import { redirect } from 'next/navigation';
import type { Locale } from '@/lib/i18n/config';
import { getCurrentUser, type AuthUser } from './session';
import { hasRole, homePathForRoles, type Role } from './roles';

export type AccessErrorCode =
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'ACCOUNT_INACTIVE'
  | 'PHONE_UNVERIFIED'
  | 'MFA_REQUIRED'
  | 'PROFILE_INCOMPLETE';

export class AccessError extends Error {
  constructor(readonly code: AccessErrorCode, message?: string) {
    super(message ?? code);
    this.name = 'AccessError';
  }
}

/** For Server Components: redirects instead of throwing a 500. */
export async function requireUser(locale: Locale): Promise<AuthUser> {
  const user = await getCurrentUser();
  if (!user) redirect(`/${locale}/login`);
  if (user.status !== 'active') redirect(`/${locale}/login?error=account`);
  return user;
}

export async function requireRole(locale: Locale, roles: Role[]): Promise<AuthUser> {
  const user = await requireUser(locale);
  if (!hasRole(user.roles, ...roles)) {
    redirect(`/${locale}${homePathForRoles(user.roles)}`);
  }
  return user;
}

/** For Server Actions: throws a typed error the action wrapper turns into a message. */
export async function requireUserAction(): Promise<AuthUser> {
  const user = await getCurrentUser();
  if (!user) throw new AccessError('UNAUTHENTICATED');
  if (user.status !== 'active') throw new AccessError('ACCOUNT_INACTIVE');
  return user;
}

export async function requireRoleAction(...roles: Role[]): Promise<AuthUser> {
  const user = await requireUserAction();
  if (!hasRole(user.roles, ...roles)) throw new AccessError('FORBIDDEN');
  return user;
}

export async function requireVerifiedPhone(): Promise<AuthUser> {
  const user = await requireUserAction();
  if (!user.phoneVerified) throw new AccessError('PHONE_UNVERIFIED');
  return user;
}

const MFA_WINDOW_MS = 12 * 60 * 60 * 1000;

/**
 * Sensitive administrative mutations require a recent second factor. If the
 * administrator has not enrolled yet they are blocked from these actions and
 * shown the enrolment prompt; this is intentionally not a silent bypass.
 */
export function assertRecentMfa(user: AuthUser): void {
  if (!user.mfaEnabled) throw new AccessError('MFA_REQUIRED');
  if (!user.mfaVerifiedAt || Date.now() - user.mfaVerifiedAt.getTime() > MFA_WINDOW_MS) {
    throw new AccessError('MFA_REQUIRED');
  }
}

export function hasRecentMfa(user: AuthUser): boolean {
  if (!user.mfaEnabled) return false;
  if (!user.mfaVerifiedAt) return false;
  return Date.now() - user.mfaVerifiedAt.getTime() <= MFA_WINDOW_MS;
}
