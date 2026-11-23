# Delivery report — TADAMOUN FAWTIR

**Date:** 23 November 2026 · **Repository:** `tadamoun-fawtir/` (local Git repository)
**Build under test:** commit at delivery, Next.js 16.4.6, Node 24.20.0, Windows 11 / PowerShell 5.1.

This report distinguishes **implemented**, **tested**, **configured**, **deployed**, **legally approved**
and **production-ready**. They are not synonyms.

---

## 1. What was actually built

A full-stack Next.js application with a real PostgreSQL schema (12 migrations), server-side domain
services, a deterministic eligibility engine, a donation/accounting subsystem with database-enforced
invariants, private document storage with signed access, a job queue, in-app notifications, an
administration console, and an Arabic/French RTL/LTR interface.

Not built (deliberately or blocked): association accounts, manual approval of ordinary applications,
real payment collection, real image OCR, SMS/e-mail delivery, virus scanning, Supabase Auth/Storage
adapters, browser E2E, hosted deployment.

## 2. What works end to end (verified)

| Journey | Verified by |
|---|---|
| Register → verify phone → complete household → upload a real PDF bill → automated `APPROVED` → anonymous publication | integration test + demo seed (`family1`) |
| Upload a duplicate bill → `REJECTED` with `DUPLICATE_FILE`, two fraud signals recorded | integration test + demo seed (`family2`) |
| Household above the document threshold → `NEEDS_ADDITIONAL_DOCUMENTS` (family status only) → upload → automatic re-evaluation → `APPROVED` | integration test |
| Appeal a rejection → new decision with `supersedes_decision_id`, original untouched | integration test |
| Donate partially → demo payment → atomic allocation → request partially funded → DEMO receipt | integration test + demo seed |
| Fund contribution → fund balance → FIFO allocation to a request → signed ledger | integration test |
| Overfunding refused (application, row lock, trigger, CHECK) | integration + security tests |
| Cross-household access denied by RLS (non-superuser role) | security test |
| Public projection contains no identity columns | security test + smoke test |
| Admin console reads real aggregates, edits rules/policies, allocates fund, marks payout, views audit | build + smoke (pages render), manual demo |
| Arabic RTL and French LTR pages, locale redirect, CSP nonce, auth redirects | smoke test (18 checks) |

## 3. Frontend architecture

- Next.js App Router, React Server Components for reads, Server Actions for writes.
- `app/[locale]/…` with route groups: `(public)`, `app` (beneficiary), `donor`, `admin`.
- Typed dictionaries `lib/i18n/dictionaries/{ar,fr}.ts` (Arabic is the reference shape; French cannot
  drift without a type error). All text, errors and status labels come from the dictionary.
- Tailwind 3 design tokens (ink/sand/brand/clay/amber), logical properties for RTL, mobile-first,
  accessible focus rings, skip link, semantic landmarks, `prefers`-friendly typography.
- Shared UI primitives in `components/ui.tsx`; one client form wrapper (`ActionForm`) bound to
  `useActionState`, with inline field errors resolved from dictionary keys.

## 4. Backend architecture

- Server-only modules under `lib/`: `auth`, `actions`, `bills`, `eligibility`, `donations`, `jobs`,
  `notifications`, `ocr`, `security`, `storage`, `validation`, `data` (read models).
- No secret or business rule on the client; no direct database access outside `lib/db`.
- Driver abstraction with two implementations: embedded PGlite (dev/CI/tests) and `pg` (PostgreSQL/
  Supabase). Transactions and typed value normalisation are shared.
- Background jobs: DB queue, `FOR UPDATE SKIP LOCKED`, retries, dead-letter visibility.

## 5. Database architecture

- 12 migrations, **50 domain tables + `schema_migrations`**, 3 views, 153 indexes, 41 triggers,
  **72 RLS policies** (measured on the seeded database).
- Money as integer centimes; append-only ledgers and decisions; integrity triggers for overfunding,
  publication, fund balance, donation status regression; checksum-verified migrations.
- Views: `public_assistance_requests` (anonymised), `public_fund_summary`, `public_platform_stats`.

## 6. Migrations

