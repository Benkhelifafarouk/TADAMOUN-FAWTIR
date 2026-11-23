import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import '@/app/globals.css';
import { dirFor, getDictionary, isLocale, locales, type Locale } from '@/lib/i18n';

export const metadata: Metadata = {
  title: {
    default: 'Tadamoun Fawtir — تضامن فواتير',
    template: '%s · Tadamoun Fawtir',
  },
  description:
    'Plateforme solidaire algérienne de paiement des factures essentielles, avec décisions automatisées et protection de la vie privée.',
  robots: { index: false, follow: false },
};

export function generateStaticParams(): { locale: string }[] {
  return locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale: rawLocale } = await params;
  if (!isLocale(rawLocale)) notFound();
  const locale: Locale = rawLocale;
  const dictionary = getDictionary(locale);

  return (
    <html lang={locale} dir={dirFor(locale)}>
      <body className="min-h-screen">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:inset-inline-start-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-brand-700 focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white"
        >
          {dictionary.common.skipToContent}
        </a>
        {children}
      </body>
    </html>
  );
}
