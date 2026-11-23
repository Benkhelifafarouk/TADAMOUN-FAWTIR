'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getDb } from '@/lib/db';
import { createSession, destroyCurrentSession, loginRateKey, requestMeta } from '@/lib/auth/session';
import { hashPassword, checkPasswordPolicy, fakeVerify, verifyPassword } from '@/lib/security/passwords';
import { keyedHash } from '@/lib/security/hash';
import { recordAudit, recordSecurityEvent, SecurityEvents } from '@/lib/security/audit';
import { homePathForRoles } from '@/lib/auth/roles';
import { getCurrentUser } from '@/lib/auth/session';
import { notify } from '@/lib/notifications/service';
import { requestPhoneOtp, verifyPhoneOtp } from '@/lib/auth/otp';
import { loginSchema, registerSchema, otpSchema, zodParse, formToObject } from '@/lib/validation/schemas';
import type { ActionState } from './state';
import { guardRateLimit, toActionError } from './errors';

const MAX_FAILED = 8;
const LOCK_MINUTES = 15;

export async function registerAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = zodParse(registerSchema, formToObject(formData));
  if (!parsed.ok) return { ok: false, fieldErrors: parsed.fieldErrors, message: 'actionErrors.VALIDATION' };
  const input = parsed.data;

  try {
    const db = await getDb();
    const meta = await requestMeta();

    const limited = await guardRateLimit('register', meta.ipHash, 8, 3600, db);
    if (limited) return limited;

    const policy = checkPasswordPolicy(input.password);
    if (!policy.ok) {
      return { ok: false, fieldErrors: { password: 'passwordStrength' }, message: 'actionErrors.VALIDATION' };
    }

    const existingEmail = await db.query<{ id: string }>(
      'select id from users where email_normalized = lower($1) limit 1',
      [input.email],
    );
    if (existingEmail[0]) return { ok: false, fieldErrors: { email: 'emailTaken' } };

    const existingPhone = await db.query<{ id: string }>('select id from users where phone = $1 limit 1', [input.phone]);
    if (existingPhone[0]) return { ok: false, fieldErrors: { phone: 'phoneTaken' } };

    const passwordHash = await hashPassword(input.password);

    const userId = await db.transaction(async (tx) => {
      const created = await tx.query<{ id: string }>(
        `insert into users (email, password_hash, full_name, phone, phone_hash, preferred_locale)
         values ($1, $2, $3, $4, $5, $6)
         returning id`,
        [
          input.email,
          passwordHash,
          input.fullName,
          input.phone,
          keyedHash(input.phone, 'phone'),
          input.locale,
        ],
      );
      const id = created[0].id;

      await tx.query('insert into user_roles (user_id, role) values ($1, $2)', [id, input.role]);
      if (input.role === 'donor') {
        await tx.query('insert into donor_profiles (user_id, is_anonymous) values ($1, true)', [id]);
      }
      await tx.query(
        `insert into consent_records (user_id, consent_type, policy_version, granted, locale, ip_hash)
         values ($1, 'terms', $2, true, $3, $4), ($1, 'privacy', $5, true, $3, $4)`,
        [id, '2026-11-draft', input.locale, meta.ipHash, '2026-11-draft'],
      );
      await tx.query(
        `insert into account_verification_events (user_id, event_type, outcome, details)
         values ($1, 'registration', 'success', $2)`,
        [id, JSON.stringify({ role: input.role })],
      );
      await notify(tx, { userId: id, event: 'welcome', dedupeKey: `welcome:${id}` });
      return id;
    });

    await recordSecurityEvent(db, {
      eventType: SecurityEvents.REGISTER,
      severity: 'info',
      userId,
      ipHash: meta.ipHash,
      details: { role: input.role },
    });
    await recordAudit(db, {
      actorUserId: userId,
      actorRole: input.role,
      action: 'auth.registered',
      entityType: 'user',
      entityId: userId,
      ipHash: meta.ipHash,
    });

    await createSession(userId);
  } catch (error) {
    return toActionError(error);
  }

  redirect(`/${input.locale}/verify-phone`);
}

