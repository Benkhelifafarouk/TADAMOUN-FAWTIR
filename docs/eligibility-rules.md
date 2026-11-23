# Eligibility rules

The eligibility engine is a **pure, deterministic function**:
`lib/eligibility/engine.ts :: evaluateEligibility(input) → output`.
No I/O, no clock, no randomness inside. The orchestration (loading evidence, persisting the decision,
publishing) lives in `lib/eligibility/service.ts`.

## 1. Inputs

| Input | Source | Notes |
|---|---|---|
| `config` | active `eligibility_rule_versions.config` | versioned JSON, editable by an admin (new version) |
| `policy` | active `assistance_policies` + matching `assistance_tiers` row | base limit, period, above-cap policy, tier multiplier |
| `bill.*` | `bills` + latest `bill_ocr_results` | amount, dates, reference, confidences, duplicate flags |
| `household.*` | `households` + accepted `household_documents` | size, declared income, documents on file |
| `history.*` | queries | period commitment, account risk level, open fraud score |
| `isAppeal` | appeal workflow | adds an informational reason |

## 2. Outputs

```ts
{
  decision: 'APPROVED' | 'REJECTED' | 'NEEDS_ADDITIONAL_DOCUMENTS'
          | 'VERIFICATION_UNCERTAIN' | 'TEMPORARILY_BLOCKED',
  eligibleAmountCentimes: number,        // 0 unless APPROVED
  confidence: number,                    // OCR overall confidence 0..1
  reasons: { code, severity, field?, params? }[],
  missingDocuments: DocType[],           // only what is necessary
  nextAction: 'none' | 'complete_profile' | 'verify_phone'
            | 'upload_documents' | 'upload_clearer_bill' | 'contact_support',
  computedLimitCentimes, ruleVersionId, ruleVersionNumber, engineVersion
}
```

Every persisted decision also stores the rule version, engine version, policy snapshot, bill amount,
period commitment, confidence, reasons and `next_action`.

## 3. Evaluation order (first match wins)

| # | Condition | Decision | Reason code |
|---|---|---|---|
| 1 | `eligibility_profiles.risk_level = blocked` or user suspended | `TEMPORARILY_BLOCKED` | `ACCOUNT_SUSPENDED` |
| 2 | Profile incomplete / no household size | `NEEDS_ADDITIONAL_DOCUMENTS` | `HOUSEHOLD_PROFILE_INCOMPLETE` (next: complete profile) |
| 3 | Service category inactive | `REJECTED` | `SERVICE_INACTIVE` |
| 4 | Provider inactive | `REJECTED` | `PROVIDER_INACTIVE` |
| 5 | Same file hash already accepted elsewhere | `REJECTED` | `DUPLICATE_FILE` |
| 6 | Same provider + normalised bill reference already accepted | `REJECTED` | `DUPLICATE_BILL_REFERENCE` |
| 7 | OCR failed or amount missing | `NEEDS_ADDITIONAL_DOCUMENTS` | `BILL_UNREADABLE` (clearer bill) |
| 8 | Overall confidence below threshold, or a critical field below its threshold | `NEEDS_ADDITIONAL_DOCUMENTS` | `BILL_LOW_CONFIDENCE` (clearer bill) |
| 9 | Amount outside `bills.min/maxAmountCentimes` | `REJECTED` | `BILL_AMOUNT_INVALID` |
| 10 | Issue date missing | `NEEDS_ADDITIONAL_DOCUMENTS` | `BILL_UNREADABLE` |
| 11 | Issue date in the future beyond tolerance, period inverted, or due before issue | `REJECTED` | `BILL_DATE_INVALID` |
| 12 | Issue date older than `maxBillAgeDays` | `REJECTED` | `BILL_TOO_OLD` |
| 13 | Open fraud score ≥ `risk.blockAtScore` | `TEMPORARILY_BLOCKED` | `RISK_SCORE_HIGH` |
| 14 | Open fraud score ≥ `risk.uncertainAtScore` | `VERIFICATION_UNCERTAIN` | `RISK_SCORE_ELEVATED` |
| 15 | Similar bill suspected (same account + amount + category) | `VERIFICATION_UNCERTAIN` | `DUPLICATE_SUSPECTED` |
| 16 | Household size above `maxSupportedSize` | `NEEDS_ADDITIONAL_DOCUMENTS` | `HOUSEHOLD_SIZE_UNSUPPORTED` (family status) |
| 17 | Household size above `requireDocumentAboveSize` with no family document on file | `NEEDS_ADDITIONAL_DOCUMENTS` | `MISSING_FAMILY_DOCUMENT` |
| 18 | Income not declared | `NEEDS_ADDITIONAL_DOCUMENTS` | `MISSING_INCOME_DOCUMENT` |
| 19 | Income above per-person or absolute maximum, **and** income document on file | `REJECTED` | `INCOME_PER_PERSON_ABOVE_THRESHOLD` / `INCOME_ABOVE_THRESHOLD` |
| 20 | Income above maximum but no income document on file | `NEEDS_ADDITIONAL_DOCUMENTS` | `MISSING_INCOME_DOCUMENT` |
| 21 | Income above documentation threshold and no document | `NEEDS_ADDITIONAL_DOCUMENTS` | `MISSING_INCOME_DOCUMENT` |
| 22 | No active policy for the category | `TEMPORARILY_BLOCKED` | `POLICY_MISSING` |
| 23 | Period limit already exhausted | `REJECTED` | `PERIOD_LIMIT_REACHED` |
| 24 | Bill exceeds the cap and policy says `reject` | `REJECTED` | `AMOUNT_CAPPED` |
| 25 | Eligible amount < 1 DZD | `REJECTED` | `AMOUNT_CAPPED` |
| 26 | Otherwise | `APPROVED` | `ELIGIBLE_APPROVED` (+ `AMOUNT_CAPPED` info if partial) |

