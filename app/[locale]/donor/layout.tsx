import { notFound } from 'next/navigation';
import { AppShell } from '@/components/app-shell';
import { requireRole } from '@/lib/auth/guards';
import { getDictionary, type Locale } from '@/lib/i18n';
import { isLocale } from '@/lib/i18n/config';

export default async function DonorLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale: raw } = await params;
  if (!isLocale(raw)) notFound();
  const locale: Locale = raw;
  const dictionary = getDictionary(locale);
  const user = await requireRole(locale, ['donor', 'beneficiary', 'admin']);

  return (
    <AppShell
      locale={locale}
      user={user}
      title={dictionary.nav.donorSpace}
      nav={[
        { href: '/donor', label: dictionary.common.dashboard },
        { href: '/donor/donations', label: dictionary.nav.donations },
        { href: '/requests', label: dictionary.nav.requests },
        { href: '/transparency', label: dictionary.nav.transparency },
      ]}
    >
      {children}
    </AppShell>
  );
}
