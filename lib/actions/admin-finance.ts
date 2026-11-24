'use server';

import { revalidatePath } from 'next/cache';
import { getDb } from '@/lib/db';
import { assertRecentMfa, requireRoleAction } from '@/lib/auth/guards';
import { markSessionMfaVerified } from '@/lib/auth/session';
import { allocateFundToRequest, refundDonation } from '@/lib/donations/service';
import { generateTotpSecret, totpUri, verifyTotp } from '@/lib/security/totp';
import { recordSecurityEvent, SecurityEvents } from '@/lib/security/audit';
import { parseAmountToCentimes } from '@/lib/money';
import type { ActionState } from './state';
import { toActionError } from './errors';

export async function allocateFundAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireRoleAction('admin');
    assertRecentMfa(user);
    const requestId = String(formData.get('requestId') ?? '');
    const amount = parseAmountToCentimes(String(formData.get('amount') ?? ''));
    const reason = String(formData.get('reason') ?? '').trim();
    if (!requestId || amount === null) return { ok: false, message: 'actionErrors.VALIDATION' };

    const db = await getDb();
    await allocateFundToRequest(db, {
      adminUserId: user.id,
      requestId,
      amountCentimes: amount,
      reason: reason.length >= 5 ? reason : 'SOLIDARITY_FUND_ALLOCATION',
    });
    revalidatePath('/admin/finance');
    return { ok: true, message: 'admin.allocated' };
  } catch (error) {
    if (error instanceof Error && error.message === 'REQUEST_NOT_FUNDED') {
      return { ok: false, message: 'actionErrors.REQUEST_NOT_OPEN' };
    }
    return toActionError(error);
  }
}

export async function refundDonationAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireRoleAction('admin');
    assertRecentMfa(user);
    const donationId = String(formData.get('donationId') ?? '');
    const reason = String(formData.get('reason') ?? '').trim();
    if (!donationId || reason.length < 5) return { ok: false, message: 'actionErrors.REASON_REQUIRED' };

    const db = await getDb();
    const result = await refundDonation(db, { adminUserId: user.id, donationId, reason });
    revalidatePath('/admin/finance');
    return { ok: true, message: 'common.saved', data: { amount: result.amountCentimes } };
  } catch (error) {
    return toActionError(error);
  }
}

export async function toggleProviderAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireRoleAction('admin');
    assertRecentMfa(user);
    const providerId = String(formData.get('providerId') ?? '');
    const active = formData.get('active') === 'true';
    const db = await getDb();
    await db.query('update service_providers set is_active = $2 where id = $1', [providerId, active]);
    await recordSecurityEvent(db, {
      eventType: 'admin.provider_toggled',
      severity: 'medium',
      userId: user.id,
      details: { providerId, active },
    });
    revalidatePath('/admin/config');
    return { ok: true, message: 'admin.statusUpdated' };
  } catch (error) {
    return toActionError(error);
  }
}

export async function enrollMfaAction(_prev: ActionState): Promise<ActionState> {
  try {
    const user = await requireRoleAction('admin');
    // Rotating an active factor requires a fresh verification of the current one.
    if (user.mfaEnabled) assertRecentMfa(user);
    const secret = generateTotpSecret();
    const db = await getDb();
    await db.query('update users set mfa_secret = $2 where id = $1', [user.id, secret]);
    return {
      ok: true,
      message: 'admin.mfaScanHint',
      data: { secret, uri: totpUri(secret, user.email) },
    };
  } catch (error) {
    return toActionError(error);
  }
}

export async function confirmMfaAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireRoleAction('admin');
    if (user.mfaEnabled) assertRecentMfa(user);
    const code = String(formData.get('code') ?? '').trim();
    const db = await getDb();
    const rows = await db.query<{ mfa_secret: string | null }>('select mfa_secret from users where id = $1', [user.id]);
    const secret = rows[0]?.mfa_secret;
    if (!secret) return { ok: false, message: 'actionErrors.MFA_NOT_ENROLLED' };
    if (!verifyTotp(secret, code)) {
      await recordSecurityEvent(db, {
        eventType: SecurityEvents.MFA_FAILED,
        severity: 'medium',
        userId: user.id,
      });
      return { ok: false, message: 'admin.mfaInvalid' };
    }
    await db.query('update users set mfa_enabled = true where id = $1', [user.id]);
    await markSessionMfaVerified(user.sessionId);
    await recordSecurityEvent(db, {
      eventType: SecurityEvents.MFA_ENABLED,
      severity: 'medium',
      userId: user.id,
    });
    revalidatePath('/admin/settings');
    return { ok: true, message: 'admin.mfaEnabled' };
  } catch (error) {
    return toActionError(error);
  }
}

export async function verifyMfaAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireRoleAction('admin');
    const code = String(formData.get('code') ?? '').trim();
    const db = await getDb();
    const rows = await db.query<{ mfa_secret: string | null; mfa_enabled: boolean }>(
      'select mfa_secret, mfa_enabled from users where id = $1',
      [user.id],
    );
    const row = rows[0];
    if (!row?.mfa_enabled || !row.mfa_secret) {
      return { ok: false, message: 'actionErrors.MFA_NOT_ENROLLED' };
    }
    if (!verifyTotp(row.mfa_secret, code)) {
      await recordSecurityEvent(db, {
        eventType: SecurityEvents.MFA_FAILED,
        severity: 'medium',
        userId: user.id,
      });
      return { ok: false, message: 'admin.mfaInvalid' };
    }
    await markSessionMfaVerified(user.sessionId);
    await recordSecurityEvent(db, {
      eventType: 'auth.mfa.session_verified',
      severity: 'info',
      userId: user.id,
    });
    revalidatePath('/admin', 'layout');
    return { ok: true, message: 'admin.mfaVerified' };
  } catch (error) {
    return toActionError(error);
  }
}

export async function disableMfaAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireRoleAction('admin');
    const code = String(formData.get('code') ?? '').trim();
    const db = await getDb();
    const rows = await db.query<{ mfa_secret: string | null }>('select mfa_secret from users where id = $1', [user.id]);
    const secret = rows[0]?.mfa_secret;
    if (!secret || !verifyTotp(secret, code)) {
      return { ok: false, message: 'admin.mfaInvalid' };
    }
    await db.query('update users set mfa_enabled = false where id = $1', [user.id]);
    await recordSecurityEvent(db, {
      eventType: 'auth.mfa.disabled',
      severity: 'high',
      userId: user.id,
    });
    revalidatePath('/admin/settings');
    return { ok: true, message: 'common.saved' };
  } catch (error) {
    return toActionError(error);
  }
}
