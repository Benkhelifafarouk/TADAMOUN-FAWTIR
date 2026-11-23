# Security assessment

**Date:** 23 November 2026 · **Scope:** the whole repository at delivery · **Type:** internal review with
automated verification — **not** an independent penetration test and **not** a certification.

## 1. What was actually done

| Activity | Result |
|---|---|
| Manual code review of auth, authorization, uploads, file serving, money paths, SQL | Findings below |
| `npm audit` (production + dev dependencies) | **0 vulnerabilities** at delivery (Next 16.4.6, Zod 4.6.7 — both upgraded for advisories) |
| TypeScript strict + ESLint | clean |
| Automated tests (82) incl. RLS with a non-superuser role and authorization/IDOR cases | passing |
| HTTP smoke test against a production build (18 checks) incl. headers, auth redirects, private file denial, webhook and job-secret rejection | passing |
| Threat review of each trust boundary (`docs/architecture/overview.md`) | documented |

**Not performed:** independent penetration test, DAST scanner run, social engineering, load testing,
binary analysis, cloud configuration review (there is no cloud deployment).

## 2. Controls implemented

| Area | Control |
|---|---|
| Passwords | scrypt (N=16384, r=8, p=1, 64-byte key), per-password salt, parameters stored with the hash, constant-time comparison, policy (≥10 chars, letter+digit, common-password reject), fake verification for unknown accounts to reduce timing enumeration |
| Sessions | 32 random bytes, only SHA-256 hash stored, `httpOnly` + `SameSite=Lax` + `Secure` in production, expiry (720 h default), revocation on logout/deletion, no session data in the URL |
| Brute force | DB-backed fixed-window rate limits on login (email+IP), registration, OTP request/verify, contact; account lockout after 8 failures (15 min) |
| OTP | 6 digits, HMAC-keyed hash at rest, 10-minute expiry, max 5 attempts, previous codes invalidated, rate limited per user and IP |
| MFA | TOTP (RFC 6238, SHA-1/6 digits/30 s, ±1 step) for administrators; session records `mfa_verified_at`; sensitive admin mutations require a recent check when enforcement is on |
| Authorization | `requireUser` / `requireRole` guards on every area; service-layer ownership predicates (`user_id = $1`) on bills, documents, donations, receipts; no client-supplied owner id is trusted |
| RLS | 72 policies on all user data; `anon` sees only the public view; append-only tables have no update/delete privilege for `authenticated`; tests run as a non-superuser role |
| SQL injection | Parameterised queries only, static identifiers, no string-built WHERE clauses; `LIKE`/regex not fed by user input |
| XSS | React escaping, no `dangerouslySetInnerHTML`, nonce-based CSP (`script-src 'self' 'nonce-…' 'strict-dynamic'`), `object-src 'none'`, `base-uri 'self'`, `frame-ancestors 'none'`, `nosniff` |
| CSRF | Mutations only via Server Actions (framework origin check) + `SameSite=Lax` cookies; webhook uses HMAC instead of a session |
| File upload | Magic-byte sniffing (JPEG/PNG/PDF only), declared MIME cross-check, size cap (8 MB), minimum/maximum dimensions, PDF parse check, SVG/HTML/executables rejected, random UUID keys, no original filename, private storage, `nosniff` on delivery |
| File access | HMAC-signed short-lived token (5 min) **and** an owner session; admin access is audited; `no-store`; no directory listing; path traversal blocked in the storage adapter |
| IDOR | Ownership enforced in SQL and verified by tests (bills, donations, receipts, documents) |
| Money integrity | Integer centimes, row locks, triggers, CHECK constraints, idempotency keys, append-only ledgers, reconciliation job |
| AI/OCR | External processing disabled by default; strict schema; no tool access; prompt-injection-resistant parser; simulated data explicitly flagged |
| Secrets | `.env*` ignored, `.env.example` placeholders only, no secret in client bundles, audit payloads redacted by key pattern, OTP/codes never logged |
| Headers | CSP, HSTS (prod), `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`, COOP/CORP, `poweredByHeader: false` |
| Audit | `audit_logs` + `security_events`, immutable at trigger and privilege level, hashed IPs, no passwords/OTP/card data |
| Error handling | Dictionary-key messages to users; no stack traces or SQL text in responses; unexpected errors logged server-side |
| Production guards | Environment validation refuses to start with missing secrets, `DEMO_MODE=true`, `PAYMENTS_LIVE_ENABLED=true`, or `postgres` without `DATABASE_URL` |

