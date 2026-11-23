import { createHash } from 'node:crypto';
import { env } from '@/lib/env';
import { extractPdfText } from './pdf';
import { parseBillText } from './parser';
import { billExtractionSchema, type BillExtraction } from './schema';

export type OcrStatus = 'success' | 'partial' | 'failed';

export interface OcrRunInput {
  buffer: Buffer;
  mimeType: string;
  providerCode: string | null;
  categoryCode: 'electricity_gas' | 'water' | 'internet' | null;
}

export interface OcrRunResult {
  status: OcrStatus;
  extraction: BillExtraction;
  rawText: string | null;
  providerName: string;
  isDemo: boolean;
  pageCount: number | null;
  errorCode?: string;
}

export class OcrNotConfiguredError extends Error {
  constructor(message = 'OCR_PROVIDER_NOT_CONFIGURED') {
    super(message);
    this.name = 'OcrNotConfiguredError';
  }
}

function emptyExtraction(providerName: string, isDemo: boolean, note: string): BillExtraction {
  const field = { value: null, confidence: 0 };
  return {
    providerCode: null,
    categoryCode: null,
    billReference: field,
    accountNumber: field,
    issueDate: field,
    dueDate: field,
    periodStart: field,
    periodEnd: field,
    totalCentimes: field,
    consumption: field,
    consumptionUnit: field,
    overallConfidence: 0,
    isDemo,
    providerName,
    notes: [note],
  };
}

/**
 * DEMO provider.
 *
 * Deliberately, visibly synthetic: it derives stable pseudo-values from the file
 * hash so the end-to-end flow can be exercised without any AI credentials. Every
 * result is flagged `isDemo` and recorded as such in the database, shown in the
 * UI and reported in the delivery notes. It is disabled when DEMO_MODE=false.
 */
export function simulateExtraction(buffer: Buffer, input: OcrRunInput): BillExtraction {
  const hash = createHash('sha256').update(buffer).digest();
  const seed = hash.readUInt32BE(0);
  const seed2 = hash.readUInt32BE(4);

  const amountDzd = 1200 + (seed % 8600);
  const issue = new Date();
  issue.setUTCDate(issue.getUTCDate() - (seed2 % 45));
  const due = new Date(issue);
  due.setUTCDate(due.getUTCDate() + 20);

  const reference = `DM${hash.subarray(0, 4).toString('hex').toUpperCase()}`;
  const account = `0${String(seed).padStart(9, '0').slice(0, 9)}`;
  const consumption = 40 + (seed2 % 400);

  const extraction: BillExtraction = {
    providerCode: input.providerCode,
    categoryCode: input.categoryCode,
    billReference: { value: reference, confidence: 0.86 },
    accountNumber: { value: account, confidence: 0.84 },
    issueDate: { value: issue.toISOString().slice(0, 10), confidence: 0.88 },
    dueDate: { value: due.toISOString().slice(0, 10), confidence: 0.8 },
    periodStart: { value: null, confidence: 0 },
    periodEnd: { value: null, confidence: 0 },
    totalCentimes: { value: String(amountDzd * 100), confidence: 0.87 },
    consumption: { value: String(consumption), confidence: 0.6 },
    consumptionUnit: { value: input.categoryCode === 'water' ? 'm³' : 'kWh', confidence: 0.6 },
    overallConfidence: 0.86,
    isDemo: true,
    providerName: 'demo-simulated',
    notes: ['DEMO_SIMULATED_EXTRACTION'],
  };
  return billExtractionSchema.parse(extraction);
}

/**
 * HTTP provider contract (documented in docs/ocr-contract.md):
 *   POST OCR_PROVIDER_URL  { mimeType, contentBase64, providerCode, categoryCode }
 *   Authorization: Bearer <OCR_PROVIDER_API_KEY>
 *   → BillExtraction JSON (schema validated, extra keys rejected by Zod parsing)
 *
 * Implemented but UNVERIFIED in this environment: no provider credentials exist.
 * It is never used unless EXTERNAL_AI_PROCESSING_ENABLED=true, so no document
 * leaves the server by default.
 */
