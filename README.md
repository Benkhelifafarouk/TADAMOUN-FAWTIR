# TADAMOUN FAWTIR — تضامن فواتير

A privacy-first Algerian solidarity platform that helps low-income households pay essential utility
bills (Sonelgaz electricity/gas, ADE water, home internet) through transparent, anonymous donations.

> **Status: working prototype, not production-ready.** Real money collection is disabled by design.
> The payment provider is a simulation, OCR for images is a clearly-labelled demo, and the legal
> documents are drafts requiring review by a qualified Algerian lawyer. See
> [Known limitations](#known-limitations--blocked-items) before drawing any conclusion.

---

## Table of contents

1. [What is implemented](#what-is-implemented)
2. [Technology stack](#technology-stack)
3. [Architecture](#architecture)
4. [Quick start](#quick-start)
5. [Demo accounts](#demo-accounts)
6. [Scripts](#scripts)
7. [Database](#database)
8. [Storage and privacy](#storage-and-privacy)
9. [OCR and AI](#ocr-and-ai)
10. [Eligibility engine](#eligibility-engine)
11. [Donations and accounting](#donations-and-accounting)
12. [Security](#security)
13. [Tests](#tests)
14. [Deployment](#deployment)
15. [Known limitations / blocked items](#known-limitations--blocked-items)
16. [Legal and regulatory status](#legal-and-regulatory-status)
17. [Project structure](#project-structure)
18. [Documentation index](#documentation-index)

---

## What is implemented

**Beneficiary**
- Registration, phone verification by OTP (with expiry, attempt limits and rate limiting), consents.
- Private household profile (wilaya, municipality, size, declared income) — never published.
- Bill upload (JPG/PNG/PDF) with content-based validation, private storage, SHA-256 hashing.
- Automatic OCR/extraction, duplicate detection, fraud signals and a deterministic eligibility decision.
- Automated document requests when verification is inconclusive, with automatic re-evaluation on upload.
- Appeals that create a **new** decision and never overwrite the original.
- Anonymous publication of approved requests and funding tracking.

**Donor**
- Browse anonymised requests with wilaya/service filters.
- Donate a full or partial amount, or contribute to the general solidarity fund.
- Demo checkout (explicitly marked), donation states, allocation detail, printable DEMO receipt.

**Administrator**
- Operational dashboard from real SQL aggregates, service/wilaya distribution.
- User status management (audited), verification and fraud monitoring (read-only decisions).
- Configurable eligibility rule versions and assistance policies with household-size tiers.
- Service catalogue and geography management.
- Donation management, payouts to providers, solidarity fund allocation, financial reports.
- Security events, audit trail, support tickets, platform settings, TOTP enrolment.

**Platform**
- Arabic (default, RTL) and French (LTR) with a typed dictionary — no hardcoded UI strings.
- 50 domain tables, 12 migrations, 72 RLS policies, 41 triggers, append-only financial history.
- Durable job queue (SKIP LOCKED), in-app notifications, signed payment webhook plumbing.
- 82 automated tests (unit, integration, RLS, authorization) + 18 HTTP smoke checks.

**Explicitly NOT implemented** (and not pretended otherwise): association/partner accounts, manual
approval of ordinary applications, real payment collection, real OCR provider credentials, SMS/email
delivery, virus scanning engine, Supabase Auth/Storage adapters, browser-based E2E (Playwright).

## Technology stack

| Layer | Choice | Notes |
|---|---|---|
| Framework | Next.js 16.4.6 (App Router, Turbopack) | Server Components, Server Actions |
| UI | React 19.2.9, TypeScript 5 (strict), Tailwind CSS 3.4 | RTL via logical properties |
| Validation | Zod 4.6.7 | One schema layer for every input and AI output |
| Database | PostgreSQL 17 — embedded PGlite 0.6 (dev/CI) or `pg` 8.23 (Supabase/self-hosted) | Same SQL migrations for both |
| Auth | First-party: scrypt + opaque httpOnly session cookies + TOTP MFA for admins | No external identity provider required |
| Files | Private local storage + HMAC-signed short-lived URLs | Never in `public/` |
| OCR | Provider abstraction: real PDF text-layer extraction, demo simulation for images, HTTP provider adapter | No vendor lock-in |
| Jobs | PostgreSQL queue with `FOR UPDATE SKIP LOCKED` | Worker via CLI or secret-protected endpoint |
| Tests | Vitest 5 (unit/integration/security) + Node HTTP smoke script | PGlite in-memory per test file |

### Deviations from the preferred stack (and why)

1. **Database driver**: the brief preferred Supabase. No Supabase project exists in this environment,
   so the schema is written as portable SQL and runs on the embedded PostgreSQL build for local
   development, CI and tests. Pointing `DATABASE_DRIVER=postgres` at a Supabase database applies the
   exact same migrations.
2. **Authentication**: Supabase Auth is replaced by first-party auth so that registration, OTP,
   sessions, MFA and every authorization test work without external credentials. The session model
   and RLS policies are designed to be portable; see `docs/architecture/overview.md`.
3. **Storage**: Supabase Storage is replaced by a private local adapter behind a `StorageProvider`
   interface. Production needs a persistent volume or an adapter (documented as a gap).

## Architecture

```text
Browser (ar RTL / fr LTR)
   │  Server Components + Server Actions (no client-side business logic)
   ▼
Next.js server (Node runtime)
   ├── Auth & guards ........ scrypt, opaque sessions, roles, TOTP
   ├── Validation ........... Zod schemas, dictionary-key errors
   ├── Domain services ...... bills, eligibility, donations, jobs, notifications
   ├── OCR abstraction ...... pdf-text (real) | demo (labelled) | http (adapter)
   └── Storage .............. private files + signed 5-minute URLs
   ▼
PostgreSQL
   ├── 50 tables, constraints, integrity triggers, append-only ledgers
   ├── 72 RLS policies (anon / authenticated / admin)
   └── Views: public_assistance_requests, public_fund_summary, public_platform_stats
```

Trust boundaries, data flow and design decisions: [`docs/architecture/overview.md`](docs/architecture/overview.md).

## Quick start

Requirements: **Node.js ≥ 20.11** (tested on 24), npm. No Docker, no database server, no credentials.

```bash
npm install
cp .env.example .env.local        # Windows: Copy-Item .env.example .env.local

# generate the two secrets and paste them into .env.local
node -e "console.log('APP_SECRET='+require('node:crypto').randomBytes(48).toString('base64url'))"
node -e "console.log('FILE_SIGNING_SECRET='+require('node:crypto').randomBytes(48).toString('base64url'))"

npm run db:reset                  # drop + migrate + reference data (58 wilayas, categories, rules)
npm run db:demo                   # synthetic users, bills, decisions, donations
npm run dev                       # http://localhost:3000 → redirects to /ar
```

Production-style run:

```bash
npm run build
npm start
```

The embedded database lives in `.data/pglite`; private uploads in `.data/private-storage`.
`npm run db:reset` destroys both schemas — development only.

## Demo accounts

All demo identities are fictional. Password for every account: `Demo12345!`

| Account | Role | What to look at |
|---|---|---|
| `admin@demo.local` | administrator | `/ar/admin` — dashboard, rules, finance, audit |
| `donor@demo.local` | donor | `/ar/donor` — donations, demo checkout, receipt |
| `family1@demo.local` | beneficiary | `/ar/app` — approved Sonelgaz bill, published request |
| `family2@demo.local` | beneficiary | `/ar/app` — duplicate attempt rejected, water bill approved |

The seed also creates two fraud signals (duplicate file hash and duplicate bill reference) on the
rejected duplicate upload, a 2 000 DZD donation allocated to the first request, and a 5 000 DZD
contribution to the solidarity fund.

> The seeded bills are real PDFs with a text layer, generated by `lib/demo/pdf.ts`. Their extraction
> is genuine (pdf.js + the deterministic parser), not a mock.

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Development server (Turbopack) |
| `npm run build` / `npm start` | Production build / serve |
| `npm run typecheck` | `tsc --noEmit` (strict) |
| `npm run lint` | ESLint 9 flat config |
| `npm test` | Unit + integration + security suites (Vitest) |
| `npm run test:unit` / `test:integration` / `test:security` | Targeted suites |
| `npm run test:e2e` | HTTP smoke checks against a production build |
| `npm run db:migrate` / `db:status` | Apply / inspect migrations |
| `npm run db:seed` | Reference data only (idempotent) |
| `npm run db:demo` | Synthetic demo data (requires `DEMO_MODE=true`) |
| `npm run db:reset` | Drop schema, migrate, seed reference data |
| `npm run worker` | Long-running job worker (polls the queue) |
| `npm run verify` | typecheck + lint + tests |

## Database

- **12 migrations** in `database/migrations/` — plain, portable PostgreSQL (no extensions required).
- **50 domain tables + 3 views**, 153 indexes, 41 triggers, 72 RLS policies.
- Money is stored as **integer centimes** (1 DZD = 100 centimes); no floating point anywhere.
- Append-only tables: `audit_logs`, `security_events`, `fund_ledger_entries`, `payment_events`,
  `donation_allocations`, `receipts`, `request_status_history`, `eligibility_decisions`,
  `eligibility_decision_reasons`. Updates/deletes are rejected by trigger **and** by revoking the
  privileges from `authenticated`.
- Integrity triggers: no overfunding, no publication without an APPROVED decision, no fund allocation
  beyond the balance, no paid→pending regression.

### Local (default)

```env
DATABASE_DRIVER=pglite
PGLITE_DATA_DIR=.data/pglite
```

### Supabase / PostgreSQL

```env
DATABASE_DRIVER=postgres
DATABASE_URL=postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres
DATABASE_SSL=true
```

Then `npm run db:migrate` and `npm run db:seed` (use a direct/session connection for migrations).
The app connects with a privileged role; RLS protects the `anon`/`authenticated` PostgREST surface.
The application must also enforce authorization server-side — it does (`lib/auth/guards.ts`), and this
is tested. See `docs/database/schema.md` for the full model.

## Storage and privacy

- Original bills and documents are written outside `public/`, with random UUID keys and no original
  filename (no PII in paths).
- Files are served only by `/api/files/[id]` after (1) HMAC signature verification and (2) a session
  belonging to the owner — or an administrator, which is written to the audit log.
- Public pages use `public_assistance_requests`, a view that contains **no** identity, account number,
  file reference or OCR text. A test asserts the column list.
- Uploads are validated by magic bytes, size, dimensions and PDF parse; SVG/HTML/executables rejected.
- **No virus scanner is configured** (`scan_status` stays `pending`); documented as a gap.

## OCR and AI

| Provider | When | Reality |
|---|---|---|
| `pdf-text` | PDF with a text layer | **Real** extraction with pdf.js + regex parser |
| `demo` | Images, or PDFs without a text layer, when `DEMO_MODE=true` | **Simulated**, flagged `is_demo`, badged in UI, notes `DEMO_SIMULATED_EXTRACTION` |
| `http` | Configured `OCR_PROVIDER_URL` + `OCR_PROVIDER_API_KEY` + `EXTERNAL_AI_PROCESSING_ENABLED=true` | Adapter implemented, **unverified** (no credentials) |

The engine never trusts the provider: every result is validated against a strict Zod schema, missing
values are never invented, and prompt-injection text inside a document is treated as data. AI never
decides eligibility. Provider contract: `docs/ocr-contract.md`.

## Eligibility engine

A pure, deterministic, versioned function (`lib/eligibility/engine.ts`) evaluates: evidence quality,
duplicate signals, dates, risk, household size, declared income, and the active assistance policy.
It returns one of `APPROVED`, `REJECTED`, `NEEDS_ADDITIONAL_DOCUMENTS`, `VERIFICATION_UNCERTAIN`,
`TEMPORARILY_BLOCKED` with reason codes, an eligible amount and a next action.

- Rules and monetary limits live in the database and are versioned; changing them creates a new version.
- Uncertainty is never auto-approved; unclear cases request **only** the necessary document.
- Consumption, wilaya and municipality are never used as wealth proxies.
- Every decision is immutable and records its rule version, engine version and evidence references.
- There is intentionally **no manual approval path** — a database trigger refuses to publish from a
  non-approved decision.

Full rule order and reason codes: [`docs/eligibility-rules.md`](docs/eligibility-rules.md).

## Donations and accounting

Four distinct states, never conflated: **pledge → payment → allocation → payout**.

- Demo provider only; `PAYMENTS_LIVE_ENABLED=true` is rejected by environment validation.
- Allocation is atomic with a row lock, application checks, a trigger and a CHECK constraint —
  overfunding is impossible.
- The solidarity fund uses a signed append-only ledger; allocation consumes contributions FIFO and
  cannot exceed the balance.
- Refunds are implemented for unallocated donations only; refunding allocated money is refused.
- Receipts are numbered `TF-RCPT-YYYY-NNNNNN` and marked `is_demo=true`.
- A reconciliation job compares stored balances with the ledgers and raises a critical security event
  on mismatch (it never silently “fixes” money).

Model and invariants: [`docs/finance/accounting-model.md`](docs/finance/accounting-model.md).

## Security

Implemented: scrypt password hashing, opaque session tokens (hashed at rest, httpOnly, SameSite=Lax,
Secure in production), session revocation, login lockout, DB-backed rate limits, OTP expiry/attempts,
TOTP for administrators, Zod validation on every input, parameterized SQL everywhere, nonce-based CSP,
HSTS, `nosniff`, `DENY` framing, strict referrer policy, IDOR-safe queries, signed short-lived file
links, audit trail, security events, redaction of secrets in logs, `npm audit` clean.

Security assessment (controls, findings, residual risks, explicit non-claims):
[`docs/security/security-assessment.md`](docs/security/security-assessment.md).

## Tests

```bash
npm test          # 82 tests: 56 unit, 26 integration/security
npm run build && npm run test:e2e   # 18 HTTP smoke checks
```

- Unit: money parsing, bill parser (incl. Arabic-Indic digits, prompt injection), 32 engine cases,
  TOTP, SQL splitter.
- Integration: beneficiary journey, duplicate rejection, document request + re-evaluation, appeals,
  donation/ allocation/ idempotency/ overfunding/ fund/ refund/ ownership.
- Security: RLS with a non-superuser role, cross-household access, public projection columns,
  authorization on bills/donations/receipts, DB refusal of non-approved publication, overfunding
  trigger, fund balance trigger, append-only trigger, signed-link tampering.

## Deployment

See [`docs/deployment/deployment.md`](docs/deployment/deployment.md) and
[`docs/operations/runbook.md`](docs/operations/runbook.md).

Minimum production environment (validation fails closed):

```env
NODE_ENV=production
APP_URL=https://your.domain
APP_SECRET=<48 random bytes>
FILE_SIGNING_SECRET=<48 random bytes>
JOBS_TICK_SECRET=<random>
DATABASE_DRIVER=postgres
DATABASE_URL=postgresql://...
DEMO_MODE=false
PAYMENTS_LIVE_ENABLED=false
PUBLIC_DONATIONS_ENABLED=false   # until legal + PSP sign-off
```

Worker: `npm run worker` (or call `POST /api/internal/jobs/tick` with `x-jobs-secret` from cron).

## Known limitations / blocked items

| Item | Status | Why / next step |
|---|---|---|
| Real payment collection | **BLOCKED** | No licensed PSP agreement; provider adapter is demo-only. Do not enable. |
| Real OCR for images | **BLOCKED** | No OCR vendor contract/credentials. Configure `OCR_PROVIDER=http` after a privacy review. |
| SMS / email delivery | **BLOCKED** | No provider configured; OTP is returned only in demo mode, otherwise registration cannot complete. |
| Malware scanning | **BLOCKED** | No engine bundled; `scan_status` remains `pending`. |
| Supabase Auth / Storage | Not implemented | First-party auth + local private storage used instead; adapter seam documented. |
| Browser E2E (Playwright) | Not run | HTTP-level smoke test instead; no browser download in this environment. |
| Independent penetration test | **Not performed** | Only internal review + automated tests. Do not claim certification. |
| Hosted deployment | Not performed | No hosting credentials. Local build verified. |
| Legal compliance | **Not established** | Drafts only; requires Algerian counsel, ANPDP filings, PSP and provider agreements. |
| OCR/LLM accuracy | Unverified | Demo mode is synthetic; text PDFs are parsed deterministically. |

## Legal and regulatory status

Real donation collection and real payouts must remain disabled until: (1) a qualified Algerian lawyer
reviews the drafts, (2) the processing is declared/authorised with the ANPDP under Law 18-07,
(3) a licensed payment provider agreement exists, (4) provider settlement agreements exist, and
(5) tax/receipt obligations are confirmed.

See [`docs/legal/legal-readiness-checklist.md`](docs/legal/legal-readiness-checklist.md) and the sourced
research brief [`docs/legal/algeria-legal-research.md`](docs/legal/algeria-legal-research.md).
Nothing in this repository is legal advice.

## Project structure

```text
tadamoun-fawtir/
├── app/                     # routes: [locale]/(public), app/, donor/, admin/, api/
├── components/              # UI primitives, shells, forms
├── lib/
│   ├── actions/             # server actions ('use server')
│   ├── auth/                # sessions, guards, OTP, roles
│   ├── bills/               # submission pipeline
│   ├── data/                # read models (SQL)
│   ├── db/                  # drivers, migrations, SQL splitter, value helpers
│   ├── donations/           # accounting services
│   ├── eligibility/         # pure engine + orchestration
│   ├── i18n/                # ar/fr dictionaries, formatters
│   ├── jobs/                # queue + runner
│   ├── ocr/                 # parser, pdf, providers, schema
│   ├── security/            # hashing, passwords, rate limits, audit, TOTP
│   ├── storage/             # private storage, validation, signed URLs
│   └── validation/          # Zod schemas
├── database/migrations/     # 12 SQL migrations
├── database/seeds/          # reference data
├── scripts/                 # db CLI, demo seed, worker, smoke
├── tests/                   # unit, integration, security, helpers
├── docs/                    # architecture, db, security, privacy, legal, ops
└── proxy.ts                 # locale routing + nonce CSP (Next 16 proxy convention)
```

## Documentation index

- [Architecture](docs/architecture/overview.md)
- [Database schema](docs/database/schema.md)
- [HTTP + server actions](docs/api/endpoints.md)
- [Eligibility rules](docs/eligibility-rules.md)
- [Financial accounting model](docs/finance/accounting-model.md)
- [OCR provider contract](docs/ocr-contract.md)
- [Security assessment](docs/security/security-assessment.md)
- [Testing](docs/testing.md)
- [Deployment](docs/deployment/deployment.md) · [Operations runbook](docs/operations/runbook.md)
- [Privacy policy (draft)](docs/privacy/privacy-policy.md) · [Terms (draft)](docs/privacy/terms-of-service.md)
- [Retention](docs/privacy/retention-policy.md) · [Processing inventory](docs/privacy/data-processing-inventory.md)
- [Consent management](docs/privacy/consent-management.md) · [Incident response](docs/privacy/incident-response.md)
- [Legal readiness checklist](docs/legal/legal-readiness-checklist.md)
- [Delivery report](docs/delivery-report.md)

## License

MIT — see [LICENSE](LICENSE). The licence covers code only, not any future legal authorisation to
operate a donation platform in Algeria.
