export interface ActionState {
  ok: boolean;
  message?: string;
  fieldErrors?: Record<string, string>;
  data?: Record<string, string | number | boolean | null>;
}

export const initialActionState: ActionState = { ok: false };

/** Walks a dotted path in a dictionary object; returns null when absent. */
export function resolveMessage(dictionary: unknown, path: string): string | null {
  const parts = path.split('.');
  let current: unknown = dictionary;
  for (const part of parts) {
    if (!current || typeof current !== 'object') return null;
    current = (current as Record<string, unknown>)[part];
  }
  return typeof current === 'string' ? current : null;
}
