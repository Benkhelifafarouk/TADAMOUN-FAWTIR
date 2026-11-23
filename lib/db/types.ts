/** Minimal database contract shared by the embedded and server drivers. */

export type SqlValue = string | number | boolean | null | Date | Buffer | object;

export interface Tx {
  query<T = Record<string, unknown>>(sql: string, params?: readonly SqlValue[]): Promise<T[]>;
}

export interface Db extends Tx {
  /** Execute one or more statements with no parameters (DDL, migrations). */
  exec(sql: string): Promise<void>;
  /** Run `fn` inside a real database transaction; rolls back on throw. */
  transaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

export class DbError extends Error {
  constructor(
    message: string,
    readonly code: string | undefined,
    override readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'DbError';
  }
}

export function wrapDbError(error: unknown): DbError {
  if (error instanceof DbError) return error;
  if (error && typeof error === 'object') {
    const e = error as { message?: string; code?: string };
    return new DbError(e.message ?? 'Database error', e.code, error);
  }
  return new DbError(String(error), undefined, error);
}
