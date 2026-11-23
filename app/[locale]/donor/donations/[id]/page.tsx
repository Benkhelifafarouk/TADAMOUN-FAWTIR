import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { Alert, ButtonLink, Card, DataRow, Money, PageHeader } from '@/components/ui';
import { StatusBadge } from '@/components/status-badge';
import { requireUser } from '@/lib/auth/guards';
import { getDonationDetail } from '@/lib/data/workspace';
import { getDictionary, localePath, type Locale } from '@/lib/i18n';
import { isLocale } from '@/lib/i18n/config';
import { formatDateTime } from '@/lib/i18n/format';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return { title: getDictionary(isLocale(locale) ? locale : 'ar').donor.donationDetail };
}

export default async function DonationDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale: raw, id } = await params;
  if (!isLocale(raw)) notFound();
  const locale: Locale = raw;
  const dictionary = getDictionary(locale);
  const t = dictionary.donor;
  const user = await requireUser(locale);
  const query = await searchParams;

  const donation = await getDonationDetail(user.id, id);
  if (!donation) redirect(`/${locale}/donor/donations`);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        eyebrow={dictionary.nav.donations}
        title={t.donationDetail}
        action={<StatusBadge group="donation" value={donation.status} dictionary={dictionary} />}
      />

      {query.paid === '1' ? <Alert tone="success" title={t.paymentSuccess} /> : null}

      <Card>
        <dl>
          <DataRow label={t.donationAmount}>
            <span className="text-lg font-bold">
              <Money centimes={donation.amountCentimes} locale={locale} />
            </span>
          </DataRow>
          <DataRow label={t.donationId}>
            <span className="font-mono text-2xs">{donation.id}</span>
          </DataRow>
          <DataRow label={t.pledgedAt}>{formatDateTime(donation.createdAt, locale)}</DataRow>
          <DataRow label={t.paidAt}>{formatDateTime(donation.paidAt, locale)}</DataRow>
          <DataRow label={t.allocatedTo}>
            {donation.publicRef ? (
              <Link className="link" href={localePath(locale, `/requests/${donation.publicRef}`)}>
                {donation.publicRef}
              </Link>
            ) : donation.target === 'fund' ? (
              t.fundContribution
            ) : (
              '—'
            )}
          </DataRow>
          <DataRow label={t.allocationTitle}>
            <Money centimes={donation.allocatedCentimes} locale={locale} />
          </DataRow>
          <DataRow label={dictionary.admin.auditTitle}>{donation.provider}</DataRow>
          <DataRow label={t.receiptNumber}>{donation.receiptNumber ?? '—'}</DataRow>
        </dl>

        <p className="field-hint mt-3">{t.allocationHint}</p>
      </Card>

      {donation.allocations.length > 0 ? (
        <Card>
          <h2 className="text-sm font-bold">{t.allocationTitle}</h2>
          <ul className="mt-3 space-y-2">
            {donation.allocations.map((allocation) => (
              <li key={allocation.requestId + allocation.createdAt} className="flex flex-wrap justify-between gap-2 rounded-lg border border-sand-200 px-3 py-2 text-2xs">
                <span className="font-mono">{allocation.publicRef ?? allocation.requestId.slice(0, 8)}</span>
                <span className="font-semibold">
                  <Money centimes={allocation.amountCentimes} locale={locale} />
                </span>
                <span className="text-ink-400">{formatDateTime(allocation.createdAt, locale)}</span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <div className="flex flex-wrap gap-3">
        {donation.status === 'paid' && donation.receiptId ? (
          <ButtonLink href={localePath(locale, `/donor/receipts/${donation.id}`)}>{t.viewReceipt}</ButtonLink>
        ) : null}
        {donation.status === 'pending' ? (
          <ButtonLink href={localePath(locale, `/donor/checkout/${donation.id}`)}>{t.confirmDemoPayment}</ButtonLink>
        ) : null}
        <ButtonLink href={localePath(locale, '/donor/donations')} variant="secondary">
          {dictionary.common.back}
        </ButtonLink>
      </div>
    </div>
  );
}
