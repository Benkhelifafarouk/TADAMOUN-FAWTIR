import Link from 'next/link';
import { getDictionary, localePath, type Locale } from '@/lib/i18n';

export function SiteFooter({ locale }: { locale: Locale }) {
  const dictionary = getDictionary(locale);
  const year = new Date().getFullYear();

  return (
    <footer className="mt-16 border-t border-sand-200 bg-sand-100/60">
      <div className="mx-auto grid max-w-content gap-8 px-4 py-10 sm:px-6 md:grid-cols-4">
        <div className="md:col-span-2">
          <p className="text-sm font-bold text-ink-950">{dictionary.common.appName}</p>
          <p className="mt-2 max-w-md text-2xs leading-relaxed text-ink-500">{dictionary.meta.description}</p>
          <p className="mt-4 max-w-md rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-2xs leading-relaxed text-amber-600">
            {dictionary.home.demoWarning}
          </p>
        </div>
        <div>
          <p className="mb-3 text-2xs font-bold uppercase tracking-wide text-ink-400">{dictionary.nav.about}</p>
          <ul className="space-y-2 text-2xs">
            <li>
              <Link className="link" href={localePath(locale, '/how-it-works')}>
                {dictionary.nav.howItWorks}
              </Link>
            </li>
            <li>
              <Link className="link" href={localePath(locale, '/transparency')}>
                {dictionary.nav.transparency}
              </Link>
            </li>
            <li>
              <Link className="link" href={localePath(locale, '/requests')}>
                {dictionary.nav.requests}
              </Link>
            </li>
            <li>
              <Link className="link" href={localePath(locale, '/contact')}>
                {dictionary.nav.contact}
              </Link>
            </li>
          </ul>
        </div>
        <div>
          <p className="mb-3 text-2xs font-bold uppercase tracking-wide text-ink-400">{dictionary.common.account}</p>
          <ul className="space-y-2 text-2xs">
            <li>
              <Link className="link" href={localePath(locale, '/legal/privacy')}>
                {dictionary.legal.privacyTitle}
              </Link>
            </li>
            <li>
              <Link className="link" href={localePath(locale, '/legal/terms')}>
                {dictionary.legal.termsTitle}
              </Link>
            </li>
            <li>
              <Link className="link" href={localePath(locale, '/login')}>
                {dictionary.nav.login}
              </Link>
            </li>
            <li>
              <Link className="link" href={localePath(locale, '/register')}>
                {dictionary.nav.register}
              </Link>
            </li>
          </ul>
        </div>
      </div>
      <div className="border-t border-sand-200 px-4 py-4 text-center text-[10px] text-ink-400 sm:px-6">
        © {year} {dictionary.common.appName} — {dictionary.legal.draftNotice}
      </div>
    </footer>
  );
}
