import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Card, EmptyState, PageHeader } from '@/components/ui';
import { markNotificationsReadAction } from '@/lib/actions/beneficiary';
import { requireUser } from '@/lib/auth/guards';
import { listNotifications } from '@/lib/data/workspace';
import { getDictionary, type Locale } from '@/lib/i18n';
import { isLocale } from '@/lib/i18n/config';
import { formatDateTime } from '@/lib/i18n/format';
import { resolvePath } from '@/lib/i18n/resolve';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return { title: getDictionary(isLocale(locale) ? locale : 'ar').notifications.title };
}

export default async function NotificationsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  if (!isLocale(raw)) notFound();
  const locale: Locale = raw;
  const dictionary = getDictionary(locale);
  const user = await requireUser(locale);
  const notifications = await listNotifications(user.id);

  const unread = notifications.filter((item) => !item.readAt).length;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={dictionary.notifications.title}
        title={dictionary.notifications.title}
        subtitle={unread > 0 ? `${unread} ${dictionary.common.unread}` : undefined}
        action={
          unread > 0 ? (
            <form action={markNotificationsReadAction}>
              <button
                type="submit"
                className="rounded-lg border border-sand-300 bg-white px-3 py-2 text-2xs font-semibold text-ink-600"
              >
                {dictionary.beneficiary.markAllRead}
              </button>
            </form>
          ) : null
        }
      />

      {notifications.length === 0 ? (
        <EmptyState title={dictionary.notifications.empty} />
      ) : (
        <ul className="space-y-3">
          {notifications.map((notification) => {
            const title = resolvePath(dictionary, notification.titleKey) ?? notification.event;
            const body = resolvePath(dictionary, notification.bodyKey) ?? '';
            return (
              <li key={notification.id}>
                <Card className={notification.readAt ? '' : 'border-brand-300 bg-brand-50/40'}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-bold text-ink-900">{title}</p>
                      <p className="mt-1 text-2xs leading-relaxed text-ink-600">{interpolate(body, notification.params)}</p>
                    </div>
                    <div className="text-end">
                      <p className="text-[10px] text-ink-400">{formatDateTime(notification.createdAt, locale)}</p>
                      <p className="mt-1 text-[10px] font-semibold text-ink-400">
                        {dictionary.status.notification[notification.status as 'sent'] ?? notification.status}
                      </p>
                    </div>
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function interpolate(template: string, params: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    params[key] === undefined ? match : String(params[key]),
  );
}
