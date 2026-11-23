import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Card, PageHeader } from '@/components/ui';
import { getDictionary, type Locale } from '@/lib/i18n';
import { isLocale } from '@/lib/i18n/config';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return { title: getDictionary(isLocale(locale) ? locale : 'ar').about.title };
}

export default async function AboutPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  if (!isLocale(raw)) notFound();
  const locale: Locale = raw;
  const dictionary = getDictionary(locale);
  const t = dictionary.about;

  return (
    <div className="mx-auto max-w-content px-4 py-10 sm:px-6">
      <PageHeader eyebrow={dictionary.nav.about} title={t.title} subtitle={t.subtitle} />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="text-lg font-bold">{t.missionTitle}</h2>
          <p className="mt-3 text-sm leading-8 text-ink-600">{t.missionText}</p>
        </Card>
        <Card>
          <h2 className="text-lg font-bold">{t.governanceTitle}</h2>
          <p className="mt-3 text-sm leading-8 text-ink-600">{t.governanceText}</p>
        </Card>
      </div>

      <Card className="mt-6">
        <h2 className="text-lg font-bold">{t.principlesTitle}</h2>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {t.principles.map((item) => (
            <li key={item} className="flex gap-2 text-sm leading-7 text-ink-600">
              <span aria-hidden="true" className="text-brand-500">
                ✓
              </span>
              {item}
            </li>
          ))}
        </ul>
      </Card>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="text-lg font-bold">{t.limitsTitle}</h2>
          <ul className="mt-4 space-y-2">
            {t.limits.map((item) => (
              <li key={item} className="flex gap-2 text-sm leading-7 text-clay-600">
                <span aria-hidden="true">!</span>
                {item}
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <h2 className="text-lg font-bold">{t.roadmapTitle}</h2>
          <p className="mt-3 text-sm leading-8 text-ink-600">{t.roadmap}</p>
        </Card>
      </div>
    </div>
  );
}
