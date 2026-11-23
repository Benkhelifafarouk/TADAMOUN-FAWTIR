'use server';

import { revalidatePath } from 'next/cache';
import { getDb } from '@/lib/db';
import { requireUserAction } from '@/lib/auth/guards';
import { recordSecurityEvent } from '@/lib/security/audit';
import { notify } from '@/lib/notifications/service';
import { adminPolicySchema, adminRuleVersionSchema, zodParse, formToObject, municipalitySchema, providerSchema, settingSchema } from '@/lib/validation/schemas';
import type { ActionState } from './state';
import { toActionError } from './errors';

export async function updateSettingAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = zodParse(settingSchema, formToObject(formData));
  if (!parsed.ok) return { ok: false, fieldErrors: parsed.fieldErrors, message: 'actionErrors.VALIDATION' };
  try {
    const user = await requireUserAction();
    if (!user.roles.includes('admin')) return { ok: false, message: 'actionErrors.FORBIDDEN' };
    const db = await getDb();
    let value: unknown;
    try {
      value = JSON.parse(parsed.data.value);
    } catch {
      value = parsed.data.value;
    }
    await db.query(
      `insert into platform_settings (key, value, updated_by)
       values ($1, $2, $3)
       on conflict (key) do update set value = excluded.value, updated_by = excluded.updated_by, updated_at = now()`,
      [parsed.data.key, JSON.stringify(value), user.id],
    );
    await recordSecurityEvent(db, {
      eventType: 'admin.setting_changed',
      severity: 'medium',
      userId: user.id,
      details: { key: parsed.data.key },
    });
    revalidatePath('/admin/settings');
    return { ok: true, message: 'admin.settingsSaved' };
  } catch (error) {
    return toActionError(error);
  }
}

export async function addMunicipalityAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = zodParse(municipalitySchema, formToObject(formData));
  if (!parsed.ok) return { ok: false, fieldErrors: parsed.fieldErrors, message: 'actionErrors.VALIDATION' };
  try {
    const user = await requireUserAction();
    if (!user.roles.includes('admin')) return { ok: false, message: 'actionErrors.FORBIDDEN' };
    const db = await getDb();
    await db.query(
      `insert into municipalities (wilaya_id, code, name_ar, name_fr) values ($1, $2, $3, $4)`,
      [parsed.data.wilayaId, parsed.data.code, parsed.data.nameAr, parsed.data.nameFr],
    );
    revalidatePath('/admin/config');
    return { ok: true, message: 'common.saved' };
  } catch (error) {
    return toActionError(error);
  }
}

export async function addProviderAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = zodParse(providerSchema, formToObject(formData));
  if (!parsed.ok) return { ok: false, fieldErrors: parsed.fieldErrors, message: 'actionErrors.VALIDATION' };
  try {
    const user = await requireUserAction();
    if (!user.roles.includes('admin')) return { ok: false, message: 'actionErrors.FORBIDDEN' };
    const db = await getDb();
    await db.query(
      `insert into service_providers (category_id, code, name_ar, name_fr) values ($1, $2, $3, $4)`,
      [parsed.data.categoryId, parsed.data.code, parsed.data.nameAr, parsed.data.nameFr],
    );
    revalidatePath('/admin/config');
    return { ok: true, message: 'common.saved' };
  } catch (error) {
    return toActionError(error);
  }
}

export async function savePolicyAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = zodParse(adminPolicySchema, formToObject(formData));
  if (!parsed.ok) return { ok: false, fieldErrors: parsed.fieldErrors, message: 'actionErrors.VALIDATION' };
  try {
    const user = await requireUserAction();
    if (!user.roles.includes('admin')) return { ok: false, message: 'actionErrors.FORBIDDEN' };
    const db = await getDb();

    await db.transaction(async (tx) => {
      await tx.query(
        `update assistance_policies set is_active = false, effective_to = now()
          where service_category_id = $1 and is_active`,
        [parsed.data.categoryId],
      );
      const created = await tx.query<{ id: string }>(
        `insert into assistance_policies
           (service_category_id, period, base_limit_centimes, version, is_active, created_by)
         values ($1, $2, $3,
                 coalesce((select max(version) + 1 from assistance_policies where service_category_id = $1), 1),
                 true, $4)
         returning id`,
        [parsed.data.categoryId, parsed.data.period, String(parsed.data.limitCentimes), user.id],
      );
      const policyId = created[0].id;
      const tiers: [number, number | null, number][] = [
        [1, 2, parsed.data.tier1Multiplier],
        [3, 5, parsed.data.tier2Multiplier],
        [6, null, parsed.data.tier3Multiplier],
      ];
      for (const [min, max, multiplier] of tiers) {
        await tx.query(
          `insert into assistance_tiers (policy_id, min_household_size, max_household_size, multiplier)
           values ($1, $2, $3, $4)`,
          [policyId, min, max, multiplier],
        );
      }
    });

    await recordSecurityEvent(db, {
      eventType: 'admin.policy_changed',
      severity: 'high',
      userId: user.id,
      details: { categoryId: parsed.data.categoryId, limit: parsed.data.limitCentimes, period: parsed.data.period },
    });
    revalidatePath('/admin/rules');
    return { ok: true, message: 'common.saved' };
  } catch (error) {
    return toActionError(error);
  }
}

