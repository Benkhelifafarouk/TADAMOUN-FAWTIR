import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Alert, Card, Money, PageHeader, Stat } from '@/components/ui';
import { StatusBadge } from '@/components/status-badge';
import { requireRole } from '@/lib/auth/guards';
import {
  getAdminOverview,
  getDecisionDistribution,
  getServiceDistribution,
  getWilayaDistribution,
  listSecurityEvents,
} from '@/lib/data/admin';
import { getDictionary, localePath, type Locale } from '@/lib/i18n';
import { isLocale } from '@/lib/i18n/config';
import { formatDateTime, formatNumber } from '@/lib/i18n/format';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return { title: getDictionary(isLocale(locale) ? locale : 'ar').admin.dashboardTitle };
}

export default async function AdminDashboard({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  if (!isLocale(raw)) notFound();
  const locale: Locale = raw;
  const dictionary = getDictionary(locale);
  const t = dictionary.admin;
  await requireRole(locale, ['admin', 'support']);

  const [overview, services, wilayas, decisions, events] = await Promise.all([
    getAdminOverview(),
    getServiceDistribution(),
    getWilayaDistribution(),
    getDecisionDistribution(),
    listSecurityEvents(6),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader eyebrow={dictionary.nav.adminSpace} title={t.dashboardTitle} subtitle={t.dashboardSubtitle} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label={t.usersCount} value={formatNumber(overview.users, locale)} />
        <Stat label={t.beneficiariesCount} value={formatNumber(overview.beneficiaries, locale)} />
        <Stat label={t.billsCount} value={formatNumber(overview.bills, locale)} />
        <Stat label={t.decisionsCount} value={formatNumber(overview.decisions, locale)} />
        <Stat label={t.approvals} value={formatNumber(overview.approvals, locale)} tone="success" />
        <Stat label={t.rejections} value={formatNumber(overview.rejections, locale)} tone="danger" />
        <Stat label={t.needsDocs} value={formatNumber(overview.needsDocs, locale)} tone="warning" />
        <Stat label={t.uncertain} value={formatNumber(overview.uncertain, locale)} tone="warning" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label={t.totalConfirmed} value={<Money centimes={overview.confirmedCentimes} locale={locale} />} />
        <Stat label={t.totalAllocated} value={<Money centimes={overview.allocatedCentimes} locale={locale} />} />
        <Stat label={t.totalPaidOut} value={<Money centimes={overview.paidOutCentimes} locale={locale} />} />
        <Stat label={t.fundBalance} value={<Money centimes={overview.fundBalanceCentimes} locale={locale} />} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="text-base font-bold">{t.serviceDistribution}</h2>
          <ul className="mt-4 space-y-2">
            {services.map((row) => (
              <li key={row.label} className="flex items-center justify-between gap-2 border-b border-sand-200/70 pb-2 text-2xs last:border-b-0">
                <span className="text-ink-600">{row.label}</span>
                <span className="flex gap-3">
                  <span className="tabular-nums text-ink-400">{formatNumber(row.count, locale)}</span>
                  <span className="font-semibold tabular-nums text-ink-900">
                    <Money centimes={row.amountCentimes} locale={locale} />
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <h2 className="text-base font-bold">{t.decisionDist}</h2>
          <ul className="mt-4 space-y-2">
            {decisions.length === 0 ? (
              <li className="text-2xs text-ink-400">{t.noData}</li>
            ) : (
              decisions.map((row) => (
                <li key={row.decision} className="flex items-center justify-between gap-2 border-b border-sand-200/70 pb-2 text-2xs last:border-b-0">
                  <StatusBadge group="decision" value={row.decision} dictionary={dictionary} />
                  <span className="tabular-nums text-ink-700">{formatNumber(row.count, locale)}</span>
                </li>
              ))
            )}
          </ul>
        </Card>

        <Card>
          <h2 className="text-base font-bold">{t.wilayaDistribution}</h2>
          <ul className="mt-4 space-y-2">
            {wilayas.length === 0 ? (
              <li className="text-2xs text-ink-400">{t.noData}</li>
            ) : (
              wilayas.map((row) => (
                <li key={row.label} className="flex items-center justify-between gap-2 border-b border-sand-200/70 pb-2 text-2xs last:border-b-0">
                  <span className="text-ink-600">{row.label}</span>
                  <span className="flex gap-3">
                    <span className="tabular-nums text-ink-400">{formatNumber(row.count, locale)}</span>
                    <span className="font-semibold tabular-nums text-ink-900">
                      <Money centimes={row.amountCentimes} locale={locale} />
                    </span>
                  </span>
                </li>
              ))
            )}
          </ul>
        </Card>

        <Card>
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold">{t.lastEvents}</h2>
            <Link className="link text-2xs" href={localePath(locale, '/admin/system')}>
              {dictionary.common.viewAll}
            </Link>
          </div>
          <ul className="mt-4 space-y-2">
            {events.length === 0 ? (
              <li className="text-2xs text-ink-400">{t.noData}</li>
            ) : (
              events.map((event) => (
                <li key={event.id} className="border-b border-sand-200/70 pb-2 text-2xs last:border-b-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[10px] text-ink-600">{event.eventType}</span>
                    <span className="text-[10px] text-ink-400">{formatDateTime(event.createdAt, locale)}</span>
                  </div>
                  <StatusBadge group="severity" value={event.severity} dictionary={dictionary} />
                </li>
              ))
            )}
          </ul>
        </Card>
      </div>

      <Alert tone="info" title={t.noManualApproval}>
        {t.noManualApprovalHint}
      </Alert>

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label={t.docsPending} value={formatNumber(overview.docsPending, locale)} tone="warning" />
        <Stat label={t.openSignals} value={formatNumber(overview.openSignals, locale)} tone="danger" />
        <Stat label={t.securityEvents} value={formatNumber(overview.security24h, locale)} />
      </div>
    </div>
  );
}