Informational reasons never change a decision: `AMOUNT_CAPPED` (partial publication), `DEMO_DATA`
(simulated extraction), `APPEAL_REASSESSED`.

## 4. Eligible amount

```text
limit     = floor(baseLimit × tierMultiplier)        # tier chosen by household size
available = max(0, limit − periodCommitted)
eligible  = min(billAmount, limit, available)
```

`period` is calendar-aligned: monthly, quarterly (Jan/Apr/Jul/Oct) or annual, in UTC.
`periodCommitted` sums `eligible_amount_centimes` of requests in the same category whose status is
`published`, `partially_funded`, `funded` or `paid` and whose `published_at` falls in the period.
Cancelled, expired and draft requests do not consume the limit. This prevents publishing several
requests to bypass the cap.

When the bill is larger than the eligible amount, only the eligible amount is published and the
beneficiary sees the reason and the amounts. A valid bill is never rejected merely for exceeding the
cap unless the policy explicitly sets `bill_above_cap_policy = 'reject'`.

## 5. Default rule configuration (seeded)

These are **initial, configurable policy values — not official Algerian thresholds**.

```json
{
  "engineVersion": "1.0.0",
  "minOverallConfidence": 0.75,
  "minCriticalFieldConfidence": 0.70,
  "criticalFields": ["billReference", "issueDate", "totalAmount", "accountNumber"],
  "maxBillAgeDays": 150,
  "futureDateToleranceDays": 5,
  "bills": { "minAmountCentimes": 30000, "maxAmountCentimes": 15000000 },
  "income": {
    "maxMonthlyIncomePerPersonCentimes": 1200000,
    "absoluteMaxMonthlyIncomeCentimes": 6000000,
    "requireDocumentAbovePerPersonCentimes": 600000
  },
  "household": { "maxSupportedSize": 15, "requireDocumentAboveSize": 8 },
  "risk": { "blockAtScore": 75, "uncertainAtScore": 45 },
  "duplicates": { "blockOnFileHash": true, "blockOnBillReference": true },
  "appeal": { "maxPerDecision": 2, "windowDays": 30 }
}
```

Assistance policies: electricity/gas 10 000 DZD per quarter, water 3 000 DZD per quarter, internet
2 000 DZD per month, with neutral tiers (multiplier 1.00) that the operator must set deliberately
through the admin console.

## 6. Document requests

- Only documents required to resolve the *specific* uncertainty are requested.
- A pending request of the same type is not duplicated.
- Due date: 14 days; the beneficiary can upload a replacement at any time.
- Uploading marks the request fulfilled, records the document as “on file”, and re-runs the engine
  immediately (new decision). The platform checks presence and file quality, **not** the semantic
  content of an income certificate — this is a documented limitation and a fraud signal source.

## 7. Appeals

- Allowed for `REJECTED`, `VERIFICATION_UNCERTAIN`, `TEMPORARILY_BLOCKED`; not for `APPROVED`.
- Window and maximum count come from the active rule config (default 30 days, 2 per decision).
- The appeal never modifies the original decision. A new decision is inserted with `appeal_id` and
  `supersedes_decision_id`, `decided_by = 'appeal_engine'`.
- The beneficiary sees both decisions and the outcome; admins can monitor appeals but cannot decide them.

## 8. Fairness constraints

- Consumption is **not** an eligibility input; it is stored for the record and shown to the
  beneficiary only.
- Wilaya/municipality are used for the public projection, never as a wealth proxy.
- No sensitive personal characteristic is read by the engine.
- No black-box score: every outcome is an ordered, documented rule with a reason code.
- Thresholds are visible in the admin console and versioned; changing one creates a new version, so a
  decision can always be explained with the exact config that produced it.

## 9. Testing

`tests/unit/eligibility-engine.test.ts` covers 32 cases: approvals, tiers, period caps, duplicates,
dates, amounts, policy gaps, confidence, documents, income, risk, blocked accounts, determinism,
appeal marking and the “never approve uncertainty” guarantee. Integration tests verify the persisted
decision, publication, document re-evaluation and the immutability of appealed decisions.
