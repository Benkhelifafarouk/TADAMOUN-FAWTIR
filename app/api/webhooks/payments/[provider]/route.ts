import { NextResponse } from 'next/server';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { getDb } from '@/lib/db';
import { env } from '@/lib/env';
import { recordSecurityEvent, SecurityEvents } from '@/lib/security/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Signed payment webhook.
 *
 * - only the `demo` provider is accepted in this build;
 * - the raw body is verified against an HMAC-SHA256 signature derived from
 *   APP_SECRET (a real integration must use the provider's documented scheme
 *   and secret, and there is no contract yet);
 * - events are deduplicated by (provider, external_event_id);
 * - the event is recorded, never trusted to mutate money by itself. Capture is
 *   performed by the authenticated server action that the donor confirms, so a
 *   forged callback cannot mark a donation as paid.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ provider: string }> },
): Promise<Response> {
  const { provider } = await context.params;
  if (provider !== 'demo') {
    return NextResponse.json({ error: 'unsupported_provider' }, { status: 404 });
  }

  const rawBody = await request.text();
  if (rawBody.length > 20_000) {
    return NextResponse.json({ error: 'payload_too_large' }, { status: 413 });
  }

  const signature = request.headers.get('x-signature') ?? '';
  const expected = createHmac('sha256', `${env().APP_SECRET}:webhook:demo`).update(rawBody).digest('hex');
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  const valid = a.length === b.length && timingSafeEqual(a, b);

  const db = await getDb();

  if (!valid) {
    await recordSecurityEvent(db, {
      eventType: SecurityEvents.WEBHOOK_INVALID_SIGNATURE,
      severity: 'high',
      route: `/api/webhooks/payments/${provider}`,
      details: { bodyLength: rawBody.length },
    });
    return NextResponse.json({ error: 'invalid_signature' }, { status: 401 });
  }

  let payload: { id?: string; type?: string; donationId?: string; transactionId?: string };
  try {
    payload = JSON.parse(rawBody) as typeof payload;
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  if (!payload.id || !payload.type) {
    return NextResponse.json({ error: 'missing_fields' }, { status: 400 });
  }

  await db.query(
    `insert into payment_events
       (provider, external_event_id, transaction_id, event_type, signature_verified, payload, processed_at)
     values ($1, $2, $3, $4, true, $5, now())
     on conflict (provider, external_event_id) do nothing`,
    [
      provider,
      payload.id,
      payload.transactionId ?? null,
      payload.type,
      JSON.stringify({ received: true, note: 'recorded_not_captured' }),
    ],
  );

  return NextResponse.json({ ok: true, recorded: true }, { headers: { 'cache-control': 'no-store' } });
}
