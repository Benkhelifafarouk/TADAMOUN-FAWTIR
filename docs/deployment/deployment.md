# Deployment

## 1. Environments

| Environment | Database | Payments | OCR | Purpose |
|---|---|---|---|---|
| Local dev | PGlite file | demo | pdf-text + demo images | build and demo |
| CI | PGlite in-memory | demo | pdf-text | tests |
| Staging | PostgreSQL | demo | pdf-text (demo images allowed) | rehearsal, smoke, provider integration tests |
| Production | PostgreSQL (Supabase or managed) | **disabled** until legal/PSP sign-off | real provider if approved | public service |

## 2. Prerequisites

- Node.js ≥ 20.11 (tested on 24), npm.
- A PostgreSQL 15+ database (Supabase compatible) for staging/production.
- A persistent volume for private files (`LOCAL_STORAGE_DIR`), or an object-storage adapter (not shipped).
- TLS termination at a reverse proxy or platform (HSTS is sent in production).
- A scheduler for jobs (cron / platform cron / worker process).

## 3. Environment variables

Required in production (validation fails closed):

| Variable | Notes |
|---|---|
| `NODE_ENV=production` | enables strict checks and HSTS |
| `APP_URL` | public origin, no trailing slash |
| `APP_SECRET` | ≥24 chars, 48 random bytes recommended; rotates sessions/tokens |
| `FILE_SIGNING_SECRET` | ≥24 chars, separate from `APP_SECRET` |
| `JOBS_TICK_SECRET` | shared secret for the job endpoint |
| `DATABASE_DRIVER=postgres` | `DATABASE_URL` required |
| `DATABASE_URL` | pooled connection string for the app; use a direct/session connection for migrations |
| `DATABASE_SSL=true` | managed databases |
| `DEMO_MODE=false` | enforced |
| `PAYMENTS_LIVE_ENABLED=false` | `true` is **rejected** by design |
| `PUBLIC_DONATIONS_ENABLED` | `false` until legal + PSP sign-off |
| `AUTO_MIGRATE=false` | migrations are an explicit deploy step |
| `STORAGE_DRIVER=local` + `LOCAL_STORAGE_DIR` | persistent volume |
| `PAYMENT_PROVIDER=demo` | only supported provider |
| `OCR_PROVIDER` | `demo` (local) or `http` with credentials + `EXTERNAL_AI_PROCESSING_ENABLED` |
| `EMAIL_PROVIDER`/`SMS_PROVIDER` | `none` until contracted; **OTP cannot be delivered otherwise** |

Generate secrets:

```bash
node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"
```

## 4. Deployment steps

```bash
npm ci
npm run typecheck && npm run lint && npm test
DATABASE_DRIVER=postgres DATABASE_URL=... npm run db:migrate     # explicit, before start
DATABASE_DRIVER=postgres DATABASE_URL=... npm run db:seed        # reference data only
npm run build
npm start                                                        # or a process manager
```

Do **not** run `db:demo` in production (it refuses when `DEMO_MODE=false`). Do not run `db:reset`.

## 5. Migrations

- `database/migrations/*.sql` are applied in filename order inside a transaction; a checksum mismatch
  aborts the deploy (no silent drift).
- Apply before starting the new version. The schema is additive; no destructive migration exists.
- Rollback: restore the previous application version. Do not reverse a migration in place; add a new one.

## 6. Storage

- `LOCAL_STORAGE_DIR` must be a persistent, backed-up volume, **outside** the web root, mounted only in
  the app container.
- Keys are `bucket/YYYY/MM/uuid.ext`; files are never served statically.
- Back up the volume together with the database so signed links and rows stay consistent.

## 7. Jobs

Two supported patterns:

```bash
# long-running worker
npm run worker
# or external scheduler every minute
curl -X POST https://app.example/api/internal/jobs/tick -H "x-jobs-secret: $JOBS_TICK_SECRET"
```

Jobs: `evaluate_bill`, `deliver_notifications`, `expire_requests`, `reconcile_fund`, `cleanup`.
Retries use a linear backoff; after `max_attempts` the job becomes `dead` (visible in `/admin/system`).

## 8. Health and monitoring

- `GET /api/health` → 200 with migration count, or 503 when the database is unavailable.
- Alert on: `security_events.severity in ('critical','high')`, `jobs.status='dead'`,
  `finance.fund_reconciliation_mismatch`, HTTP 5xx rate, disk usage of the storage volume.
- Logs are JSON-friendly but contain no document content, OTP codes or passwords.

## 9. Supabase specifics

1. Create the project and choose a region (assess cross-border transfer first).
2. Run migrations with the direct/session connection (port 5432 or the session pooler).
3. Set `DATABASE_URL` to the pooled connection for the app.
4. RLS policies are already created by migration 009; `anon` and `authenticated` roles exist on Supabase.
5. Auth is first-party: do **not** enable Supabase Auth for this app unless you migrate the session
   model. Storage is first-party too; configure a volume or write an adapter.

## 10. Production checklist

- [ ] All secrets set, none committed; `npm audit` clean.
- [ ] `DEMO_MODE=false`, `PAYMENTS_LIVE_ENABLED=false`, `PUBLIC_DONATIONS_ENABLED=false` (until approved).
- [ ] Migrations applied and `db:status` shows zero pending.
- [ ] Backups scheduled and **restore tested**.
- [ ] Worker or cron active; `/admin/system` shows no dead jobs.
- [ ] Security headers verified (CSP nonce present, HSTS, no `X-Powered-By`).
- [ ] Private file route returns 403 without a token and 401 without a session.
- [ ] Legal go-live gate satisfied (`docs/legal/legal-readiness-checklist.md`).
- [ ] Incident response roles named and on-call rota published.

## 11. Rollback

1. Stop traffic / put the app in maintenance.
2. Restore the previous application build.
3. If a migration must be undone, write a new forward migration; never edit an applied file.
4. Restore the database snapshot only if data corruption occurred; keep the corrupt snapshot for
   analysis and document the incident.
