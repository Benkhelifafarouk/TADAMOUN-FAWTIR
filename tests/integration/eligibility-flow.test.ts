import { describe, expect, it } from 'vitest';
import { getDb } from '@/lib/db';
import { num } from '@/lib/db/values';
import { submitAppeal, evaluateBill } from '@/lib/eligibility/service';
import { submitHouseholdDocument } from '@/lib/bills/service';
import { setupTestDatabase } from '../helpers/db';
import {
  createBeneficiary,
  latestDecision,
  sampleBillFile,
  submitSampleBill,
} from '../helpers/factories';

setupTestDatabase();

describe('beneficiary journey (integration)', () => {
  it('turns a valid bill into an anonymised published request', async () => {
    const db = await getDb();
    const family = await createBeneficiary(db, { size: 5, incomeDzd: 25000 });

    const result = await submitSampleBill(family.userId);
    expect(result.decision).toBe('APPROVED');
    expect(result.publicRef).toMatch(/^TF-\d{4}-\d{6}$/);

    const request = await db.query<{
      id: string;
      status: string;
      eligible_amount_centimes: unknown;
      funded_amount_centimes: unknown;
      anonymized_description: string;
    }>('select * from assistance_requests where public_ref = $1', [result.publicRef]);

    expect(request).toHaveLength(1);
    expect(request[0].status).toBe('published');
    expect(num(request[0].eligible_amount_centimes)).toBe(845_000);
    expect(num(request[0].funded_amount_centimes)).toBe(0);

    const publicRow = await db.query<Record<string, unknown>>(
      'select * from public_assistance_requests where reference = $1',
      [result.publicRef],
    );
    expect(publicRow).toHaveLength(1);
    expect(publicRow[0].wilaya_code).toBe('16');

    const serialized = JSON.stringify(publicRow[0]);
    expect(serialized).not.toContain(family.email);
    expect(serialized).not.toContain('Test beneficiary');
    expect(serialized).not.toContain('@');
    expect(publicRow[0]).not.toHaveProperty('beneficiary_id');
    expect(publicRow[0]).not.toHaveProperty('account_number_hash');
  });

  it('rejects an exact duplicate of a previously approved bill', async () => {
    const db = await getDb();
    const first = await createBeneficiary(db, { size: 5, incomeDzd: 25000 });
    const second = await createBeneficiary(db, { size: 5, incomeDzd: 25000 });

    const approved = await submitSampleBill(first.userId, { nonce: '910001' });
    expect(approved.decision).toBe('APPROVED');

    const duplicate = await submitSampleBill(second.userId, { nonce: '910001' });
    expect(duplicate.decision).toBe('REJECTED');
    expect(duplicate.publicRef).toBeNull();

    const decision = await latestDecision(db, duplicate.billId);
    const reasons = await db.query<{ code: string }>(
      'select code from eligibility_decision_reasons where decision_id = $1',
      [decision.id],
    );
    expect(reasons.map((r) => r.code)).toContain('DUPLICATE_FILE');
  });

  it('requests only the necessary document, then re-evaluates automatically', async () => {
    const db = await getDb();
    const family = await createBeneficiary(db, { size: 9, incomeDzd: 20000 });

    const submitted = await submitSampleBill(family.userId);
    expect(submitted.decision).toBe('NEEDS_ADDITIONAL_DOCUMENTS');

    const docs = await db.query<{ id: string; doc_type: string; status: string }>(
      'select id, doc_type, status from document_requests where beneficiary_id = $1',
      [family.beneficiaryId],
    );
    expect(docs).toHaveLength(1);
    expect(docs[0].doc_type).toBe('family_status');
    expect(docs[0].status).toBe('pending');

    await submitHouseholdDocument({
      userId: family.userId,
      docType: 'family_status',
      documentRequestId: docs[0].id,
      file: sampleBillFile(1),
    });

    const fulfilled = await db.query<{ status: string }>(
      'select status from document_requests where id = $1',
      [docs[0].id],
    );
    expect(fulfilled[0].status).toBe('fulfilled');

    const decision = await latestDecision(db, submitted.billId);
    expect(decision.decision).toBe('APPROVED');

    const published = await db.query<{ public_ref: string }>(
      'select public_ref from assistance_requests where bill_id = $1',
      [submitted.billId],
    );
    expect(published[0]?.public_ref).toMatch(/^TF-/);
  });

  it('keeps the original decision when an appeal is filed', async () => {
    const db = await getDb();
    const first = await createBeneficiary(db, { size: 5, incomeDzd: 25000 });
    const second = await createBeneficiary(db, { size: 5, incomeDzd: 25000 });

    await submitSampleBill(first.userId, { nonce: '910002' });
    const duplicate = await submitSampleBill(second.userId, { nonce: '910002' });
    const original = await latestDecision(db, duplicate.billId);
    expect(original.decision).toBe('REJECTED');

    const appeal = await submitAppeal(db, {
      userId: second.userId,
      decisionId: original.id,
      message: 'La facture est bien la mienne, elle a été déposée par erreur deux fois.',
    });

    expect(appeal.decisionId).not.toBe(original.id);

    const decisions = await db.query<{ id: string; decision: string; supersedes_decision_id: string | null }>(
      `select d.id, d.decision, d.supersedes_decision_id
         from eligibility_decisions d
         join verification_requests vr on vr.id = d.verification_request_id
        where vr.bill_id = $1
        order by d.created_at`,
      [duplicate.billId],
    );

    expect(decisions.length).toBeGreaterThanOrEqual(2);
    expect(decisions[0].id).toBe(original.id);
    expect(decisions[0].decision).toBe('REJECTED');
    const latest = decisions[decisions.length - 1];
    expect(latest.supersedes_decision_id).toBe(original.id);

    const appealRow = await db.query<{ status: string; new_decision_id: string; outcome: string }>(
      'select status, new_decision_id, outcome from appeals where id = $1',
      [appeal.appealId],
    );
    expect(appealRow[0].status).toBe('resolved');
    expect(appealRow[0].new_decision_id).toBe(latest.id);
    expect(appealRow[0].outcome).toBe('REJECTED');
  });

  it('cannot approve a bill twice into two public requests', async () => {
    const db = await getDb();
    const family = await createBeneficiary(db, { size: 5, incomeDzd: 25000 });

    const first = await submitSampleBill(family.userId);
    await evaluateBill(db, first.billId);

    const requests = await db.query<{ count: number }>(
      'select count(*)::int as count from assistance_requests where bill_id = $1',
      [first.billId],
    );
    expect(num(requests[0].count)).toBe(1);
  });

  it('does not publish a request that exceeds the approved decision amount', async () => {
    const db = await getDb();
    const family = await createBeneficiary(db, { size: 5, incomeDzd: 500000 });
    const submitted = await submitSampleBill(family.userId);
    const decision = await latestDecision(db, submitted.billId);

    const bill = await db.query<{ service_category_id: string; provider_id: string; beneficiary_id: string }>(
      'select service_category_id, provider_id, beneficiary_id from bills where id = $1',
      [submitted.billId],
    );
    const profile = await db.query<{ wilaya_id: string }>(
      'select wilaya_id from beneficiary_profiles where id = $1',
      [bill[0].beneficiary_id],
    );

    await expect(
      db.query(
        `insert into assistance_requests
           (bill_id, beneficiary_id, verification_decision_id, service_category_id, provider_id,
            wilaya_id, status, eligible_amount_centimes, anonymized_description,
            anonymized_description_fr, description_locale, published_at)
         values ($1, $2, $3, $4, $5, $6, 'published', 9999999, $7, $8, 'ar', now())`,
        [
          submitted.billId,
          bill[0].beneficiary_id,
          decision.id,
          bill[0].service_category_id,
          bill[0].provider_id,
          profile[0].wilaya_id,
          'وصف مجهول لطلب مساعدة على سداد فاتورة منزلية ضرورية لأسرة محتاجة.',
          "Description anonyme d'une demande d'aide pour une facture domestique essentielle.",
        ],
      ),
    ).rejects.toThrow(/PUBLISH_REQUIRES_APPROVED_DECISION|PUBLISH_AMOUNT_EXCEEDS_DECISION/);
  });
});
