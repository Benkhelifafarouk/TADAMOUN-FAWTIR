# Database schema

PostgreSQL 17. All objects are created by the migrations in `database/migrations/` and are portable to
Supabase (no extensions, no vendor-specific functions).

**Measured on the seeded database:** 50 domain tables + `schema_migrations`, 3 views, 153 indexes,
41 triggers, 72 RLS policies, 12 migrations.

## 1. Conventions

- UUID primary keys (`gen_random_uuid()`), `timestamptz` everywhere, `created_at`/`updated_at` with a
  `app_touch_updated_at()` trigger on mutable tables.
- Money: `bigint` **centimes** (1 DZD = 100). Column names end with `_centimes` to make misuse obvious.
- Status columns use `text` + `CHECK` constraints (readable in SQL, easy to extend with a migration).
- Enumerations that drive policy live in tables (`eligibility_rules`, `assistance_policies`), not in
  code.
- Personal data is isolated: identity in `users`, household in `beneficiary_profiles`/`households`,
  files in `stored_files`, and the donor-facing projection in a view.

## 2. Table groups

### Identity and access
| Table | Purpose |
|---|---|
| `users` | Credentials, name, phone, locale, status, MFA secret/flags, lockout counters |
| `user_roles` | Additive roles (`beneficiary`, `donor`, `support`, `admin`) |
| `sessions` | Hashed opaque tokens, expiry, revocation, MFA verification timestamp |
| `otp_codes` | Keyed hashes only, purpose, attempts, expiry, consumption |
| `consent_records` | Append-only consent history with policy version and locale |
| `account_verification_events` | Registration/OTP outcomes |

### Beneficiary and household
`beneficiary_profiles` (1:1 with user, wilaya/municipality/address, status),
`households` (size, children, declared income, housing), `household_members`,
`household_documents` (document type + file + acceptance state), `eligibility_profiles` (rolling
snapshot + `risk_level` used for account-level blocks).

### Bills and verification
`bills`, `bill_files` (link to `stored_files`), `bill_ocr_results` (raw text, parsed JSON, per-field
confidence, `is_demo`), `bill_verification_events`, `verification_requests` (attempt per bill),
`verification_evidence`, `document_requests`, `fraud_signals`.

### Eligibility
`eligibility_rules`, `eligibility_rule_versions` (JSON config + effective dates + active flag),
`assistance_policies` (base limit, period, above-cap policy, version), `assistance_tiers`
(household-size ranges and multipliers), `eligibility_decisions` (immutable), 
`eligibility_decision_reasons`, `appeals`.

### Requests (public projection)
`assistance_requests` (the internal row: beneficiary, bill, decision, amounts, status, public ref),
`request_status_history`, `public_request_views`.
Views: `public_assistance_requests`, `public_fund_summary`, `public_platform_stats`.

### Donations and accounting
`donor_profiles`, `donations` (pledge/paid/refunded + idempotency key), `payment_transactions`,
`payment_events` (raw provider callbacks, deduplicated), `donation_allocations`, `refunds`,
`solidarity_fund` (single row), `fund_ledger_entries` (signed, append-only), `receipts`.

### Operations
`notifications`, `support_tickets`, `audit_logs`, `security_events`, `jobs`, `rate_limits`,
`platform_settings`, `stored_files`, plus reference data `wilayas` (58 official), `municipalities`,
`service_categories`, `service_providers`.

## 3. Integrity invariants (enforced in the database)

