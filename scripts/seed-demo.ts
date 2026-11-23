import 'dotenv/config';
import { getDb } from '../lib/db';
import { hashPassword } from '../lib/security/passwords';
import { keyedHash } from '../lib/security/hash';
import { submitBill } from '../lib/bills/service';
import { createDonation, confirmDemoPayment } from '../lib/donations/service';
import { evaluateBill } from '../lib/eligibility/service';
import { buildBillPdf, demoSamples } from '../lib/demo/pdf';
import { seedRecurringJobs } from '../lib/jobs/runner';
import { env } from '../lib/env';
import { num } from '../lib/db/values';

/**
 * Synthetic demo data. Every identity here is fictional and every payment is a
 * simulation. Running the script twice is safe: existing demo users are reused.
 *
 * Credentials (documented in README):
 *   admin@demo.local      / Demo12345!
 *   donor@demo.local      / Demo12345!
 *   family1@demo.local    / Demo12345!
 *   family2@demo.local    / Demo12345!
 */

const PASSWORD = 'Demo12345!';

interface UserSeed {
  email: string;
  name: string;
  phone: string;
  role: 'admin' | 'donor' | 'beneficiary';
  wilayaCode?: string;
  municipalityCode?: string;
  size?: number;
  children?: number;
  incomeDzd?: number;
}

const USERS: UserSeed[] = [
  { email: 'admin@demo.local', name: 'Admin Démo', phone: '0550000001', role: 'admin' },
  { email: 'donor@demo.local', name: 'Donateur Démo', phone: '0550000002', role: 'donor' },
  {
    email: 'family1@demo.local',
    name: 'Famille Démo Une',
    phone: '0550000003',
    role: 'beneficiary',
    wilayaCode: '16',
    municipalityCode: '16001',
    size: 5,
    children: 3,
    incomeDzd: 25000,
  },
  {
    email: 'family2@demo.local',
    name: 'Famille Démo Deux',
    phone: '0550000004',
    role: 'beneficiary',
    wilayaCode: '31',
    municipalityCode: '31001',
    size: 4,
    children: 2,
    incomeDzd: 20000,
  },
];

async function ensureUser(seed: UserSeed): Promise<string> {
  const db = await getDb();
  const existing = await db.query<{ id: string }>('select id from users where email_normalized = lower($1)', [seed.email]);
  if (existing[0]) return existing[0].id;

  const passwordHash = await hashPassword(PASSWORD);
  const created = await db.query<{ id: string }>(
    `insert into users (email, password_hash, full_name, phone, phone_hash, phone_verified_at, preferred_locale)
     values ($1, $2, $3, $4, $5, now(), 'ar')
     returning id`,
    [seed.email, passwordHash, seed.name, seed.phone, keyedHash(seed.phone, 'phone')],
  );
  const id = created[0].id;
  await db.query('insert into user_roles (user_id, role) values ($1, $2)', [id, seed.role]);
  if (seed.role === 'donor') {
    await db.query('insert into donor_profiles (user_id, is_anonymous) values ($1, true)', [id]);
  }
  await db.query(
    `insert into consent_records (user_id, consent_type, policy_version, granted, locale)
     values ($1, 'terms', '2026-11-draft', true, 'fr'), ($1, 'privacy', '2026-11-draft', true, 'fr')`,
    [id],
  );
  return id;
}

async function ensureProfile(userId: string, seed: UserSeed): Promise<void> {
  const db = await getDb();
  const wilaya = await db.query<{ id: string }>('select id from wilayas where code = $1', [seed.wilayaCode ?? '']);
  const municipality = await db.query<{ id: string }>(
    `select m.id from municipalities m join wilayas w on w.id = m.wilaya_id
      where w.code = $1 and m.code = $2`,
    [seed.wilayaCode ?? '', seed.municipalityCode ?? ''],
  );
  if (!wilaya[0]) return;

  const profile = await db.query<{ id: string }>(
    `insert into beneficiary_profiles (user_id, wilaya_id, municipality_id, status, profile_completed_at)
     values ($1, $2, $3, 'complete', now())
     on conflict (user_id) do update set status = 'complete'
     returning id`,
    [userId, wilaya[0].id, municipality[0]?.id ?? null],
  );
  const beneficiaryId = profile[0].id;

  await db.query(
    `insert into households (beneficiary_id, size, children_count, monthly_income_centimes, income_source, housing_status)
     values ($1, $2, $3, $4, 'salaire', 'tenant')
     on conflict (beneficiary_id) do update
       set size = excluded.size, children_count = excluded.children_count,
           monthly_income_centimes = excluded.monthly_income_centimes`,
    [beneficiaryId, seed.size ?? 4, seed.children ?? 0, String((seed.incomeDzd ?? 25000) * 100)],
  );

  await db.query(
    `insert into eligibility_profiles (beneficiary_id, declared_income_centimes, household_size)
     values ($1, $2, $3)
     on conflict (beneficiary_id) do update
       set declared_income_centimes = excluded.declared_income_centimes, household_size = excluded.household_size`,
    [beneficiaryId, String((seed.incomeDzd ?? 25000) * 100), seed.size ?? 4],
  );
}

