import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ActionForm } from '@/components/action-form';
import { Card, PageHeader } from '@/components/ui';
import { StatusBadge } from '@/components/status-badge';
import { runJobsAction } from '@/lib/actions/public';
import { requireRole } from '@/lib/auth/guards';
import { listAuditLogs, listSecurityEvents } from '@/lib/data/admin';
import { getDictionary, type Locale } from '@/lib/i18n';
import { isLocale } from '@/lib/i18n/config';
import { formatDateTime } from '@/lib/i18n/format';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return { title: getDictionary(isLocale(locale) ? locale : 'ar').admin.securityTitle };
}

export default async function SystemPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  if (!isLocale(raw)) notFound();
  const locale: Locale = raw;
  const dictionary = getDictionary(locale);
  const t = dictionary.admin;
  await requireRole(locale, ['admin']);

  const [events, audit] = await Promise.all([listSecurityEvents(80), listAuditLogs(80)]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={dictionary.nav.security}
        title={t.securityTitle}
        action={
          <ActionForm action={runJobsAction} dictionary={dictionary} submitLabel={t.runJobs} submitVariant="secondary" showSubmit>
            <span className="sr-only">{t.runJobs}</span>
          </ActionForm>
        }
      />

      <Card className="overflow-x-auto p-0">
        <div className="p-4">
          <h2 className="text-base font-bold">{t.securityEvents}</h2>
          <p className="mt-1 text-2xs text-ink-400">{t.readOnlyNotice}</p>
        </div>
        <table className="table-app">
          <thead>
            <tr>
              <th>{t.timestamp}</th>
              <th>{t.eventType}</th>
              <th>{t.severity}</th>
              <th>{t.entity}</th>
            </tr>
          </thead>
          <tbody>
            {events.length === 0 ? (
              <tr>
                <td colSpan={4} className="text-center text-2xs text-ink-400">
                  {t.noRows}
                </td>
              </tr>
            ) : (
              events.map((event) => (
                <tr key={event.id}>
                  <td className="whitespace-nowrap text-2xs text-ink-500">{formatDateTime(event.createdAt, locale)}</td>
                  <td className="font-mono text-2xs">{event.eventType}</td>
                  <td>
                    <StatusBadge group="severity" value={event.severity} dictionary={dictionary} />
                  </td>
                  <td className="max-w-[22rem] truncate font-mono text-[10px] text-ink-400" dir="ltr">
                    {JSON.stringify(event.details)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>

      <Card className="overflow-x-auto p-0">
        <div className="p-4">
          <h2 className="text-base font-bold">{t.auditTitle}</h2>
          <p className="mt-1 text-2xs text-ink-400">{dictionary.transparency.accountingList[0]}</p>
        </div>
        <table className="table-app">
          <thead>
            <tr>
              <th>{t.timestamp}</th>
              <th>{t.action}</th>
              <th>{t.entity}</th>
              <th>{t.actor}</th>
            </tr>
          </thead>
          <tbody>
            {audit.length === 0 ? (
              <tr>
                <td colSpan={4} className="text-center text-2xs text-ink-400">
                  {t.noRows}
                </td>
              </tr>
            ) : (
              audit.map((row) => (
                <tr key={row.id}>
                  <td className="whitespace-nowrap text-2xs text-ink-500">{formatDateTime(row.createdAt, locale)}</td>
                  <td className="font-mono text-2xs">{row.action}</td>
                  <td className="text-2xs">
                    {row.entityType}
                    {row.entityId ? <span className="block font-mono text-[10px] text-ink-400">{row.entityId.slice(0, 8)}</span> : null}
                  </td>
                  <td className="text-2xs text-ink-500" dir="ltr">
                    {row.actorEmail ?? row.actorRole ?? '—'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
