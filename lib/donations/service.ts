import type { Db } from '@/lib/db/types';
import { num } from '@/lib/db/values';
import { env } from '@/lib/env';
import { notify } from '@/lib/notifications/service';
import { recordAudit, recordSecurityEvent, SecurityEvents } from '@/lib/security/audit';

/**
 * Donations and accounting.
 *
 * Distinct states, never conflated:
 *   pending  → a pledge / payment attempt
 *   paid     → funds actually collected (demo provider: simulated)
 *   allocated→ the paid amount is attached to a request (donation_allocations)
 *   paid out → assistance_requests.paid_amount_centimes (provider settlement)
 *
 * Overfunding is prevented by: an application check, a row lock, a BEFORE INSERT
 * trigger on donation_allocations and a CHECK constraint on assistance_requests.
 */

export class DonationError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'DonationError';
  }
}

export interface CreateDonationInput {
  userId: string;
  target: 'request' | 'fund';
  requestId: string | null;
  amountCentimes: number;
  idempotencyKey?: string | null;
}

export interface DonationSummary {
  id: string;
  status: string;
  target: 'request' | 'fund';
  amountCentimes: number;
  requestId: string | null;
  publicRef: string | null;
  receiptId: string | null;
  receiptNumber: string | null;
}

async function ensureDonorProfile(db: Db, userId: string): Promise<string> {
  const existing = await db.query<{ id: string }>('select id from donor_profiles where user_id = $1', [userId]);
  if (existing[0]) return existing[0].id;
  const created = await db.query<{ id: string }>(
    `insert into donor_profiles (user_id, is_anonymous)
     values ($1, true)
     on conflict (user_id) do update set updated_at = now()
     returning id`,
    [userId],
  );
  return created[0].id;
}

export async function createDonation(db: Db, input: CreateDonationInput): Promise<DonationSummary> {
  if (!env().donationsEnabled) throw new DonationError('DONATIONS_DISABLED');
  if (input.amountCentimes <= 0) throw new DonationError('INVALID_AMOUNT');

  const donorProfileId = await ensureDonorProfile(db, input.userId);

  let publicRef: string | null = null;
  if (input.target === 'request') {
    if (!input.requestId) throw new DonationError('REQUEST_REQUIRED');
    const rows = await db.query<{ id: string; status: string; eligible: unknown; funded: unknown; public_ref: string }>(
      `select id, status, eligible_amount_centimes as eligible, funded_amount_centimes as funded, public_ref
         from assistance_requests where id = $1`,
      [input.requestId],
    );
    const request = rows[0];
    if (!request) throw new DonationError('REQUEST_NOT_FOUND');
    if (!['published', 'partially_funded'].includes(request.status)) {
      throw new DonationError('REQUEST_NOT_OPEN');
    }
    const remaining = num(request.eligible) - num(request.funded);
    if (input.amountCentimes > remaining) throw new DonationError('AMOUNT_EXCEEDS_REMAINING');
    publicRef = request.public_ref;
  }

  const donationId = await db.transaction(async (tx) => {
    const inserted = await tx.query<{ id: string }>(
      `insert into donations
         (donor_user_id, donor_profile_id, target, assistance_request_id, amount_centimes,
          status, payment_provider, idempotency_key)
       values ($1, $2, $3, $4, $5, 'pending', $6, $7)
       on conflict (idempotency_key) do update set updated_at = now()
       returning id`,
      [
        input.userId,
        donorProfileId,
        input.target,
        input.target === 'request' ? input.requestId : null,
        String(input.amountCentimes),
        env().PAYMENT_PROVIDER,
        input.idempotencyKey ?? `auto:${crypto.randomUUID()}`,
      ],
    );
    const id = inserted[0].id;

    const existingTx = await tx.query<{ id: string }>(
      'select id from payment_transactions where donation_id = $1 limit 1',
      [id],
    );
    if (!existingTx[0]) {
      await tx.query(
        `insert into payment_transactions (donation_id, provider, provider_ref, amount_centimes, status, raw_status)
         values ($1, $2, $3, $4, 'created', 'awaiting_confirmation')`,
        [id, env().PAYMENT_PROVIDER, `demo_${id}`, String(input.amountCentimes)],
      );
    }
    return id;
  });

  await recordAudit(db, {
    actorUserId: input.userId,
    actorRole: 'donor',
    action: 'donation.created',
    entityType: 'donation',
    entityId: donationId,
    afterState: { target: input.target, amount: input.amountCentimes, publicRef },
  });

  return {
    id: donationId,
    status: 'pending',
    target: input.target,
    amountCentimes: input.amountCentimes,
    requestId: input.requestId,
    publicRef,
    receiptId: null,
    receiptNumber: null,
  };
}

