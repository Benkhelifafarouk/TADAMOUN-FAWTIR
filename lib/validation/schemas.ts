import { z } from 'zod';
import { parseAmountToCentimes } from '@/lib/money';

/**
 * All server input validation lives here. Every message is a dictionary key
 * (e.g. 'required', 'email') resolved by the UI, never a hardcoded sentence.
 */

export const localeSchema = z.enum(['ar', 'fr']);

export const emailSchema = z
  .string()
  .trim()
  .min(3, 'required')
  .max(254, 'tooLong')
  .pipe(z.email('email'))
  .transform((value) => value.toLowerCase());

export const passwordSchema = z
  .string()
  .min(10, 'passwordStrength')
  .max(200, 'tooLong')
  .refine((value) => /[A-Za-z\u0600-\u06FF]/.test(value) && /[0-9]/.test(value), 'passwordStrength');

export const fullNameSchema = z.string().trim().min(2, 'tooShort').max(120, 'tooLong');

/** Normalises Algerian mobile numbers to +213XXXXXXXXX. */
export function normalizePhone(input: string): string | null {
  const digits = input
    .replace(/[\s\-().]/g, '')
    .replace(/^00/, '+');
  let normalized: string | null = null;
  if (/^\+213[5-7]\d{8}$/.test(digits)) normalized = digits;
  else if (/^0[5-7]\d{8}$/.test(digits)) normalized = `+213${digits.slice(1)}`;
  else if (/^213[5-7]\d{8}$/.test(digits)) normalized = `+${digits}`;
  return normalized;
}

export const phoneSchema = z
  .string()
  .trim()
  .min(8, 'phone')
  .transform((value, ctx) => {
    const normalized = normalizePhone(value);
    if (!normalized) {
      ctx.addIssue({ code: 'custom', message: 'phone' });
      return z.NEVER;
    }
    return normalized;
  });

export const uidSchema = z.string().uuid('invalidId');

export const registerSchema = z.object({
  fullName: fullNameSchema,
  email: emailSchema,
  phone: phoneSchema,
  password: passwordSchema,
  confirmPassword: z.string(),
  role: z.enum(['beneficiary', 'donor']),
  locale: localeSchema,
  consentTerms: z.literal('on', 'consentRequired'),
  consentPrivacy: z.literal('on', 'consentRequired'),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'passwordMismatch',
  path: ['confirmPassword'],
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'required').max(200, 'tooLong'),
});

export const otpSchema = z.object({
  code: z.string().trim().regex(/^\d{6}$/, 'otpInvalid'),
});

export const householdProfileSchema = z.object({
  wilayaId: uidSchema,
  municipalityId: z.union([uidSchema, z.literal('')]).optional(),
  address: z.string().trim().max(240, 'tooLong').optional(),
  size: z.coerce.number().int().min(1, 'min').max(40, 'max'),
  children: z.coerce.number().int().min(0, 'min').max(40, 'max'),
  monthlyIncome: z.string().trim().optional(),
  incomeSource: z.string().trim().max(120, 'tooLong').optional(),
  housingStatus: z.enum(['owner', 'tenant', 'family_hosted', 'other']).optional(),
}).refine((data) => data.children <= data.size, {
  message: 'max',
  path: ['children'],
}).transform((data, ctx) => {
  let incomeCentimes: number | null = null;
  if (data.monthlyIncome && data.monthlyIncome.length > 0) {
    incomeCentimes = parseAmountToCentimes(data.monthlyIncome);
    if (incomeCentimes === null) {
      ctx.addIssue({ code: 'custom', message: 'amount', path: ['monthlyIncome'] });
      return z.NEVER;
    }
  }
  return { ...data, incomeCentimes };
});

export const billUploadSchema = z.object({
  providerId: uidSchema,
  categoryId: uidSchema,
  reference: z.string().trim().max(60, 'tooLong').optional(),
  accountNumber: z.string().trim().max(40, 'tooLong').optional(),
  total: z.string().trim().optional(),
  issueDate: z.string().trim().optional(),
});

export const documentUploadSchema = z.object({
  docType: z.enum(['family_status', 'income_proof', 'social_status', 'residence_proof', 'clearer_bill', 'other']),
  requestId: uidSchema.optional(),
});

export const appealSchema = z.object({
  decisionId: uidSchema,
  message: z.string().trim().min(20, 'tooShort').max(4000, 'tooLong'),
});

export const donationSchema = z.object({
  requestRef: z.string().trim().min(3, 'required').max(40, 'tooLong').optional(),
  target: z.enum(['request', 'fund']),
  amount: z.string().trim().min(1, 'required'),
  idempotencyKey: z.string().trim().min(8).max(80).optional(),
}).transform((data, ctx) => {
  const centimes = parseAmountToCentimes(data.amount);
  if (centimes === null || centimes < 10000) {
    ctx.addIssue({ code: 'custom', message: 'amount', path: ['amount'] });
    return z.NEVER;
  }
  if (centimes > 5_000_000_00) {
    ctx.addIssue({ code: 'custom', message: 'max', path: ['amount'] });
    return z.NEVER;
  }
  if (data.target === 'request' && !data.requestRef) {
    ctx.addIssue({ code: 'custom', message: 'required', path: ['requestRef'] });
    return z.NEVER;
  }
  return { ...data, amountCentimes: centimes };
});