export async function createRuleVersionAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = zodParse(adminRuleVersionSchema, formToObject(formData));
  if (!parsed.ok) return { ok: false, fieldErrors: parsed.fieldErrors, message: 'actionErrors.VALIDATION' };
  try {
    const user = await requireUserAction();
    if (!user.roles.includes('admin')) return { ok: false, message: 'actionErrors.FORBIDDEN' };
    const db = await getDb();

    const active = await db.query<{ config: unknown }>(
      `select v.config from eligibility_rule_versions v
         join eligibility_rules r on r.id = v.rule_id
        where r.key = 'standard_eligibility' and v.is_active
        order by v.version desc limit 1`,
    );
    const baseConfig = (typeof active[0]?.config === 'string' ? JSON.parse(active[0].config) : active[0]?.config) as Record<string, unknown>;
    if (!baseConfig) return { ok: false, message: 'actionErrors.GENERIC' };

    const config = {
      ...baseConfig,
      minOverallConfidence: parsed.data.minOverallConfidence,
      minCriticalFieldConfidence: parsed.data.minCriticalFieldConfidence,
      maxBillAgeDays: parsed.data.maxBillAgeDays,
      income: {
        ...(baseConfig.income as Record<string, unknown>),
        maxMonthlyIncomePerPersonCentimes: parsed.data.maxMonthlyIncomePerPersonCentimes,
        absoluteMaxMonthlyIncomeCentimes: parsed.data.absoluteMaxMonthlyIncomeCentimes,
        requireDocumentAbovePerPersonCentimes: parsed.data.requireDocumentAbovePerPersonCentimes,
      },
      risk: {
        ...(baseConfig.risk as Record<string, unknown>),
        blockAtScore: parsed.data.blockAtScore,
        uncertainAtScore: parsed.data.uncertainAtScore,
      },
    };

    await db.transaction(async (tx) => {
      const rule = await tx.query<{ id: string }>(
        `select id from eligibility_rules where key = 'standard_eligibility'`,
      );
      if (!rule[0]) throw new Error('RULE_MISSING');
      await tx.query(
        `update eligibility_rule_versions set is_active = false, effective_to = now()
          where rule_id = $1 and is_active`,
        [rule[0].id],
      );
      await tx.query(
        `insert into eligibility_rule_versions (rule_id, version, config, is_active, created_by)
         values ($1, (select coalesce(max(version), 0) + 1 from eligibility_rule_versions where rule_id = $1), $2, true, $3)`,
        [rule[0].id, JSON.stringify(config), user.id],
      );
    });

    await recordSecurityEvent(db, {
      eventType: 'admin.rules_changed',
      severity: 'high',
      userId: user.id,
      details: { thresholds: { confidence: parsed.data.minOverallConfidence, blockAt: parsed.data.blockAtScore } },
    });
    revalidatePath('/admin/rules');
    return { ok: true, message: 'common.saved' };
  } catch (error) {
    return toActionError(error);
  }
}

