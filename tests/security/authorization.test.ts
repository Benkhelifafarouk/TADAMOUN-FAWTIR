import { describe, expect, it } from 'vitest';
import { getDb } from '@/lib/db';
import { num } from '@/lib/db/values';
import { getBillDetail } from '@/lib/bills/service';
import { getDonationDetail, getReceipt } from '@/lib/data/workspace';
import { createDonation, confirmDemoPayment } from '@/lib/donations/service';
import { signFileToken, verifyFileToken } from '@/lib/storage/signed-url';
import * as eligibilityService from '@/lib/eligibility/service';
import { setupTestDatabase } from '../helpers/db';
import { createBeneficiary, createUser, latestDecision, submitSampleBill } from '../helpers/factories';

setupTestDatabase();

describe('authorization and integrity controls', () => {
  it('does not return another household bill detail', async () => {
    const db = await getDb();
    const owner = await createBeneficiary(db, { size: 5, incomeDzd: 25000 });
    const stranger = await createBeneficiary(db, { size: 5, incomeDzd: 25000 });

    const submitted = await submitSampleBill(owner.userId);

    expect(await getBillDetail(db, submitted.billId, stranger.userId)).toBeNull();
    expect(await getBillDetail(db, submitted.billId, owner.userId)).not.toBeNull();
  });

  it('does not return another donor donation or receipt', async () => {
    const db = await getDb();
    const family = await createBeneficiary(db, { size: 5, incomeDzd: 25000 });
    const donorA = await createUser(db, { role: 'donor' });
    const donorB = await createUser(db, { role: 'donor' });

    const submitted = await submitSampleBill(family.userId);
    const request = await db.query<{ id: string }>(
      'select id from assistance_requests where public_ref = $1',
      [submitted.publicRef],
    );

    const donation = await createDonation(db, {
      userId: donorA.userId,
      target: 'request',
      requestId: request[0].id,
      amountCentimes: 100_000,
      idempotencyKey: 'authz-donation',
    });
    await confirmDemoPayment(db, { userId: donorA.userId, donationId: donation.id });

    expect(await getDonationDetail(donorB.userId, donation.id)).toBeNull();
    expect(await getReceipt(donorB.userId, donation.id)).toBeNull();
    expect(await getDonationDetail(donorA.userId, donation.id)).not.toBeNull();
  });

  it('has no manual approval path in the eligibility module', () => {
    const exported = Object.keys(eligibilityService);
    expect(exported.sort()).toEqual(['buildAnonymizedDescriptions', 'evaluateBill', 'submitAppeal']);
    expect(exported.some((name) => /approve|override|force/i.test(name))).toBe(false);
  });

  it('database refuses to publish from a non-approved decision', async () => {
    const db = await getDb();
    const first = await createBeneficiary(db, { size: 5, incomeDzd: 25000 });
    const second = await createBeneficiary(db, { size: 9, incomeDzd: 20000 });

    await submitSampleBill(first.userId);
    const pending = await submitSampleBill(second.userId);
    expect(pending.decision).toBe('NEEDS_ADDITIONAL_DOCUMENTS');

    const decision = await latestDecision(db, pending.billId);
    const bill = await db.query<{ service_category_id: string; provider_id: string }>(
      'select service_category_id, provider_id from bills where id = $1',
      [pending.billId],
    );
    const profile = await db.query<{ wilaya_id: string }>(
      'select wilaya_id from beneficiary_profiles where user_id = $1',
      [second.userId],
    );

    await expect(
      db.query(
        `insert into assistance_requests
           (bill_id, beneficiary_id, verification_decision_id, service_category_id, provider_id,
            wilaya_id, status, eligible_amount_centimes, anonymized_description,
            anonymized_description_fr, description_locale, published_at)
         values ($1, $2, $3, $4, $5, $6, 'published', 100000, $7, $8, 'ar', now())`,
        [
          pending.billId,
          (await db.query<{ id: string }>('select id from beneficiary_profiles where user_id = $1', [second.userId]))[0]
            .id,
          decision.id,
          bill[0].service_category_id,
          bill[0].provider_id,
          profile[0].wilaya_id,
          'محاولة نشر غير مصرح بها لطلب مساعدة على سداد فاتورة منزلية ضرورية.',
          "Tentative de publication non autorisée d'une demande d'aide pour une facture domestique.",
        ],
      ),
    ).rejects.toThrow(/PUBLISH_REQUIRES_APPROVED_DECISION|PUBLISH_AMOUNT_EXCEEDS_DECISION/);
  });

  it('database refuses an allocation that would overfund a request', async () => {
    const db = await getDb();
    const family = await createBeneficiary(db, { size: 5, incomeDzd: 25000 });
    const donor = await createUser(db, { role: 'donor' });
    const submitted = await submitSampleBill(family.userId);

    const request = await db.query<{ id: string; eligible: unknown }>(
      'select id, eligible_amount_centimes as eligible from assistance_requests where public_ref = $1',
      [submitted.publicRef],
    );
    const eligible = num(request[0].eligible);

    const donation = await db.query<{ id: string }>(
      `insert into donations (donor_user_id, target, assistance_request_id, amount_centimes, status,
                              payment_provider, idempotency_key, paid_at)
       values ($1, 'request', $2, $3, 'paid', 'demo', 'trigger-overfund', now())
       returning id`,
      [donor.userId, request[0].id, String(eligible + 100_000)],
    );

    await expect(
      db.query(
        `insert into donation_allocations (donation_id, assistance_request_id, amount_centimes, source)
         values ($1, $2, $3, 'direct')`,
        [donation[0].id, request[0].id, String(eligible + 1)],
      ),
    ).rejects.toThrow(/OVERFUNDING_BLOCKED/);
  });

  it('database refuses a fund allocation beyond the available balance', async () => {
    const db = await getDb();
    const fund = await db.query<{ id: string }>('select id from solidarity_fund limit 1');

    await expect(
      db.query(
        `insert into fund_ledger_entries (fund_id, entry_type, amount_centimes, reason)
         values ($1, 'allocation', -100000, 'test negative balance')`,
        [fund[0].id],
      ),
    ).rejects.toThrow(/FUND_INSUFFICIENT_BALANCE/);
  });

  it('rejects tampered or expired private file links', () => {
    const token = signFileToken({
      k: 'bills/2026/11/00000000-0000-0000-0000-000000000000.pdf',
      u: 'user-1',
      e: Math.floor(Date.now() / 1000) + 60,
    });
    expect(verifyFileToken(token)?.u).toBe('user-1');

    const tampered = `${token.slice(0, -2)}${token.endsWith('a') ? 'bb' : 'aa'}`;
    expect(verifyFileToken(tampered)).toBeNull();

    const expired = signFileToken({
      k: 'bills/2026/11/00000000-0000-0000-0000-000000000000.pdf',
      u: 'user-1',
      e: Math.floor(Date.now() / 1000) - 10,
    });
    expect(verifyFileToken(expired)).toBeNull();
  });

  it('stores append-only tables protected by triggers', async () => {
    const db = await getDb();
    const fund = await db.query<{ id: string }>('select id from solidarity_fund limit 1');
    const entry = await db.query<{ id: string }>(
      `insert into fund_ledger_entries (fund_id, entry_type, amount_centimes, reason)
       values ($1, 'contribution', 1000, 'append-only test')
       returning id`,
      [fund[0].id],
    );
    await expect(
      db.query(`update fund_ledger_entries set reason = 'tampered' where id = $1`, [entry[0].id]),
    ).rejects.toThrow(/append-only/);
  });
});
