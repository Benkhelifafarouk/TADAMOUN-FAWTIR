import { randomInt } from 'node:crypto';
import { getDb } from '@/lib/db';
import { env } from '@/lib/env';
import { keyedHash, safeEqual } from '@/lib/security/hash';
import { recordSecurityEvent, SecurityEvents } from '@/lib/security/audit';
import { consumeRateLimit } from '@/lib/security/rate-limit';

export interface OtpRequestResult {
  ok: boolean;
  reason?: 'rate_limited' | 'no_phone' | 'delivery_unavailable';
  retryAfterSeconds?: number;
  /** Only present in demo/test environments; never in production. */
  demoCode?: string;
}

export interface OtpVerifyResult {
  ok: boolean;
  reason?: 'invalid' | 'expired' | 'too_many_attempts' | 'not_found';
}

function hashCode(userId: string, code: string): string {
  return keyedHash(`${userId}:${code}`, 'otp');
}

export async function requestPhoneOtp(userId: string, phone: string | null): Promise<OtpRequestResult> {
  if (!phone) return { ok: false, reason: 'no_phone' };
  const db = await getDb();

  const limit = await consumeRateLimit(db, {
    bucket: `otp:${userId}`,
    identifier: userId,
    limit: 3,
    windowSeconds: 3600,
  });
  if (!limit.allowed) {
    await recordSecurityEvent(db, {
      eventType: SecurityEvents.OTP_REQUESTED,
      severity: 'medium',
      userId,
      details: { blocked: 'rate_limit' },
    });
    return { ok: false, reason: 'rate_limited', retryAfterSeconds: limit.retryAfterSeconds };
  }

  // Invalidate previous codes for this purpose: only the newest one is valid.
  await db.query(
    `update otp_codes set consumed_at = now()
      where user_id = $1 and purpose = 'phone_verification' and consumed_at is null`,
    [userId],
  );

  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  const ttlMinutes = env().OTP_TTL_MINUTES;

  await db.query(
    `insert into otp_codes (user_id, purpose, destination_hash, code_hash, max_attempts, expires_at)
     values ($1, 'phone_verification', $2, $3, $4, now() + ($5 || ' minutes')::interval)`,
    [
      userId,
      keyedHash(phone, 'otp-destination'),
      hashCode(userId, code),
      env().OTP_MAX_ATTEMPTS,
      String(ttlMinutes),
    ],
  );

  await recordSecurityEvent(db, {
    eventType: SecurityEvents.OTP_REQUESTED,
    severity: 'low',
    userId,
    details: { purpose: 'phone_verification' },
  });

  // No SMS provider is configured by default. We never claim a message was sent.
  if (env().SMS_PROVIDER === 'none') {
    if (env().demoMode && env().NODE_ENV !== 'production') {
      return { ok: true, demoCode: code };
    }
    return { ok: false, reason: 'delivery_unavailable' };
  }

  // A real gateway adapter would be called here. It is intentionally absent:
  // no SMS contract exists for this project yet (documented as BLOCKED).
  return { ok: false, reason: 'delivery_unavailable' };
}

export async function verifyPhoneOtp(userId: string, code: string): Promise<OtpVerifyResult> {
  const db = await getDb();

  const rows = await db.query<{
    id: string;
    code_hash: string;
    attempts: number;
    max_attempts: number;
    expires_at: Date;
  }>(
    `select id, code_hash, attempts, max_attempts, expires_at
       from otp_codes
      where user_id = $1 and purpose = 'phone_verification' and consumed_at is null
      order by created_at desc
      limit 1`,
    [userId],
  );

  const row = rows[0];
  if (!row) return { ok: false, reason: 'not_found' };
  if (new Date(row.expires_at).getTime() < Date.now()) {
    await db.query('update otp_codes set consumed_at = now() where id = $1', [row.id]);
    return { ok: false, reason: 'expired' };
  }
  if (row.attempts >= row.max_attempts) {
    await recordSecurityEvent(db, {
      eventType: SecurityEvents.OTP_LOCKED,
      severity: 'medium',
      userId,
      details: { attempts: row.attempts },
    });
    return { ok: false, reason: 'too_many_attempts' };
  }

  const updated = await db.query<{ attempts: number }>(
    'update otp_codes set attempts = attempts + 1 where id = $1 returning attempts',
    [row.id],
  );

  if (!safeEqual(row.code_hash, hashCode(userId, code))) {
    await db.query(
      `insert into account_verification_events (user_id, event_type, outcome, details)
       values ($1, 'phone_otp', 'failure', $2)`,
      [userId, JSON.stringify({ attempts: updated[0]?.attempts ?? row.attempts + 1 })],
    );
    await recordSecurityEvent(db, {
      eventType: SecurityEvents.OTP_FAILED,
      severity: 'low',
      userId,
      details: { attempts: updated[0]?.attempts ?? row.attempts + 1 },
    });
    return { ok: false, reason: 'invalid' };
  }

  await db.transaction(async (tx) => {
    await tx.query('update otp_codes set consumed_at = now() where id = $1', [row.id]);
    await tx.query(
      'update users set phone_verified_at = now() where id = $1 and phone_verified_at is null',
      [userId],
    );
    await tx.query(
      `insert into account_verification_events (user_id, event_type, outcome, details)
       values ($1, 'phone_otp', 'success', '{}'::jsonb)`,
      [userId],
    );
  });

  await recordSecurityEvent(db, {
    eventType: SecurityEvents.PHONE_VERIFIED,
    severity: 'info',
    userId,
  });

  return { ok: true };
}
