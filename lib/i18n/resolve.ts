import type { Dictionary } from '@/lib/i18n';

/** Resolves a dotted path (e.g. "notifications.events.welcome.title"). */
export function resolvePath(dictionary: Dictionary, path: string): string | null {
  let current: unknown = dictionary;
  for (const part of path.split('.')) {
    if (!current || typeof current !== 'object') return null;
    current = (current as Record<string, unknown>)[part];
  }
  return typeof current === 'string' ? current : null;
}