export const supportTicketSchema = z.object({
  subject: z.string().trim().min(3, 'tooShort').max(160, 'tooLong'),
  message: z.string().trim().min(10, 'tooShort').max(4000, 'tooLong'),
  email: z.union([emailSchema, z.literal('')]).optional(),
});

export const adminRuleVersionSchema = z.object({
  minOverallConfidence: z.coerce.number().min(0.1).max(1),
  minCriticalFieldConfidence: z.coerce.number().min(0.1).max(1),
  maxBillAgeDays: z.coerce.number().int().min(10).max(730),
  maxMonthlyIncomePerPerson: z.string().trim(),
  absoluteMaxMonthlyIncome: z.string().trim(),
  requireDocumentAbovePerPerson: z.string().trim(),
  blockAtScore: z.coerce.number().int().min(1).max(100),
  uncertainAtScore: z.coerce.number().int().min(1).max(100),
}).refine((d) => d.uncertainAtScore < d.blockAtScore, {
  message: 'max',
  path: ['uncertainAtScore'],
}).transform((data, ctx) => {
  const toC = (v: string): number | null => parseAmountToCentimes(v);
  const perPerson = toC(data.maxMonthlyIncomePerPerson);
  const absolute = toC(data.absoluteMaxMonthlyIncome);
  const requireAbove = toC(data.requireDocumentAbovePerPerson);
  if (perPerson === null) ctx.addIssue({ code: 'custom', message: 'amount', path: ['maxMonthlyIncomePerPerson'] });
  if (absolute === null) ctx.addIssue({ code: 'custom', message: 'amount', path: ['absoluteMaxMonthlyIncome'] });
  if (requireAbove === null) ctx.addIssue({ code: 'custom', message: 'amount', path: ['requireDocumentAbovePerPerson'] });
  if (perPerson === null || absolute === null || requireAbove === null) return z.NEVER;
  return {
    minOverallConfidence: data.minOverallConfidence,
    minCriticalFieldConfidence: data.minCriticalFieldConfidence,
    maxBillAgeDays: data.maxBillAgeDays,
    maxMonthlyIncomePerPersonCentimes: perPerson,
    absoluteMaxMonthlyIncomeCentimes: absolute,
    requireDocumentAbovePerPersonCentimes: requireAbove,
    blockAtScore: data.blockAtScore,
    uncertainAtScore: data.uncertainAtScore,
  };
});

export const adminPolicySchema = z.object({
  categoryId: uidSchema,
  period: z.enum(['monthly', 'quarterly', 'annual']),
  limit: z.string().trim().min(1, 'required'),
  tier1Multiplier: z.coerce.number().min(0.1).max(5),
  tier2Multiplier: z.coerce.number().min(0.1).max(5),
  tier3Multiplier: z.coerce.number().min(0.1).max(5),
}).transform((data, ctx) => {
  const centimes = parseAmountToCentimes(data.limit);
  if (centimes === null) {
    ctx.addIssue({ code: 'custom', message: 'amount', path: ['limit'] });
    return z.NEVER;
  }
  return { ...data, limitCentimes: centimes };
});

export const municipalitySchema = z.object({
  wilayaId: uidSchema,
  code: z.string().trim().min(1, 'required').max(10, 'tooLong'),
  nameAr: z.string().trim().min(2, 'tooShort').max(120, 'tooLong'),
  nameFr: z.string().trim().min(2, 'tooShort').max(120, 'tooLong'),
});

export const providerSchema = z.object({
  categoryId: uidSchema,
  code: z.string().trim().regex(/^[a-z0-9_]{3,40}$/, 'invalidChoice'),
  nameAr: z.string().trim().min(2, 'tooShort').max(120, 'tooLong'),
  nameFr: z.string().trim().min(2, 'tooShort').max(120, 'tooLong'),
});

export const settingSchema = z.object({
  key: z.string().trim().min(1, 'required').max(120, 'tooLong'),
  value: z.string().trim().min(1, 'required').max(2000, 'tooLong'),
});

export interface ParseSuccess<T> {
  ok: true;
  data: T;
}
export interface ParseFailure {
  ok: false;
  fieldErrors: Record<string, string>;
  formError?: string;
}

export function zodParse<T>(schema: z.ZodType<T>, input: unknown): ParseSuccess<T> | ParseFailure {
  const result = schema.safeParse(input);
  if (result.success) return { ok: true, data: result.data };
  const fieldErrors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.join('.') || '_form';
    if (!fieldErrors[key]) fieldErrors[key] = issue.message;
  }
  return { ok: false, fieldErrors };
}

export function formToObject(formData: FormData): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value === 'string') result[key] = value;
  }
  return result;
}
