import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

/**
 * Password hashing with scrypt (memory-hard, available in Node core so there is
 * no native build step). Parameters are stored with the hash so they can be
 * raised later without invalidating existing passwords.
 */

const scrypt = promisify(scryptCallback) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

const PARAMS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 } as const;
const KEY_LENGTH = 64;

const COMMON_PASSWORDS = new Set([
  'password',
  'password1',
  'motdepasse',
  '123456789',
  '1234567890',
  'qwertyuiop',
  'azertyuiop',
  'algerie123',
  'admin12345',
  'changeme123',
]);

export interface PasswordPolicyResult {
  ok: boolean;
  reason?: 'too_short' | 'too_long' | 'needs_letter' | 'needs_digit' | 'too_common';
}

export function checkPasswordPolicy(password: string): PasswordPolicyResult {
  if (password.length < 10) return { ok: false, reason: 'too_short' };
  if (password.length > 200) return { ok: false, reason: 'too_long' };
  if (!/[A-Za-z\u0600-\u06FF]/.test(password)) return { ok: false, reason: 'needs_letter' };
  if (!/[0-9]/.test(password)) return { ok: false, reason: 'needs_digit' };
  if (COMMON_PASSWORDS.has(password.toLowerCase())) return { ok: false, reason: 'too_common' };
  return { ok: true };
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password.normalize('NFKC'), salt, KEY_LENGTH, PARAMS);
  return [
    'scrypt',
    PARAMS.N,
    PARAMS.r,
    PARAMS.p,
    salt.toString('base64'),
    key.toString('base64'),
  ].join('$');
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  try {
    const parts = stored.split('$');
    if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
    const N = Number(parts[1]);
    const r = Number(parts[2]);
    const p = Number(parts[3]);
    const salt = Buffer.from(parts[4], 'base64');
    const expected = Buffer.from(parts[5], 'base64');
    if (!Number.isFinite(N) || !Number.isFinite(r) || !Number.isFinite(p)) return false;
    const actual = await scrypt(password.normalize('NFKC'), salt, expected.length, {
      N,
      r,
      p,
      maxmem: PARAMS.maxmem,
    });
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

/** Constant-ish work for unknown accounts, to avoid user enumeration by timing. */
export async function fakeVerify(password: string): Promise<void> {
  await scrypt(password.normalize('NFKC'), randomBytes(16), KEY_LENGTH, PARAMS);
}
