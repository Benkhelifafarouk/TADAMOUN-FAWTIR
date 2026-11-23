# HTTP routes and server actions

All mutations are **Server Actions** (`'use server'`), not REST endpoints, so the CSRF surface is the
framework's origin-checked action POST rather than a custom token. Reads happen in Server Components.

## 1. HTTP routes

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `GET` | `/` | public | 307 → `/ar` (locale detection) |
| `GET` | `/api/health` | public | DB connectivity, migration count, demo/payment flags |
| `GET` | `/api/files/[id]?token=…` | session + HMAC token | Streams a private document; `no-store`, `nosniff`, sandbox CSP |
| `POST` | `/api/internal/jobs/tick` | `x-jobs-secret` | Claims and runs due jobs (cron/worker) |
| `POST` | `/api/webhooks/payments/[provider]` | HMAC signature | Records a payment event (deduplicated, never captures money) |

### Health

```json
{ "status": "ok", "database": "pglite", "migrations": 12,
  "demoMode": true, "paymentsLive": false, "latencyMs": 3 }
```

### Private file

`token` = `base64url(JSON{k,u,e}) + "." + HMAC-SHA256(body, FILE_SIGNING_SECRET)`.
The route verifies: valid signature, not expired, `k` matches the stored key, `u` matches the owner,
and a session exists for that owner. An administrator may read another user's document, and that access
is written to `audit_logs` (`document.accessed_by_admin`). Failure modes: 403 invalid/expired,
401 unauthenticated, 404 missing, 500 storage unavailable.

### Webhook

```http
POST /api/webhooks/payments/demo
x-signature: <hex hmac-sha256(rawBody, APP_SECRET + ":webhook:demo")>
content-type: application/json

{"id":"evt_123","type":"payment.captured","donationId":"…","transactionId":"…"}
```

- Unsupported provider → 404.
- Invalid signature → 401 + `payment.webhook.invalid_signature` (high).
- Duplicate `(provider, external_event_id)` → 200, no duplicate row.
- The handler only records the event (`processed_at` set, payload marked `recorded_not_captured`).
  Capture happens in the authenticated checkout action, so a forged callback cannot mark a donation paid.
  A real PSP integration must replace this with the provider's documented signature scheme and a
  capture/reconciliation flow.

## 2. Server actions

Every action returns `ActionState` (`{ ok, message?, fieldErrors?, data? }`) where `message` and field
errors are **dictionary keys**, never raw text. All inputs pass a Zod schema.

### Authentication — `lib/actions/auth.ts`

| Action | Guard / limits | Effect |
|---|---|---|
| `registerAction` | 8/hour per hashed IP; password policy | user + role + consents + optional donor profile; session; redirect to `/verify-phone` |
| `loginAction` | 10/15 min per email+IP; lock after 8 failures (15 min); constant-time fake verify for unknown accounts | session + last_login; redirect by role |
| `logoutAction` | session | revokes the session, clears cookie |
| `sendPhoneOtpAction` | 3/hour per user + 10/hour per IP | invalidates prior codes, stores keyed hash, returns code only in demo mode |
| `verifyPhoneOtpAction` | 10/15 min per user | attempt-limited comparison; marks phone verified; audit |

### Beneficiary — `lib/actions/beneficiary.ts`

| Action | Guard | Effect |
|---|---|---|
| `saveHouseholdProfileAction` | authenticated | upserts profile + household + eligibility snapshot, validates wilaya/municipality consistency |
| `uploadBillAction` | beneficiary + verified phone | full bill pipeline, returns decision |
| `uploadDocumentAction` | authenticated | private file, fulfils a document request, re-evaluates |
| `submitAppealAction` | authenticated + decision owner | new app engine decision; original preserved |
| `markNotificationsReadAction` | authenticated | sets `read_at` |
| `updateConsentAction` | authenticated | appends a consent record |
| `requestDeletionAction` | authenticated | status `pending_deletion`, revokes sessions, ends session |

### Donor — `lib/actions/donor.ts`

| Action | Guard | Effect |
|---|---|---|
| `createDonationAction` | authenticated | resolves request by **public reference**, validates amount/remaining, creates pending donation, redirects to checkout |
| `confirmDemoPaymentAction` | donation owner | atomic capture + allocation + receipt |
| `cancelDonationAction` | donation owner | pending → cancelled |

### Administration — `lib/actions/admin.ts`, `lib/actions/admin-finance.ts`

| Action | Guard | Notes |
|---|---|---|
| `updateUserStatusAction` | admin | suspend/activate, requires a reason, cannot target self, audited |
| `updateSettingAction` | admin | JSON value validation, security event |
| `addMunicipalityAction`, `addProviderAction`, `toggleProviderAction` | admin | catalogue/geography |
| `createRuleVersionAction` | admin | deactivates previous version, inserts a new one from the form |
| `savePolicyAction` | admin | new policy version + 3 tiers, deactivates the old one |
| `markFraudSignalAction` | admin | reviewed/dismissed; **does not** change decisions |
| `markRequestPaidAction` | admin | funded → paid with provider reference, audited |
| `allocateFundAction` | admin | FIFO fund allocation, reason required |
| `refundDonationAction` | admin | unallocated only, reason required |
| `resolveTicketAction` | admin/support | ticket status |
| `enrollMfaAction` / `confirmMfaAction` / `disableMfaAction` | admin | TOTP secret, verification, session MFA timestamp |
| `runJobsAction` | admin | runs due jobs, security event |
| `contactAction` | public (rate limited 5/h) | support ticket |

There is **no** action that approves an ordinary application, and a database trigger refuses to publish
a request whose decision is not `APPROVED`.

## 3. Pages (server-rendered)

```
/{ar|fr}                     home
/{locale}/requests           browse (filters: wilaya, service, sort)
/{locale}/requests/[ref]     detail (anonymised only)
/{locale}/requests/[ref]/donate
/{locale}/transparency | /about | /how-it-works | /contact
/{locale}/legal/privacy | /legal/terms
/{locale}/login | /register | /verify-phone
/{locale}/app                beneficiary dashboard
/{locale}/app/profile | /bills | /bills/new | /bills/[id]
/{locale}/app/requests | /documents | /notifications | /settings
/{locale}/app/appeals/[decisionId]
/{locale}/donor              donor dashboard + fund contribution
/{locale}/donor/donations | /donations/[id] | /checkout/[id] | /receipts/[id]
/{locale}/admin              dashboard
/{locale}/admin/users | /moderation | /finance | /rules | /config | /system | /support | /settings
```

Access rules: `/app` requires the `beneficiary` role; `/donor` requires `donor`, `beneficiary` or
`admin`; `/admin` requires `admin` or `support`, with mutations restricted to `admin`.
Unauthenticated requests are redirected to `/{locale}/login`.
