import type { Dictionary } from '@/lib/i18n';

/**
 * Dynamic-code labels: reason codes, document types and next actions are stored
 * in the database, so they are resolved against the dictionary at render time.
 */

export function reasonLabel(dictionary: Dictionary, code: string): string {
  const map = dictionary.reasons as unknown as Record<string, string>;
  return map[code] ?? code;
}

export function docLabel(dictionary: Dictionary, docType: string): string {
  const map = dictionary.docs as unknown as Record<string, string>;
  return map[docType] ?? docType;
}

export function nextActionLabel(dictionary: Dictionary, code: string | null): string | null {
  if (!code) return null;
  const map = dictionary.nextActions as unknown as Record<string, string>;
  return map[code] ?? null;
}

export function serviceLabel(
  dictionary: Dictionary,
  code: string,
  fallback: string,
): string {
  const map = dictionary.requests.serviceLabels as unknown as Record<string, string>;
  return map[code] ?? fallback;
}
