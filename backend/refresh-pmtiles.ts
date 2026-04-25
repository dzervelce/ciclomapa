import { spawn } from 'node:child_process';
import { copyFile, mkdir, rename, unlink } from 'node:fs/promises';
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
    //
    // cwd: '/tmp' so the upstream script's intermediate files (latvia.geojson)
    // land in writable space — /srv/velokarte/backend is owned by `deploy`,
    // not the `velokarte-api` user that runs this systemd unit.
    const proc = spawn(
      '/usr/local/bin/bun',
      [SCRIPT, '--area', 'Latvia', '--output', OUTPUT_TMP],
      {
        env: { ...process.env, NODE_PATH },
        stdio: 'inherit',
        cwd: '/tmp',
      }
    );
    proc.on('exit', (code) => resolve(code ?? 1));
    proc.on('error', (err) => {
      console.error('failed to spawn generate-pmtiles:', err);
      resolve(1);
    });
  });
}

/**
 * Move a file atomically when on the same filesystem; fall back to copy+delete
 * for cross-device cases (rename() raises EXDEV when src and dest are on
 * different filesystems — common here because systemd's PrivateTmp puts /tmp
 * on tmpfs while /srv/velokarte is on ext4).
 */
async function moveAtomicOrCopy(src: string, dest: string): Promise<void> {
  try {
    await rename(src, dest);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'EXDEV') throw err;
    await copyFile(src, dest);
    await unlink(src);
  }
}

async function main() {
  await mkdir(dirname(OUTPUT_FINAL), { recursive: true });
  const code = await runScript();
  if (code !== 0) {
    // Exit 0 so systemd doesn't retry-flag the unit; next hourly tick will try again.
    console.error(`generate-pmtiles exited ${code} — leaving existing pmtiles in place.`);
    process.exit(0);
  }
  await moveAtomicOrCopy(OUTPUT_TMP, OUTPUT_FINAL);
  console.log(`PMTiles refreshed: ${OUTPUT_FINAL}`);
  process.exit(0);
}

main().catch((err) => {
  console.error('refresh-pmtiles fatal error:', err);
  process.exit(0);
});
