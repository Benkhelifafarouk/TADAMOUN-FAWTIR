import Link from 'next/link';
import { logoutAction } from '@/lib/actions/auth';
import type { AuthUser } from '@/lib/auth/session';
import { getDictionary, localePath, type Locale } from '@/lib/i18n';
import { LocaleSwitcher } from '@/components/locale-switcher';
import { otherLocale } from '@/lib/i18n/config';

export interface NavItem {
  href: string;
  label: string;
}

export function AppShell({
  locale,
  user,
  nav,
  title,
  children,
}: {
  locale: Locale;
  user: AuthUser;
  nav: NavItem[];
  title: string;
  children: React.ReactNode;
}) {
  const dictionary = getDictionary(locale);

  return (
    <div className="min-h-screen bg-sand-50">
      <header className="sticky top-0 z-40 border-b border-sand-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-content items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <Link href={localePath(locale, '/')} className="flex items-center gap-2">
              <span aria-hidden="true" className="grid h-8 w-8 place-items-center rounded-lg bg-brand-700 text-xs font-bold text-white">
                ت
              </span>
              <span className="hidden text-sm font-bold text-ink-950 sm:block">{dictionary.common.appName}</span>
            </Link>
            <span className="hidden text-2xs font-semibold uppercase tracking-wide text-ink-400 sm:block">{title}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden max-w-[16rem] truncate text-2xs text-ink-500 md:block">{user.fullName}</span>
            <LocaleSwitcher
              current={locale}
              target={otherLocale(locale)}
              label={locale === 'ar' ? dictionary.common.french : dictionary.common.arabic}
            />
            <form action={logoutAction}>
              <button
                type="submit"
                className="rounded-lg border border-sand-300 bg-white px-3 py-1.5 text-2xs font-semibold text-ink-600 transition hover:border-clay-500/40 hover:text-clay-600"
              >
                {dictionary.common.signOut}
              </button>
            </form>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-content gap-6 px-4 py-6 sm:px-6">
        <aside className="hidden w-56 shrink-0 lg:block">
          <nav aria-label={title} className="sticky top-20 space-y-1">
            {nav.map((item) => (
              <Link
                key={item.href}
                href={localePath(locale, item.href)}
                className="block rounded-lg px-3 py-2 text-sm font-medium text-ink-600 transition hover:bg-white hover:text-brand-800"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </aside>

        <main id="main" className="min-w-0 flex-1">
          <nav aria-label={title} className="mb-4 flex gap-1 overflow-x-auto pb-1 lg:hidden">
            {nav.map((item) => (
              <Link
                key={item.href}
                href={localePath(locale, item.href)}
                className="whitespace-nowrap rounded-full border border-sand-300 bg-white px-3 py-1.5 text-2xs font-semibold text-ink-600"
              >
                {item.label}
              </Link>
            ))}
          </nav>
          {children}
        </main>
      </div>
    </div>
  );
}