async function providerIdByCode(code: string): Promise<string | null> {
  const db = await getDb();
  const rows = await db.query<{ id: string; category_id: string }>(
    'select id, category_id from service_providers where code = $1',
    [code],
  );
  return rows[0]?.id ?? null;
}

async function main(): Promise<void> {
  if (!env().demoMode) {
    throw new Error('DEMO_MODE is false: refusing to seed synthetic identities.');
  }

  const db = await getDb();

  const ids: Record<string, string> = {};
  for (const seed of USERS) {
    ids[seed.email] = await ensureUser(seed);
  }

  for (const seed of USERS.filter((user) => user.role === 'beneficiary')) {
    const userId = ids[seed.email];
    await ensureProfile(userId, seed);
  }

  const existingBills = await db.query<{ count: number }>('select count(*)::int as count from bills');
  if (num(existingBills[0]?.count) === 0) {
    const samples = demoSamples();
    const sonelgaz = await providerIdByCode('sonelgaz');
    const ade = await providerIdByCode('ade');

    if (sonelgaz && ade) {
      const family1 = ids['family1@demo.local'];
      const family2 = ids['family2@demo.local'];

      const categoryOfSonelgaz = await db.query<{ category_id: string }>(
        'select category_id from service_providers where id = $1',
        [sonelgaz],
      );
      const categoryOfAde = await db.query<{ category_id: string }>(
        'select category_id from service_providers where id = $1',
        [ade],
      );

      const pdf1 = buildBillPdf(samples[0]);
      const result1 = await submitBill({
        userId: family1,
        providerId: sonelgaz,
        categoryId: categoryOfSonelgaz[0].category_id,
        file: new File([new Uint8Array(pdf1)], 'demo-sonelgaz.pdf', { type: 'application/pdf' }),
      });
      console.info(`family1 bill → ${result1.decision} ${result1.publicRef ?? ''}`);

      // Same file bytes on a second household: an exact duplicate must be
      // rejected with an explicit reason, not silently accepted.
      try {
        const duplicate = await submitBill({
          userId: family2,
          providerId: sonelgaz,
          categoryId: categoryOfSonelgaz[0].category_id,
          file: new File([new Uint8Array(pdf1)], 'demo-copy.pdf', { type: 'application/pdf' }),
        });
        console.info(`family2 duplicate → ${duplicate.decision}`);
      } catch (error) {
        console.info(`family2 duplicate blocked: ${error instanceof Error ? error.message : 'unknown'}`);
      }

      const pdf2 = buildBillPdf(samples[1]);
      const result2 = await submitBill({
        userId: family2,
        providerId: ade,
        categoryId: categoryOfAde[0].category_id,
        file: new File([new Uint8Array(pdf2)], 'demo-ade.pdf', { type: 'application/pdf' }),
      });
      console.info(`family2 water bill → ${result2.decision} ${result2.publicRef ?? ''}`);

      // Donor flow: contribute to the first published request and to the fund.
      const donorId = ids['donor@demo.local'];
      const request = await db.query<{ id: string; eligible: unknown; funded: unknown }>(
        `select id, eligible_amount_centimes as eligible, funded_amount_centimes as funded
           from assistance_requests
          where status in ('published', 'partially_funded')
          order by published_at asc limit 1`,
      );
      if (request[0]) {
        const remaining = num(request[0].eligible) - num(request[0].funded);
        const amount = Math.min(200_000, remaining);
        const donation = await createDonation(db, {
          userId: donorId,
          target: 'request',
          requestId: request[0].id,
          amountCentimes: amount,
          idempotencyKey: `demo-request-donation:${request[0].id}`,
        });
        await confirmDemoPayment(db, { userId: donorId, donationId: donation.id });

        const fundDonation = await createDonation(db, {
          userId: donorId,
          target: 'fund',
          requestId: null,
          amountCentimes: 500_000,
          idempotencyKey: 'demo-fund-contribution:v1',
        });
        await confirmDemoPayment(db, { userId: donorId, donationId: fundDonation.id });
        console.info('demo donations captured (simulated) and receipts issued');
      }

      // Re-run evaluation for any bill left pending, then seed scheduled jobs.
      const pending = await db.query<{ id: string }>("select id from bills where status = 'processing'");
      for (const row of pending) {
        try {
          await evaluateBill(db, row.id);
        } catch {
          // a pending evaluation is retried by the job queue
        }
      }
    }
  } else {
    console.info('Bills already present: demo bill/donation seeding skipped.');
  }

  await seedRecurringJobs(db);
  await db.close();
  console.info('Demo seed complete.');
  console.info('Logins: admin@demo.local / donor@demo.local / family1@demo.local / family2@demo.local');
  console.info(`Password: ${PASSWORD}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
