# OCR / AI provider contract

The platform never depends on one vendor. Providers return a validated structure; the eligibility engine
never reads free-form model output.

## 1. Interface

```ts
runOcr({ buffer, mimeType, providerCode, categoryCode }) → {
  status: 'success' | 'partial' | 'failed',
  extraction: BillExtraction,
  rawText: string | null,
  providerName: string,
  isDemo: boolean,
  pageCount: number | null,
  errorCode?: string
}
```

## 2. `BillExtraction` (strict Zod schema, `lib/ocr/schema.ts`)

```json
{
  "providerCode": "sonelgaz",
  "categoryCode": "electricity_gas",
  "billReference":    { "value": "SN2026A12345", "confidence": 0.92 },
  "accountNumber":    { "value": "0123456789",  "confidence": 0.92 },
  "issueDate":        { "value": "2026-10-15",  "confidence": 0.93 },
  "dueDate":          { "value": "2026-11-05",  "confidence": 0.90 },
  "periodStart":      { "value": "2026-09-01",  "confidence": 0.85 },
  "periodEnd":        { "value": "2026-09-30",  "confidence": 0.85 },
  "totalCentimes":    { "value": "845000",      "confidence": 0.94 },
  "consumption":      { "value": "320",         "confidence": 0.85 },
  "consumptionUnit":  { "value": "kWh",         "confidence": 0.85 },
  "overallConfidence": 0.928,
  "isDemo": false,
  "providerName": "pdf-text-layer",
  "notes": []
}
```

- Every field is `{ value: string | null, confidence: 0..1 }`; a missing value **must** be `null` with
  confidence `0`. Fabricating a value is a contract violation.
- Unknown keys are rejected by the schema; nothing from a provider is executed or interpolated into SQL.
- `totalCentimes` is an integer string in centimes.

## 3. Built-in providers

| Provider | Selection | Behaviour |
|---|---|---|
| `pdf-text-layer` | any `application/pdf` | Real extraction with pdf.js (first 5 pages), then `parseBillText()`. If no text layer: demo fallback when `DEMO_MODE=true`, otherwise `failed` with `PDF_NO_TEXT_LAYER`. |
| `demo-simulated` | images when `DEMO_MODE=true`, or scanned PDFs | Deterministic pseudo-values derived from the file hash; `isDemo=true`, `notes: ["DEMO_SIMULATED_EXTRACTION"]`, recorded in `bill_ocr_results.is_demo`, badged in the UI and reported in the delivery notes. Never enabled when `DEMO_MODE=false`. |
| `http-provider` | `OCR_PROVIDER=http` | POST adapter (below). Requires credentials **and** `EXTERNAL_AI_PROCESSING_ENABLED=true`. Implemented, unverified in this environment. |

### HTTP adapter request

```http
POST $OCR_PROVIDER_URL
Authorization: Bearer $OCR_PROVIDER_API_KEY
Content-Type: application/json

{ "mimeType": "image/jpeg", "contentBase64": "…", "providerCode": "sonelgaz",
  "categoryCode": "electricity_gas", "model": "…" }
```

Response: a `BillExtraction` JSON object. Timeout 20 s, response body limited to 500 000 characters,
schema-validated. Errors are recorded as `OCR_HTTP_<status>`, `OCR_INVALID_SCHEMA`, `OCR_INVALID_JSON`
and produce a `failed` result — never an exception that breaks the pipeline.

## 4. Privacy gate

Documents are **never** sent to an external service unless:
1. `EXTERNAL_AI_PROCESSING_ENABLED=true`,
2. a provider URL and key are configured,
3. an operator has completed the privacy assessment (see `docs/privacy/data-processing-inventory.md`).

The default configuration performs no external transfer at all.

## 5. Prompt-injection handling

- Document text is data, not instructions. The parser uses anchored regular expressions and never
  evaluates model output.
- Provider output is schema-validated; free-form text is ignored.
- AI/OCR has no database access and cannot call tools.
- A unit test embeds “IGNORE ALL PREVIOUS INSTRUCTIONS …” in a bill and asserts the extracted amount is
  unchanged.
