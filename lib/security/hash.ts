import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { env } from '@/lib/env';

/**
 * Keyed hashing for identifiers that must be comparable but not recoverable
 * (phone numbers, IP addresses, session tokens, OTP codes).
 */

export function sha256Hex(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

export function keyedHash(value: string, purpose: string): string {
  return createHmac('sha256', env().APP_SECRET).update(`${purpose}\u0000${value}`).digest('hex');
}

export function hmacHex(value: string, secret: string): string {
  return createHmac('sha256', secret).update(value).digest('hex');
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export function safeEqual(a: string, b: string): boolean {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);
  if (bufferA.length !== bufferB.length) return false;
  return timingSafeEqual(bufferA, bufferB);
}

/** Removes obvious secrets before anything is written to an audit payload. */
const SENSITIVE_KEY = /pass(word)?|token|secret|otp|code|cookie|authorization|card|cvv/i;

export function redact<T>(value: T): T {
  if (Array.isArray(value)) return value.map((item) => redact(item)) as unknown as T;
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      result[key] = SENSITIVE_KEY.test(key) ? '[redacted]' : redact(item);
    }
    return result as T;
  }
  return value;
}

/** Best-effort client IP from proxy headers; hashed before storage. */
export function clientIpHash(forwardedFor: string | null, fallback?: string | null): string {
  const raw = forwardedFor?.split(',')[0]?.trim() ?? fallback ?? 'unknown';
  return keyedHash(raw, 'ip');
}

export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return '***';
  const visible = local.slice(0, 1);
  return `${visible}${'*'.repeat(Math.max(2, local.length - 1))}@${domain}`;
}
