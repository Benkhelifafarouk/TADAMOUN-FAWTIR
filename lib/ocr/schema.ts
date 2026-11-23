import { z } from 'zod';

/**
 * Strict schema for anything an OCR/AI provider returns. Providers are treated as
 * untrusted: text inside a document may contain instructions, so the output is
 * validated field by field and never executed.
 */

export const extractedFieldSchema = z.object({
  value: z.string().max(200).nullable(),
  confidence: z.number().min(0).max(1),
});

export const billExtractionSchema = z.object({
  providerCode: z.string().max(60).nullable(),
  categoryCode: z.enum(['electricity_gas', 'water', 'internet']).nullable(),
  billReference: extractedFieldSchema,
  accountNumber: extractedFieldSchema,
  issueDate: extractedFieldSchema,
  dueDate: extractedFieldSchema,
  periodStart: extractedFieldSchema,
  periodEnd: extractedFieldSchema,
  totalCentimes: extractedFieldSchema,
  consumption: extractedFieldSchema,
  consumptionUnit: extractedFieldSchema,
  overallConfidence: z.number().min(0).max(1),
  isDemo: z.boolean(),
  providerName: z.string().max(80),
  notes: z.array(z.string().max(200)).max(10).default([]),
});

export type BillExtraction = z.infer<typeof billExtractionSchema>;

export const emptyField = { value: null, confidence: 0 } as const;

export function fieldValue(extraction: BillExtraction, key: keyof BillExtraction): string | null {
  const field = extraction[key];
  if (field && typeof field === 'object' && 'value' in field) return field.value;
  return null;
}
