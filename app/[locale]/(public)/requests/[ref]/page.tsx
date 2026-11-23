import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Alert, Badge, ButtonLink, Card, DataRow, Money, Progress } from '@/components/ui';
import { StatusBadge } from '@/components/status-badge';
import { getPublicRequest } from '@/lib/data/public';
import { getDictionary, localePath, type Locale } from '@/lib/i18n';
import { isLocale } from '@/lib/i18n/config';
import { formatDate } from '@/lib/i18n/format';
import { percent } from '@/lib/money';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; ref: string }>;
}): Promise<Metadata> {
  const { locale, ref } = await params;
  const dictionary = getDictionary(isLocale(locale) ? locale : 'ar');
  return { title: `${ref} · ${dictionary.requests.detailTitle}` };
}

export default async function RequestDetailPage({
  params,
}: {
  params: Promise<{ locale: string; ref: string }>;
}) {
  const { locale: raw, ref } = await params;
  if (!isLocale(raw)) notFound();
  const locale: Locale = raw;
  const dictionary = getDictionary(locale);

  const request = await getPublicRequest(ref);

  if (!request) {
    return (
      <div className="mx-auto max-w-content px-4 py-16 sm:px-6">
        <Card className="mx-auto max-w-lg text-center">
          <p className="text-sm font-semibold text-ink-800">{dictionary.requests.notFound}</p>
          <div className="mt-4">
            <ButtonLink href={localePath(locale, '/requests')} variant="secondary">
              {dictionary.donor.backToRequests}
            </ButtonLink>
          </div>
        </Card>
      </div>
    );
  }

  const progress = percent(request.fundedAmountCentimes, request.eligibleAmountCentimes);
  const remaining = request.remainingAmountCentimes;
  const open = remaining > 0 && ['published', 'partially_funded'].includes(request.status);
  const description = locale === 'ar' ? request.description : request.descriptionFr;

  return (
    <div className="mx-auto max-w-content px-4 py-10 sm:px-6">
      <nav className="mb-4 text-2xs text-ink-400">
        <Link href={localePath(locale, '/requests')} className="link">
          {dictionary.nav.requests}
        </Link>
        <span className="mx-2">/</span>
        <span className="font-mono">{request.reference}</span>
      </nav>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_0.6fr]">
        <div className="space-y-6">
          <Card>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-mono text-2xs text-ink-400">{request.reference}</p>
                <h1 className="mt-1 text-2xl font-bold">
                  {locale === 'ar' ? request.categoryNameAr : request.categoryNameFr}
                </h1>
                <p className="mt-1 text-sm text-ink-500">
                  {locale === 'ar' ? request.wilayaNameAr : request.wilayaNameFr}
                  {request.municipalityNameAr || request.municipalityNameFr ? (
                    <>
                      <span className="text-ink-300"> · </span>
                      {locale === 'ar' ? request.municipalityNameAr : request.municipalityNameFr}
                    </>
                  ) : null}
                </p>
              </div>
              <div className="flex flex-col items-end gap-2">
                <StatusBadge group="request" value={request.status} dictionary={dictionary} />
                <Badge tone="brand">{dictionary.requests.verifiedBadge}</Badge>
              </div>
            </div>

            <p className="mt-6 text-sm leading-8 text-ink-700">{description}</p>

            <div className="mt-6 rounded-xl border border-sand-200 bg-sand-50 p-4">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-2xs font-semibold uppercase tracking-wide text-ink-400">
                  {dictionary.common.progress}
                </span>
                <span className="text-sm font-bold text-ink-900">
                  {dictionary.requests.progressLabel.replace('{percent}', String(progress))}
                </span>
              </div>
              <div className="mt-2">
                <Progress value={progress} label={dictionary.common.progress} />
              </div>
              <div className="mt-3 flex flex-wrap justify-between gap-2 text-2xs">
                <span className="text-ink-500">
                  {dictionary.requests.fundedLabel}:{' '}
                  <strong className="text-brand-800">
                    <Money centimes={request.fundedAmountCentimes} locale={locale} />
                  </strong>
                </span>
                <span className="text-ink-500">
                  {dictionary.requests.remainingLabel}:{' '}
                  <strong className="text-ink-900">
                    <Money centimes={remaining} locale={locale} />
                  </strong>
                </span>
              </div>
            </div>

            {open ? (
              <div className="mt-6 flex flex-wrap gap-3">
                <ButtonLink href={localePath(locale, `/requests/${request.reference}/donate`)}>
                  {dictionary.requests.supportCta}
                </ButtonLink>
                <ButtonLink href={localePath(locale, '/transparency')} variant="secondary">
                  {dictionary.nav.transparency}
                </ButtonLink>
              </div>
            ) : (
              <Alert tone="success" title={dictionary.requests.fullyFunded} />
            )}
          </Card>

          <Card>
            <h2 className="text-base font-bold">{dictionary.requests.aboutRequest}</h2>
            <dl className="mt-3">
              <DataRow label={dictionary.requests.service}>
                {locale === 'ar' ? request.categoryNameAr : request.categoryNameFr}
              </DataRow>
              <DataRow label={dictionary.requests.location}>
                {locale === 'ar' ? request.wilayaNameAr : request.wilayaNameFr}
              </DataRow>
              <DataRow label={dictionary.requests.eligibleLabel}>
                <Money centimes={request.eligibleAmountCentimes} locale={locale} />
              </DataRow>
              <DataRow label={dictionary.requests.publishedOn}>{formatDate(request.publishedAt, locale)}</DataRow>
              <DataRow label={dictionary.beneficiary.expiresAt}>{formatDate(request.expiresAt, locale)}</DataRow>
              <DataRow label={dictionary.beneficiary.provider}>
                {locale === 'ar' ? request.providerNameAr : request.providerNameFr}
              </DataRow>
            </dl>
            <p className="mt-4 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-2xs leading-relaxed text-brand-900">
              {dictionary.requests.privacyNotice}
            </p>
          </Card>
        </div>

        <aside className="space-y-4">
          <Card className="bg-brand-700 text-white">
            <p className="text-2xs uppercase tracking-wide text-brand-100">{dictionary.transparency.demoTitle}</p>
            <p className="mt-2 text-sm leading-7 text-brand-50">{dictionary.transparency.demoText}</p>
          </Card>
          <Card>
            <h2 className="text-sm font-bold">{dictionary.transparency.accountingTitle}</h2>
            <ul className="mt-3 space-y-2 text-2xs leading-relaxed text-ink-500">
              {dictionary.transparency.accountingList.map((item) => (
                <li key={item} className="flex gap-2">
                  <span aria-hidden="true" className="text-brand-500">
                    •
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          </Card>
        </aside>
      </div>
    </div>
  );
}
