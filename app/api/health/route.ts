import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { env } from '@/lib/env';
import { num } from '@/lib/db/values';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Liveness/readiness probe: checks the database and migration state. */
export async function GET(): Promise<Response> {
  const startedAt = Date.now();
  try {
    const db = await getDb();
    const rows = await db.query<{ applied: unknown }>('select count(*)::int as applied from schema_migrations');
    return NextResponse.json(
      {
        status: 'ok',
        database: env().DATABASE_DRIVER,
        migrations: num(rows[0]?.applied),
        demoMode: env().demoMode,
        paymentsLive: env().paymentsLive,
        latencyMs: Date.now() - startedAt,
        time: new Date().toISOString(),
      },
      { headers: { 'cache-control': 'no-store' } },
    );
  } catch {
    return NextResponse.json({ status: 'degraded', database: 'unavailable' }, { status: 503 });
  }
}
