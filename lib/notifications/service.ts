import type { Db } from '@/lib/db/types';

/**
 * In-app notification queue.
 *
 * No email/SMS provider is configured, therefore nothing is ever reported as
 * "delivered". `in_app` notifications move queued → sent through the job queue;
 * other channels fail with an explicit `provider_not_configured` reason.
 */

type Queryable = Pick<Db, 'query'>;

export type NotificationChannel = 'in_app' | 'email' | 'sms';

export interface NotificationInput {
  userId: string;
  event: string;
  params?: Record<string, string | number>;
  channel?: NotificationChannel;
  dedupeKey?: string;
}

export async function notify(q: Queryable, input: NotificationInput): Promise<void> {
  const channel = input.channel ?? 'in_app';
  const providerConfigured =
    channel === 'in_app' ||
    (channel === 'email' && process.env.EMAIL_PROVIDER === 'smtp') ||
    (channel === 'sms' && process.env.SMS_PROVIDER !== 'none' && Boolean(process.env.SMS_API_KEY));

  await q.query(
    `insert into notifications
       (user_id, type, title_key, body_key, params, channel, status, failure_reason, dedupe_key)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     on conflict (dedupe_key) do nothing`,
    [
      input.userId,
      input.event,
      `notifications.events.${input.event}.title`,
      `notifications.events.${input.event}.body`,
      JSON.stringify(input.params ?? {}),
      channel,
      channel === 'in_app' ? 'queued' : providerConfigured ? 'queued' : 'failed',
      providerConfigured ? null : 'provider_not_configured',
      input.dedupeKey ?? null,
    ],
  );
}

/** Job handler: in-app notifications are considered sent once persisted and queued. */
export async function deliverQueuedNotifications(q: Queryable, limit = 100): Promise<number> {
  const rows = await q.query<{ id: string }>(
    `with due as (
       select id from notifications
        where status = 'queued' and channel = 'in_app'
        order by created_at
        limit $1
        for update skip locked
     )
     update notifications n
        set status = 'sent', sent_at = now()
       from due
      where n.id = due.id
      returning n.id`,
    [limit],
  );
  return rows.length;
}
