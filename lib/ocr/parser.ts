import { billExtractionSchema, emptyField, type BillExtraction } from './schema';

/**
 * Deterministic field extraction from bill text.
 *
 * This is intentionally a transparent parser, not an LLM: label-anchored regexes
 * plus a few constrained heuristics. Every value carries a confidence and a
 * missing value is never invented. Prompt-injection text inside a document is
 * simply ignored because nothing is executed.
 */

const AR_DIGITS = /[\u0660-\u0669]/g;
const FA_DIGITS = /[\u06f0-\u06f9]/g;

const AMOUNT_LABELS = [
  'المبلغ الإجمالي',
  'المبلغ المستحق',
  'مبلغ الفاتورة',
  'المبلغ',
  'montant total',
  'montant à payer',
  'montant a payer',
  'net à payer',
  'total à payer',
  'montant',
  'total',
];

const REFERENCE_LABELS = ['رقم الفاتورة', 'المرجع', 'n° facture', 'no facture', 'numéro de facture', 'reference', 'référence'];
const ACCOUNT_LABELS = ['رقم الزبون', 'رقم الاشتراك', 'رقم الحساب', 'n° client', 'no client', 'numéro client', 'n° abonné', 'abonné', 'compte', 'contrat'];
const ISSUE_LABELS = ['تاريخ الإصدار', 'تاريخ الفاتورة', 'date de facture', 'date d’émission', "date d'emission", 'émise le', 'emise le'];
const DUE_LABELS = ['آخر أجل للدفع', 'تاريخ الاستحقاق', 'date limite', 'échéance', 'echeance', 'à payer avant'];

const MONTHS: Record<string, number> = {
  janvier: 1, février: 2, fevrier: 2, mars: 3, avril: 4, mai: 5, juin: 6, juillet: 7,
  août: 8, aout: 8, septembre: 9, octobre: 10, novembre: 11, décembre: 12, decembre: 12,
  جانفي: 1, فيفري: 2, مارس: 3, أفريل: 4, افريل: 4, ماي: 5, جوان: 6, جويلية: 7,
  أوت: 8, اوت: 8, سبتمبر: 9, أكتوبر: 10, اكتوبر: 10, نوفمبر: 11, ديسمبر: 12,
};

export function normalizeText(input: string): string {
  return input
    .replace(AR_DIGITS, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(FA_DIGITS, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/\u066b/g, '.')
    .replace(/\u066c/g, ',')
    .replace(/\u00a0/g, ' ')
    .replace(/[\u200e\u200f\u202a-\u202e]/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\r\n/g, '\n');
}

/** Parses "1 234,56", "1.234,56", "1234.56", "1,234.56" into centimes. */
export function parseNumberToCentimes(token: string): number | null {
  const cleaned = token.replace(/[\s']/g, '').replace(/[^\d.,]/g, '');
  if (!/\d/.test(cleaned)) return null;
  const lastComma = cleaned.lastIndexOf(',');
  const lastDot = cleaned.lastIndexOf('.');

  let normalized: string;
  if (lastComma >= 0 && lastDot >= 0) {
    const decimalSep = lastComma > lastDot ? ',' : '.';
    const thousandsSep = decimalSep === ',' ? '.' : ',';
    normalized = cleaned.split(thousandsSep).join('');
    if (decimalSep === ',') normalized = normalized.replace(',', '.');
  } else if (lastComma >= 0) {
    const decimals = cleaned.length - lastComma - 1;
    normalized = decimals > 0 && decimals <= 2 ? cleaned.replace(',', '.') : cleaned.replace(/,/g, '');
  } else if (lastDot >= 0) {
    const decimals = cleaned.length - lastDot - 1;
    normalized = decimals > 0 && decimals <= 2 ? cleaned : cleaned.replace(/\./g, '');
  } else {
    normalized = cleaned;
  }

  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  const value = Number(normalized);
  if (!Number.isFinite(value) || value <= 0) return null;
  const centimes = Math.round(value * 100);
  return Number.isSafeInteger(centimes) ? centimes : null;
}

/** Finds a number token (with optional thousands separators) in a string. */
const NUMBER_TOKEN = /\d{1,3}(?:[ .]\d{3})+(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?/;

function toIsoDate(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  if (year < 100) year += year > 50 ? 1900 : 2000;
  if (year < 2000 || year > 2100) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date.toISOString().slice(0, 10);
}

const DATE_PATTERN = /(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})|(\d{4})-(\d{2})-(\d{2})/g;

function parseDateToken(token: string): string | null {
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(token);
  if (iso) return toIsoDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  const dmy = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/.exec(token);
  if (dmy) return toIsoDate(Number(dmy[3]), Number(dmy[2]), Number(dmy[1]));
  return null;
}

function findDates(text: string): string[] {
  const found: string[] = [];
  for (const match of text.matchAll(DATE_PATTERN)) {
    const iso = parseDateToken(match[0]);
    if (iso && !found.includes(iso)) found.push(iso);
  }
  // Textual months: 12 janvier 2026 / 12 جانفي 2026
  const textual = /(\d{1,2})\s+([A-Za-zÀ-ÿ\u0600-\u06FF]+)\s+(\d{4})/g;
  for (const match of text.matchAll(textual)) {
    const month = MONTHS[match[2].toLowerCase()];
    if (!month) continue;
    const iso = toIsoDate(Number(match[3]), month, Number(match[1]));
    if (iso && !found.includes(iso)) found.push(iso);
  }
  return found;
}

function labelledLine(lines: string[], labels: string[]): number {
  const normalizedLabels = labels.map((l) => l.toLowerCase());
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].toLowerCase();
    if (normalizedLabels.some((label) => line.includes(label))) return i;
  }
  return -1;
}

function extractLabelledAmount(lines: string[]): { centimes: number | null; anchored: boolean } {
  for (const label of AMOUNT_LABELS) {
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      const index = line.toLowerCase().indexOf(label.toLowerCase());
      if (index === -1) continue;
      const sameLine = line.slice(index + label.length);
      const token = NUMBER_TOKEN.exec(sameLine);
      if (token) {
        const centimes = parseNumberToCentimes(token[0]);
        if (centimes) return { centimes, anchored: true };
      }
      const next = lines[i + 1];
      if (next) {
        const nextToken = NUMBER_TOKEN.exec(next);
        if (nextToken) {
          const centimes = parseNumberToCentimes(nextToken[0]);
          if (centimes) return { centimes, anchored: true };
        }
      }
    }
  }
  return { centimes: null, anchored: false };
}