/**
 * Demo payment confirmation. Simulates the provider callback in a single
 * transaction and allocates the amount atomically.
 */
export async function confirmDemoPayment(db: Db, input: { userId: string; donationId: string }): Promise<DonationSummary> {
  if (env().PAYMENT_PROVIDER !== 'demo') throw new DonationError('PAYMENT_PROVIDER_NOT_DEMO');

  return db.transaction(async (tx) => {
    const donationRows = await tx.query<{
      id: string;
      status: string;
      target: 'request' | 'fund';
      assistance_request_id: string | null;
      amount_centimes: unknown;
      donor_user_id: string;
    }>(
      `select id, status, target, assistance_request_id, amount_centimes, donor_user_id
         from donations where id = $1 for update`,
      [input.donationId],
    );
    const donation = donationRows[0];
    if (!donation) throw new DonationError('DONATION_NOT_FOUND');
    if (donation.donor_user_id !== input.userId) throw new DonationError('FORBIDDEN');
    if (donation.status === 'paid') {
      const receipt = await tx.query<{ id: string; receipt_number: string }>(
        'select id, receipt_number from receipts where donation_id = $1',
        [donation.id],
      );
      return {
        id: donation.id,
        status: 'paid',
        target: donation.target,
        amountCentimes: num(donation.amount_centimes),
        requestId: donation.assistance_request_id,
        publicRef: null,
        receiptId: receipt[0]?.id ?? null,
        receiptNumber: receipt[0]?.receipt_number ?? null,
      };
    }
    if (donation.status !== 'pending') throw new DonationError('DONATION_NOT_PENDING');

    const amount = num(donation.amount_centimes);
    let publicRef: string | null = null;

    if (donation.target === 'request' && donation.assistance_request_id) {
      const requestRows = await tx.query<{
        id: string;
        status: string;
        eligible: unknown;
        funded: unknown;
        public_ref: string;
        beneficiary_id: string;
        bill_id: string;
      }>(
        `select id, status, eligible_amount_centimes as eligible, funded_amount_centimes as funded,
                public_ref, beneficiary_id, bill_id
           from assistance_requests where id = $1 for update`,
        [donation.assistance_request_id],
      );
      const request = requestRows[0];
      if (!request) throw new DonationError('REQUEST_NOT_FOUND');
      if (!['published', 'partially_funded'].includes(request.status)) {
        throw new DonationError('REQUEST_NOT_OPEN');
      }
      const remaining = num(request.eligible) - num(request.funded);
      if (amount > remaining) {
        await recordSecurityEvent(tx, {
          eventType: SecurityEvents.DONATION_OVERFUND_ATTEMPT,
          severity: 'high',
          userId: input.userId,
          details: { donationId: donation.id, amount, remaining },
        });
        throw new DonationError('AMOUNT_EXCEEDS_REMAINING');
      }

      await tx.query(
        `insert into donation_allocations
           (donation_id, assistance_request_id, amount_centimes, source, allocation_rule)
         values ($1, $2, $3, 'direct', 'donor_selected_request')`,
        [donation.id, request.id, String(amount)],
      );

      const newFunded = num(request.funded) + amount;
      const newStatus = newFunded >= num(request.eligible) ? 'funded' : 'partially_funded';
      await tx.query(
        `update assistance_requests
            set funded_amount_centimes = $2, status = $3,
                funded_at = case when $3 = 'funded' then now() else funded_at end
          where id = $1`,
        [request.id, String(newFunded), newStatus],
      );
      await tx.query(
        `insert into request_status_history (request_id, from_status, to_status, reason, actor_type)
         values ($1, $2, $3, 'DONATION_ALLOCATED', 'donor')`,
        [request.id, request.status, newStatus],
      );

      const owner = await tx.query<{ user_id: string }>(
        'select bp.user_id from beneficiary_profiles bp where bp.id = $1',
        [request.beneficiary_id],
      );
      if (owner[0]) {
        await notify(tx, {
          userId: owner[0].user_id,
          event: newStatus === 'funded' ? 'request_funded' : 'funding_progress',
          params: { amount, reference: request.public_ref },
          dedupeKey: `funded:${request.id}:${newFunded}`,
        });
      }
      publicRef = request.public_ref;
    } else {
      const fund = await tx.query<{ id: string }>('select id from solidarity_fund limit 1 for update');
      if (!fund[0]) throw new DonationError('FUND_NOT_FOUND');
      await tx.query(
        `update solidarity_fund
            set balance_centimes = balance_centimes + $2,
                total_contributions_centimes = total_contributions_centimes + $2
          where id = $1`,
        [fund[0].id, String(amount)],
      );
      await tx.query(
        `insert into fund_ledger_entries
           (fund_id, entry_type, amount_centimes, donation_id, reason)
         values ($1, 'contribution', $2, $3, 'DONOR_FUND_CONTRIBUTION')`,
        [fund[0].id, String(amount), donation.id],
      );
    }

    await tx.query(
      `update donations set status = 'paid', paid_at = now(), provider_payment_id = $2 where id = $1`,
      [donation.id, `demo_${donation.id}`],
    );
    await tx.query(
      `update payment_transactions
          set status = 'captured', raw_status = 'demo_captured'
        where donation_id = $1`,
      [donation.id],
    );
    await tx.query(
      `insert into payment_events
         (provider, external_event_id, transaction_id, event_type, signature_verified, payload, processed_at)
       values ('demo', $1, (select id from payment_transactions where donation_id = $2 limit 1),
               'payment.captured', true, $3, now())
       on conflict (provider, external_event_id) do nothing`,
      [`demo-capture-${donation.id}`, donation.id, JSON.stringify({ demo: true, amount })],
    );

    const receiptNumber = await tx.query<{ number: string }>('select app_next_receipt_number() as number');
    const receipt = await tx.query<{ id: string; receipt_number: string }>(
      `insert into receipts (donation_id, receipt_number, amount_centimes, is_demo, language)
       values ($1, $2, $3, true, 'ar')
       returning id, receipt_number`,
      [donation.id, receiptNumber[0].number, String(amount)],
    );

    await recordAudit(tx, {
      actorUserId: input.userId,
      actorRole: 'donor',
      action: 'donation.paid_demo',
      entityType: 'donation',
      entityId: donation.id,
      afterState: { amount, target: donation.target, receipt: receipt[0].receipt_number, demo: true },
    });

    return {
      id: donation.id,
      status: 'paid',
      target: donation.target,
      amountCentimes: amount,
      requestId: donation.assistance_request_id,
      publicRef,
      receiptId: receipt[0].id,
      receiptNumber: receipt[0].receipt_number,
    };
  });
}

