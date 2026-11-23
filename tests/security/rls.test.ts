import { afterEach, describe, expect, it } from 'vitest';
import { getDb } from '@/lib/db';
import { num } from '@/lib/db/values';
import { setupTestDatabase } from '../helpers/db';
import { createBeneficiary, submitSampleBill } from '../helpers/factories';

setupTestDatabase();

/**
 * RLS is verified with a NON-SUPERUSER role (`authenticated` / `anon`), which is
 * exactly how Supabase exposes the database through PostgREST. The application
 * server itself connects as the owner, so these tests are the only place where
 * policy behaviour is observed.
 */

async function asUser<T>(userId: string, fn: () => Promise<T>): Promise<T> {
  const db = await getDb();
  try {
    await db.query('set role authenticated');
    await db.query("select set_config('app.current_user_id', $1, false)", [userId]);
    return await fn();
  } finally {
    await db.query("select set_config('app.current_user_id', '', false)");
    await db.query('reset role');
  }
}

async function asAnon<T>(fn: () => Promise<T>): Promise<T> {
  const db = await getDb();
  try {
    await db.query('set role anon');
    return await fn();
  } finally {
    await db.query('reset role');
  }
}

afterEach(async () => {
  const db = await getDb();
  await db.query('reset role');
});

describe('row level security', () => {
  it('limits a beneficiary to their own rows', async () => {
    const db = await getDb();
    const owner = await createBeneficiary(db, { size: 5, incomeDzd: 25000 });
    const other = await createBeneficiary(db, { size: 5, incomeDzd: 30000 });

    const ownerBill = await submitSampleBill(owner.userId);
    const otherBill = await submitSampleBill(other.userId);

    const visibleBills = await asUser(owner.userId, () => db.query<{ id: string }>('select id from bills'));
    expect(visibleBills).toHaveLength(1);
    expect(visibleBills[0].id).toBe(ownerBill.billId);

    const foreignBill = await asUser(owner.userId, () =>
      db.query<{ id: string }>('select id from bills where id = $1', [otherBill.billId]),
    );
    expect(foreignBill).toHaveLength(0);

    const profiles = await asUser(owner.userId, () =>
      db.query<{ id: string }>('select id from beneficiary_profiles'),
    );
    expect(profiles).toHaveLength(1);

    const users = await asUser(owner.userId, () => db.query<{ id: string }>('select id from users'));
    expect(users).toHaveLength(1);
    expect(users[0].id).toBe(owner.userId);

    const foreignRequests = await asUser(other.userId, () =>
      db.query<{ id: string }>('select id from assistance_requests where bill_id = $1', [ownerBill.billId]),
    );
    expect(foreignRequests).toHaveLength(0);
  });

  it('cannot update another household profile', async () => {
    const db = await getDb();
    const owner = await createBeneficiary(db, { size: 5, incomeDzd: 25000 });
    const other = await createBeneficiary(db, { size: 5, incomeDzd: 30000 });

    const before = await db.query<{ size: number }>('select size from households where beneficiary_id = $1', [
      other.beneficiaryId,
    ]);

    await asUser(owner.userId, async () => {
      const updated = await db.query(
        'update households set size = 99 where beneficiary_id = $1 returning id',
        [other.beneficiaryId],
      );
      expect(updated).toHaveLength(0);
    });

    const after = await db.query<{ size: number }>('select size from households where beneficiary_id = $1', [
      other.beneficiaryId,
    ]);
    expect(after[0].size).toBe(before[0].size);
  });

  it('exposes anonymised requests to anon but no base table', async () => {
    const db = await getDb();
    const family = await createBeneficiary(db, { size: 5, incomeDzd: 25000 });
    const submitted = await submitSampleBill(family.userId);
    expect(submitted.decision).toBe('APPROVED');

    const publicRows = await asAnon(() =>
      db.query<{ reference: string; eligible_amount_centimes: unknown }>(
        'select reference, eligible_amount_centimes from public_assistance_requests',
      ),
    );
    expect(publicRows.length).toBeGreaterThanOrEqual(1);
    expect(num(publicRows[0].eligible_amount_centimes)).toBeGreaterThan(0);

    await expect(asAnon(() => db.query('select id from assistance_requests'))).rejects.toThrow();
    await expect(asAnon(() => db.query('select id from stored_files'))).rejects.toThrow();
    await expect(asAnon(() => db.query('select id from users'))).rejects.toThrow();
    await expect(asAnon(() => db.query('select id from notifications'))).rejects.toThrow();
  });

  it('hides audit logs from non-administrators', async () => {
    const db = await getDb();
    const donor = await createBeneficiary(db, { size: 5, incomeDzd: 25000 });
    const rows = await asUser(donor.userId, () => db.query<{ id: string }>('select id from audit_logs'));
    expect(rows).toHaveLength(0);
  });

  it('never exposes private columns in the public projection', async () => {
    const db = await getDb();
    const columns = await db.query<{ column_name: string }>(
      `select column_name from information_schema.columns
        where table_name = 'public_assistance_requests'`,
    );
    const names = columns.map((row) => row.column_name);
    for (const forbidden of [
      'beneficiary_id',
      'bill_id',
      'verification_decision_id',
      'account_number_hash',
      'bill_reference',
      'full_name',
      'phone',
      'address_line',
      'storage_key',
      'ocr_text',
    ]) {
      expect(names).not.toContain(forbidden);
    }
    expect(names).toContain('reference');
    expect(names).toContain('anonymized_description');
  });
});
