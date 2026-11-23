import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ActionForm } from '@/components/action-form';
import { Alert, Badge, Card, DemoBadge, PageHeader, Stat } from '@/components/ui';
import { StatusBadge } from '@/components/status-badge';
import { markFraudSignalAction } from '@/lib/actions/admin';
import { requireRole } from '@/lib/auth/guards';
import { getAdminOverview, listAppealsAdmin, listFraudSignals, listVerificationMonitor } from '@/lib/data/admin';
import { getDictionary, type Locale } from '@/lib/i18n';
import { isLocale } from '@/lib/i18n/config';
import { formatDate, formatDateTime, formatNumber } from '@/lib/i18n/format';
import { reasonLabel } from '@/lib/i18n/labels';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return { title: getDictionary(isLocale(locale) ? locale : 'ar').admin.verificationTitle };
}

export default async function ModerationPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  if (!isLocale(raw)) notFound();
  const locale: Locale = raw;
  const dictionary = getDictionary(locale);
  const t = dictionary.admin;
  await requireRole(locale, ['admin']);

  const [monitor, signals, appeals, overview] = await Promise.all([
    listVerificationMonitor(60),
    listFraudSignals(),
    listAppealsAdmin(),
    getAdminOverview(),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader eyebrow={dictionary.nav.verification} title={t.verificationTitle} subtitle={t.verificationSubtitle} />

      <Alert tone="info" title={t.noManualApproval}>
        {t.noManualApprovalHint}
      </Alert>

      <div className="grid gap-4 sm:grid-cols-4">
        <Stat label={t.decisionsCount} value={formatNumber(overview.decisions, locale)} />
        <Stat label={t.needsDocs} value={formatNumber(overview.needsDocs, locale)} tone="warning" />
        <Stat label={t.openSignals} value={formatNumber(overview.openSignals, locale)} tone="danger" />
        <Stat label={t.docsPending} value={formatNumber(overview.docsPending, locale)} tone="warning" />
      </div>

      <Card className="overflow-x-auto p-0">
        <div className="p-4">
          <h2 className="text-base font-bold">{t.verificationTitle}</h2>
          <p className="mt-1 text-2xs text-ink-400">{t.readOnlyNotice}</p>
        </div>
        <table className="table-app">
          <thead>
            <tr>
              <th>{dictionary.common.reference}</th>
              <th>{dictionary.requests.service}</th>
              <th>{dictionary.requests.location}</th>
              <th>{dictionary.beneficiary.billAmount}</th>
              <th>{dictionary.common.status}</th>
              <th>{t.decision}</th>
              <th>{t.docsPending}</th>
              <th>{t.decidedAt}</th>
            </tr>
          </thead>
          <tbody>
            {monitor.length === 0 ? (
              <tr>
                <td colSpan={8} className="text-center text-2xs text-ink-400">
                  {t.noRows}
                </td>
              </tr>
            ) : (
              monitor.map((row) => (
                <tr key={row.id}>
                  <td className="font-mono text-2xs text-ink-500">
                    {row.billReference ?? row.billId.slice(0, 8)}
                    {row.ocrDemo ? (
                      <span className="ms-1">
                        <DemoBadge label={dictionary.common.demo} />
                      </span>
                    ) : null}
                  </td>
                  <td className="text-2xs">{row.categoryNameAr}</td>
                  <td className="text-2xs">{row.wilayaNameAr}</td>
                  <td className="text-2xs tabular-nums">{row.totalCentimes === null ? '—' : (row.totalCentimes / 100).toLocaleString('fr-DZ')}</td>
                  <td>
                    <StatusBadge group="verification" value={row.status} dictionary={dictionary} />
                  </td>
                  <td>
                    {row.decision ? <StatusBadge group="decision" value={row.decision} dictionary={dictionary} /> : <span className="text-2xs text-ink-400">—</span>}
                  </td>
                  <td className="text-2xs tabular-nums">{row.pendingDocs}</td>
                  <td className="text-2xs text-ink-500">{row.decidedAt ? formatDateTime(row.decidedAt, locale) : '—'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>

      <Card>
        <h2 className="text-base font-bold">{t.fraudTitle}</h2>
        <p className="mt-1 text-2xs text-ink-400">{t.fraudSubtitle}</p>

        <ul className="mt-4 space-y-3">
          {signals.length === 0 ? (
            <li className="text-2xs text-ink-400">{t.noRows}</li>
          ) : (
            signals.slice(0, 40).map((signal) => (
              <li key={signal.id} className="rounded-lg border border-sand-200 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Badge tone={signal.severity === 'high' ? 'danger' : signal.severity === 'medium' ? 'warning' : 'neutral'}>
                      {signal.severity}
                    </Badge>
                    <span className="font-mono text-2xs text-ink-700">{signal.code}</span>
                    <span className="text-2xs text-ink-400">score {signal.score}</span>
                  </div>
                  <StatusBadge group="fraud" value={signal.status} dictionary={dictionary} />
                </div>
                <p className="mt-2 text-2xs text-ink-400">
                  {signal.beneficiaryWilaya ?? '—'} · {formatDateTime(signal.createdAt, locale)}
                </p>
                {signal.status === 'open' ? (
                  <div className="mt-3 flex gap-2">
                    {(['reviewed', 'dismissed'] as const).map((status) => (
                      <ActionForm
                        key={status}
                        action={markFraudSignalAction}
                        dictionary={dictionary}
                        submitLabel={status === 'reviewed' ? t.markReviewed : t.dismiss}
                        submitVariant="secondary"
                        showSubmit
                        hiddenFields={{ signalId: signal.id, status }}
                      >
                        <span className="sr-only">{status}</span>
                      </ActionForm>
                    ))}
                  </div>
                ) : null}
              </li>
            ))
          )}
        </ul>
      </Card>

      <Card>
        <h2 className="text-base font-bold">{t.appealsTitle}</h2>
        <ul className="mt-4 space-y-2">
          {appeals.length === 0 ? (
            <li className="text-2xs text-ink-400">{t.noRows}</li>
          ) : (
            appeals.slice(0, 30).map((appeal) => (
              <li key={appeal.id} className="rounded-lg border border-sand-200 px-3 py-2">
                <div className="flex flex-wrap items-center justify-between gap-2 text-2xs">
                  <span className="text-ink-600">{appeal.wilaya}</span>
                  <StatusBadge group="appeal" value={appeal.status} dictionary={dictionary} />
                  <span className="text-ink-400">{formatDate(appeal.submittedAt, locale)}</span>
                  <span className="text-ink-500">
                    {appeal.outcome ? dictionary.status.decision[appeal.outcome as 'APPROVED'] ?? appeal.outcome : '—'}
                  </span>
                </div>
                <p className="mt-1 line-clamp-2 text-2xs text-ink-500">{appeal.message}</p>
              </li>
            ))
          )}
        </ul>
      </Card>

      <p className="text-2xs text-ink-400">
        {reasonLabel(dictionary, 'ELIGIBLE_APPROVED')} — {t.monitoringOnly}
      </p>
    </div>
  );
}
