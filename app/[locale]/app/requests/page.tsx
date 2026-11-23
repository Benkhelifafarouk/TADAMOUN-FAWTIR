import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Card, EmptyState, Money, PageHeader, Progress } from '@/components/ui';
import { StatusBadge } from '@/components/status-badge';
import { requireUser } from '@/lib/auth/guards';
import { listBeneficiaryRequests } from '@/lib/data/workspace';
import { getDictionary, localePath, type Locale } from '@/lib/i18n';
import { isLocale } from '@/lib/i18n/config';
import { formatDate } from '@/lib/i18n/format';
import { percent } from '@/lib/money';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return { title: getDictionary(isLocale(locale) ? locale : 'ar').beneficiary.requestsTitle };
}

export default async function BeneficiaryRequestsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  if (!isLocale(raw)) notFound();
  const locale: Locale = raw;
  const dictionary = getDictionary(locale);
  const t = dictionary.beneficiary;
  const user = await requireUser(locale);

  const requests = await listBeneficiaryRequests(user.id);

  return (
    <div className="space-y-6">
      <PageHeader eyebrow={dictionary.nav.myRequests} title={t.requestsTitle} subtitle={t.requestsSubtitle} />

      {requests.length === 0 ? (
        <EmptyState title={t.noRequests} hint={t.privacyNote} />
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {requests.map((request) => (
            <li key={request.id}>
              <Card>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-mono text-2xs text-ink-400">{request.publicRef}</p>
                    <p className="mt-1 text-sm font-bold">{locale === 'ar' ? request.categoryNameAr : request.categoryNameFr}</p>
                  </div>
                  <StatusBadge group="request" value={request.status} dictionary={dictionary} />
                </div>

                <div className="mt-4">
                  <Progress
                    value={percent(request.fundedCentimes, request.eligibleCentimes)}
                    label={dictionary.common.progress}
                  />
                  <div className="mt-2 flex justify-between text-2xs text-ink-500">
                    <span>
                      {dictionary.requests.fundedLabel}:{' '}
                      <strong className="text-brand-800">
                        <Money centimes={request.fundedCentimes} locale={locale} />
                      </strong>
                    </span>
                    <span>
                      {dictionary.requests.eligibleLabel}: <strong>{<Money centimes={request.eligibleCentimes} locale={locale} />}</strong>
                    </span>
                  </div>
                </div>

                <dl className="mt-4 grid grid-cols-2 gap-2 border-t border-sand-200 pt-3 text-2xs">
                  <div>
                    <dt className="text-ink-400">{t.publishedAt}</dt>
                    <dd className="font-semibold text-ink-800">{formatDate(request.publishedAt, locale)}</dd>
                  </div>
                  <div>
                    <dt className="text-ink-400">{t.expiresAt}</dt>
                    <dd className="font-semibold text-ink-800">{formatDate(request.expiresAt, locale)}</dd>
                  </div>
                </dl>

                <Link
                  className="link mt-4 inline-flex text-2xs"
                  href={localePath(locale, `/requests/${request.publicRef}`)}
                >
                  {t.viewRequest}
                </Link>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
