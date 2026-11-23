import type { Db } from '@/lib/db/types';
import { num } from '@/lib/db/values';

/**
 * Durable job queue.
 *
 * Claiming uses `FOR UPDATE SKIP LOCKED`, so multiple workers can run in parallel
 * without executing the same job twice. Jobs are retried with a linear backoff
 * and become `dead` after `max_attempts`, which is visible to operators.
 */

export type JobType =
  | 'evaluate_bill'
  | 'deliver_notifications'
  | 'expire_requests'
  | 'reconcile_fund'
  | 'cleanup';

export interface EnqueueInput {
  type: JobType;
  payload?: Record<string, unknown>;
  runAt?: Date;
  maxAttempts?: number;
  dedupeKey?: string | null;
}

export async function enqueueJob(db: Db, input: EnqueueInput): Promise<string | null> {
  const rows = await db.query<{ id: string }>(
    `insert into jobs (type, payload, run_at, max_attempts, dedupe_key)
     values ($1, $2, coalesce($3, now()), $4, $5)
     on conflict (dedupe_key) do nothing
     returning id`,
    [
      input.type,
      JSON.stringify(input.payload ?? {}),
      input.runAt ?? null,
      input.maxAttempts ?? 5,
      input.dedupeKey ?? null,
    ],
  );
  return rows[0]?.id ?? null;
}

export interface JobRow {
  id: string;
  type: JobType;
  payload: Record<string, unknown>;
  attempts: number;
  max_attempts: number;
}

export async function claimJobs(db: Db, workerId: string, limit = 5): Promise<JobRow[]> {
  return db.transaction(async (tx) => {
    const rows = await tx.query<{
      id: string;
      type: JobType;
      payload: unknown;
      attempts: number;
      max_attempts: number;
    }>(
      `with due as (
         select id from jobs
          where status in ('queued', 'failed')
            and run_at <= now()
          order by run_at
          limit $1
          for update skip locked
       )
       update jobs j
          set status = 'running',
              locked_at = now(),
              locked_by = $2,
              attempts = j.attempts + 1
         from due
        where j.id = due.id
        returning j.id, j.type, j.payload, j.attempts, j.max_attempts`,
      [limit, workerId],
    );
    return rows.map((row) => ({
      id: row.id,
      type: row.type,
      payload: (typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload) as Record<string, unknown>,
      attempts: num(row.attempts),
      max_attempts: num(row.max_attempts),
    }));
  });
}

export async function completeJob(db: Db, jobId: string): Promise<void> {
  await db.query(`update jobs set status = 'succeeded', last_error = null where id = $1`, [jobId]);
}

export async function failJob(db: Db, jobId: string, error: string, attempts: number, maxAttempts: number): Promise<void> {
  const dead = attempts >= maxAttempts;
  const backoffSeconds = Math.min(3600, Math.max(15, attempts * attempts * 30));
  await db.query(
    `update jobs
        set status = $2,
            last_error = $3,
            run_at = now() + ($4 || ' seconds')::interval,
            locked_at = null,
            locked_by = null
      where id = $1`,
    [jobId, dead ? 'dead' : 'failed', error.slice(0, 1000), String(backoffSeconds)],
  );
}