12 migrations, all applied on a fresh database, in order, each in a transaction, with checksum
protection. `npm run db:status` reports 0 pending after `npm run db:migrate`.

## 7. Authentication and authorization

- First-party auth: scrypt hashes, opaque 32-byte session tokens hashed at rest, httpOnly/SameSite/Secure
  cookies, expiry and revocation, lockout after 8 failures, DB-backed rate limits.
- OTP: 6 digits, keyed hash, 10 min TTL, 5 attempts, previous codes invalidated, per-user and per-IP limits.
- TOTP MFA for administrators (enrol/confirm/disable with a valid code, session `mfa_verified_at`).
- Roles: additive `user_roles` (`beneficiary`, `donor`, `support`, `admin`); guards on every area.
- RLS policies for `anon`/`authenticated` and tests with a non-superuser role.
- **Not deployed to Supabase**; RLS tested against the embedded PostgreSQL as a non-superuser role.

## 8. Storage and privacy

- Private storage outside the web root; random UUID keys; no original filenames.
- Access requires an HMAC-signed 5-minute token **and** a session belonging to the owner; admin access is
  audited; responses are `no-store`, `nosniff`, sandboxed.
- Public pages query a view without identity, account, file or OCR columns.
- Deletion path deactivates the account and revokes sessions; automated purge of old documents is **not**
  implemented (documented gap).

## 9. OCR and AI

| Path | Status |
|---|---|
| PDF with a text layer | **Real** pdf.js extraction + deterministic parser (tests, demo bills) |
| Images / scanned PDFs in demo mode | **Simulated**, flagged `is_demo`, badged in the UI and stored in the database |
| HTTP provider adapter | Implemented, **unverified** (no credentials), disabled unless explicitly enabled |
| Eligibility decision by AI | **Never**; AI/OCR only supplies evidence and confidence |

Schema-validated, prompt-injection resistant, missing values never invented.

## 10. Eligibility engine

Pure deterministic function, versioned rules, 26-step documented order, five decision states, reason
codes, configurable limits and household tiers, period commitments, document requests, appeals that
create new decisions, no manual approval path. 32 unit cases + integration coverage.

## 11. Donations and accounting

Four distinct states (pledge, payment, allocation, payout), atomic allocation, idempotency keys, signed
webhook event storage, fund ledger with sign enforcement, FIFO fund allocation, refunds limited to
unallocated donations, numbered DEMO receipts, reconciliation job. Overfunding is prevented by four
independent mechanisms.

## 12. Payment integration status

**Demo only.** No real PSP contract, no card data stored, `PAYMENTS_LIVE_ENABLED=true` is rejected by
environment validation. The webhook endpoint verifies an HMAC signature and records events but never
captures money; capture is user-confirmed in the checkout action.

## 13. Automated test results

```
TypeScript strict   PASS (tsc --noEmit, 0 errors)
ESLint              PASS (0 problems)
Vitest              82/82 passing
  ├─ unit            56
  ├─ integration     12
  └─ security        14
HTTP smoke           18/18 passing against a production build
npm audit            0 vulnerabilities
```

