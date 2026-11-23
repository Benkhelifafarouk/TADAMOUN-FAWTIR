import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { randomUUID } from 'node:crypto';
import { ActionForm, FieldError } from '@/components/action-form';
import { Alert, ButtonLink, Card, EmptyState, Money, PageHeader, Progress, Stat } from '@/components/ui';
import { StatusBadge } from '@/components/status-badge';
import { createDonationAction } from '@/lib/actions/donor';
import { requireUser } from '@/lib/auth/guards';
import { getPublicStats } from '@/lib/data/public';
import { getDonorSummary, listDonations } from '@/lib/data/workspace';
import { getDictionary, localePath, type Locale } from '@/lib/i18n';
import { isLocale } from '@/lib/i18n/config';
import { formatDate, formatNumber } from '@/lib/i18n/format';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return { title: getDictionary(isLocale(locale) ? locale : 'ar').donor.dashboardTitle };
}

export default async function DonorDashboard({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  if (!isLocale(raw)) notFound();
  const locale: Locale = raw;
  const dictionary = getDictionary(locale);
  const t = dictionary.donor;
  const user = await requireUser(locale);

  const [summary, donations, stats] = await Promise.all([
    getDonorSummary(user.id),
    listDonations(user.id, 8),
    getPublicStats(),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={dictionary.nav.donorSpace}
        title={t.dashboardTitle}
        subtitle={t.dashboardSubtitle}
        action={<ButtonLink href={localePath(locale, '/requests')}>{dictionary.nav.requests}</ButtonLink>}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label={t.totalDonated} value={<Money centimes={summary.totalPaidCentimes} locale={locale} />} />
        <Stat label={t.supportedRequests} value={formatNumber(summary.supportedRequests, locale)} />
        <Stat label={t.activeDonations} value={formatNumber(summary.pendingCount, locale)} tone="warning" />
        <Stat label={t.fundBalance} value={<Money centimes={stats.fundBalanceCentimes} locale={locale} />} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.3fr_0.7fr]">
        <Card>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-bold">{t.recentDonations}</h2>
            <Link className="link text-2xs" href={localePath(locale, '/donor/donations')}>
              {dictionary.common.viewAll}
            </Link>
          </div>

          {donations.length === 0 ? (
            <EmptyState title={t.noDonations} hint={t.progressAfter} />
          ) : (
            <ul className="divide-y divide-sand-200">
              {donations.map((donation) => (
                <li key={donation.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                  <div>
                    <p className="text-sm font-semibold text-ink-900">
                      <Money centimes={donation.amountCentimes} locale={locale} />
                    </p>
                    <p className="mt-0.5 text-2xs text-ink-400">
                      {donation.target === 'fund' ? t.fundContribution : donation.publicRef ?? t.donationId}
                      <span className="mx-1">·</span>
                      {formatDate(donation.createdAt, locale)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge group="donation" value={donation.status} dictionary={dictionary} />
                    <Link className="link text-2xs" href={localePath(locale, `/donor/donations/${donation.id}`)}>
                      {dictionary.common.details}
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <h2 className="text-base font-bold">{t.fundTitle}</h2>
          <p className="mt-2 text-2xs leading-relaxed text-ink-500">{t.fundSubtitle}</p>

          <div className="mt-4 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2">
            <p className="text-2xs font-semibold uppercase tracking-wide text-brand-700">{t.fundBalance}</p>
            <p className="mt-1 text-lg font-bold text-brand-900">
              <Money centimes={stats.fundBalanceCentimes} locale={locale} />
            </p>
            <div className="mt-2">
              <Progress
                value={stats.fundContributionsCentimes > 0 ? (stats.fundBalanceCentimes / stats.fundContributionsCentimes) * 100 : 0}
                label={dictionary.common.progress}
              />
            </div>
          </div>

          <div className="mt-4">
            <ActionForm
              action={createDonationAction}
              dictionary={dictionary}
              submitLabel={t.donateToFund}
              hiddenFields={{ locale, target: 'fund', idempotencyKey: randomUUID() }}
            >
              <div>
                <label className="field-label" htmlFor="amount">
                  {t.amountLabel}
                </label>
                <input id="amount" name="amount" inputMode="decimal" required className="field-input" placeholder="1000" dir="ltr" />
                <FieldError name="amount" dictionary={dictionary} />
              </div>
              <Alert tone="warning">{t.paymentDemoNotice}</Alert>
            </ActionForm>
          </div>
        </Card>
      </div>

      <p className="text-2xs text-ink-400">{dictionary.transparency.demoText}</p>
    </div>
  );
}
