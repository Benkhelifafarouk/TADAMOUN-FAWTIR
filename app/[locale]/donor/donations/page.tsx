import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Card, EmptyState, Money, PageHeader } from '@/components/ui';
import { StatusBadge } from '@/components/status-badge';
import { requireUser } from '@/lib/auth/guards';
import { listDonations } from '@/lib/data/workspace';
import { getDictionary, localePath, type Locale } from '@/lib/i18n';
import { isLocale } from '@/lib/i18n/config';
import { formatDate } from '@/lib/i18n/format';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return { title: getDictionary(isLocale(locale) ? locale : 'ar').donor.donationsTitle };
}

export default async function DonationsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  if (!isLocale(raw)) notFound();
  const locale: Locale = raw;
  const dictionary = getDictionary(locale);
  const t = dictionary.donor;
  const user = await requireUser(locale);
  const donations = await listDonations(user.id);

  return (
    <div className="space-y-6">
      <PageHeader eyebrow={dictionary.nav.donations} title={t.donationsTitle} subtitle={t.dashboardSubtitle} />

      {donations.length === 0 ? (
        <EmptyState
          title={t.noDonations}
          hint={t.progressAfter}
          action={
            <Link className="link text-2xs" href={localePath(locale, '/requests')}>
              {dictionary.nav.requests}
            </Link>
          }
        />
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="table-app">
            <thead>
              <tr>
                <th>{dictionary.common.date}</th>
                <th>{t.donationAmount}</th>
                <th>{dictionary.common.reference}</th>
                <th>{t.donationStatus}</th>
                <th>{dictionary.donor.allocatedTo}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {donations.map((donation) => (
                <tr key={donation.id}>
                  <td className="text-2xs text-ink-500">{formatDate(donation.createdAt, locale)}</td>
                  <td className="font-semibold">
                    <Money centimes={donation.amountCentimes} locale={locale} />
                  </td>
                  <td className="font-mono text-2xs text-ink-500">
                    {donation.publicRef ?? (donation.target === 'fund' ? t.fundContribution : '—')}
                  </td>
                  <td>
                    <StatusBadge group="donation" value={donation.status} dictionary={dictionary} />
                  </td>
                  <td className="text-2xs">
                    {donation.allocatedCentimes > 0 ? (
                      <span className="font-semibold text-brand-800">
                        <Money centimes={donation.allocatedCentimes} locale={locale} />
                      </span>
                    ) : (
                      <span className="text-ink-400">—</span>
                    )}
                  </td>
                  <td>
                    <Link className="link text-2xs" href={localePath(locale, `/donor/donations/${donation.id}`)}>
                      {dictionary.common.details}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
