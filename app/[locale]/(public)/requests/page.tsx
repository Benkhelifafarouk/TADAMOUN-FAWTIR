import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Badge, ButtonLink, Card, EmptyState, Money, PageHeader, Progress } from '@/components/ui';
import { StatusBadge } from '@/components/status-badge';
import { browsePublicRequests, getCategories, getWilayas } from '@/lib/data/public';
import { getDictionary, localePath, type Locale } from '@/lib/i18n';
import { isLocale } from '@/lib/i18n/config';
import { formatDate } from '@/lib/i18n/format';
import { percent } from '@/lib/money';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const dictionary = getDictionary(isLocale(locale) ? locale : 'ar');
  return { title: dictionary.requests.title };
}

export default async function RequestsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale: raw } = await params;
  if (!isLocale(raw)) notFound();
  const locale: Locale = raw;
  const dictionary = getDictionary(locale);
  const query = await searchParams;

  const wilaya = typeof query.wilaya === 'string' ? query.wilaya : undefined;
  const service = typeof query.service === 'string' ? query.service : undefined;
  const sort = query.sort === 'remaining' ? 'remaining' : 'newest';

  const [requests, wilayas, categories] = await Promise.all([
    browsePublicRequests({ wilaya, service, sort }),
    getWilayas(),
    getCategories(),
  ]);

  return (
    <div className="mx-auto max-w-content px-4 py-10 sm:px-6">
      <PageHeader eyebrow={dictionary.nav.requests} title={dictionary.requests.title} subtitle={dictionary.requests.subtitle} />

      <form method="get" className="surface mb-6 flex flex-wrap items-end gap-3 p-4">
        <div className="min-w-[10rem] flex-1">
          <label className="field-label" htmlFor="wilaya">
            {dictionary.requests.filterWilaya}
          </label>
          <select id="wilaya" name="wilaya" defaultValue={wilaya ?? ''} className="field-input">
            <option value="">{dictionary.common.all}</option>
            {wilayas.map((item) => (
              <option key={item.code} value={item.code}>
                {locale === 'ar' ? item.nameAr : item.nameFr}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-[10rem] flex-1">
          <label className="field-label" htmlFor="service">
            {dictionary.requests.filterService}
          </label>
          <select id="service" name="service" defaultValue={service ?? ''} className="field-input">
            <option value="">{dictionary.common.all}</option>
            {categories.map((item) => (
              <option key={item.code} value={item.code}>
                {locale === 'ar' ? item.nameAr : item.nameFr}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-[9rem]">
          <label className="field-label" htmlFor="sort">
            {dictionary.common.filters}
          </label>
          <select id="sort" name="sort" defaultValue={sort} className="field-input">
            <option value="newest">{dictionary.requests.sortNewest}</option>
            <option value="remaining">{dictionary.requests.sortRemaining}</option>
          </select>
        </div>
        <button
          type="submit"
          className="rounded-lg bg-brand-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-800"
        >
          {dictionary.common.apply}
        </button>
        <Link
          href={localePath(locale, '/requests')}
          className="rounded-lg border border-sand-300 bg-white px-4 py-2.5 text-sm font-semibold text-ink-600"
        >
          {dictionary.common.reset}
        </Link>
      </form>

      {requests.length === 0 ? (
        <EmptyState
          title={dictionary.requests.empty}
          hint={dictionary.requests.emptyHint}
          action={<ButtonLink href={localePath(locale, '/how-it-works')} variant="secondary">{dictionary.nav.howItWorks}</ButtonLink>}
        />
      ) : (
        <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {requests.map((request) => {
            const progress = percent(request.fundedAmountCentimes, request.eligibleAmountCentimes);
            return (
              <li key={request.reference}>
                <Card className="flex h-full flex-col">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-mono text-2xs text-ink-400">{request.reference}</p>
                      <p className="mt-1 text-sm font-bold text-ink-900">
                        {locale === 'ar' ? request.categoryNameAr : request.categoryNameFr}
                      </p>
                      <p className="mt-0.5 text-2xs text-ink-500">
                        {locale === 'ar' ? request.wilayaNameAr : request.wilayaNameFr}
                        {request.municipalityNameAr || request.municipalityNameFr ? (
                          <>
                            <span className="text-ink-300"> · </span>
                            {locale === 'ar' ? request.municipalityNameAr : request.municipalityNameFr}
                          </>
                        ) : null}
                      </p>
                    </div>
                    <StatusBadge group="request" value={request.status} dictionary={dictionary} />
                  </div>

                  <div className="mt-4">
                    <Progress value={progress} label={dictionary.common.progress} />
                    <div className="mt-2 flex items-baseline justify-between gap-2 text-2xs text-ink-500">
                      <span>
                        {dictionary.requests.progressLabel.replace('{percent}', String(progress))}
                      </span>
                      <span className="font-bold text-ink-900">
                        <Money centimes={request.remainingAmountCentimes} locale={locale} />
                      </span>
                    </div>
                  </div>

                  <dl className="mt-4 grid grid-cols-2 gap-2 border-t border-sand-200 pt-3 text-2xs">
                    <div>
                      <dt className="text-ink-400">{dictionary.requests.eligibleLabel}</dt>
                      <dd className="font-semibold text-ink-900">
                        <Money centimes={request.eligibleAmountCentimes} locale={locale} />
                      </dd>
                    </div>
                    <div>
                      <dt className="text-ink-400">{dictionary.requests.fundedLabel}</dt>
                      <dd className="font-semibold text-brand-800">
                        <Money centimes={request.fundedAmountCentimes} locale={locale} />
                      </dd>
                    </div>
                  </dl>

                  <div className="mt-auto pt-4">
                    <Link
                      href={localePath(locale, `/requests/${request.reference}`)}
                      className="inline-flex w-full items-center justify-center rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-2xs font-bold text-brand-800 transition hover:bg-brand-100"
                    >
                      {dictionary.requests.supportCta}
                    </Link>
                    <p className="mt-2 text-[10px] text-ink-400">
                      {dictionary.requests.publishedOn} {formatDate(request.publishedAt, locale)}
                    </p>
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      <p className="mt-6 text-center text-2xs text-ink-400">
        <Badge tone="info">{dictionary.requests.verifiedBadge}</Badge>{' '}
        {dictionary.requests.privacyNotice}
      </p>
    </div>
  );
}