function extractCurrencyAmount(text: string): number | null {
  const pattern = new RegExp(`(${NUMBER_TOKEN.source})\\s*(?:دج|DA|DZD|دينار)`, 'gi');
  const candidates: number[] = [];
  for (const match of text.matchAll(pattern)) {
    const centimes = parseNumberToCentimes(match[1]);
    if (centimes) candidates.push(centimes);
  }
  if (candidates.length === 0) return null;
  return Math.max(...candidates);
}

function extractReference(text: string): { value: string | null; anchored: boolean } {
  for (const label of REFERENCE_LABELS) {
    const pattern = new RegExp(`${label}[^A-Za-z0-9\\u0600-\\u06FF]{0,12}([A-Z0-9][A-Z0-9\\-/]{4,24})`, 'i');
    const match = pattern.exec(text);
    if (match?.[1]) return { value: match[1], anchored: true };
  }
  const generic = /(?:^|\s)([A-Z]{0,4}\d{6,14}[A-Z0-9\-/]{0,6})(?:\s|$)/.exec(text);
  if (generic?.[1]) return { value: generic[1], anchored: false };
  return { value: null, anchored: false };
}

function extractAccount(text: string): { value: string | null; anchored: boolean } {
  for (const label of ACCOUNT_LABELS) {
    const pattern = new RegExp(`${label}[^0-9]{0,15}(\\d{6,16})`, 'i');
    const match = pattern.exec(text);
    if (match?.[1]) return { value: match[1], anchored: true };
  }
  return { value: null, anchored: false };
}

function extractConsumption(text: string): { value: string | null; unit: string | null; anchored: boolean } {
  const pattern = /(\d[\d .,]{0,12})\s*(kwh|kw\/h|kw h|m3|m³|mètres cubes|وحدة|كيلوواط)/i;
  const match = pattern.exec(text);
  if (!match?.[1]) return { value: null, unit: null, anchored: false };
  const numeric = parseNumberToCentimes(match[1]);
  if (numeric === null) return { value: null, unit: null, anchored: false };
  return { value: String(numeric / 100), unit: match[2], anchored: true };
}

