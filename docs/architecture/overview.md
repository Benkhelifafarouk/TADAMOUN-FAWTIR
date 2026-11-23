# Architecture overview

## 1. Context and actors

| Actor | Goal | Trust level |
|---|---|---|
| Beneficiary (household) | Get a bill paid without exposing identity | Authenticated, untrusted input |
| Donor | Fund a verified need with traceability | Authenticated, untrusted input |
| Administrator | Operate the platform and configure policy | Authenticated + TOTP, audited |
| Support agent | Handle tickets, no access to private documents by default | Authenticated, least privilege |
| Anonymous visitor | Read public requests, transparency, legal pages | Untrusted |

There are no associations, partner accounts or activation codes — by product decision. Beneficiaries
register directly and ordinary decisions are taken by the automated engine only.

## 2. Layers

```text
app/[locale]/…            Server Components (read) + forms
components/               Presentational primitives, shells, client form wrapper
lib/actions/*             Server Actions: auth → validation → service → audit → revalidate
lib/{bills,eligibility,donations,jobs,notifications}
                          Domain services (business rules, transactions)
lib/db/*                  Driver abstraction (PGlite | pg), migration runner, value helpers
database/migrations/*     Portable PostgreSQL DDL, constraints, triggers, RLS
```

Rules of the codebase:

- **No business logic in the browser.** Client components only manage form state; every decision is
  made on the server with Zod-validated input.
- **No SQL string interpolation.** All queries are parameterised; identifiers are static.
- **No user-facing string literals.** `lib/i18n/dictionaries/{ar,fr}.ts` is the single source, typed
  so the French dictionary cannot drift from the Arabic reference.
- **Money is integer centimes.** `lib/money.ts` owns parsing/formatting; `numeric`/`float` is never
  used for amounts.

## 3. Trust boundaries

1. **Browser → Next.js server.** Untrusted. Validated by Zod, guarded by session + role checks.
   Server Actions also benefit from Next's origin check (CSRF mitigation for form posts).
2. **Next.js server → PostgreSQL.** Privileged connection (bypasses RLS). Authorization is therefore
   enforced in `lib/auth/guards.ts` and in every query predicate; RLS is a second line for the
   `anon`/`authenticated` surface.
3. **Next.js server → file storage.** Private directory; only the signed-URL route reads it.
4. **Next.js server → external AI/OCR.** Disabled unless `EXTERNAL_AI_PROCESSING_ENABLED=true`; a
   documented privacy gate. Documents are never sent by default.
5. **Payment provider → server.** Webhook is signature-verified and idempotent; the demo handler only
   records events and never mutates money (capture is user-confirmed server-side).

## 4. Key flows

### 4.1 Bill submission → publication

```text
POST server action (uploadBillAction)
 └─ guard: authenticated beneficiary + verified phone
 └─ submitBill()
     ├─ beneficiary profile must be complete
     ├─ provider/category active and consistent
     ├─ validateUpload(): magic bytes, size, dimensions, PDF header
     ├─ sha256 + private storage write (key = bills/YYYY/MM/uuid.ext)
     ├─ tx: stored_files + bills(processing) + bill_files + event
     ├─ runOcr(): pdf-text (real) | demo (labelled) | http (adapter)
     ├─ persist OCR result + fill bill fields (never invent a value)
     ├─ fraud signals: duplicate hash, duplicate reference, impossible dates, low resolution
     └─ evaluateBill()
         ├─ load rule version + policy + tier + period commitment
         ├─ load duplicate/risk evidence and latest OCR
         ├─ engine.evaluateEligibility() — pure, deterministic
         └─ tx: decision (immutable) + reasons + verification status
                + document requests (only what is missing)
                + assistance_request publication when APPROVED
                + notification + audit + evidence
```

The engine is a pure function: same input → same output, which is what makes 32 unit cases possible.

### 4.2 Donation

```text
createDonationAction → createDonation()
  ├─ request must be published/partially funded, amount ≤ remaining
  └─ donation(pending) + payment_transaction(created)
→ redirect to demo checkout
confirmDemoPaymentAction → confirmDemoPayment()
  └─ tx: lock donation → lock request → allocate (trigger + check) → update funded/status
         → payment evidence → DEMO receipt → notification → audit
```

### 4.3 Re-evaluation and appeals

- Uploading a requested document marks the request fulfilled, records the document as “on file”
  (presence + quality only — content is not semantically verified by a human), then re-runs the engine,
  producing a new decision.
- An appeal creates a new decision with `appeal_id` and `supersedes_decision_id`. The original decision
  is untouched (append-only trigger).

## 5. Design decisions and trade-offs

| Decision | Rationale | Cost |
|---|---|---|
| Dual DB driver (PGlite / pg) | Zero-setup local dev, CI and tests against real PostgreSQL; same SQL for Supabase | PGlite is single-writer; not for production traffic |
| First-party auth instead of Supabase Auth | Fully testable without external credentials; no vendor lock-in | Must maintain session/OTP/MFA code; no social login |
| RLS + server-side authorization | Defence in depth; protects a future PostgREST surface | Two places to keep consistent; tested |
| Immutable decisions and ledgers | Financial and fairness auditability | Corrections require new rows, more storage |
| Publication only through the engine | Prevents hidden manual favouritism | No emergency manual publish; an outage blocks publishing |
| Demo provider | Legal safety before PSP agreement | No real money path yet |
| Files on local disk | Simple, private, no cloud dependency | Requires a persistent volume; no CDN |
| Jobs in PostgreSQL | No extra infrastructure; SKIP LOCKED is reliable | Throughput limited; needs a worker/cron |

## 6. Failure behaviour

- **OCR provider down** → bill stays `processing`, a job retries; the beneficiary sees a processing
  state, never a fabricated approval.
- **Engine misconfigured** (no active rule/policy) → decision `TEMPORARILY_BLOCKED` with an explicit
  reason; it never silently approves.
- **Job worker down** → decisions still produced inline on submission; notifications stay queued and
  are delivered when a worker runs.
- **Fund ledger mismatch** → critical security event; no automatic correction.
- **Database unavailable** → `/api/health` returns 503; pages fail closed (no cached private data).

## 7. Scaling path

1. Move to managed PostgreSQL; keep the same migrations; set connection pooling.
2. Replace local storage with an object-store adapter behind `StorageProvider` (signed URLs already
   abstracted).
3. Run multiple app instances; the job queue already supports concurrent workers.
4. Add a real OCR provider and an SMS/email provider through the existing interfaces.
5. Add read replicas for public pages if needed; public reads already go through views.