export async function loginAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = zodParse(loginSchema, formToObject(formData));
  if (!parsed.ok) return { ok: false, fieldErrors: parsed.fieldErrors, message: 'actionErrors.VALIDATION' };
  const input = parsed.data;
  const locale = String(formData.get('locale') ?? 'ar');

  let target = '';
  try {
    const db = await getDb();
    const meta = await requestMeta();

    const limited = await guardRateLimit(`login:${loginRateKey(input.email)}`, meta.ipHash, 10, 900, db);
    if (limited) {
      await recordSecurityEvent(db, {
        eventType: SecurityEvents.LOGIN_RATE_LIMITED,
        severity: 'medium',
        ipHash: meta.ipHash,
        details: { emailHash: keyedHash(input.email, 'login-id') },
      });
      return limited;
    }

    const rows = await db.query<{
      id: string;
      password_hash: string;
      status: string;
      failed_login_count: number;
      locked_until: Date | null;
      preferred_locale: string;
    }>(
      `select id, password_hash, status, failed_login_count, locked_until, preferred_locale
         from users where email_normalized = lower($1) limit 1`,
      [input.email],
    );
    const user = rows[0];

    if (!user) {
      await fakeVerify(input.password);
      await recordSecurityEvent(db, {
        eventType: SecurityEvents.LOGIN_FAILED,
        severity: 'low',
        ipHash: meta.ipHash,
        details: { reason: 'unknown_account' },
      });
      return { ok: false, message: 'actionErrors.INVALID_CREDENTIALS' };
    }

    if (user.locked_until && new Date(user.locked_until).getTime() > Date.now()) {
      return { ok: false, message: 'actionErrors.ACCOUNT_LOCKED' };
    }
    if (user.status !== 'active') return { ok: false, message: 'actionErrors.ACCOUNT_INACTIVE' };

    const valid = await verifyPassword(input.password, user.password_hash);
    if (!valid) {
      const failures = Number(user.failed_login_count) + 1;
      const lock = failures >= MAX_FAILED;
      await db.query(
        `update users set failed_login_count = $2,
           locked_until = case when $3 then now() + ($4 || ' minutes')::interval else locked_until end
         where id = $1`,
        [user.id, String(failures), String(lock), String(LOCK_MINUTES)],
      );
      await recordSecurityEvent(db, {
        eventType: lock ? SecurityEvents.LOGIN_LOCKED : SecurityEvents.LOGIN_FAILED,
        severity: lock ? 'high' : 'low',
        userId: user.id,
        ipHash: meta.ipHash,
        details: { failures },
      });
      return { ok: false, message: lock ? 'actionErrors.ACCOUNT_LOCKED' : 'actionErrors.INVALID_CREDENTIALS' };
    }

    await db.query(
      `update users set failed_login_count = 0, locked_until = null, last_login_at = now() where id = $1`,
      [user.id],
    );
    await createSession(user.id);

    const roleRows = await db.query<{ role: string }>('select role from user_roles where user_id = $1', [user.id]);
    await recordSecurityEvent(db, {
      eventType: SecurityEvents.LOGIN_SUCCESS,
      severity: 'info',
      userId: user.id,
      ipHash: meta.ipHash,
    });
    await recordAudit(db, {
      actorUserId: user.id,
      actorRole: roleRows.map((r) => r.role).join(','),
      action: 'auth.login',
      entityType: 'user',
      entityId: user.id,
      ipHash: meta.ipHash,
    });

    target = `/${locale}${homePathForRoles(roleRows.map((r) => r.role as 'beneficiary' | 'donor' | 'support' | 'admin'))}`;
  } catch (error) {
    return toActionError(error);
  }

  redirect(target);
}

export async function logoutAction(): Promise<void> {
  const user = await getCurrentUser();
  await destroyCurrentSession();
  if (user) {
    const db = await getDb();
    await recordSecurityEvent(db, {
      eventType: SecurityEvents.LOGOUT,
      severity: 'info',
      userId: user.id,
    });
  }
  revalidatePath('/', 'layout');
  redirect('/ar');
}

export async function sendPhoneOtpAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await getCurrentUser();
    if (!user) return { ok: false, message: 'actionErrors.UNAUTHENTICATED' };

    const db = await getDb();
    const meta = await requestMeta();
    const limited = await guardRateLimit('otp-ip', meta.ipHash, 10, 3600, db);
    if (limited) return limited;

    const result = await requestPhoneOtp(user.id, user.phone);
    if (!result.ok) {
      return { ok: false, message: `actionErrors.OTP_${(result.reason ?? 'delivery_unavailable').toUpperCase()}` };
    }

    revalidatePath(`/${formData.get('locale') ?? 'ar'}/verify-phone`);
    return { ok: true, message: 'auth.otpSent', data: { demoCode: result.demoCode ?? null } };
  } catch (error) {
    return toActionError(error);
  }
}

export async function verifyPhoneOtpAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = zodParse(otpSchema, formToObject(formData));
  if (!parsed.ok) return { ok: false, fieldErrors: parsed.fieldErrors };

  try {
    const user = await getCurrentUser();
    if (!user) return { ok: false, message: 'actionErrors.UNAUTHENTICATED' };
    const db = await getDb();
    const meta = await requestMeta();

    const limited = await guardRateLimit('otp-verify', user.id, 10, 900, db);
    if (limited) return limited;

    const result = await verifyPhoneOtp(user.id, parsed.data.code);
    if (!result.ok) {
      const key =
        result.reason === 'expired'
          ? 'auth.otpExpired'
          : result.reason === 'too_many_attempts'
            ? 'auth.otpAttempts'
            : 'auth.otpInvalid';
      return { ok: false, message: key };
    }

    await recordAudit(db, {
      actorUserId: user.id,
      actorRole: user.roles.join(','),
      action: 'auth.phone_verified',
      entityType: 'user',
      entityId: user.id,
      ipHash: meta.ipHash,
    });

    revalidatePath('/', 'layout');
    return { ok: true, message: 'auth.phoneVerified' };
  } catch (error) {
    return toActionError(error);
  }
}
