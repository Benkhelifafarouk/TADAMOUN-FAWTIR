import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { splitSqlStatements } from './sql-split';
import type { Db } from './types';

const MIGRATIONS_DIR = path.resolve(process.cwd(), 'database', 'migrations');
const SEEDS_DIR = path.resolve(process.cwd(), 'database', 'seeds');

export interface MigrationResult {
  applied: string[];
  skipped: string[];
}

async function listSqlFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  return entries
    .filter((e) => e.isFile() && e.name.endsWith('.sql'))
    .map((e) => e.name)
    .sort((a, b) => a.localeCompare(b));
}

function checksum(sql: string): string {
  return createHash('sha256').update(sql.replace(/\r\n/g, '\n')).digest('hex');
}

export async function ensureMigrationTable(db: Db): Promise<void> {
  await db.exec(`
    create table if not exists schema_migrations (
      version    text primary key,
      checksum   text not null,
      applied_at timestamptz not null default now()
    );
  `);
}

/**
 * Applies every pending migration in filename order. Each file is executed as a
 * single batch; a checksum mismatch on an already-applied migration aborts the
 * run so that the deployed schema cannot silently drift from the repository.
 */
export async function migrate(db: Db): Promise<MigrationResult> {
  await ensureMigrationTable(db);
  const files = await listSqlFiles(MIGRATIONS_DIR);
  const appliedRows = await db.query<{ version: string; checksum: string }>(
    'select version, checksum from schema_migrations',
  );
  const applied = new Map(appliedRows.map((r) => [r.version, r.checksum]));

  const result: MigrationResult = { applied: [], skipped: [] };

  for (const file of files) {
    const sql = await readFile(path.join(MIGRATIONS_DIR, file), 'utf8');
    const sum = checksum(sql);
    const previous = applied.get(file);

    if (previous) {
      if (previous !== sum) {
        throw new Error(
          `Migration ${file} was modified after being applied (checksum mismatch). Create a new migration instead.`,
        );
      }
      result.skipped.push(file);
      continue;
    }

    try {
      await db.transaction(async (tx) => {
        for (const statement of splitSqlStatements(sql)) {
          await tx.query(statement);
        }
      });
      await db.query('insert into schema_migrations (version, checksum) values ($1, $2)', [file, sum]);
      result.applied.push(file);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Migration ${file} failed: ${message}`);
    }
  }

  return result;
}

export async function runSeeds(db: Db): Promise<string[]> {
  const files = await listSqlFiles(SEEDS_DIR);
  for (const file of files) {
    const sql = await readFile(path.join(SEEDS_DIR, file), 'utf8');
    await db.exec(sql);
  }
  return files;
}

/** Development/test only: drop and recreate the public schema. */
export async function resetDatabase(db: Db): Promise<void> {
  await db.exec(`
    drop schema public cascade;
    create schema public;
    grant usage on schema public to public;
  `);
  await migrate(db);
}

export async function migrationStatus(db: Db): Promise<{ applied: string[]; pending: string[] }> {
  await ensureMigrationTable(db);
  const files = await listSqlFiles(MIGRATIONS_DIR);
  const rows = await db.query<{ version: string }>('select version from schema_migrations');
  const appliedSet = new Set(rows.map((r) => r.version));
  return {
    applied: files.filter((f) => appliedSet.has(f)),
    pending: files.filter((f) => !appliedSet.has(f)),
  };
}
