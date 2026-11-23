'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { Locale } from '@/lib/i18n/config';

/** Language switch that preserves the current page. */
export function LocaleSwitcher({
  current,
  target,
  label,
  className,
}: {
  current: Locale;
  target: Locale;
  label: string;
  className?: string;
}) {
  const pathname = usePathname() ?? `/${current}`;
  const next = pathname.replace(new RegExp(`^/${current}`), `/${target}`);
  return (
    <Link
      href={next}
      hrefLang={target}
      aria-label={label}
      className={
        className ??
        'inline-flex items-center gap-1.5 rounded-lg border border-sand-300 bg-white px-2.5 py-1.5 text-2xs font-semibold text-ink-600 transition hover:border-brand-300 hover:text-brand-700'
      }
    >
      <span aria-hidden="true" className="text-[10px] uppercase tracking-wider">
        {target}
      </span>
      <span>{label}</span>
    </Link>
  );
}
