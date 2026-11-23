import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ActionForm, FieldError } from '@/components/action-form';
import { Alert, Card, Money, PageHeader, Stat } from '@/components/ui';
import { StatusBadge } from '@/components/status-badge';
import { allocateFundAction, refundDonationAction } from '@/lib/actions/admin-finance';
import { markRequestPaidAction } from '@/lib/actions/admin';
import { requireRole } from '@/lib/auth/guards';
import { getFinancialReport, getFundView, listAdminDonations, listFundableRequestsForPayout } from '@/lib/data/admin';
import { getDictionary, type Locale } from '@/lib/i18n';
import { isLocale } from '@/lib/i18n/config';
import { formatDateTime, formatNumber } from '@/lib/i18n/format';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return { title: getDictionary(isLocale(locale) ? locale : 'ar').admin.reportsTitle };
}

export default async function FinancePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  if (!isLocale(raw)) notFound();
  const locale: Locale = raw;
  const dictionary = getDictionary(locale);
  const t = dictionary.admin;
  const user = await requireRole(locale, ['admin']);

  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));

  const [report, fund, donations, payouts] = await Promise.all([
    getFinancialReport(monthStart, monthEnd),
    getFundView(),
    listAdminDonations(80),
    listFundableRequestsForPayout(),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader eyebrow={dictionary.nav.reports} title={t.reportsTitle} subtitle={t.reportsSubtitle} />

      {!user.mfaEnabled ? <Alert tone="warning">{t.mfaRequiredNote}</Alert> : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label={t.totalConfirmed} value={<Money centimes={report.confirmedCentimes} locale={locale} />} />
        <Stat label={t.totalPending} value={<Money centimes={report.pendingCentimes} locale={locale} />} tone="warning" />
        <Stat label={t.totalAllocated} value={<Money centimes={report.allocatedCentimes} locale={locale} />} />
        <Stat label={t.totalPaidOut} value={<Money centimes={report.paidOutCentimes} locale={locale} />} tone="success" />
        <Stat label={t.totalRefunded} value={<Money centimes={report.refundedCentimes} locale={locale} />} tone="danger" />
        <Stat label={t.fundBalance} value={<Money centimes={fund.balanceCentimes} locale={locale} />} />
        <Stat label={dictionary.transparency.fundContributions} value={<Money centimes={fund.contributionsCentimes} locale={locale} />} />
        <Stat label={dictionary.transparency.demoTitle} value={`${formatNumber(report.demoReceipts, locale)} / ${formatNumber(report.realReceipts, locale)}`} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.25fr_0.75fr]">
        <Card>
          <h2 className="text-base font-bold">{t.donationsTitle}</h2>
          <div className="mt-3 overflow-x-auto">
            <table className="table-app">
              <thead>
                <tr>
                  <th>{dictionary.common.date}</th>
                  <th>{dictionary.donor.donationAmount}</th>
                  <th>{dictionary.common.reference}</th>
                  <th>{dictionary.common.status}</th>
                  <th>{t.totalAllocated}</th>
                  <th>{dictionary.common.actions}</th>
                </tr>
              </thead>
              <tbody>
                {donations.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center text-2xs text-ink-400">
                      {t.noRows}
                    </td>
                  </tr>
                ) : (
                  donations.map((donation) => (
                    <tr key={donation.id}>
                      <td className="text-2xs text-ink-500">{formatDateTime(donation.createdAt, locale)}</td>
                      <td className="font-semibold tabular-nums">
                        <Money centimes={donation.amountCentimes} locale={locale} />
                      </td>
                      <td className="font-mono text-2xs text-ink-500">{donation.publicRef ?? '—'}</td>
                      <td>
                        <StatusBadge group="donation" value={donation.status} dictionary={dictionary} />
                      </td>
                      <td className="text-2xs tabular-nums">
                        <Money centimes={donation.allocatedCentimes} locale={locale} />
                      </td>
                      <td>
                        {donation.status === 'paid' && donation.allocatedCentimes === 0 ? (
                          <div className="min-w-[11rem]">
                            <ActionForm
                              action={refundDonationAction}
                              dictionary={dictionary}
                              submitLabel={t.totalRefunded}
                              submitVariant="secondary"
                              showSubmit
                              hiddenFields={{ donationId: donation.id }}
                            >
                              <input name="reason" placeholder={t.allocateReason} className="field-input !py-1 text-2xs" />
                              <FieldError name="reason" dictionary={dictionary} />
                            </ActionForm>
                          </div>
                        ) : (
                          <span className="text-2xs text-ink-400">—</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>

        <div className="space-y-4">
          <Card>
            <h2 className="text-base font-bold">{t.fundTitle}</h2>
            <p className="mt-2 text-2xs text-ink-400">{t.fundSubtitle}</p>
            <p className="mt-3 text-2xl font-bold">
              <Money centimes={fund.balanceCentimes} locale={locale} />
            </p>

            <div className="mt-4">
              <ActionForm
                action={allocateFundAction}
                dictionary={dictionary}
                submitLabel={t.allocateFund}
                hiddenFields={{ locale }}
              >
                <div>
                  <label className="field-label" htmlFor="requestId">
                    {t.allocateTo}
                  </label>
                  <select id="requestId" name="requestId" className="field-input" required>
                    <option value="">—</option>
                    {fund.fundableRequests.map((request) => (
                      <option key={request.id} value={request.id}>
                        {request.publicRef} — {(request.remainingCentimes / 100).toLocaleString('fr-DZ')} DA
                      </option>
                    ))}
                  </select>
                  <FieldError name="requestId" dictionary={dictionary} />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="field-label" htmlFor="amount">
                      {t.allocateAmount}
                    </label>
                    <input id="amount" name="amount" inputMode="decimal" required className="field-input" dir="ltr" />
                    <FieldError name="amount" dictionary={dictionary} />
                  </div>
                  <div>
                    <label className="field-label" htmlFor="reason">
                      {t.allocateReason}
                    </label>
                    <input id="reason" name="reason" required minLength={5} className="field-input" />
                    <FieldError name="reason" dictionary={dictionary} />
                  </div>
                </div>
              </ActionForm>
            </div>
          </Card>

          <Card>
            <h2 className="text-base font-bold">{t.totalPaidOut}</h2>
            <p className="mt-1 text-2xs text-ink-400">{t.reportsSubtitle}</p>
            <ul className="mt-3 space-y-3">
              {payouts.length === 0 ? (
                <li className="text-2xs text-ink-400">{t.noRows}</li>
              ) : (
                payouts.map((payout) => (
                  <li key={payout.id} className="rounded-lg border border-sand-200 p-2">
                    <p className="font-mono text-2xs text-ink-600">{payout.publicRef}</p>
                    <p className="mt-1 text-2xs font-semibold">
                      <Money centimes={payout.fundedCentimes} locale={locale} />
                    </p>
                    <div className="mt-2">
                      <ActionForm
                        action={markRequestPaidAction}
                        dictionary={dictionary}
                        submitLabel={dictionary.common.confirm}
                        submitVariant="secondary"
                        showSubmit
                        hiddenFields={{ requestId: payout.id }}
                      >
                        <input name="reference" placeholder="Sonelgaz ref." className="field-input !py-1 text-2xs" required />
                        <FieldError name="reference" dictionary={dictionary} />
                      </ActionForm>
                    </div>
                  </li>
                ))
              )}
            </ul>
          </Card>
        </div>
      </div>

      <Card className="overflow-x-auto">
        <h2 className="text-base font-bold">{dictionary.transparency.fundTitle}</h2>
        <table className="table-app mt-3">
          <thead>
            <tr>
              <th>{dictionary.common.date}</th>
              <th>{t.runJobs}</th>
              <th>{dictionary.common.amount}</th>
              <th>{dictionary.common.reference}</th>
              <th>{t.allocateReason}</th>
            </tr>
          </thead>
          <tbody>
            {fund.ledger.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-center text-2xs text-ink-400">
                  {t.noRows}
                </td>
              </tr>
            ) : (
              fund.ledger.map((entry) => (
                <tr key={entry.id}>
                  <td className="text-2xs text-ink-500">{formatDateTime(entry.createdAt, locale)}</td>
                  <td className="text-2xs">{entry.entryType}</td>
                  <td className={`text-2xs font-semibold tabular-nums ${entry.amountCentimes < 0 ? 'text-clay-600' : 'text-brand-800'}`}>
                    {entry.amountCentimes < 0 ? '-' : '+'}
                    <Money centimes={Math.abs(entry.amountCentimes)} locale={locale} />
                  </td>
                  <td className="font-mono text-2xs text-ink-500">{entry.publicRef ?? '—'}</td>
                  <td className="text-2xs text-ink-500">{entry.reason}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
