import type { Db } from '@/lib/db/types';
import { getDb } from '@/lib/db';
import { AccessError } from '@/lib/auth/guards';
import { BillError } from '@/lib/bills/service';
import { DonationError } from '@/lib/donations/service';
import { consumeRateLimit } from '@/lib/security/rate-limit';
import type { ActionState } from './state';

/** Maps domain errors to dictionary keys — never to raw exception text. */
export function toActionError(error: unknown): ActionState {
  if (error instanceof AccessError) {
    return { ok: false, message: `actionErrors.${error.code}` };
  }
  if (error instanceof BillError) {
    return { ok: false, message: `actionErrors.${error.code}` };
  }
  if (error instanceof DonationError) {
    return { ok: false, message: `actionErrors.${error.code}` };
  }
  if (error && typeof error === 'object' && 'code' in error) {
    const code = String((error as { code?: unknown }).code ?? '');
    if (code.startsWith('23505')) return { ok: false, message: 'actionErrors.DUPLICATE_ENTRY' };
    if (code.startsWith('23503')) return { ok: false, message: 'actionErrors.INVALID_REFERENCE' };
    if (code.startsWith('23514')) return { ok: false, message: 'actionErrors.CONSTRAINT_VIOLATION' };
    if (code === 'restrict_violation') return { ok: false, message: 'actionErrors.APPEND_ONLY' };
  }
  console.error('Unhandled action error', error);
  return { ok: false, message: 'actionErrors.GENERIC' };
}

export async function guardRateLimit(
  bucket: string,
  identifier: string,
  limit: number,
  windowSeconds: number,
  db?: Db,
): Promise<ActionState | null> {
  const handle = db ?? (await getDb());
  const result = await consumeRateLimit(handle, { bucket, identifier, limit, windowSeconds });
  if (result.allowed) return null;
  return { ok: false, message: 'actionErrors.RATE_LIMITED' };
}

export function revalidateTargets(): string[] {
  return [
    '/',
  ];
}