| Invariant | Enforcement |
|---|---|
| A request can never be funded above its eligible amount | `CHECK (funded <= eligible)` + `app_guard_allocation()` BEFORE INSERT trigger (locks the request row and sums existing allocations) + application check |
| A request is only published from an `APPROVED` decision and for at most the approved amount | `app_guard_request_publish()` trigger |
| The fund cannot allocate more than its balance | `app_guard_fund_ledger()` trigger |
| A paid donation cannot return to `pending`; a refunded donation is final | `app_guard_donation_status()` trigger |
| Financial/audit history is immutable | `app_reject_mutation()` triggers on 9 tables + revoked UPDATE/DELETE privileges |
| Ledger sign matches entry type | `fund_ledger_sign_matches_type` CHECK (contribution > 0, allocation < 0, refund < 0) |
| No duplicate bill reference per provider in accepted bills | application duplicate detection + fraud signal (a similar bill is evidence, not a verdict) |
| Amounts are positive and consistent | CHECK constraints on every monetary column |

## 4. Row Level Security model

Three roles: `anon`, `authenticated` (identified by `app.current_user_id`, set per request by the
server), and the owner/service connection. `app_has_role()`, `app_is_admin()`, `app_is_support()` are
`SECURITY DEFINER` with a pinned `search_path` to avoid policy recursion and hijacking.

| Data | anon | authenticated beneficiary | donor | admin/support |
|---|---|---|---|---|
| Public requests (view) | read | read | read | read |
| `users` | — | own row (limited columns) | own row | all |
| `beneficiary_profiles`, `households` | — | own | — | all |
| `bills`, OCR results, verification | — | own bills; OCR results denied | — | bills yes; OCR text restricted |
| `stored_files` | — | own metadata | — | metadata (access audited at the route) |
| `assistance_requests` | — (view only) | own | — | all |
| `donations`, receipts | — | — | own | all |
| `donation_allocations` | — | own requests | own donations | all |
| `audit_logs`, `security_events` | — | — | — | admin only |
| `platform_settings` | public keys only | public keys | public keys | all |

Column-level privileges restrict what a user can update: `users` (name, phone, locale),
`beneficiary_profiles` (address, municipality, wilaya), `households` (size/children/income/housing),
`notifications` (`read_at` only).

**Important:** the application server connects as the table owner and therefore bypasses RLS. That is
why server-side authorization is implemented and tested, and why `tests/security/rls.test.ts` exercises
the policies with a **non-superuser** role — the same exposure a Supabase anon/authenticated key would
have.

## 5. Migrations

| # | File | Contents |
|---|---|---|
| 001 | `core_and_reference.sql` | helpers, reference tables, settings |
| 002 | `identity.sql` | users, roles, sessions, OTP, consent, verification events |
| 003 | `beneficiary.sql` | stored files, profiles, households, documents, eligibility snapshot |
| 004 | `bills.sql` | bills, files, OCR, verification workflow, document requests, fraud signals |
| 005 | `eligibility.sql` | rules/versions, policies/tiers, decisions, reasons, appeals, append-only |
| 006 | `donations.sql` | donors, donations, payments, events, allocations, refunds, fund, ledger, receipts |
| 007 | `public_requests.sql` | requests, history, views, public ref sequence |
| 008 | `operations.sql` | notifications, tickets, audit, security events, jobs, rate limits |
| 009 | `rls.sql` | roles, grants, RLS enablement and 72 policies, privilege tightening |
| 010 | `integrity_and_views.sql` | guards, numbering, transparency views, hot indexes |
| 011 | `feature_columns.sql` | MFA columns, session MFA timestamp, FR description, next action |
| 012 | `fund_refund_sign.sql` | correct sign rule for refunds (documented correction) |

Adding a migration:

```bash
# create database/migrations/013_my_change.sql, then
npm run db:migrate
```

Already-applied migrations are checksum-verified; editing one aborts the run. Never rewrite history —
add a new migration.

## 6. Reset and seeds

```bash
npm run db:reset   # DROP SCHEMA public CASCADE; migrate; reference seed (development only)
npm run db:demo    # synthetic users/bills/decisions/donations (DEMO_MODE=true)
```

Reference seed is idempotent (`on conflict do nothing` / `where not exists`). The demo seed refuses to
run when `DEMO_MODE=false`.
