/**
 * Money handling.
 *
 * DZD is stored as integer minor units (centimes, 1 DZD = 100 centimes).
 * Never use floating point for amounts: every calculation stays in integers.
 */

export const CURRENCY = 'DZD' as const;
export const CENTIMES_PER_DZD = 100;

export function dzdToCentimes(dzd: number): number {
  return Math.round(dzd * CENTIMES_PER_DZD);
}

export function centimesToDzd(centimes: number): number {
  return centimes / CENTIMES_PER_DZD;
}

/**
 * Parses a human amount typed as "12 500", "12,500.50", "12500.5" or "١٢٥٠٠".
 * Returns null when the input cannot be interpreted unambiguously.
 */
export function parseAmountToCentimes(input: string): number | null {
  if (typeof input !== 'string') return null;
  const normalizedDigits = input
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[\u06f0-\u06f9]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/\u00a0/g, ' ')
    .trim();

  if (normalizedDigits.length === 0) return null;

  // Remove grouping whitespace first, then decide which separator is decimal.
  const compact = normalizedDigits.replace(/[\s']/g, '');
  const lastComma = compact.lastIndexOf(',');
  const lastDot = compact.lastIndexOf('.');

  let decimalSeparator: ',' | '.' | null = null;
  if (lastComma >= 0 && lastDot >= 0) {
    decimalSeparator = lastComma > lastDot ? ',' : '.';
  } else if (lastComma >= 0) {
    const after = compact.length - lastComma - 1;
    if (after <= 2) decimalSeparator = ',';
    else if (after !== 3) return null;
  } else if (lastDot >= 0) {
    const after = compact.length - lastDot - 1;
    if (after <= 2) decimalSeparator = '.';
    else if (after !== 3) return null;
  }

  const groupingChars = decimalSeparator === ',' ? /\./g : decimalSeparator === '.' ? /,/g : /[.,]/g;
  let normalized = compact.replace(groupingChars, '');
  if (decimalSeparator === ',') normalized = normalized.replace(',', '.');

  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;

  const value = Number(normalized);
  if (!Number.isFinite(value) || value <= 0) return null;
  const centimes = Math.round(value * CENTIMES_PER_DZD);
  if (!Number.isSafeInteger(centimes)) return null;
  return centimes;
}

/** Localised amount without relying on currency symbol placement rules. */
export function formatMoney(
  centimes: number,
  locale: string,
  currencyLabel = 'DZD',
): string {
  const amount = centimesToDzd(centimes);
  const formatter = new Intl.NumberFormat(locale === 'ar' ? 'ar-DZ-u-nu-latn' : 'fr-DZ', {
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    maximumFractionDigits: 2,
  });
  return `${formatter.format(amount)} ${currencyLabel}`;
}

/** Plain decimal string for form inputs (no currency, no grouping). */
export function centimesToInput(centimes: number): string {
  const dzd = centimesToDzd(centimes);
  return Number.isInteger(dzd) ? String(dzd) : dzd.toFixed(2);
}

export function percent(funded: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((funded / total) * 100)));
}

export function sumCentimes(values: readonly number[]): number {
  return values.reduce((acc, value) => acc + value, 0);
}