function extractPeriod(text: string): { start: string | null; end: string | null } {
  const pattern = /(?:du|من|من تاريخ)\s*([0-9]{1,2}[/\-.][0-9]{1,2}[/\-.][0-9]{2,4})\s*(?:au|إلى|الى)\s*([0-9]{1,2}[/\-.][0-9]{1,2}[/\-.][0-9]{2,4})/i;
  const match = pattern.exec(text);
  if (!match) return { start: null, end: null };
  return { start: parseDateToken(match[1]), end: parseDateToken(match[2]) };
}

export interface ParseOptions {
  providerCode?: string | null;
  categoryCode?: 'electricity_gas' | 'water' | 'internet' | null;
  isDemo?: boolean;
  providerName?: string;
}

export function parseBillText(rawText: string, options: ParseOptions = {}): BillExtraction {
  const text = normalizeText(rawText);
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const amount = extractLabelledAmount(lines);
  const fallbackAmount = amount.centimes ?? extractCurrencyAmount(text);
  const reference = extractReference(text);
  const account = extractAccount(text);
  const dates = findDates(text);
  const period = extractPeriod(text);

  const issueLabelIndex = labelledLine(lines, ISSUE_LABELS);
  const dueLabelIndex = labelledLine(lines, DUE_LABELS);

  let issueDate: string | null = null;
  if (issueLabelIndex >= 0) {
    const window = lines.slice(issueLabelIndex, issueLabelIndex + 2).join(' ');
    issueDate = findDates(window)[0] ?? null;
  }
  if (!issueDate) issueDate = dates[0] ?? null;

  let dueDate: string | null = null;
  if (dueLabelIndex >= 0) {
    const window = lines.slice(dueLabelIndex, dueLabelIndex + 2).join(' ');
    dueDate = findDates(window)[0] ?? null;
  }
  if (!dueDate && dates.length > 1) dueDate = dates.find((d) => d !== issueDate) ?? null;

  const consumption = extractConsumption(text);

  const fieldConfidence = (anchored: boolean, value: unknown, base = 0.92, heuristic = 0.62): number => {
    if (value === null || value === undefined) return 0;
    return anchored ? base : heuristic;
  };

  const extraction: BillExtraction = {
    providerCode: options.providerCode ?? null,
    categoryCode: options.categoryCode ?? null,
    billReference: {
      value: reference.value,
      confidence: fieldConfidence(reference.anchored, reference.value),
    },
    accountNumber: {
      value: account.value,
      confidence: fieldConfidence(account.anchored, account.value),
    },
    issueDate: {
      value: issueDate,
      confidence: fieldConfidence(issueLabelIndex >= 0, issueDate, 0.93, 0.6),
    },
    dueDate: {
      value: dueDate,
      confidence: fieldConfidence(dueLabelIndex >= 0, dueDate, 0.9, 0.55),
    },
    periodStart: { value: period.start, confidence: fieldConfidence(period.start !== null, period.start, 0.85, 0) },
    periodEnd: { value: period.end, confidence: fieldConfidence(period.end !== null, period.end, 0.85, 0) },
    totalCentimes: {
      value: fallbackAmount === null ? null : String(fallbackAmount),
      confidence: fieldConfidence(amount.anchored, fallbackAmount, 0.94, 0.58),
    },
    consumption: {
      value: consumption.value,
      confidence: fieldConfidence(consumption.anchored, consumption.value, 0.85, 0),
    },
    consumptionUnit: {
      value: consumption.unit,
      confidence: fieldConfidence(consumption.anchored, consumption.unit, 0.85, 0),
    },
    overallConfidence: 0,
    isDemo: options.isDemo ?? false,
    providerName: options.providerName ?? 'regex-parser',
    notes: [],
  };

  const critical = [
    extraction.totalCentimes.confidence,
    extraction.billReference.confidence,
    extraction.issueDate.confidence,
    extraction.accountNumber.confidence,
  ];
  extraction.overallConfidence =
    Math.round((critical.reduce((acc, value) => acc + value, 0) / critical.length) * 1000) / 1000;

  if (!amount.anchored && fallbackAmount !== null) extraction.notes.push('AMOUNT_WITHOUT_LABEL');
  if (extraction.billReference.value === null) extraction.notes.push('REFERENCE_NOT_FOUND');
  if (extraction.issueDate.value === null) extraction.notes.push('ISSUE_DATE_NOT_FOUND');

  // Final schema validation: a malformed extraction must never propagate.
  return billExtractionSchema.parse(extraction);
}

export const __testables = { parseNumberToCentimes, normalizeText, findDates };
export { emptyField };
