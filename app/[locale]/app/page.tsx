import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Alert, ButtonLink, Card, EmptyState, Money, PageHeader, Stat } from '@/components/ui';
import { StatusBadge } from '@/components/status-badge';
import { requireUser } from '@/lib/auth/guards';
import { getBeneficiaryContext, listBills, listDocumentRequests } from '@/lib/data/workspace';
import { getDictionary, localePath, type Locale } from '@/lib/i18n';
import { isLocale } from '@/lib/i18n/config';
import { formatDate, formatNumber } from '@/lib/i18n/format';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return { title: getDictionary(isLocale(locale) ? locale : 'ar').beneficiary.dashboardTitle };
}

export default async function BeneficiaryDashboard({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  if (!isLocale(raw)) notFound();
  const locale: Locale = raw;
  const dictionary = getDictionary(locale);
  const t = dictionary.beneficiary;
  const user = await requireUser(locale);

  const [context, bills, documents] = await Promise.all([
    getBeneficiaryContext(user.id),
    listBills(user.id, 5),
    listDocumentRequests(user.id),
  ]);

  const pendingDocuments = documents.filter((doc) => doc.status === 'pending');
  const profileComplete = context?.status === 'complete' && context.householdSize !== null;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={dictionary.nav.beneficiarySpace}
        title={t.welcome.replace('{name}', user.fullName.split(' ')[0] ?? user.fullName)}
        subtitle={t.dashboardSubtitle}
        action={<ButtonLink href={localePath(locale, '/app/bills/new')}>{dictionary.nav.newBill}</ButtonLink>}
      />

      {!context ? (
        <Alert tone="warning" title={t.profileIncomplete}>
          <Link className="link" href={localePath(locale, '/app/profile')}>
            {t.completeProfile}
          </Link>
        </Alert>
      ) : !profileComplete ? (
        <Alert tone="warning" title={t.profileIncomplete}>
          <Link className="link" href={localePath(locale, '/app/profile')}>
            {t.completeProfile}
          </Link>
        </Alert>
      ) : null}

      {!user.phoneVerified ? (
        <Alert tone="warning" title={dictionary.auth.phonePending}>
          <Link className="link" href={localePath(locale, '/verify-phone')}>
            {dictionary.auth.verifyPhone}
          </Link>
        </Alert>
      ) : null}

      {pendingDocuments.length > 0 ? (
        <Card className="border-amber-500/40 bg-amber-500/5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-bold text-amber-600">{t.pendingDocuments}</p>
              <p className="mt-1 text-2xs text-ink-600">
                {pendingDocuments.length} · {dictionary.docs.whyNeeded}
              </p>
            </div>
            <ButtonLink href={localePath(locale, '/app/documents')} variant="secondary">
              {dictionary.nav.documents}
            </ButtonLink>
          </div>
        </Card>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label={dictionary.nav.myBills} value={formatNumber(context?.counts.bills ?? 0, locale)} />
        <Stat
          label={dictionary.status.decision.APPROVED}
          value={formatNumber(context?.counts.approved ?? 0, locale)}
          tone="success"
        />
        <Stat
          label={dictionary.status.decision.REJECTED}
          value={formatNumber(context?.counts.rejected ?? 0, locale)}
          tone="danger"
        />
        <Stat
          label={dictionary.nav.myRequests}
          value={formatNumber(context?.counts.publishedRequests ?? 0, locale)}
          tone="brand"
        />
      </div>

      <Card>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-bold">{t.billsTitle}</h2>
          <Link className="link text-2xs" href={localePath(locale, '/app/bills')}>
            {dictionary.common.viewAll}
          </Link>
        </div>

        {bills.length === 0 ? (
          <EmptyState
            title={t.noBills}
            hint={t.billsSubtitle}
            action={<ButtonLink href={localePath(locale, '/app/bills/new')}>{dictionary.nav.newBill}</ButtonLink>}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="table-app">
              <thead>
                <tr>
                  <th>{dictionary.beneficiary.serviceType}</th>
                  <th>{dictionary.beneficiary.billAmount}</th>
                  <th>{dictionary.common.status}</th>
                  <th>{dictionary.beneficiary.submittedAt}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {bills.map((bill) => (
                  <tr key={bill.id}>
                    <td className="font-medium">
                      {locale === 'ar' ? bill.categoryNameAr : bill.categoryNameFr}
                      <span className="block text-[10px] text-ink-400">
                        {locale === 'ar' ? bill.providerNameAr : bill.providerNameFr}
                      </span>
                    </td>
                    <td>{bill.totalCentimes === null ? '—' : <Money centimes={bill.totalCentimes} locale={locale} />}</td>
                    <td>
                      <StatusBadge group="bill" value={bill.status} dictionary={dictionary} />
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
          </div>
        )}
      </Card>

      <Card>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-bold">{t.requestsTitle}</h2>
          <Link className="link text-2xs" href={localePath(locale, '/app/requests')}>
            {dictionary.common.viewAll}
          </Link>
        </div>
        <p className="text-2xs leading-relaxed text-ink-400">{t.requestsSubtitle}</p>
      </Card>
    </div>
  );
}
