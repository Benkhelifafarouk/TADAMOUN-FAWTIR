/**
 * PostgreSQL returns bigint/numeric as strings (pg) or BigInt (PGlite).
 * Every numeric read goes through these helpers so amounts never become "1000"
 * string concatenations or BigInt leaks.
 */

export function num(value: unknown): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

export function numOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = num(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function bool(value: unknown): boolean {
  return value === true || value === 't' || value === 'true' || value === 1;
}

export function dateOrNull(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

export function isoDate(value: unknown): string | null {
  const date = dateOrNull(value);
  return date ? date.toISOString().slice(0, 10) : null;
}

export function jsonObject<T = Record<string, unknown>>(value: unknown): T {
  if (value && typeof value === 'object') return value as T;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as T;
    } catch {
      return {} as T;
    }
  }
  return {} as T;
}

/**
 * Parses a JSONB value only when it actually looks like JSON.
 *
 * A JSON string scalar (e.g. "2026-11-draft") is returned by the driver as the
 * bare text 2026-11-draft; calling JSON.parse on it throws. Object/array/scalar
 * JSON values still parse normally, and a plain string is returned unchanged.
 */
export function parseJsonValue<T = unknown>(value: unknown): T {
  if (typeof value !== 'string') return value as T;
  const trimmed = value.trim();
  if (trimmed.length === 0) return value as T;
  const first = trimmed[0];
  if (!['{', '[', '"', '-', 't', 'f', 'n'].includes(first) && !/^[0-9]/.test(first)) {
    return value as T;
  }
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    return value as T;
  }
}