async function runHttpProvider(input: OcrRunInput): Promise<OcrRunResult> {
  const url = env().OCR_PROVIDER_URL;
  const key = env().OCR_PROVIDER_API_KEY;
  if (!url || !key) throw new OcrNotConfiguredError('OCR_PROVIDER_MISSING_CREDENTIALS');
  if (!env().externalAi) throw new OcrNotConfiguredError('EXTERNAL_AI_PROCESSING_DISABLED');

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      mimeType: input.mimeType,
      contentBase64: input.buffer.toString('base64'),
      providerCode: input.providerCode,
      categoryCode: input.categoryCode,
      model: env().OCR_PROVIDER_MODEL ?? null,
    }),
    signal: AbortSignal.timeout(20_000),
  });

  if (!response.ok) {
    return {
      status: 'failed',
      extraction: emptyExtraction('http-provider', false, 'PROVIDER_ERROR'),
      rawText: null,
      providerName: 'http-provider',
      isDemo: false,
      pageCount: null,
      errorCode: `OCR_HTTP_${response.status}`,
    };
  }

  const text = await response.text();
  if (text.length > 500_000) {
    return {
      status: 'failed',
      extraction: emptyExtraction('http-provider', false, 'RESPONSE_TOO_LARGE'),
      rawText: null,
      providerName: 'http-provider',
      isDemo: false,
      pageCount: null,
      errorCode: 'OCR_RESPONSE_TOO_LARGE',
    };
  }

  try {
    const parsed = billExtractionSchema.safeParse(JSON.parse(text));
    if (!parsed.success) {
      return {
        status: 'failed',
        extraction: emptyExtraction('http-provider', false, 'INVALID_SCHEMA'),
        rawText: null,
        providerName: 'http-provider',
        isDemo: false,
        pageCount: null,
        errorCode: 'OCR_INVALID_SCHEMA',
      };
    }
    return {
      status: parsed.data.overallConfidence >= 0.6 ? 'success' : 'partial',
      extraction: parsed.data,
      rawText: null,
      providerName: 'http-provider',
      isDemo: false,
      pageCount: null,
    };
  } catch {
    return {
      status: 'failed',
      extraction: emptyExtraction('http-provider', false, 'INVALID_JSON'),
      rawText: null,
      providerName: 'http-provider',
      isDemo: false,
      pageCount: null,
      errorCode: 'OCR_INVALID_JSON',
    };
  }
}

export async function runOcr(input: OcrRunInput): Promise<OcrRunResult> {
  const e = env();

  if (input.mimeType === 'application/pdf') {
    try {
      const pdf = await extractPdfText(input.buffer);
      if (pdf.hasTextLayer) {
        const extraction = parseBillText(pdf.text, {
          providerCode: input.providerCode,
          categoryCode: input.categoryCode,
          isDemo: false,
          providerName: 'pdf-text-layer',
        });
        return {
          status: extraction.overallConfidence >= 0.55 ? 'success' : 'partial',
          extraction,
          rawText: pdf.text.slice(0, 40_000),
          providerName: 'pdf-text-layer',
          isDemo: false,
          pageCount: pdf.pageCount,
        };
      }
      if (e.demoMode) {
        const extraction = simulateExtraction(input.buffer, input);
        return {
          status: 'partial',
          extraction,
          rawText: null,
          providerName: 'demo-simulated',
          isDemo: true,
          pageCount: pdf.pageCount,
          errorCode: 'PDF_WITHOUT_TEXT_LAYER_DEMO',
        };
      }
      return {
        status: 'failed',
        extraction: emptyExtraction('pdf-text-layer', false, 'NO_TEXT_LAYER'),
        rawText: null,
        providerName: 'pdf-text-layer',
        isDemo: false,
        pageCount: pdf.pageCount,
        errorCode: 'PDF_NO_TEXT_LAYER',
      };
    } catch {
      return {
        status: 'failed',
        extraction: emptyExtraction('pdf-text-layer', false, 'PDF_PARSE_ERROR'),
        rawText: null,
        providerName: 'pdf-text-layer',
        isDemo: false,
        pageCount: null,
        errorCode: 'PDF_PARSE_ERROR',
      };
    }
  }

  // Images require a real OCR engine: no offline engine is bundled.
  if (e.OCR_PROVIDER === 'http') {
    try {
      return await runHttpProvider(input);
    } catch (error) {
      const code = error instanceof OcrNotConfiguredError ? error.message : 'OCR_PROVIDER_ERROR';
      return {
        status: 'failed',
        extraction: emptyExtraction('http-provider', false, code),
        rawText: null,
        providerName: 'http-provider',
        isDemo: false,
        pageCount: null,
        errorCode: code,
      };
    }
  }

  if (e.demoMode) {
    const extraction = simulateExtraction(input.buffer, input);
    return {
      status: 'partial',
      extraction,
      rawText: null,
      providerName: 'demo-simulated',
      isDemo: true,
      pageCount: null,
      errorCode: 'DEMO_SIMULATED_EXTRACTION',
    };
  }

  return {
    status: 'failed',
    extraction: emptyExtraction('unconfigured', false, 'OCR_NOT_CONFIGURED'),
    rawText: null,
    providerName: 'unconfigured',
    isDemo: false,
    pageCount: null,
    errorCode: 'OCR_NOT_CONFIGURED',
  };
}

export function ocrProviderStatus(): { provider: string; mode: 'real' | 'demo' | 'none'; externalProcessing: boolean } {
  const e = env();
  if (e.OCR_PROVIDER === 'http') {
    return {
      provider: 'http',
      mode: e.OCR_PROVIDER_URL && e.OCR_PROVIDER_API_KEY && e.externalAi ? 'real' : 'none',
      externalProcessing: e.externalAi,
    };
  }
  return { provider: 'demo + pdf-text', mode: e.demoMode ? 'demo' : 'none', externalProcessing: false };
}
