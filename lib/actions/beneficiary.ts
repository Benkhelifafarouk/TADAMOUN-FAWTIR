'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getDb } from '@/lib/db';
import { requireUserAction } from '@/lib/auth/guards';
import { destroyCurrentSession, revokeAllSessions } from '@/lib/auth/session';
import { recordAudit, recordSecurityEvent } from '@/lib/security/audit';
import { notify } from '@/lib/notifications/service';
import { submitBill, submitHouseholdDocument } from '@/lib/bills/service';
import { submitAppeal } from '@/lib/eligibility/service';
import {
  appealSchema,
  billUploadSchema,
  documentUploadSchema,
  formToObject,
  householdProfileSchema,
  zodParse,
} from '@/lib/validation/schemas';
import type { ActionState } from './state';
import { toActionError } from './errors';

export async function saveHouseholdProfileAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = zodParse(householdProfileSchema, formToObject(formData));
  if (!parsed.ok) return { ok: false, fieldErrors: parsed.fieldErrors, message: 'actionErrors.VALIDATION' };
  const input = parsed.data;

  try {
    const user = await requireUserAction();
    const db = await getDb();

    const wilaya = await db.query<{ id: string }>('select id from wilayas where id = $1 and is_active', [input.wilayaId]);
    if (!wilaya[0]) return { ok: false, fieldErrors: { wilayaId: 'invalidChoice' } };

    if (input.municipalityId) {
      const municipality = await db.query<{ id: string }>(
        'select id from municipalities where id = $1 and wilaya_id = $2 and is_active',
        [input.municipalityId, input.wilayaId],
      );
      if (!municipality[0]) return { ok: false, fieldErrors: { municipalityId: 'invalidChoice' } };
    }

    const complete = input.size >= 1 && input.incomeCentimes !== null;

    const before = await db.query<{ status: string } | Record<string, unknown>>(
      'select status from beneficiary_profiles where user_id = $1',
      [user.id],
    );

    await db.transaction(async (tx) => {
      const profile = await tx.query<{ id: string }>(
        `insert into beneficiary_profiles (user_id, wilaya_id, municipality_id, address_line, status, profile_completed_at)
         values ($1, $2, $3, $4, $5, $6)
         on conflict (user_id) do update
           set wilaya_id = excluded.wilaya_id,
               municipality_id = excluded.municipality_id,
               address_line = excluded.address_line,
               status = excluded.status,
               profile_completed_at = coalesce(beneficiary_profiles.profile_completed_at, excluded.profile_completed_at)
         returning id`,
        [
          user.id,
          input.wilayaId,
          input.municipalityId || null,
          input.address || null,
          complete ? 'complete' : 'draft',
          complete ? new Date() : null,
        ],
      );
      const beneficiaryId = profile[0].id;

      await tx.query(
        `insert into households (beneficiary_id, size, children_count, monthly_income_centimes, income_source, housing_status)
         values ($1, $2, $3, $4, $5, $6)
         on conflict (beneficiary_id) do update
           set size = excluded.size,
               children_count = excluded.children_count,
               monthly_income_centimes = excluded.monthly_income_centimes,
               income_source = excluded.income_source,
               housing_status = excluded.housing_status`,
        [
          beneficiaryId,
          input.size,
          input.children,
          input.incomeCentimes === null ? null : String(input.incomeCentimes),
          input.incomeSource || null,
          input.housingStatus ?? null,
        ],
      );

      await tx.query(
        `insert into eligibility_profiles (beneficiary_id, declared_income_centimes, household_size)
         values ($1, $2, $3)
         on conflict (beneficiary_id) do update
           set declared_income_centimes = excluded.declared_income_centimes,
               household_size = excluded.household_size`,
        [
          beneficiaryId,
          input.incomeCentimes === null ? null : String(input.incomeCentimes),
          input.size,
        ],
      );
    });

    await recordAudit(db, {
      actorUserId: user.id,
      actorRole: 'beneficiary',
      action: 'beneficiary.profile_saved',
      entityType: 'beneficiary_profile',
      entityId: user.id,
      beforeState: before[0] ?? null,
      afterState: { size: input.size, children: input.children, complete, incomeProvided: input.incomeCentimes !== null },
    });

    revalidatePath('/app', 'layout');
    return { ok: true, message: 'beneficiary.profileSaved' };
  } catch (error) {
    return toActionError(error);
  }
}

