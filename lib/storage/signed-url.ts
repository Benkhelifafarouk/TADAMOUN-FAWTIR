import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '@/lib/env';

/**
 * Short-lived signed references for private files.
 *
 * A signature binds: storage key + owning user + expiry. The route that serves
 * the file also checks the current session, so leaking a URL is not sufficient
 * to read a document.
 */

export interface FileTokenPayload {
  k: string; // storage key
  u: string; // owner user id
  e: number; // expiry (unix seconds)
}

function secret(): string {
  return env().FILE_SIGNING_SECRET;
}

function sign(body: string): string {
  return createHmac('sha256', secret()).update(body).digest('base64url');
}

export function signFileToken(payload: FileTokenPayload): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${body}.${sign(body)}`;
}

export function verifyFileToken(token: string): FileTokenPayload | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [body, signature] = parts;
  const expected = sign(body);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as FileTokenPayload;
    if (typeof payload.k !== 'string' || typeof payload.u !== 'string' || typeof payload.e !== 'number') {
      return null;
    }
    if (payload.e * 1000 < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export function buildFileUrl(fileId: string, storageKey: string, ownerUserId: string, ttlSeconds = 300): string {
  const token = signFileToken({
    k: storageKey,
    u: ownerUserId,
    e: Math.floor(Date.now() / 1000) + ttlSeconds,
  });
  return `/api/files/${fileId}?token=${encodeURIComponent(token)}`;
}
