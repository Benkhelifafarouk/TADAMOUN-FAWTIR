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
        <>
          <ul className="space-y-3 md:hidden">
            {bills.map((bill) => (
              <li key={bill.id}>
                <Card>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-mono text-2xs text-ink-400">{bill.billReference ?? bill.id.slice(0, 8)}</p>
                      <p className="mt-1 text-sm font-bold text-ink-900">
                        {locale === 'ar' ? bill.categoryNameAr : bill.categoryNameFr}
                      </p>
                      <p className="mt-0.5 text-2xs text-ink-500">
                        {locale === 'ar' ? bill.providerNameAr : bill.providerNameFr} � {formatDate(bill.createdAt, locale)}
                      </p>
                    </div>
                    <StatusBadge group="bill" value={bill.status} dictionary={dictionary} />
                  </div>
                  <dl className="mt-3 grid grid-cols-2 gap-2 border-t border-sand-200 pt-3 text-2xs">
                    <div>
                      <dt className="text-ink-400">{t.billAmount}</dt>
                      <dd className="mt-0.5 font-semibold text-ink-900">
                        {bill.totalCentimes === null ? '�' : <Money centimes={bill.totalCentimes} locale={locale} />}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-ink-400">{t.eligibleAmount}</dt>
                      <dd className="mt-0.5 font-semibold text-brand-800">
                        {bill.eligibleCentimes === null ? '�' : <Money centimes={bill.eligibleCentimes} locale={locale} />}
                      </dd>
                    </div>
                  </dl>
                  <div className="mt-3 flex items-center justify-between gap-2">
                    {bill.decision ? (
                      <StatusBadge group="decision" value={bill.decision} dictionary={dictionary} />
                    ) : (
                      <span />
                    )}
                    <Link className="link text-2xs" href={localePath(locale, `/app/bills/${bill.id}`)}>
                      {dictionary.common.details}
                    </Link>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
          <Card className="hidden overflow-x-auto p-0 md:block">
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
        </>
      )}
    </div>
  );
}
