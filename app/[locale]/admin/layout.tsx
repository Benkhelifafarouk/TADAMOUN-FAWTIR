import { notFound } from 'next/navigation';
import { AppShell } from '@/components/app-shell';
import { requireRole } from '@/lib/auth/guards';
import { getDictionary, type Locale } from '@/lib/i18n';
import { isLocale } from '@/lib/i18n/config';

export default async function AdminLayout({
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
  const user = await requireRole(locale, ['admin', 'support']);

  return (
    <AppShell
      locale={locale}
      user={user}
      title={dictionary.nav.adminSpace}
      nav={[
        { href: '/admin', label: dictionary.common.dashboard },
        { href: '/admin/users', label: dictionary.nav.users },
        { href: '/admin/moderation', label: dictionary.nav.verification },
        { href: '/admin/finance', label: dictionary.nav.reports },
        { href: '/admin/rules', label: dictionary.nav.rules },
        { href: '/admin/config', label: dictionary.nav.catalogue },
        { href: '/admin/system', label: dictionary.nav.security },
        { href: '/admin/support', label: dictionary.nav.support },
        { href: '/admin/settings', label: dictionary.admin.settingsTitle },
      ]}
    >
      {children}
    </AppShell>
  );
}
