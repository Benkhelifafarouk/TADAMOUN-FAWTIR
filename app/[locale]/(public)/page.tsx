import type { Metadata } from 'next';
import Link from 'next/link';
import { Alert, Badge, ButtonLink, Card, Money, Progress, SectionTitle } from '@/components/ui';
import { StatusBadge } from '@/components/status-badge';
import { browsePublicRequests, getCategories, getPublicStats } from '@/lib/data/public';
import { getDictionary, localePath, type Locale } from '@/lib/i18n';
import { isLocale } from '@/lib/i18n/config';
import { notFound } from 'next/navigation';
import { percent } from '@/lib/money';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const dictionary = getDictionary(isLocale(locale) ? locale : 'ar');
  return { title: dictionary.common.appName, description: dictionary.meta.description };
}

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  if (!isLocale(raw)) notFound();
  const locale: Locale = raw;
  const dictionary = getDictionary(locale);
  const t = dictionary.home;

  const [stats, categories, latest] = await Promise.all([
    getPublicStats(),
    getCategories(),
    browsePublicRequests({ limit: 3 }),
  ]);

  return (
    <>
      <section className="relative overflow-hidden border-b border-sand-200 bg-gradient-to-b from-brand-50 via-sand-50 to-sand-50">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-24 end-[-6rem] h-72 w-72 rounded-full bg-brand-200/40 blur-2xl"
        />
        <div className="mx-auto grid max-w-content gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[1.15fr_0.85fr] lg:py-20">
          <div>
            <Badge tone="brand" className="mb-5">
              <span aria-hidden="true">◈</span> {t.trustBadge}
            </Badge>
            <h1 className="max-w-2xl text-3xl font-bold leading-[1.25] text-ink-950 sm:text-4xl lg:text-[2.75rem]">
              {t.heroTitle}
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-8 text-ink-600">{t.heroSubtitle}</p>

            <div className="mt-8 flex flex-wrap gap-3">
              <ButtonLink href={localePath(locale, '/requests')}>{t.ctaDonate}</ButtonLink>
              <ButtonLink href={localePath(locale, '/register?role=beneficiary')} variant="secondary">
                {t.ctaRequest}
              </ButtonLink>
            </div>

            <dl className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { label: t.statsPublished, value: stats.publishedRequests },
                { label: t.statsCompleted, value: stats.supportedHouseholds },
              ].map((item) => (
                <div key={item.label} className="rounded-xl border border-sand-200 bg-white/70 px-3 py-3">
                  <dt className="text-[10px] font-semibold uppercase tracking-wide text-ink-400">{item.label}</dt>
                  <dd className="mt-1 text-xl font-bold tabular-nums text-ink-950">{item.value}</dd>
                </div>
              ))}
              <div className="rounded-xl border border-sand-200 bg-white/70 px-3 py-3">
                <dt className="text-[10px] font-semibold uppercase tracking-wide text-ink-400">{t.statsFund}</dt>
                <dd className="mt-1 text-sm font-bold tabular-nums text-brand-800">
                  <Money centimes={stats.fundBalanceCentimes} locale={locale} />
                </dd>
              </div>
              <div className="rounded-xl border border-sand-200 bg-white/70 px-3 py-3">
                <dt className="text-[10px] font-semibold uppercase tracking-wide text-ink-400">
                  {dictionary.transparency.allocatedTotal}
                </dt>
                <dd className="mt-1 text-sm font-bold tabular-nums text-ink-950">
                  <Money centimes={stats.allocatedCentimes} locale={locale} />
                </dd>
              </div>
            </dl>
          </div>

          <Card className="self-start bg-white/90">
            <div className="flex items-center justify-between gap-2">
              <p className="text-2xs font-bold uppercase tracking-wide text-brand-700">{dictionary.nav.requests}</p>
              <Badge tone="info">{dictionary.requests.verifiedBadge}</Badge>
            </div>
            {latest.length === 0 ? (
              <p className="mt-4 text-sm leading-7 text-ink-500">{dictionary.requests.emptyHint}</p>
            ) : (
              <ul className="mt-4 space-y-4">
                {latest.slice(0, 2).map((request) => (
                  <li key={request.reference} className="rounded-xl border border-sand-200 p-4">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-2xs text-ink-400">{request.reference}</span>
                      <StatusBadge group="request" value={request.status} dictionary={dictionary} />
                    </div>
                    <p className="mt-2 text-sm font-semibold text-ink-900">
                      {locale === 'ar' ? request.categoryNameAr : request.categoryNameFr}
                      <span className="text-ink-300"> · </span>
                      {locale === 'ar' ? request.wilayaNameAr : request.wilayaNameFr}
                    </p>
                    <div className="mt-3">
                      <Progress
                        value={percent(request.fundedAmountCentimes, request.eligibleAmountCentimes)}
                        label={dictionary.common.progress}
                      />
                      <div className="mt-2 flex justify-between text-2xs text-ink-500">
                        <span>
                          <Money centimes={request.fundedAmountCentimes} locale={locale} /> /{' '}
                          <Money centimes={request.eligibleAmountCentimes} locale={locale} />
                        </span>
                        <Link className="link" href={localePath(locale, `/requests/${request.reference}`)}>
                          {dictionary.common.view}
                        </Link>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <Link
              href={localePath(locale, '/requests')}
              className="mt-4 inline-flex text-2xs font-bold text-brand-700 hover:text-brand-800"
            >
              {dictionary.common.viewAll} →
            </Link>
          </Card>
        </div>
      </section>

      <section className="mx-auto max-w-content px-4 py-12 sm:px-6 lg:py-16">
        <SectionTitle title={t.howTitle} subtitle={t.howSubtitle} />
        <ol className="grid gap-4 md:grid-cols-3">
          {[
            { title: t.step1Title, text: t.step1Text },
            { title: t.step2Title, text: t.step2Text },
            { title: t.step3Title, text: t.step3Text },
          ].map((step, index) => (
            <li key={step.title} className="surface p-6">
              <span className="grid h-9 w-9 place-items-center rounded-full bg-brand-700 text-sm font-bold text-white">
                {index + 1}
              </span>
              <h3 className="mt-4 text-base font-bold">{step.title}</h3>
              <p className="mt-2 text-sm leading-7 text-ink-500">{step.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="border-y border-sand-200 bg-white">
        <div className="mx-auto grid max-w-content gap-8 px-4 py-12 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:py-16">
          <div>
            <h2 className="text-2xl font-bold">{t.privacyTitle}</h2>
            <p className="mt-3 text-sm leading-8 text-ink-600">{t.privacyText}</p>
            <Alert tone="success" title={dictionary.requests.privacyNotice}>
              <ul className="mt-2 space-y-1.5 text-2xs">
                <li>• {t.privacyPoint1}</li>
                <li>• {t.privacyPoint2}</li>
                <li>• {t.privacyPoint3}</li>
              </ul>
            </Alert>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {categories.map((category) => (
              <div key={category.id} className="rounded-xl border border-sand-200 bg-sand-50 p-4">
                <p className="text-sm font-bold text-ink-900">
                  {locale === 'ar' ? category.nameAr : category.nameFr}
                </p>
                <p className="mt-1 text-2xs leading-relaxed text-ink-400">
                  {locale === 'ar' ? category.descriptionAr : category.descriptionFr}
                </p>
                <p className="mt-3 text-2xs font-semibold text-brand-700">{t.servicesSubtitle}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-content px-4 py-12 sm:px-6 lg:py-16">
        <div className="surface flex flex-col gap-6 p-8 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl font-bold sm:text-2xl">{t.ctaTitle}</h2>
            <p className="mt-2 max-w-xl text-sm text-ink-500">{t.ctaText}</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <ButtonLink href={localePath(locale, '/requests')}>{dictionary.nav.requests}</ButtonLink>
            <ButtonLink href={localePath(locale, '/how-it-works')} variant="secondary">
              {dictionary.nav.howItWorks}
            </ButtonLink>
          </div>
        </div>
        <p className="mt-6 text-center text-2xs text-ink-400">{t.demoWarning}</p>
      </section>
    </>
  );
}
