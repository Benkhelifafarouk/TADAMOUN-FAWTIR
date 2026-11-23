import { randomUUID } from 'node:crypto';
import { getDb } from '@/lib/db';
import type { Db } from '@/lib/db/types';
import { num } from '@/lib/db/values';
import { evaluateBill } from '@/lib/eligibility/service';
import { deliverQueuedNotifications } from '@/lib/notifications/service';
import { cleanupRateLimits } from '@/lib/security/rate-limit';
import { recordSecurityEvent } from '@/lib/security/audit';
import { claimJobs, completeJob, failJob, type JobRow } from './queue';

async function handle(db: Db, job: JobRow): Promise<void> {
  switch (job.type) {
    case 'evaluate_bill': {
      const billId = String(job.payload.billId ?? '');
      if (!billId) throw new Error('MISSING_BILL_ID');
      await evaluateBill(db, billId);
      return;
    }
    case 'deliver_notifications': {
      await deliverQueuedNotifications(db, 200);
      return;
    }
    case 'expire_requests': {
      const expired = await db.query<{ id: string; beneficiary_id: string; public_ref: string }>(
        `update assistance_requests
            set status = 'expired'
          where status in ('published', 'partially_funded')
            and expires_at is not null
            and expires_at < now()
          returning id, beneficiary_id, public_ref`,
      );
      for (const row of expired) {
        await db.query(
          `insert into request_status_history (request_id, from_status, to_status, reason, actor_type)
           values ($1, null, 'expired', 'EXPIRED_BY_SCHEDULE', 'system')`,
          [row.id],
        );
        await db.query(
          `update bills set status = 'expired'
            where id = (select bill_id from assistance_requests where id = $1)`,
          [row.id],
        );
      }
      return;
    }
    case 'reconcile_fund': {
      const fund = await db.query<{ id: string; balance_centimes: unknown }>(
        `select id, balance_centimes from solidarity_fund limit 1`,
      );
      const row = fund[0];
      if (!row) return;
      const ledger = await db.query<{ total: unknown }>(
        `select coalesce(sum(amount_centimes), 0) as total from fund_ledger_entries where fund_id = $1`,
        [row.id],
      );
      const ledgerTotal = num(ledger[0]?.total);
      const balance = num(row.balance_centimes);
      if (ledgerTotal !== balance) {
        await recordSecurityEvent(db, {
          eventType: 'finance.fund_reconciliation_mismatch',
          severity: 'critical',
          details: { balance, ledgerTotal, difference: balance - ledgerTotal },
        });
      }
      const requests = await db.query<{ id: string; funded: unknown; eligible: unknown }>(
        `select ar.id, ar.funded_amount_centimes as funded, ar.eligible_amount_centimes as eligible
           from assistance_requests ar
          where ar.status in ('published', 'partially_funded', 'funded', 'paid')`,
      );
      for (const request of requests) {
        const allocated = await db.query<{ total: unknown }>(
          `select coalesce(sum(amount_centimes), 0) as total from donation_allocations where assistance_request_id = $1`,
          [request.id],
        );
        const sum = num(allocated[0]?.total);
        if (sum !== num(request.funded)) {
          await recordSecurityEvent(db, {
            eventType: 'finance.request_reconciliation_mismatch',
            severity: 'high',
            details: { requestId: request.id, funded: num(request.funded), allocated: sum },
          });
        }
      }
      return;
    }
    case 'cleanup': {
      await cleanupRateLimits(db, 48);
      await db.query(`delete from jobs where status = 'succeeded' and updated_at < now() - interval '30 days'`);
      return;
    }
    default:
      throw new Error(`UNKNOWN_JOB_TYPE:${String(job.type)}`);
  }
}

export interface JobRunSummary {
  processed: number;
  succeeded: number;
  failed: number;
}

/** Processes due jobs; safe to call inline (demo) or from an external worker. */
export async function runDueJobs(db: Db, options: { limit?: number; workerId?: string } = {}): Promise<JobRunSummary> {
  const workerId = options.workerId ?? `worker-${randomUUID().slice(0, 8)}`;
  const jobs = await claimJobs(db, workerId, options.limit ?? 5);
  let succeeded = 0;
  let failed = 0;

  for (const job of jobs) {
    try {
      await handle(db, job);
      await completeJob(db, job.id);
      succeeded += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await failJob(db, job.id, message, job.attempts, job.max_attempts);
      failed += 1;
    }
  }

  return { processed: jobs.length, succeeded, failed };
}

/** Best-effort inline execution used after user actions in demo mode. */
export async function runJobsSafely(limit = 4): Promise<void> {
  try {
    const db = await getDb();
    await runDueJobs(db, { limit });
  } catch (error) {
    console.warn('inline job run failed', error instanceof Error ? error.message : error);
  }
}

export async function seedRecurringJobs(db: Db): Promise<void> {
  await db.query(
    `insert into jobs (type, payload, status, run_at, max_attempts, dedupe_key)
     values ('expire_requests', '{}'::jsonb, 'queued', now(), 3, 'recurring:expire_requests')
     on conflict (dedupe_key) do nothing`,
  );
  await db.query(
    `insert into jobs (type, payload, status, run_at, max_attempts, dedupe_key)
     values ('reconcile_fund', '{}'::jsonb, 'queued', now(), 3, 'recurring:reconcile_fund')
     on conflict (dedupe_key) do nothing`,
  );
  return;
}