export async function uploadBillAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = zodParse(billUploadSchema, formToObject(formData));
  if (!parsed.ok) return { ok: false, fieldErrors: parsed.fieldErrors, message: 'actionErrors.VALIDATION' };

  try {
    const user = await requireUserAction();
    if (!user.phoneVerified) return { ok: false, message: 'actionErrors.PHONE_UNVERIFIED' };

    const file = formData.get('file');
    if (!(file instanceof File)) return { ok: false, fieldErrors: { file: 'fileRequired' } };

    const result = await submitBill({
      userId: user.id,
      providerId: parsed.data.providerId,
      categoryId: parsed.data.categoryId,
      file,
    });

    revalidatePath('/app', 'layout');
    return {
      ok: true,
      message: result.decision === 'APPROVED' ? 'beneficiary.billSubmitted' : 'beneficiary.billSubmitted',
      data: {
        billId: result.billId,
        decision: result.decision,
        publicRef: result.publicRef,
        ocrIsDemo: result.ocrIsDemo,
      },
    };
  } catch (error) {
    return toActionError(error);
  }
}

export async function uploadDocumentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = zodParse(documentUploadSchema, formToObject(formData));
  if (!parsed.ok) return { ok: false, fieldErrors: parsed.fieldErrors, message: 'actionErrors.VALIDATION' };

  try {
    const user = await requireUserAction();
    const file = formData.get('file');
    if (!(file instanceof File)) return { ok: false, fieldErrors: { file: 'fileRequired' } };

    const result = await submitHouseholdDocument({
      userId: user.id,
      docType: parsed.data.docType,
      file,
      documentRequestId: parsed.data.requestId ?? null,
    });

    revalidatePath('/app', 'layout');
    return { ok: true, message: 'beneficiary.documentUploaded', data: { decision: result.decision } };
  } catch (error) {
    return toActionError(error);
  }
}

export async function submitAppealAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = zodParse(appealSchema, formToObject(formData));
  if (!parsed.ok) return { ok: false, fieldErrors: parsed.fieldErrors, message: 'actionErrors.VALIDATION' };

  try {
    const user = await requireUserAction();
    const db = await getDb();
    const result = await submitAppeal(db, {
      userId: user.id,
      decisionId: parsed.data.decisionId,
      message: parsed.data.message,
    });

    revalidatePath('/app', 'layout');
    return {
      ok: true,
      message: 'beneficiary.appealSubmitted',
      data: { decision: result.decision },
    };
  } catch (error) {
    return toActionError(error);
  }
}

export async function markNotificationsReadAction(): Promise<void> {
  const user = await requireUserAction();
  const db = await getDb();
  await db.query('update notifications set read_at = now() where user_id = $1 and read_at is null', [user.id]);
  revalidatePath('/app/notifications');
}

export async function updateConsentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireUserAction();
    const db = await getDb();
    const consentType = String(formData.get('consentType') ?? '');
    if (!['terms', 'privacy', 'data_processing', 'marketing'].includes(consentType)) {
      return { ok: false, message: 'actionErrors.VALIDATION' };
    }
    const granted = formData.get('granted') === 'on';
    await db.query(
      `insert into consent_records (user_id, consent_type, policy_version, granted, locale)
       values ($1, $2, '2026-11-draft', $3, $4)`,
      [user.id, consentType, granted, user.preferredLocale],
    );
    await recordAudit(db, {
      actorUserId: user.id,
      actorRole: user.roles.join(','),
      action: 'consent.updated',
      entityType: 'consent_record',
      entityId: user.id,
      afterState: { consentType, granted },
    });
    revalidatePath('/app/settings');
    return { ok: true, message: 'beneficiary.consentUpdated' };
  } catch (error) {
    return toActionError(error);
  }
}

export async function requestDeletionAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireUserAction();
    const db = await getDb();
    const locale = String(formData.get('locale') ?? user.preferredLocale);

    await db.transaction(async (tx) => {
      await tx.query(`update users set status = 'pending_deletion' where id = $1`, [user.id]);
      await tx.query(
        `update beneficiary_profiles set status = 'suspended' where user_id = $1`,
        [user.id],
      );
    });
    await revokeAllSessions(user.id, 'account_deletion_requested');
    await recordSecurityEvent(db, {
      eventType: 'account.deletion_requested',
      severity: 'medium',
      userId: user.id,
    });
    await notify(db, {
      userId: user.id,
      event: 'security_alert',
      dedupeKey: `deletion:${user.id}`,
    });
    await destroyCurrentSession();
    redirect(`/${locale}`);
  } catch (error) {
    return toActionError(error);
  }
}
