import { notFound } from 'next/navigation';
import { AppShell } from '@/components/app-shell';
import { requireRole } from '@/lib/auth/guards';
import { getDictionary, type Locale } from '@/lib/i18n';
import { isLocale } from '@/lib/i18n/config';

export default async function BeneficiaryLayout({
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
  const user = await requireRole(locale, ['beneficiary']);

  return (
    <AppShell
      locale={locale}
      user={user}
      title={dictionary.nav.beneficiarySpace}
      nav={[
        { href: '/app', label: dictionary.common.dashboard },
        { href: '/app/profile', label: dictionary.nav.profile },
        { href: '/app/bills', label: dictionary.nav.myBills },
        { href: '/app/bills/new', label: dictionary.nav.newBill },
        { href: '/app/requests', label: dictionary.nav.myRequests },
        { href: '/app/documents', label: dictionary.nav.documents },
        { href: '/app/notifications', label: dictionary.notifications.title },
        { href: '/app/settings', label: dictionary.nav.settings },
      ]}
    >
      {children}
    </AppShell>
  );
}
