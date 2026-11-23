import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { runDueJobs } from '@/lib/jobs/runner';
import { env } from '@/lib/env';
import { safeEqual } from '@/lib/security/hash';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Worker entry point. Intended to be called by an external scheduler (cron,
 * GitHub Actions, a container sidecar) with the shared job secret. Never
 * reachable without the secret, even though it only processes queued work.
 */
export async function POST(request: Request): Promise<Response> {
  const secret = env().JOBS_TICK_SECRET;
  const provided = request.headers.get('x-jobs-secret') ?? '';
  if (!secret || !safeEqual(secret, provided)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const db = await getDb();
  const summary = await runDueJobs(db, { limit: 10, workerId: 'http-tick' });
  return NextResponse.json({ ok: true, ...summary }, { headers: { 'cache-control': 'no-store' } });
}