export async function updateUserStatusAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireUserAction();
    if (!user.roles.includes('admin')) return { ok: false, message: 'actionErrors.FORBIDDEN' };
    const targetId = String(formData.get('userId') ?? '');
    const status = String(formData.get('status') ?? '');
    const reason = String(formData.get('reason') ?? '').slice(0, 300);
    if (!['active', 'suspended'].includes(status) || !targetId) {
      return { ok: false, message: 'actionErrors.VALIDATION' };
    }
    if (targetId === user.id) return { ok: false, message: 'actionErrors.CANNOT_MODIFY_SELF' };
    if (reason.length < 5) return { ok: false, message: 'actionErrors.REASON_REQUIRED' };

    const db = await getDb();
    await db.query('update users set status = $2 where id = $1', [targetId, status]);
    await recordSecurityEvent(db, {
      eventType: 'admin.user_status_changed',
      severity: 'high',
      userId: user.id,
      details: { targetId, status, reason },
    });
    revalidatePath('/admin/users');
    return { ok: true, message: 'admin.userUpdated' };
  } catch (error) {
    return toActionError(error);
  }
}

export async function markFraudSignalAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireUserAction();
    if (!user.roles.includes('admin')) return { ok: false, message: 'actionErrors.FORBIDDEN' };
    const signalId = String(formData.get('signalId') ?? '');
    const status = String(formData.get('status') ?? '');
    if (!['reviewed', 'dismissed'].includes(status)) return { ok: false, message: 'actionErrors.VALIDATION' };
    const db = await getDb();
    await db.query(
      `update fraud_signals set status = $2, reviewed_at = now(), reviewed_by = $3 where id = $1`,
      [signalId, status, user.id],
    );
    await recordSecurityEvent(db, {
      eventType: 'admin.fraud_signal_reviewed',
      severity: 'medium',
      userId: user.id,
      details: { signalId, status },
    });
    revalidatePath('/admin/moderation');
    return { ok: true, message: 'admin.reviewed' };
  } catch (error) {
    return toActionError(error);
  }
}

export async function markRequestPaidAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireUserAction();
    if (!user.roles.includes('admin')) return { ok: false, message: 'actionErrors.FORBIDDEN' };
    const requestId = String(formData.get('requestId') ?? '');
    const reference = String(formData.get('reference') ?? '').trim();
    if (!requestId || reference.length < 3) return { ok: false, message: 'actionErrors.REFERENCE_REQUIRED' };

    const db = await getDb();
    await db.transaction(async (tx) => {
      const rows = await tx.query<{ id: string; status: string; funded: unknown; public_ref: string; beneficiary_id: string }>(
        `select id, status, funded_amount_centimes as funded, public_ref, beneficiary_id
           from assistance_requests where id = $1 for update`,
        [requestId],
      );
      const request = rows[0];
      if (!request) throw new Error('REQUEST_NOT_FOUND');
      if (request.status !== 'funded') throw new Error('REQUEST_NOT_FUNDED');
      await tx.query(
        `update assistance_requests
            set status = 'paid', paid_amount_centimes = funded_amount_centimes, paid_at = now()
          where id = $1`,
        [requestId],
      );
      await tx.query(
        `insert into request_status_history (request_id, from_status, to_status, reason, actor_type, actor_user_id)
         values ($1, 'funded', 'paid', $2, 'admin', $3)`,
        [requestId, `PROVIDER_PAYMENT:${reference}`.slice(0, 300), user.id],
      );
      const owner = await tx.query<{ user_id: string }>(
        'select user_id from beneficiary_profiles where id = $1',
        [request.beneficiary_id],
      );
      if (owner[0]) {
        await notify(tx, {
          userId: owner[0].user_id,
          event: 'payment_completed',
          params: { reference: request.public_ref },
          dedupeKey: `paid:${requestId}`,
        });
      }
    });

    await recordSecurityEvent(db, {
      eventType: 'admin.request_marked_paid',
      severity: 'high',
      userId: user.id,
      details: { requestId, reference },
    });
    revalidatePath('/admin/finance');
    return { ok: true, message: 'common.saved' };
  } catch (error) {
    return toActionError(error);
  }
}

export async function resolveTicketAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireUserAction();
    if (!user.roles.includes('admin')) return { ok: false, message: 'actionErrors.FORBIDDEN' };
    const ticketId = String(formData.get('ticketId') ?? '');
    const status = String(formData.get('status') ?? '');
    if (!['in_progress', 'resolved', 'closed'].includes(status)) {
      return { ok: false, message: 'actionErrors.VALIDATION' };
    }
    const db = await getDb();
    await db.query('update support_tickets set status = $2, assigned_to = $3 where id = $1', [ticketId, status, user.id]);
    revalidatePath('/admin/support');
    return { ok: true, message: 'admin.statusUpdated' };
  } catch (error) {
    return toActionError(error);
  }
}
