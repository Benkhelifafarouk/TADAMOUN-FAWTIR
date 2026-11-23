import { describe, expect, it } from 'vitest';
import { getDb } from '@/lib/db';
import { num } from '@/lib/db/values';
import {
  allocateFundToRequest,
  confirmDemoPayment,
  createDonation,
  refundDonation,
} from '@/lib/donations/service';
import { setupTestDatabase } from '../helpers/db';
import { createBeneficiary, createUser, submitSampleBill } from '../helpers/factories';

setupTestDatabase();

async function publishedRequest(userId: string): Promise<{ requestId: string; eligible: number }> {
  const db = await getDb();
  const submitted = await submitSampleBill(userId);
  expect(submitted.decision).toBe('APPROVED');
  const rows = await db.query<{ id: string; eligible_amount_centimes: unknown }>(
    'select id, eligible_amount_centimes from assistance_requests where public_ref = $1',
    [submitted.publicRef],
  );
  return { requestId: rows[0].id, eligible: num(rows[0].eligible_amount_centimes) };
}

describe('donation flow (integration)', () => {
  it('records a demo payment, allocates atomically and issues a DEMO receipt', async () => {
    const db = await getDb();
    const family = await createBeneficiary(db, { size: 5, incomeDzd: 25000 });
    const donor = await createUser(db, { role: 'donor' });
    const { requestId, eligible } = await publishedRequest(family.userId);

    const donation = await createDonation(db, {
      userId: donor.userId,
      target: 'request',
      requestId,
      amountCentimes: 300_000,
      idempotencyKey: 'donation-test-1',
    });
    expect(donation.status).toBe('pending');

    const paid = await confirmDemoPayment(db, { userId: donor.userId, donationId: donation.id });
    expect(paid.status).toBe('paid');
    expect(paid.receiptNumber).toMatch(/^TF-RCPT-\d{4}-\d{6}$/);

    const request = await db.query<{ funded: unknown; status: string }>(
      'select funded_amount_centimes as funded, status from assistance_requests where id = $1',
      [requestId],
    );
    expect(num(request[0].funded)).toBe(300_000);
    expect(request[0].status).toBe('partially_funded');
    expect(eligible).toBe(845_000);

    const allocation = await db.query<{ amount: unknown; source: string }>(
      'select amount_centimes as amount, source from donation_allocations where donation_id = $1',
      [donation.id],
    );
    expect(allocation).toHaveLength(1);
    expect(num(allocation[0].amount)).toBe(300_000);
    expect(allocation[0].source).toBe('direct');

    const receipt = await db.query<{ is_demo: boolean }>('select is_demo from receipts where donation_id = $1', [
      donation.id,
    ]);
    expect(receipt[0].is_demo).toBe(true);
  });

  it('is idempotent: confirming twice never allocates twice', async () => {
    const db = await getDb();
    const family = await createBeneficiary(db, { size: 5, incomeDzd: 25000 });
    const donor = await createUser(db, { role: 'donor' });
    const { requestId } = await publishedRequest(family.userId);

    const donation = await createDonation(db, {
      userId: donor.userId,
      target: 'request',
      requestId,
      amountCentimes: 200_000,
      idempotencyKey: 'donation-test-idempotent',
    });

    await confirmDemoPayment(db, { userId: donor.userId, donationId: donation.id });
    await confirmDemoPayment(db, { userId: donor.userId, donationId: donation.id });

    const allocations = await db.query<{ count: number; total: unknown }>(
      'select count(*)::int as count, coalesce(sum(amount_centimes), 0) as total from donation_allocations where donation_id = $1',
      [donation.id],
    );
    expect(num(allocations[0].count)).toBe(1);
    expect(num(allocations[0].total)).toBe(200_000);

    const request = await db.query<{ funded: unknown }>(
      'select funded_amount_centimes as funded from assistance_requests where id = $1',
      [requestId],
    );
    expect(num(request[0].funded)).toBe(200_000);
  });

  it('refuses to overfund a request', async () => {
    const db = await getDb();
    const family = await createBeneficiary(db, { size: 5, incomeDzd: 25000 });
    const donor = await createUser(db, { role: 'donor' });
    const { requestId } = await publishedRequest(family.userId);

    await expect(
      createDonation(db, {
        userId: donor.userId,
        target: 'request',
        requestId,
        amountCentimes: 900_000,
        idempotencyKey: 'donation-overfund',
      }),
    ).rejects.toThrow('AMOUNT_EXCEEDS_REMAINING');
  });

  it('marks the request funded when the remaining amount is reached', async () => {
    const db = await getDb();
    const family = await createBeneficiary(db, { size: 5, incomeDzd: 25000 });
    const donor = await createUser(db, { role: 'donor' });
    const { requestId } = await publishedRequest(family.userId);

    const first = await createDonation(db, {
      userId: donor.userId,
      target: 'request',
      requestId,
      amountCentimes: 500_000,
      idempotencyKey: 'donation-fill-1',
    });
    await confirmDemoPayment(db, { userId: donor.userId, donationId: first.id });

    const second = await createDonation(db, {
      userId: donor.userId,
      target: 'request',
      requestId,
      amountCentimes: 345_000,
      idempotencyKey: 'donation-fill-2',
    });
    await confirmDemoPayment(db, { userId: donor.userId, donationId: second.id });

    const request = await db.query<{ funded: unknown; status: string; funded_at: Date | null }>(
      'select funded_amount_centimes as funded, status, funded_at from assistance_requests where id = $1',
      [requestId],
    );
    expect(num(request[0].funded)).toBe(845_000);
    expect(request[0].status).toBe('funded');
    expect(request[0].funded_at).not.toBeNull();

    await expect(
      createDonation(db, {
        userId: donor.userId,
        target: 'request',
        requestId,
        amountCentimes: 100_000,
        idempotencyKey: 'donation-too-late',
      }),
    ).rejects.toThrow('REQUEST_NOT_OPEN');
  });

  it('tracks the solidarity fund with a signed, append-only ledger', async () => {
    const db = await getDb();
    const familyA = await createBeneficiary(db, { size: 5, incomeDzd: 25000 });
    const familyB = await createBeneficiary(db, { size: 5, incomeDzd: 25000 });
    const donor = await createUser(db, { role: 'donor' });
    const requestB = await publishedRequest(familyB.userId);

    const fundDonation = await createDonation(db, {
      userId: donor.userId,
      target: 'fund',
      requestId: null,
      amountCentimes: 500_000,
      idempotencyKey: 'fund-contribution-1',
    });
    await confirmDemoPayment(db, { userId: donor.userId, donationId: fundDonation.id });

    const fund = await db.query<{ balance: unknown; contributions: unknown }>(
      'select balance_centimes as balance, total_contributions_centimes as contributions from solidarity_fund',
    );
    expect(num(fund[0].balance)).toBe(500_000);
    expect(num(fund[0].contributions)).toBe(500_000);

    await allocateFundToRequest(db, {
      adminUserId: donor.userId,
      requestId: requestB.requestId,
      amountCentimes: 400_000,
      reason: 'Affectation de démonstration validée par un administrateur.',
    });

    const fundAfter = await db.query<{ balance: unknown; allocated: unknown }>(
      'select balance_centimes as balance, total_allocated_centimes as allocated from solidarity_fund',
    );
    expect(num(fundAfter[0].balance)).toBe(100_000);
    expect(num(fundAfter[0].allocated)).toBe(400_000);

    const request = await db.query<{ funded: unknown }>(
      'select funded_amount_centimes as funded from assistance_requests where id = $1',
      [requestB.requestId],
    );
    expect(num(request[0].funded)).toBe(400_000);

    const ledger = await db.query<{ entry_type: string; amount: unknown }>(
      'select entry_type, amount_centimes as amount from fund_ledger_entries order by created_at',
    );
    expect(ledger.map((row) => row.entry_type)).toEqual(['contribution', 'allocation']);
    expect(num(ledger[1].amount)).toBe(-400_000);

    await expect(
      allocateFundToRequest(db, {
        adminUserId: donor.userId,
        requestId: requestB.requestId,
        amountCentimes: 500_000,
        reason: 'Tentative de dépassement du solde du fonds.',
      }),
    ).rejects.toThrow();

    void familyA;
  });

  it('refuses to refund an allocated donation but refunds an unallocated one', async () => {
    const db = await getDb();
    const family = await createBeneficiary(db, { size: 5, incomeDzd: 25000 });
    const donor = await createUser(db, { role: 'donor' });
    const admin = await createUser(db, { role: 'admin' });
    const { requestId } = await publishedRequest(family.userId);

    const allocated = await createDonation(db, {
      userId: donor.userId,
      target: 'request',
      requestId,
      amountCentimes: 150_000,
      idempotencyKey: 'refund-allocated',
    });
    await confirmDemoPayment(db, { userId: donor.userId, donationId: allocated.id });

    await expect(
      refundDonation(db, {
        adminUserId: admin.userId,
        donationId: allocated.id,
        reason: 'Demande de remboursement du donateur.',
      }),
    ).rejects.toThrow('REFUND_BLOCKED_ALLOCATED');

    const balanceBefore = await db.query<{ balance: unknown }>(
      'select balance_centimes as balance from solidarity_fund',
    );
    const before = num(balanceBefore[0].balance);

    const unallocated = await createDonation(db, {
      userId: donor.userId,
      target: 'fund',
      requestId: null,
      amountCentimes: 50_000,
      idempotencyKey: 'refund-unallocated',
    });
    await confirmDemoPayment(db, { userId: donor.userId, donationId: unallocated.id });

    const refund = await refundDonation(db, {
      adminUserId: admin.userId,
      donationId: unallocated.id,
      reason: 'Remboursement demandé avant toute affectation.',
    });
    expect(refund.amountCentimes).toBe(50_000);

    const donation = await db.query<{ status: string }>('select status from donations where id = $1', [
      unallocated.id,
    ]);
    expect(donation[0].status).toBe('refunded');

    const fund = await db.query<{ balance: unknown }>('select balance_centimes as balance from solidarity_fund');
    expect(num(fund[0].balance)).toBe(before);
  });

  it('prevents a donor from paying another donor\'s donation', async () => {
    const db = await getDb();
    const family = await createBeneficiary(db, { size: 5, incomeDzd: 25000 });
    const donorA = await createUser(db, { role: 'donor' });
    const donorB = await createUser(db, { role: 'donor' });
    const { requestId } = await publishedRequest(family.userId);

    const donation = await createDonation(db, {
      userId: donorA.userId,
      target: 'request',
      requestId,
      amountCentimes: 100_000,
      idempotencyKey: 'ownership-check',
    });

    await expect(confirmDemoPayment(db, { userId: donorB.userId, donationId: donation.id })).rejects.toThrow(
      'FORBIDDEN',
    );
  });
});