export async function cancelDonation(db: Db, input: { userId: string; donationId: string }): Promise<void> {
  await db.transaction(async (tx) => {
    const rows = await tx.query<{ id: string; status: string; donor_user_id: string }>(
      'select id, status, donor_user_id from donations where id = $1 for update',
      [input.donationId],
    );
    const donation = rows[0];
    if (!donation) throw new DonationError('DONATION_NOT_FOUND');
    if (donation.donor_user_id !== input.userId) throw new DonationError('FORBIDDEN');
    if (donation.status !== 'pending') throw new DonationError('DONATION_NOT_PENDING');
    await tx.query(`update donations set status = 'cancelled' where id = $1`, [donation.id]);
    await tx.query(`update payment_transactions set status = 'failed', raw_status = 'cancelled' where donation_id = $1`, [
      donation.id,
    ]);
  });
}

export interface FundAllocationInput {
  adminUserId: string;
  requestId: string;
  amountCentimes: number;
  reason: string;
}

/**
 * Allocates pooled fund money to a request, FIFO across the contributions that
 * are still unallocated. Every allocation produces a negative ledger entry.
 */
export async function allocateFundToRequest(db: Db, input: FundAllocationInput): Promise<{ allocated: number }> {
  if (input.amountCentimes <= 0) throw new DonationError('INVALID_AMOUNT');
  if (input.reason.trim().length < 5) throw new DonationError('REASON_REQUIRED');

  return db.transaction(async (tx) => {
    const fundRows = await tx.query<{ id: string; balance: unknown }>(
      'select id, balance_centimes as balance from solidarity_fund limit 1 for update',
    );
    const fund = fundRows[0];
    if (!fund) throw new DonationError('FUND_NOT_FOUND');
    if (num(fund.balance) < input.amountCentimes) throw new DonationError('FUND_INSUFFICIENT_BALANCE');

    const requestRows = await tx.query<{ id: string; status: string; eligible: unknown; funded: unknown }>(
      `select id, status, eligible_amount_centimes as eligible, funded_amount_centimes as funded
         from assistance_requests where id = $1 for update`,
      [input.requestId],
    );
    const request = requestRows[0];
    if (!request) throw new DonationError('REQUEST_NOT_FOUND');
    if (!['published', 'partially_funded', 'funded'].includes(request.status)) {
      throw new DonationError('REQUEST_NOT_OPEN');
    }
    const remaining = num(request.eligible) - num(request.funded);
    if (input.amountCentimes > remaining) throw new DonationError('AMOUNT_EXCEEDS_REMAINING');

    const contributions = await tx.query<{ id: string; available: unknown }>(
      `select d.id,
              d.amount_centimes - coalesce((select sum(a.amount_centimes) from donation_allocations a where a.donation_id = d.id), 0) as available
         from donations d
        where d.target = 'fund' and d.status = 'paid'
        order by d.paid_at asc nulls last, d.created_at asc
        for update`,
    );

    let toAllocate = input.amountCentimes;
    for (const contribution of contributions) {
      if (toAllocate <= 0) break;
      const available = num(contribution.available);
      if (available <= 0) continue;
      const take = Math.min(available, toAllocate);
      const allocation = await tx.query<{ id: string }>(
        `insert into donation_allocations
           (donation_id, assistance_request_id, amount_centimes, source, allocation_rule, created_by)
         values ($1, $2, $3, 'fund', 'fund_fifo_allocation', $4)
         returning id`,
        [contribution.id, request.id, String(take), input.adminUserId],
      );
      await tx.query(
        `insert into fund_ledger_entries
           (fund_id, entry_type, amount_centimes, donation_id, assistance_request_id, allocation_id, reason, created_by)
         values ($1, 'allocation', $2, $3, $4, $5, $6, $7)`,
        [
          fund.id,
          String(-take),
          contribution.id,
          request.id,
          allocation[0].id,
          input.reason.slice(0, 300),
          input.adminUserId,
        ],
      );
      toAllocate -= take;
    }

    if (toAllocate > 0) throw new DonationError('FUND_CONTRIBUTIONS_EXHAUSTED');

    await tx.query(
      `update solidarity_fund
          set balance_centimes = balance_centimes - $2,
              total_allocated_centimes = total_allocated_centimes + $2
        where id = $1`,
      [fund.id, String(input.amountCentimes)],
    );

    const newFunded = num(request.funded) + input.amountCentimes;
    const newStatus = newFunded >= num(request.eligible) ? 'funded' : 'partially_funded';
    await tx.query(
      `update assistance_requests
          set funded_amount_centimes = $2, status = $3,
              funded_at = case when $3 = 'funded' then now() else funded_at end
        where id = $1`,
      [request.id, String(newFunded), newStatus],
    );
    await tx.query(
      `insert into request_status_history (request_id, from_status, to_status, reason, actor_type, actor_user_id)
       values ($1, $2, $3, 'SOLIDARITY_FUND_ALLOCATION', 'admin', $4)`,
      [request.id, request.status, newStatus, input.adminUserId],
    );

    await recordAudit(tx, {
      actorUserId: input.adminUserId,
      actorRole: 'admin',
      action: 'fund.allocated',
      entityType: 'assistance_request',
      entityId: request.id,
      afterState: { amount: input.amountCentimes, reason: input.reason },
    });

    return { allocated: input.amountCentimes };
  });
}

