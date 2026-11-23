import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ButtonLink, Card, EmptyState, Money, PageHeader } from '@/components/ui';
import { StatusBadge } from '@/components/status-badge';
import { requireUser } from '@/lib/auth/guards';
import { listBills } from '@/lib/data/workspace';
import { getDictionary, localePath, type Locale } from '@/lib/i18n';
import { isLocale } from '@/lib/i18n/config';
import { formatDate } from '@/lib/i18n/format';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return { title: getDictionary(isLocale(locale) ? locale : 'ar').beneficiary.billsTitle };
}

export default async function BillsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  if (!isLocale(raw)) notFound();
  const locale: Locale = raw;
  const dictionary = getDictionary(locale);
  const t = dictionary.beneficiary;
  const user = await requireUser(locale);

  const bills = await listBills(user.id);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={dictionary.nav.myBills}
        title={t.billsTitle}
        subtitle={t.billsSubtitle}
        action={<ButtonLink href={localePath(locale, '/app/bills/new')}>{dictionary.nav.newBill}</ButtonLink>}
      />

      {bills.length === 0 ? (
        <EmptyState
          title={t.noBills}
          hint={t.billsSubtitle}
          action={<ButtonLink href={localePath(locale, '/app/bills/new')}>{dictionary.nav.newBill}</ButtonLink>}
        />
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="table-app">
            <thead>
              <tr>
                <th>{dictionary.common.reference}</th>
                <th>{dictionary.beneficiary.serviceType}</th>
                <th>{dictionary.beneficiary.billAmount}</th>
                <th>{dictionary.beneficiary.eligibleAmount}</th>
                <th>{dictionary.common.status}</th>
                <th>{dictionary.beneficiary.submittedAt}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {bills.map((bill) => (
                <tr key={bill.id}>
                  <td className="font-mono text-2xs text-ink-500">{bill.billReference ?? bill.id.slice(0, 8)}</td>
                  <td>
                    <span className="font-medium">{locale === 'ar' ? bill.categoryNameAr : bill.categoryNameFr}</span>
                    <span className="block text-[10px] text-ink-400">
                      {locale === 'ar' ? bill.providerNameAr : bill.providerNameFr}
                    </span>
                  </td>
                  <td>{bill.totalCentimes === null ? '—' : <Money centimes={bill.totalCentimes} locale={locale} />}</td>
                  <td>
                    {bill.eligibleCentimes === null ? (
                      '—'
                    ) : (
                      <span className="font-semibold text-brand-800">
                        <Money centimes={bill.eligibleCentimes} locale={locale} />
                      </span>
                    )}
                  </td>
                  <td>
                    <div className="flex flex-wrap gap-1">
                      <StatusBadge group="bill" value={bill.status} dictionary={dictionary} />
                      {bill.decision ? <StatusBadge group="decision" value={bill.decision} dictionary={dictionary} /> : null}
                    </div>
                  </td>
                  <td className="text-2xs text-ink-500">{formatDate(bill.createdAt, locale)}</td>
                  <td>
                    <Link className="link text-2xs" href={localePath(locale, `/app/bills/${bill.id}`)}>
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
