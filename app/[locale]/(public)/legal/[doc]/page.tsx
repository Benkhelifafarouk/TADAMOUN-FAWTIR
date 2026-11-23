import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Alert, Card, PageHeader } from '@/components/ui';
import { getDictionary, localePath, type Locale } from '@/lib/i18n';
import { isLocale } from '@/lib/i18n/config';

const DOCS = ['privacy', 'terms'] as const;
type Doc = (typeof DOCS)[number];

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; doc: string }>;
}): Promise<Metadata> {
  const { locale, doc } = await params;
  const dictionary = getDictionary(isLocale(locale) ? locale : 'ar');
  return { title: doc === 'terms' ? dictionary.legal.termsTitle : dictionary.legal.privacyTitle };
}

export default async function LegalPage({
  params,
}: {
  params: Promise<{ locale: string; doc: string }>;
}) {
  const { locale: raw, doc } = await params;
  if (!isLocale(raw)) notFound();
  const locale: Locale = raw;
  const dictionary = getDictionary(locale);
  const legal = dictionary.legal;
  if (!DOCS.includes(doc as Doc)) notFound();

  const isPrivacy = doc === 'privacy';

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <PageHeader
        eyebrow={dictionary.common.important}
        title={isPrivacy ? legal.privacyTitle : legal.termsTitle}
        subtitle={isPrivacy ? legal.privacyIntro : legal.termsIntro}
      />

      <Alert tone="danger" title={dictionary.common.important}>
        {legal.draftNotice}
      </Alert>

      <Card className="mt-6">
        <div className="prose-app">
          <h2>{legal.dataCollectedTitle}</h2>
          <ul>
            {legal.dataCollected.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>

          <h2>{legal.rightsTitle}</h2>
          <p>{legal.rightsText}</p>

          <h2>{legal.retentionTitle}</h2>
          <p>{legal.retentionText}</p>

          <h2>{legal.contactTitle}</h2>
          <p>{legal.contactText}</p>
        </div>

        <div className="mt-6 flex flex-wrap gap-4 border-t border-sand-200 pt-4 text-2xs">
          <Link className="link" href={localePath(locale, isPrivacy ? '/legal/terms' : '/legal/privacy')}>
            {isPrivacy ? legal.termsTitle : legal.privacyTitle}
          </Link>
          <Link className="link" href={localePath(locale, '/contact')}>
            {dictionary.nav.contact}
          </Link>
        </div>
      </Card>
    </div>
  );
}
