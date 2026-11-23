import Link from 'next/link';
import { getCurrentUser } from '@/lib/auth/session';
import { homePathForRoles } from '@/lib/auth/roles';
import { getDictionary, localePath, otherLocale, type Locale } from '@/lib/i18n';
import { LocaleSwitcher } from '@/components/locale-switcher';

export async function SiteHeader({ locale }: { locale: Locale }) {
  const dictionary = getDictionary(locale);
  const user = await getCurrentUser();
  const home = localePath(locale, '/');

  const links = [
    { href: '/requests', label: dictionary.nav.requests },
    { href: '/how-it-works', label: dictionary.nav.howItWorks },
    { href: '/transparency', label: dictionary.nav.transparency },
    { href: '/about', label: dictionary.nav.about },
    { href: '/contact', label: dictionary.nav.contact },
  ];

  return (
    <header className="sticky top-0 z-40 border-b border-sand-200 bg-sand-50/90 backdrop-blur">
      <div className="mx-auto flex max-w-content items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <Link href={home} className="flex items-center gap-2.5">
          <span aria-hidden="true" className="grid h-9 w-9 place-items-center rounded-lg bg-brand-700 text-sm font-bold text-white">
            ت
          </span>
          <span className="leading-tight">
            <span className="block text-sm font-bold text-ink-950">{dictionary.common.appName}</span>
            <span className="block text-[10px] font-medium text-ink-400">{dictionary.common.tagline}</span>
          </span>
        </Link>

        <nav aria-label={dictionary.common.menu} className="hidden items-center gap-1 md:flex">
          {links.map((link) => (
            <Link
              key={link.href}
              href={localePath(locale, link.href)}
              className="rounded-lg px-3 py-2 text-sm font-medium text-ink-600 transition hover:bg-white hover:text-brand-800"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <LocaleSwitcher
            current={locale}
            target={otherLocale(locale)}
            label={locale === 'ar' ? dictionary.common.french : dictionary.common.arabic}
          />
          {user ? (
            <Link
              href={localePath(locale, homePathForRoles(user.roles))}
              className="hidden rounded-lg bg-brand-700 px-3.5 py-2 text-2xs font-bold text-white transition hover:bg-brand-800 sm:inline-flex"
            >
              {dictionary.common.dashboard}
            </Link>
          ) : (
            <>
              <Link
                href={localePath(locale, '/login')}
                className="hidden rounded-lg border border-sand-300 bg-white px-3 py-2 text-2xs font-semibold text-ink-700 sm:inline-flex"
              >
                {dictionary.nav.login}
              </Link>
              <Link
                href={localePath(locale, '/register')}
                className="hidden rounded-lg bg-brand-700 px-3.5 py-2 text-2xs font-bold text-white transition hover:bg-brand-800 sm:inline-flex"
              >
                {dictionary.nav.register}
              </Link>
            </>
          )}

          <details className="relative md:hidden">
            <summary className="list-none rounded-lg border border-sand-300 bg-white px-3 py-2 text-2xs font-semibold text-ink-700">
              {dictionary.common.menu}
            </summary>
            <nav className="absolute end-0 mt-2 w-56 rounded-xl border border-sand-200 bg-white p-2 shadow-lift">
              {[...links, { href: '/login', label: dictionary.nav.login }, { href: '/register', label: dictionary.nav.register }].map(
                (link) => (
                  <Link
                    key={link.href}
                    href={localePath(locale, link.href)}
                    className="block rounded-lg px-3 py-2 text-sm text-ink-700 hover:bg-sand-100"
                  >
                    {link.label}
                  </Link>
                ),
              )}
            </nav>
          </details>
        </div>
      </div>
    </header>
  );
}
