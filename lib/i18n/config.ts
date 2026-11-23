export const locales = ['ar', 'fr'] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = 'ar';

export function isLocale(value: string | undefined | null): value is Locale {
  return value === 'ar' || value === 'fr';
}

export function dirFor(locale: Locale): 'rtl' | 'ltr' {
  return locale === 'ar' ? 'rtl' : 'ltr';
}

export function otherLocale(locale: Locale): Locale {
  return locale === 'ar' ? 'fr' : 'ar';
}

/**
 * Builds a locale-aware path. Internal links must always go through this helper
 * so that a language switch never drops the current page.
 */
export function localePath(locale: Locale, path: string): string {
  const clean = path === '/' ? '' : path.startsWith('/') ? path : `/${path}`;
  return `/${locale}${clean}`;
}

export function stripLocale(pathname: string): { locale: Locale | null; rest: string } {
  const match = /^\/(ar|fr)(\/.*)?$/.exec(pathname);
  if (!match) return { locale: null, rest: pathname };
  return { locale: match[1] as Locale, rest: match[2] ?? '/' };
}