/**
 * Refund of an unallocated, paid donation. Allocated money cannot be silently
 * pulled back: that would break the append-only allocation history and a
 * beneficiary's funding. It is refused and must be handled as a support case.
 */
export async function refundDonation(
  db: Db,
  input: { adminUserId: string; donationId: string; reason: string },
): Promise<{ refundId: string; amountCentimes: number }> {
  return db.transaction(async (tx) => {
    const rows = await tx.query<{
      id: string;
      status: string;
      amount_centimes: unknown;
      target: 'request' | 'fund';
      donor_user_id: string | null;
    }>(
      `select id, status, amount_centimes, target, donor_user_id from donations where id = $1 for update`,
      [input.donationId],
    );
    const donation = rows[0];
    if (!donation) throw new DonationError('DONATION_NOT_FOUND');
    if (donation.status !== 'paid') throw new DonationError('REFUND_NOT_ALLOWED');

    const allocations = await tx.query<{ total: unknown }>(
      'select coalesce(sum(amount_centimes), 0) as total from donation_allocations where donation_id = $1',
      [donation.id],
    );
    if (num(allocations[0]?.total) > 0) throw new DonationError('REFUND_BLOCKED_ALLOCATED');

    const amount = num(donation.amount_centimes);
    const refund = await tx.query<{ id: string }>(
      `insert into refunds (donation_id, amount_centimes, status, reason, provider_refund_ref, processed_at)
       values ($1, $2, 'processed', $3, $4, now())
       returning id`,
      [donation.id, String(amount), input.reason.slice(0, 300), `demo-refund-${donation.id}`],
    );

    await tx.query(`update donations set status = 'refunded' where id = $1`, [donation.id]);
    await tx.query(
      `update payment_transactions set status = 'refunded', raw_status = 'refunded' where donation_id = $1`,
      [donation.id],
    );

    if (donation.target === 'fund') {
      const fund = await tx.query<{ id: string }>('select id from solidarity_fund limit 1 for update');
      if (fund[0]) {
        await tx.query(
          `update solidarity_fund
              set balance_centimes = balance_centimes - $2,
                  total_contributions_centimes = total_contributions_centimes - $2
            where id = $1`,
          [fund[0].id, String(amount)],
        );
        await tx.query(
          `insert into fund_ledger_entries
             (fund_id, entry_type, amount_centimes, donation_id, reason, created_by)
           values ($1, 'refund', $2, $3, $4, $5)`,
          [fund[0].id, String(-amount), donation.id, input.reason.slice(0, 300), input.adminUserId],
        );
      }
    }

    await recordAudit(tx, {
      actorUserId: input.adminUserId,
      actorRole: 'admin',
      action: 'donation.refunded',
      entityType: 'donation',
      entityId: donation.id,
      afterState: { amount, reason: input.reason },
    });

    if (donation.donor_user_id) {
      await notify(tx, {
        userId: donation.donor_user_id,
        event: 'payment_completed',
        params: { amount },
        dedupeKey: `refund:${donation.id}`,
      });
    }

    return { refundId: refund[0].id, amountCentimes: amount };
  });
}
