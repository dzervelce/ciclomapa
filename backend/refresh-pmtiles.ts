import { spawn } from 'node:child_process';
import { rename, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

const SCRIPT = '/srv/velokarte/scripts/generate-pmtiles.js';
const OUTPUT_TMP = '/tmp/latvia-new.pmtiles';
const OUTPUT_FINAL = '/srv/velokarte/pmtiles/latvia.pmtiles';

// The upstream script uses CommonJS require() for osmtogeojson + others.
// We resolve those from backend/node_modules via NODE_PATH so we don't have
// to install deps inside scripts/ separately.
const NODE_PATH = '/srv/velokarte/backend/node_modules';

function runScript(): Promise<number> {
  return new Promise((resolve) => {
    // Use Bun rather than Node so we don't have to install Node on the VPS;
    // Bun is Node-compatible and resolves require() against NODE_PATH the same way.
    const proc = spawn(
      '/usr/local/bin/bun',
      [SCRIPT, '--area', 'Latvia', '--output', OUTPUT_TMP],
      {
        env: { ...process.env, NODE_PATH },
        stdio: 'inherit',
      }
    );
    proc.on('exit', (code) => resolve(code ?? 1));
    proc.on('error', (err) => {
      console.error('failed to spawn generate-pmtiles:', err);
      resolve(1);
    });
  });
}

async function main() {
  await mkdir(dirname(OUTPUT_FINAL), { recursive: true });
  const code = await runScript();
  if (code !== 0) {
    // Exit 0 so systemd doesn't retry-flag the unit; next hourly tick will try again.
    console.error(`generate-pmtiles exited ${code} — leaving existing pmtiles in place.`);
    process.exit(0);
  }
  await rename(OUTPUT_TMP, OUTPUT_FINAL);
  console.log(`PMTiles refreshed: ${OUTPUT_FINAL}`);
  process.exit(0);
}

main().catch((err) => {
  console.error('refresh-pmtiles fatal error:', err);
  process.exit(0);
});
