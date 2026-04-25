import { sql } from 'bun';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, 'migrations');

async function ensureMigrationsTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version    TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
}

async function appliedVersions(): Promise<Set<string>> {
  const rows = await sql`SELECT version FROM schema_migrations`;
  return new Set(rows.map((r: { version: string }) => r.version));
}

async function main() {
  await ensureMigrationsTable();
  const applied = await appliedVersions();

  const files = (await readdir(MIGRATIONS_DIR))
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const version = file.replace(/\.sql$/, '');
    if (applied.has(version)) {
      console.log(`SKIP ${version}`);
      continue;
    }
    const content = await readFile(join(MIGRATIONS_DIR, file), 'utf8');
    console.log(`APPLY ${version}`);
    await sql.begin(async (tx) => {
      await tx.unsafe(content);
      await tx`INSERT INTO schema_migrations (version) VALUES (${version})`;
    });
  }
  console.log('migrations complete');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('migration failed:', err);
    process.exit(1);
  });
