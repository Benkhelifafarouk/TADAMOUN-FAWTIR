import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ButtonLink, Card, PageHeader } from '@/components/ui';
import { getDictionary, localePath, type Locale } from '@/lib/i18n';
import { isLocale } from '@/lib/i18n/config';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return { title: getDictionary(isLocale(locale) ? locale : 'ar').how.title };
}

export default async function HowItWorksPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  if (!isLocale(raw)) notFound();
  const locale: Locale = raw;
  const dictionary = getDictionary(locale);
  const t = dictionary.how;

  return (
    <div className="mx-auto max-w-content px-4 py-10 sm:px-6">
      <PageHeader eyebrow={dictionary.nav.howItWorks} title={t.title} subtitle={t.subtitle} />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="text-lg font-bold">{t.beneficiaryTitle}</h2>
          <ol className="mt-4 space-y-3">
            {t.beneficiarySteps.map((step, index) => (
              <li key={step} className="flex gap-3 text-sm leading-7 text-ink-600">
                <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand-700 text-2xs font-bold text-white">
                  {index + 1}
                </span>
                {step}
              </li>
            ))}
          </ol>
        </Card>

        <Card>
          <h2 className="text-lg font-bold">{t.donorTitle}</h2>
          <ol className="mt-4 space-y-3">
            {t.donorSteps.map((step, index) => (
              <li key={step} className="flex gap-3 text-sm leading-7 text-ink-600">
                <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand-50 text-2xs font-bold text-brand-700">
                  {index + 1}
                </span>
                {step}
              </li>
            ))}
          </ol>
          <div className="mt-6">
            <ButtonLink href={localePath(locale, '/requests')}>{dictionary.nav.requests}</ButtonLink>
          </div>
        </Card>
      </div>

      <Card className="mt-6">
        <h2 className="text-lg font-bold">{t.verificationTitle}</h2>
        <p className="mt-3 text-sm leading-8 text-ink-600">{t.verificationText}</p>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {[
            dictionary.status.decision.APPROVED,
            dictionary.status.decision.REJECTED,
            dictionary.status.decision.NEEDS_ADDITIONAL_DOCUMENTS,
            dictionary.status.decision.VERIFICATION_UNCERTAIN,
            dictionary.status.decision.TEMPORARILY_BLOCKED,
          ].map((label) => (
            <div key={label} className="rounded-lg border border-sand-200 bg-sand-50 px-3 py-2 text-2xs font-semibold text-ink-700">
              {label}
            </div>
          ))}
        </div>
      </Card>

      <Card className="mt-6">
        <h2 className="text-lg font-bold">{t.neverTitle}</h2>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {t.neverList.map((item) => (
            <li key={item} className="flex gap-2 text-sm leading-7 text-ink-600">
              <span aria-hidden="true" className="text-clay-500">
                ✕
              </span>
              {item}
            </li>
          ))}
        </ul>
      </Card>

      <div className="mt-6">
        <h2 className="mb-4 text-lg font-bold">{t.faqTitle}</h2>
        <div className="space-y-3">
          {t.faq.map((item) => (
            <details key={item.q} className="surface p-4">
              <summary className="cursor-pointer text-sm font-semibold text-ink-900">{item.q}</summary>
              <p className="mt-3 text-sm leading-7 text-ink-600">{item.a}</p>
            </details>
          ))}
        </div>
      </div>

      <Card className="mt-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold">{t.ctaTitle}</h2>
          <p className="mt-1 text-sm text-ink-500">{t.ctaText}</p>
        </div>
        <div className="flex gap-3">
          <ButtonLink href={localePath(locale, '/register?role=beneficiary')}>{dictionary.nav.register}</ButtonLink>
          <ButtonLink href={localePath(locale, '/requests')} variant="secondary">
            {dictionary.nav.requests}
          </ButtonLink>
        </div>
      </Card>
    </div>
  );
}