Commands: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build && npm run test:e2e`.

## 14. Security assessment results

Internal review + automated verification: no critical/high vulnerability found in the implemented code
after fixes. Six issues were found during development and fixed (date handling, unfair risk scoping, fund
refund sign, test fixture collision, pdf.js cleanup, plus a documentation gap). Residual risks: RLS is
bypassed by the application's owner connection (mitigated by server-side authorization), no AV scanning,
no encryption at rest, no SMS provider, demo-mode MFA relaxation, no independent pentest. Full detail:
`docs/security/security-assessment.md`.

**No penetration test, certification or compliance attestation is claimed.**

## 15. Remaining vulnerabilities / accepted risks

See `docs/security/security-assessment.md` §3.2 (R1–R10). None of them is an unpatched critical
vulnerability in the code; they are architectural or operational gaps requiring external services,
configuration or review.

## 16. Remaining external dependencies

| Dependency | Needed for | Status |
|---|---|---|
| Algerian legal counsel | privacy/terms/legal vehicle | **missing** |
| ANPDP declaration/authorisation | lawful processing | **missing** |
| Licensed PSP (CIB/Edahabia) | real donations | **missing** |
| SMS provider | OTP delivery in production | **missing** |
| E-mail provider | notifications | **missing** |
| Real OCR/AI provider | image bills | **missing** (adapter ready) |
| Antivirus engine | upload scanning | **missing** |
| Hosting + domain + TLS | deployment | **missing** |
| Utility/provider settlement agreements | paying bills | **missing** |
| Accountant (DGI) | receipts/tax | **missing** |
| Independent security reviewer | launch gate | **missing** |

## 17. Legal readiness status

**Not established.** Documents are drafts. Real donation collection and payouts must remain disabled.
See `docs/legal/legal-readiness-checklist.md` (12-item go-live gate) and the sourced research brief.

## 18. GitHub repository

Not published: no authenticated GitHub connection in this environment. A local Git repository with
meaningful commits is prepared. To publish:

```bash
git remote add origin git@github.com:<your-account>/tadamoun-fawtir.git
git branch -M main
git push -u origin main
```

The repository name suggested by the brief is `tadamoun-fawtir`.

## 19. Local installation

```bash
cd tadamoun-fawtir
npm install
cp .env.example .env.local
# set APP_SECRET and FILE_SIGNING_SECRET (commands in README)
npm run db:reset && npm run db:demo
npm run dev
```

## 20. Exact commands to run the project

```bash
npm run dev                 # http://localhost:3000 (redirects to /ar)
npm run build && npm start  # production-style local run
npm run db:status           # migration status
npm test                    # 82 tests
npm run build && npm run test:e2e
```

## 21. Environment variables you must configure

`APP_URL`, `APP_SECRET`, `FILE_SIGNING_SECRET`, `JOBS_TICK_SECRET`, `DATABASE_DRIVER`, `DATABASE_URL`
(for PostgreSQL), `DATABASE_SSL`, `LOCAL_STORAGE_DIR`, `DEMO_MODE=false`,
`PAYMENTS_LIVE_ENABLED=false`, `PUBLIC_DONATIONS_ENABLED=false`,
`EMAIL_PROVIDER`/`SMS_PROVIDER` (+ credentials), `OCR_PROVIDER` (+ URL/key) if enabled.
Full list with notes: `.env.example` and `docs/deployment/deployment.md`.

## 22. Features implemented but requiring credentials

- Real image OCR (`OCR_PROVIDER=http`, `OCR_PROVIDER_URL`, `OCR_PROVIDER_API_KEY`,
  `EXTERNAL_AI_PROCESSING_ENABLED=true`, plus a privacy assessment).
- SMS OTP delivery and e-mail notifications.
- Payment capture through a licensed provider (adapter and webhook contract must be completed).
- Virus scanning (interface returns `not_available`).
- Any hosted database (PostgreSQL/Supabase).

## 23. Not ready for production

1. Real payments are disabled and unimplemented by contract.
2. Image OCR is simulated.
3. No SMS/e-mail provider.
4. No antivirus scanning.
5. No automated retention purge.
6. No independent security review.
7. Legal compliance not established.
8. No hosted deployment or verified backups.
9. No browser-based E2E test.
10. No account recovery (password reset) flow.

## 24. Honest status matrix

| Aspect | Implemented | Tested | Configured | Deployed | Legally approved | Production-ready |
|---|---|---|---|---|---|---|
| UI (ar/fr) | yes | smoke + manual | yes | no | n/a | no |
| Auth/roles/RLS | yes | yes | yes | no | n/a | no |
| Bills/OCR/eligibility | yes | yes | pdf-text real; images demo | no | no | no |
| Donations/accounting | yes (demo) | yes | demo provider | no | no | no |
| Admin console | yes | smoke + manual | yes | no | n/a | no |
| Payments | no (demo) | simulated only | no | no | no | no |
| Legal/privacy | drafts | n/a | no | no | **no** | **no** |

**Bottom line:** this is a working, tested prototype that can be run locally and reviewed, with honest
demo labelling. It is **not** a production-ready or legally authorised donation platform, and it must not
be presented as one.
