import type { Db } from '@/lib/db/types';
import { keyedHash } from './hash';

/**
 * Fixed-window rate limiting backed by PostgreSQL so that it works across
 * serverless instances (no in-memory counters that reset on cold start).
 */

export interface RateLimitOptions {
  bucket: string;
  identifier: string;
  limit: number;
  windowSeconds: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export async function consumeRateLimit(db: Db, options: RateLimitOptions): Promise<RateLimitResult> {
  const { bucket, identifier, limit, windowSeconds } = options;
  const windowMs = windowSeconds * 1000;
  const now = Date.now();
  const windowStart = new Date(Math.floor(now / windowMs) * windowMs);
  const key = `${bucket}:${keyedHash(identifier, 'rate-limit')}`;

  const rows = await db.query<{ count: number }>(
    `insert into rate_limits (key, window_start, count)
     values ($1, $2, 1)
     on conflict (key, window_start)
     do update set count = rate_limits.count + 1
     returning count`,
    [key, windowStart],
  );

  const count = rows[0]?.count ?? 1;
  const retryAfterSeconds = Math.max(1, Math.ceil((windowStart.getTime() + windowMs - now) / 1000));

  return {
    allowed: count <= limit,
    remaining: Math.max(0, limit - count),
    retryAfterSeconds,
  };
}

export async function cleanupRateLimits(db: Db, olderThanHours = 24): Promise<void> {
  await db.query(
    `delete from rate_limits where window_start < now() - ($1 || ' hours')::interval`,
    [String(olderThanHours)],
  );
}
