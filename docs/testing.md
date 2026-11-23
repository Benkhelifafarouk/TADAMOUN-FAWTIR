# Testing

## 1. Commands

```bash
npm test                      # Vitest: unit + integration + security
npm run test:unit             # 56 tests
npm run test:integration      # 12 tests
npm run test:security         # 14 tests
npm run build && npm run test:e2e   # 18 HTTP smoke checks
npm run typecheck && npm run lint   # static checks
npm run verify                # typecheck + lint + tests
```

Measured result at delivery: **82 Vitest tests passing**, **18 smoke checks passing**, TypeScript strict
clean, ESLint clean, `npm audit` 0 vulnerabilities.

## 2. Test architecture

- Each test file opens its own **in-memory PostgreSQL** (PGlite), applies the real 12 migrations and the
  real reference seed (`tests/helpers/db.ts`). No mocks of the database.
- Storage is replaced by an in-memory provider; no test writes to the developer's disk.
- Factories create realistic beneficiaries, providers and **real PDF bills** with a text layer
  (`lib/demo/pdf.ts`), so OCR and the parser are exercised for real.
- Bill fixtures carry a unique nonce so unrelated tests never collide in duplicate detection; the
  duplicate tests deliberately share a nonce.
- Files run sequentially (`fileParallelism: false`) because PGlite is a single WASM instance per file.

## 3. Coverage map

| Requirement | Test |
|---|---|
| Money parsing/formatting, no float drift | `tests/unit/money.test.ts` |
| OCR parser, Arabic digits, missing values never invented | `tests/unit/parser.test.ts` |
| Prompt injection inside a bill is ignored | `tests/unit/parser.test.ts` |
| 32 eligibility scenarios (all five decisions, tiers, caps, duplicates, dates, risk, income, policy gap, determinism) | `tests/unit/eligibility-engine.test.ts` |
| TOTP correctness and drift | `tests/unit/security-primitives.test.ts` |
| Migration SQL splitter (dollar quotes, comments, quotes) | `tests/unit/security-primitives.test.ts` |
| Registration data → profile → bill → approval → anonymous publication | `tests/integration/eligibility-flow.test.ts` |
| Duplicate bill rejected with the right reason | same |
| Only the necessary document is requested; upload re-evaluates automatically | same |
| Appeal creates a new decision and preserves the original | same |
| No double publication for one bill | same |
| DB refuses publication from a non-approved decision | `tests/security/authorization.test.ts`, `tests/integration/eligibility-flow.test.ts` |
| Donation → demo payment → allocation → DEMO receipt | `tests/integration/donations-flow.test.ts` |
| Idempotent payment confirmation | same |
| Overfunding refused (app + trigger) | same, `tests/security/authorization.test.ts` |
| Fund contribution, FIFO allocation, signed ledger, insufficient balance | same |
| Refund of allocated donation refused; unallocated refunded | same |
| Donor cannot pay another donor's donation | same |
| Cross-household data access denied (RLS, non-superuser role) | `tests/security/rls.test.ts` |
| anon can read the public view but no base table | same |
| Public projection has no private columns | same |
| Authorisation on bills, donations, receipts (service layer) | `tests/security/authorization.test.ts` |
| No manual approval function exported | same |
| Append-only trigger | same |
| Signed file URL tampering/expiry | same |
| Locale redirect, RTL/LTR, CSP nonce, auth redirects, private file denial, webhook signature, job secret, no PII in HTML | `scripts/smoke.mjs` |

## 4. Not covered (honest gaps)

| Gap | Reason | Impact |
|---|---|---|
| Browser end-to-end (Playwright/Cypress) | No browser download in this environment | DOM-level regressions (layout, client form states) are only checked manually and by HTML smoke assertions |
| Load/performance testing | Out of scope for the prototype | PGlite is single-writer; production throughput unmeasured |
| Fuzzing / property-based testing | Not implemented | Parser edge cases beyond the fixtures are unverified |
| Real OCR provider | No credentials | HTTP adapter unverified |
| Real payment provider (CIB/Edahabia) | No PSP agreement | Only simulated capture tested |
| SMS/email delivery | No provider | OTP delivery in production is blocked |
| Antivirus scanning | No engine | Uploaded files are validated but not scanned |
| Independent penetration test | Not performed | No certification claim is made |

## 5. CI

`.github/workflows/ci.yml` runs on push/PR: install (npm ci) → typecheck → lint → tests → reference +
demo seed → build → smoke → `npm audit --audit-level=high`. The demo seed is required because the smoke
test reads real published requests.
