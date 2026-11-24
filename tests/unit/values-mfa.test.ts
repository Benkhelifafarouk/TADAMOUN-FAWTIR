import { describe, expect, it } from 'vitest';
import { assertRecentMfa, AccessError, hasRecentMfa } from '@/lib/auth/guards';
import type { AuthUser } from '@/lib/auth/session';
import { parseJsonValue } from '@/lib/db/values';

const HOUR = 60 * 60 * 1000;

function admin(overrides: Partial<AuthUser> = {}): AuthUser {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    email: 'admin@demo.local',
    fullName: 'Admin',
    status: 'active',
    roles: ['admin'],
    phoneVerified: true,
    mfaEnabled: true,
    mfaVerifiedAt: new Date(),
    profileComplete: true,
    locale: 'ar',
    ...overrides,
  } as AuthUser;
}

describe('parseJsonValue', () => {
  it('parses JSON objects and arrays', () => {
    expect(parseJsonValue('{"a":1}')).toEqual({ a: 1 });
    expect(parseJsonValue('[1,2,3]')).toEqual([1, 2, 3]);
  });

  it('parses JSON string scalars and primitives', () => {
    expect(parseJsonValue('"2026-11-draft"')).toBe('2026-11-draft');
    expect(parseJsonValue('42')).toBe(42);
    expect(parseJsonValue('true')).toBe(true);
    expect(parseJsonValue('null')).toBeNull();
  });

  it('returns plain text unchanged instead of throwing', () => {
    expect(parseJsonValue('2026-11-draft')).toBe('2026-11-draft');
    expect(parseJsonValue('pending review')).toBe('pending review');
    expect(parseJsonValue('')).toBe('');
  });

  it('passes non-string values through', () => {
    const value = { a: 1 };
    expect(parseJsonValue(value)).toBe(value);
  });
});

describe('MFA recency', () => {
  it('rejects administrators who never enrolled', () => {
    expect(hasRecentMfa(admin({ mfaEnabled: false }))).toBe(false);
    expect(() => assertRecentMfa(admin({ mfaEnabled: false }))).toThrow(AccessError);
  });

  it('rejects a verified session older than the window', () => {
    const stale = admin({ mfaVerifiedAt: new Date(Date.now() - 13 * HOUR) });
    expect(hasRecentMfa(stale)).toBe(false);
    expect(() => assertRecentMfa(stale)).toThrow(AccessError);
  });

  it('accepts a recent verification and rejects a missing timestamp', () => {
    const recent = admin({ mfaVerifiedAt: new Date(Date.now() - 2 * HOUR) });
    expect(hasRecentMfa(recent)).toBe(true);
    expect(() => assertRecentMfa(recent)).not.toThrow();

    const missing = admin({ mfaVerifiedAt: null });
    expect(hasRecentMfa(missing)).toBe(false);
    expect(() => assertRecentMfa(missing)).toThrow(AccessError);
  });
});
