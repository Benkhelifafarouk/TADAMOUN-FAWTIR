import { env } from '@/lib/env';
import { PgliteDb } from './pglite-driver';
import { PostgresDb } from './postgres-driver';
import type { Db } from './types';

/**
 * Process-wide database handle. Cached on globalThis so that Next.js HMR in
 * development and repeated server renders share one connection/pool.
 */

type Holder = {
  db?: Db;
  connecting?: Promise<Db>;
};

const globalForDb = globalThis as unknown as { __tadamounDb?: Holder };
const holder: Holder = (globalForDb.__tadamounDb ??= {});

export async function createDb(options?: { driver?: 'pglite' | 'postgres'; dataDir?: string | null }): Promise<Db> {
  const e = env();
  const driver = options?.driver ?? e.DATABASE_DRIVER;

  if (driver === 'postgres') {
    if (!e.DATABASE_URL) throw new Error('DATABASE_URL is required when DATABASE_DRIVER=postgres');
    return PostgresDb.create(e.DATABASE_URL, e.databaseSsl);
  }

  const dataDir = options?.dataDir === undefined ? e.PGLITE_DATA_DIR : options.dataDir;
  return PgliteDb.create(dataDir);
}

export async function getDb(): Promise<Db> {
  if (holder.db) return holder.db;
  if (!holder.connecting) {
    holder.connecting = (async () => {
      const db = await createDb();
      if (env().autoMigrate) {
        const { migrate } = await import('./migrate');
        await migrate(db);
      }
      holder.db = db;
      return db;
    })();
  }
  return holder.connecting;
}

/** Test helper: install a specific database instance (e.g. in-memory PGlite). */
export function setDbForTests(db: Db): void {
  holder.db = db;
  holder.connecting = Promise.resolve(db);
}

export async function closeDb(): Promise<void> {
  if (holder.db) {
    await holder.db.close();
    holder.db = undefined;
    holder.connecting = undefined;
  }
}

export type { Db, Tx, SqlValue } from './types';
