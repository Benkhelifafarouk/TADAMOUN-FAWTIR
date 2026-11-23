import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Alert, Card, Money, PageHeader, Stat } from '@/components/ui';
import { getPublicStats } from '@/lib/data/public';
import { getDictionary, type Locale } from '@/lib/i18n';
import { isLocale } from '@/lib/i18n/config';
import { formatNumber } from '@/lib/i18n/format';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return { title: getDictionary(isLocale(locale) ? locale : 'ar').transparency.title };
}

export default async function TransparencyPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  if (!isLocale(raw)) notFound();
  const locale: Locale = raw;
  const dictionary = getDictionary(locale);
  const stats = await getPublicStats();

  return (
    <div className="mx-auto max-w-content px-4 py-10 sm:px-6">
      <PageHeader eyebrow={dictionary.nav.transparency} title={dictionary.transparency.title} subtitle={dictionary.transparency.subtitle} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label={dictionary.transparency.publishedRequests} value={formatNumber(stats.publishedRequests, locale)} />
        <Stat label={dictionary.transparency.completedRequests} value={formatNumber(stats.completedRequests, locale)} />
        <Stat
          label={dictionary.transparency.allocatedTotal}
          value={<Money centimes={stats.allocatedCentimes} locale={locale} />}
        />
        <Stat
          label={dictionary.transparency.households}
          value={formatNumber(stats.supportedHouseholds, locale)}
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <h2 className="text-lg font-bold">{dictionary.transparency.accountingTitle}</h2>
          <ol className="mt-4 space-y-3">
            {dictionary.transparency.accountingList.map((item, index) => (
              <li key={item} className="flex gap-3 text-sm leading-7 text-ink-600">
                <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand-50 text-2xs font-bold text-brand-700">
                  {index + 1}
                </span>
                {item}
              </li>
            ))}
          </ol>
          <Alert tone="warning" title={dictionary.transparency.demoTitle}>
            {dictionary.transparency.demoText}
          </Alert>
        </Card>

        <div className="space-y-4">
          <Card className="bg-brand-700 text-white">
            <p className="text-2xs uppercase tracking-wide text-brand-100">{dictionary.transparency.fundTitle}</p>
            <p className="mt-3 text-3xl font-bold tabular-nums">
              <Money centimes={stats.fundBalanceCentimes} locale={locale} />
            </p>
            <p className="mt-1 text-2xs text-brand-100">{dictionary.transparency.fundBalance}</p>
            <hr className="my-4 border-white/20" />
            <p className="text-2xs text-brand-100">
              {dictionary.transparency.fundContributions}:{' '}
              <strong className="text-white">
                <Money centimes={stats.fundContributionsCentimes} locale={locale} />
              </strong>
            </p>
          </Card>
          <Card>
            <p className="text-sm leading-7 text-ink-600">{dictionary.transparency.fundText}</p>
          </Card>
        </div>
      </div>
    </div>
  );
}
