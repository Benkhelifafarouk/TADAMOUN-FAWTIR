import { Pool, type PoolClient } from 'pg';
import type { Db, SqlValue, Tx } from './types';

/**
 * PostgreSQL server driver (Supabase, RDS, self-hosted).
 * The application must use a privileged connection (service role); RLS is the
 * defence-in-depth layer for the anon/authenticated PostgREST surface.
 */
export class PostgresDb implements Db {
  constructor(private readonly pool: Pool) {}

  static create(connectionString: string, ssl: boolean): PostgresDb {
    const pool = new Pool({
      connectionString,
      ssl: ssl ? { rejectUnauthorized: false } : undefined,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
      application_name: 'tadamoun-fawtir',
    });
    return new PostgresDb(pool);
  }

  async query<T = Record<string, unknown>>(sql: string, params?: readonly SqlValue[]): Promise<T[]> {
    const result = await this.pool.query(sql, params ? [...params] : undefined);
    return result.rows as T[];
  }

  async exec(sql: string): Promise<void> {
    await this.pool.query(sql);
  }

  async transaction<R>(fn: (tx: Tx) => Promise<R>): Promise<R> {
    const client: PoolClient = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const tx: Tx = {
        async query<T = Record<string, unknown>>(sql: string, params?: readonly SqlValue[]) {
          const result = await client.query(sql, params ? [...params] : undefined);
          return result.rows as T[];
        },
      };
      const result = await fn(tx);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // connection already broken; the pool will discard it
      }
      throw error;
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