## 3. Findings

### 3.1 Found and fixed during this build

| # | Finding | Severity | Status |
|---|---|---|---|
| F1 | `String(date).slice(0,10)` on `Date` objects produced invalid ISO dates, so every bill was classified `BILL_UNREADABLE` | High (functional, not exploitable) | Fixed (`isoDate()` helper), covered by integration tests |
| F2 | Fraud score was aggregated per beneficiary, so one duplicate could block unrelated future bills automatically | Medium (unfair denial) | Fixed: score scoped to the bill; account-level blocking requires an explicit, audited `risk_level` |
| F3 | Fund ledger constraint treated refunds as inflows | Medium (accounting) | Fixed by migration 012 |
| F4 | Duplicate-detection test collisions revealed fixtures sharing identical bytes | Low (test-only) | Fixed with unique nonces; duplicate tests use a shared nonce deliberately |
| F5 | `pdfjs` cleanup used `document.destroy()` which does not exist in v6, turning a successful extraction into a failure | High (functional) | Fixed: `loadingTask.destroy()` |
| F6 | Missing `standardFontDataUrl` caused warnings on font-less PDFs | Info | Left as-is: text extraction is unaffected; documented |

### 3.2 Residual risks accepted for the prototype

| # | Risk | Severity | Mitigation / next step |
|---|---|---|---|
| R1 | The app connects to PostgreSQL as the table owner, so **RLS is bypassed for application queries** | High if the app is compromised | Server-side authorization is implemented and tested; RLS protects the anon/authenticated surface. Production should use a role without `BYPASSRLS` where possible and keep RLS as a second layer |
| R2 | No antivirus/malware scanner on uploads | Medium | Add a scanning service before public launch; `scan_status` field is ready |
| R3 | Documents stored unencrypted at rest (local disk) | Medium | Use encrypted volumes or object storage with SSE; envelope encryption is not implemented |
| R4 | No SMS/email provider, so OTP cannot be delivered in production | High (availability) | Configure a provider before launch; registration is otherwise blocked outside demo mode |
| R5 | Demo mode allows admin mutations without TOTP | Medium | `DEMO_MODE` is rejected in production by environment validation; production requires MFA for admin actions |
| R6 | `style-src 'unsafe-inline'` is required by the current Tailwind/Next setup | Low | Migrate to nonce/hash-based styles or drop inline styles |
| R7 | Rate limiting is per instance database, no distributed cache | Low | PostgreSQL-backed counters are already shared; add alerting on spikes |
| R8 | No independent security review | High for launch | Commission a penetration test and an ASVS-based review before public operation |
| R9 | Legal/privacy compliance not established | Critical for launch | See the legal readiness checklist; keep real payments disabled |
| R10 | No account recovery flow (password reset) | Medium (usability/support load) | Deliberately omitted rather than implemented insecurely; requires a verified channel |

## 4. OWASP Top 10 (2021) mapping

| Category | Status |
|---|---|
| A01 Broken access control | Guards + ownership predicates + RLS + tests (IDOR, cross-household, admin) |
| A02 Cryptographic failures | scrypt, HMAC-SHA256 tokens, TLS assumed at the proxy, HSTS; no encryption at rest yet (R3) |
| A03 Injection | Parameterised SQL, Zod validation, no `eval`, CSP; prompt injection treated as data |
| A04 Insecure design | Threat model, no manual approval path, append-only money, explicit demo gates |
| A05 Security misconfiguration | Fail-closed env validation, security headers, `poweredByHeader: false`, no default admin password |
| A06 Vulnerable components | `npm audit` clean; Next/Zod upgraded for published advisories; CI runs the audit |
| A07 Identification/auth failures | Lockout, rate limits, OTP limits, MFA for admins, session revocation; no account recovery yet |
| A08 Software/data integrity | Lockfile, checksum-verified migrations, immutable financial records |
| A09 Logging/monitoring failures | Audit + security events; no external SIEM/alerting integration yet |
| A10 SSRF | Only the OCR adapter performs outbound requests, and only to a configured URL when explicitly enabled; no user-supplied URL is fetched |

## 5. Claims explicitly not made

- No penetration test was performed.
- No “certified”, “ASVS level N”, or “ISO 27001” compliance is claimed.
- No real payment security (PCI DSS) scope exists because no card data is ever handled; the demo provider
  does not process cards.
- No legal or regulatory compliance is claimed (see legal checklist).
