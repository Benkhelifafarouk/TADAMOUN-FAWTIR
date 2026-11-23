import { ar, type Dictionary } from './dictionaries/ar';
import { fr } from './dictionaries/fr';
import { defaultLocale, type Locale } from './config';

const dictionaries: Record<Locale, Dictionary> = { ar, fr };

export function getDictionary(locale: Locale): Dictionary {
  return dictionaries[locale] ?? dictionaries[defaultLocale];
}

export type { Dictionary };
export * from './config';
export * from './format';
