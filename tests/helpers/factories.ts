import { getDb } from '@/lib/db';
import type { Db } from '@/lib/db/types';
import { hashPassword } from '@/lib/security/passwords';
import { keyedHash } from '@/lib/security/hash';
import { submitBill } from '@/lib/bills/service';
import { buildBillPdf, demoSamples } from '@/lib/demo/pdf';

export const TEST_PASSWORD = 'TestPass12345';

let counter = 0;

export interface TestBeneficiary {
  userId: string;
  beneficiaryId: string;
  email: string;
}

export async function createUser(
  db: Db,
  options: { role: 'beneficiary' | 'donor' | 'admin'; email?: string; phoneVerified?: boolean },
): Promise<{ userId: string; email: string }> {
  counter += 1;
  const email = options.email ?? `${options.role}${counter}@test.local`;
  const phone = `0550${String(100000 + counter).slice(0, 6)}`;
  const passwordHash = await hashPassword(TEST_PASSWORD);
  const rows = await db.query<{ id: string }>(
    `insert into users (email, password_hash, full_name, phone, phone_hash,
                        phone_verified_at, preferred_locale)
     values ($1, $2, $3, $4, $5, $6, 'ar')
     returning id`,
    [
      email,
      passwordHash,
      `Test ${options.role} ${counter}`,
      phone,
      keyedHash(phone, 'phone'),
      options.phoneVerified === false ? null : new Date(),
    ],
  );
  const userId = rows[0].id;
  await db.query('insert into user_roles (user_id, role) values ($1, $2)', [userId, options.role]);
  if (options.role === 'donor') {
    await db.query('insert into donor_profiles (user_id, is_anonymous) values ($1, true)', [userId]);
  }
  return { userId, email };
}

export async function createBeneficiary(
  db: Db,
  options: { size?: number; incomeDzd?: number; householdSize?: number; wilayaCode?: string; phoneVerified?: boolean } = {},
): Promise<TestBeneficiary> {
  const { userId, email } = await createUser(db, {
    role: 'beneficiary',
    phoneVerified: options.phoneVerified,
  });
  const size = options.householdSize ?? options.size ?? 4;
  const income = options.incomeDzd ?? 25000;

  const wilaya = await db.query<{ id: string }>('select id from wilayas where code = $1', [
    options.wilayaCode ?? '16',
  ]);

  const profile = await db.query<{ id: string }>(
    `insert into beneficiary_profiles (user_id, wilaya_id, status, profile_completed_at)
     values ($1, $2, 'complete', now())
     returning id`,
    [userId, wilaya[0].id],
  );
  const beneficiaryId = profile[0].id;

  await db.query(
    `insert into households (beneficiary_id, size, children_count, monthly_income_centimes, housing_status)
     values ($1, $2, 0, $3, 'tenant')`,
    [beneficiaryId, size, String(income * 100)],
  );
  await db.query(
    `insert into eligibility_profiles (beneficiary_id, declared_income_centimes, household_size)
     values ($1, $2, $3)`,
    [beneficiaryId, String(income * 100), size],
  );

  return { userId, beneficiaryId, email };
}

export async function provider(
  db: Db,
  code = 'sonelgaz',
): Promise<{ providerId: string; categoryId: string }> {
  const rows = await db.query<{ id: string; category_id: string }>(
    'select id, category_id from service_providers where code = $1',
    [code],
  );
  return { providerId: rows[0].id, categoryId: rows[0].category_id };
}

let nonceCounter = 700000;

/** Unique nonce per bill so that separate tests never collide on duplicate checks. */
export function nextNonce(): string {
  nonceCounter += 1;
  return String(nonceCounter);
}

export function sampleBillFile(index = 0, nonce: string = nextNonce()): File {
  const sample = demoSamples()[index];
  const pdf = buildBillPdf({
    ...sample,
    reference: `${sample.reference}${nonce}`,
    account: `01${nonce.padStart(8, '0').slice(-8)}`,
  });
  return new File([new Uint8Array(pdf)], `test-bill-${index}-${nonce}.pdf`, { type: 'application/pdf' });
}

export async function submitSampleBill(
  beneficiaryUserId: string,
  options: { index?: number; providerCode?: string; nonce?: string } = {},
): Promise<{ billId: string; decision: string; publicRef: string | null }> {
  const db = await getDb();
  const { providerId, categoryId } = await provider(db, options.providerCode ?? 'sonelgaz');
  const result = await submitBill({
    userId: beneficiaryUserId,
    providerId,
    categoryId,
    file: sampleBillFile(options.index ?? 0, options.nonce),
  });
  return { billId: result.billId, decision: result.decision, publicRef: result.publicRef };
}

export async function latestDecision(db: Db, billId: string): Promise<{
  id: string;
  decision: string;
  eligible_amount_centimes: unknown;
  supersedes_decision_id: string | null;
  appeal_id: string | null;
}> {
  const rows = await db.query<{
    id: string;
    decision: string;
    eligible_amount_centimes: unknown;
    supersedes_decision_id: string | null;
    appeal_id: string | null;
  }>(
    `select d.id, d.decision, d.eligible_amount_centimes, d.supersedes_decision_id, d.appeal_id
       from eligibility_decisions d
       join verification_requests vr on vr.id = d.verification_request_id
      where vr.bill_id = $1
      order by d.created_at desc
      limit 1`,
    [billId],
  );
  return rows[0];
}
