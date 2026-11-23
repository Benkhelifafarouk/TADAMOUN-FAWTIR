import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import type { Db, SqlValue, Tx } from './types';

/**
 * Embedded PostgreSQL (PostgreSQL compiled to WASM).
 * Used for local development, CI and the integration/RLS test suites so that no
 * external service is required. The SQL dialect is the real thing: migrations,
 * constraints, triggers and RLS behave identically to a server deployment.
 */
export class PgliteDb implements Db {
  constructor(private readonly client: PGlite) {}

  static async create(dataDir: string | null): Promise<PgliteDb> {
    if (dataDir) {
      await mkdir(path.resolve(dataDir), { recursive: true });
      return new PgliteDb(new PGlite(dataDir));
    }
    return new PgliteDb(new PGlite());
  }

  async query<T = Record<string, unknown>>(sql: string, params?: readonly SqlValue[]): Promise<T[]> {
    const result = await this.client.query<T>(sql, params ? [...params] : undefined);
    return result.rows;
  }

  async exec(sql: string): Promise<void> {
    await this.client.exec(sql);
  }

  async transaction<R>(fn: (tx: Tx) => Promise<R>): Promise<R> {
    return this.client.transaction(async (trx) => {
      const tx: Tx = {
        async query<T = Record<string, unknown>>(sql: string, params?: readonly SqlValue[]) {
          const result = await trx.query<T>(sql, params ? [...params] : undefined);
          return result.rows;
        },
      };
      return fn(tx);
    });
  }

  async close(): Promise<void> {
    await this.client.close();
  }
}
