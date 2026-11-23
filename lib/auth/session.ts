import { cookies, headers } from 'next/headers';
import { cache } from 'react';
import { getDb } from '@/lib/db';
import { env } from '@/lib/env';
import { clientIpHash, keyedHash, sha256Hex, randomToken } from '@/lib/security/hash';
import type { Role } from './roles';

export const SESSION_COOKIE = 'tf_session';

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  phoneVerified: boolean;
  preferredLocale: 'ar' | 'fr';
  status: 'active' | 'suspended' | 'pending_deletion' | 'deleted';
  roles: Role[];
  sessionId: string;
  sessionExpiresAt: Date;
  mfaEnabled: boolean;
  mfaVerifiedAt: Date | null;
}

interface SessionRow {
  session_id: string;
  user_id: string;
  expires_at: Date;
  revoked_at: Date | null;
  mfa_verified_at: Date | null;
  email: string;
  full_name: string;
  phone: string | null;
  phone_verified_at: Date | null;
  preferred_locale: 'ar' | 'fr';
  status: AuthUser['status'];
  mfa_enabled: boolean;
  roles: Role[] | null;
}

function cookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    secure: env().NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: maxAgeSeconds,
  };
}

export async function requestMeta(): Promise<{ ipHash: string; userAgent: string | null }> {
  const headerList = await headers();
  const forwarded = headerList.get('x-forwarded-for');
  const remote = headerList.get('x-real-ip');
  return {
    ipHash: clientIpHash(forwarded, remote),
    userAgent: headerList.get('user-agent')?.slice(0, 300) ?? null,
  };
}

export async function createSession(userId: string): Promise<void> {
  const db = await getDb();
  const token = randomToken(32);
  const ttlSeconds = env().SESSION_TTL_HOURS * 3600;
  const meta = await requestMeta();

  await db.query(
    `insert into sessions (user_id, token_hash, user_agent, ip_hash, expires_at)
     values ($1, $2, $3, $4, now() + ($5 || ' seconds')::interval)`,
    [userId, sha256Hex(token), meta.userAgent, meta.ipHash, String(ttlSeconds)],
  );

  const store = await cookies();
  store.set(SESSION_COOKIE, token, cookieOptions(ttlSeconds));
}

export const getCurrentUser = cache(async (): Promise<AuthUser | null> => {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token || token.length < 20) return null;

  const db = await getDb();
  const rows = await db.query<SessionRow>(
    `select s.id as session_id, s.user_id, s.expires_at, s.revoked_at, s.mfa_verified_at,
            u.email, u.full_name, u.phone, u.phone_verified_at, u.preferred_locale,
            u.status, u.mfa_enabled,
            coalesce(
              (select array_agg(ur.role::text) from user_roles ur where ur.user_id = u.id),
              '{}'
            ) as roles
       from sessions s
       join users u on u.id = s.user_id
      where s.token_hash = $1
      limit 1`,
    [sha256Hex(token)],
  );

  const row = rows[0];
  if (!row) return null;
  if (row.revoked_at) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) return null;

  return {
    id: row.user_id,
    email: row.email,
    fullName: row.full_name,
    phone: row.phone,
    phoneVerified: Boolean(row.phone_verified_at),
    preferredLocale: row.preferred_locale,
    status: row.status,
    roles: (row.roles ?? []).filter(Boolean) as Role[],
    sessionId: row.session_id,
    sessionExpiresAt: new Date(row.expires_at),
    mfaEnabled: row.mfa_enabled,
    mfaVerifiedAt: row.mfa_verified_at ? new Date(row.mfa_verified_at) : null,
  };
});

export async function destroyCurrentSession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    const db = await getDb();
    await db.query(
      `update sessions set revoked_at = now(), revoked_reason = 'logout'
        where token_hash = $1 and revoked_at is null`,
      [sha256Hex(token)],
    );
  }
  store.delete(SESSION_COOKIE);
}

export async function revokeAllSessions(userId: string, reason: string): Promise<void> {
  const db = await getDb();
  await db.query(
    `update sessions set revoked_at = now(), revoked_reason = $2
      where user_id = $1 and revoked_at is null`,
    [userId, reason],
  );
}

export async function markSessionMfaVerified(sessionId: string): Promise<void> {
  const db = await getDb();
  await db.query('update sessions set mfa_verified_at = now() where id = $1', [sessionId]);
}

/** Verifies an opaque token outside the cookie flow (tests, CLI). */
export async function userForToken(token: string): Promise<string | null> {
  const db = await getDb();
  const rows = await db.query<{ user_id: string }>(
    `select user_id from sessions
      where token_hash = $1 and revoked_at is null and expires_at > now()`,
    [sha256Hex(token)],
  );
  return rows[0]?.user_id ?? null;
}

/** Deterministic key for deduplicating login identifiers in rate limits. */
export function loginRateKey(email: string): string {
  return keyedHash(email, 'login-rate');
}
