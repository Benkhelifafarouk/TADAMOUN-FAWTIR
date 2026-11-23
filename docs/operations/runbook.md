# Operations runbook

## 1. Routine checks

| Frequency | Check | Action if abnormal |
|---|---|---|
| Every 5 min | `GET /api/health` | 503 → database/storage incident |
| Hourly | `jobs` with `status='dead'` | inspect `last_error`, fix, re-enqueue |
| Daily | `security_events` severity high/critical | triage per incident response |
| Daily | `finance.fund_reconciliation_mismatch` | freeze allocations, investigate ledger |
| Daily | disk usage of `LOCAL_STORAGE_DIR` | expand volume / investigate orphan files |
| Weekly | `sessions` expiry vs active users | revoke stale sessions if needed |
| Weekly | backup integrity (test restore to staging) | fix backup pipeline |
| Monthly | dependency audit (`npm audit`) | patch and redeploy |

Useful SQL:

```sql
-- pending decisions
select count(*) from verification_requests where status in ('queued','processing');
-- documents waiting
select count(*) from document_requests where status = 'pending';
-- dead jobs
select id, type, attempts, last_error from jobs where status = 'dead' order by updated_at desc;
-- money snapshot
select (select coalesce(sum(amount_centimes),0) from donations where status='paid') as paid,
       (select coalesce(sum(amount_centimes),0) from donation_allocations) as allocated,
       (select balance_centimes from solidarity_fund) as fund;
-- recent security events
select event_type, severity, created_at, details from security_events
 order by created_at desc limit 50;
```

## 2. Troubleshooting

### A bill stays in "processing"
1. `select status, last_error from verification_requests where bill_id = …;`
2. `select provider, status, error_message from bill_ocr_results where bill_file_id = …;`
3. If the job is dead: `select * from jobs where payload->>'billId' = '…';`
4. Re-run: re-enqueue `evaluate_bill` from the admin console ("run jobs") or via the tick endpoint.
5. If OCR failed on a scanned PDF and `DEMO_MODE=false`, the beneficiary must upload a clearer copy; this
   is expected behaviour, not a bug.

### Notifications not delivered
- `in_app` notifications are marked `sent` by the `deliver_notifications` job; run the worker.
- `email`/`sms` fail with `provider_not_configured` — this is intentional until a provider is configured.

### Login problems
- Check `users.locked_until` and `failed_login_count`.
- Check `security_events` for `auth.login.rate_limited` / `auth.login.locked`.
- Unlock: `update users set failed_login_count = 0, locked_until = null where id = …;` (audited action).

### Beneficiary cannot upload
- Phone must be verified; profile must be complete (size + income).
- Provider/category mismatch is rejected by design.
- Check file size (8 MB), format (JPG/PNG/PDF) and image dimensions (≥200×200).

### Fund allocation refused
- `FUND_INSUFFICIENT_BALANCE`: balance is lower than the requested amount (or the ledger disagrees).
- `AMOUNT_EXCEEDS_REMAINING`: the request is already (partly) funded.
- Never edit `fund_ledger_entries`; it is append-only by trigger and privilege.

### Storage full
- Expand the volume; never move files into `public/`.
- Orphan files (rows deleted but file present) can be listed and removed manually; document the action.

## 3. Backup and restore

**What to back up:** the PostgreSQL database **and** `LOCAL_STORAGE_DIR` (they must be consistent), plus
environment secrets in the secret manager.

```bash
# PostgreSQL
pg_dump "$DATABASE_URL" --format=custom --file=tadamoun-$(date +%F).dump
# Storage (Linux)
tar -C "$LOCAL_STORAGE_DIR" -czf storage-$(date +%F).tar.gz .
```

Restore into staging first:

```bash
createdb tadamoun_restore
pg_restore --dbname=tadamoun_restore --clean --if-exists tadamoun-YYYY-MM-DD.dump
tar -C /srv/storage-restore -xzf storage-YYYY-MM-DD.tar.gz
```

Verification after restore:

```sql
select count(*) from schema_migrations;              -- expect 12
select * from public_platform_stats;                 -- plausible counters
select balance_centimes from solidarity_fund;        -- must equal sum of fund_ledger_entries
```

RPO/RTO are not defined yet; agree them with the operator before launch. Encrypt backups and apply the
retention schedule to them.

## 4. Secret rotation

| Secret | Effect | Procedure |
|---|---|---|
| `APP_SECRET` | invalidates OTP hashes, IP/phone hashes in logs, session tokens? (sessions use SHA-256 of the token, not the secret) | rotate with a maintenance window; phone hashes change (duplicate signals may reset) |
| `FILE_SIGNING_SECRET` | invalidates all signed document links | rotate freely; links are short-lived |
| `JOBS_TICK_SECRET` | invalidates the scheduler | update cron and app together |
| Database password | — | rotate in the provider, update `DATABASE_URL`, restart |

After any suspected compromise: revoke all sessions, rotate `FILE_SIGNING_SECRET`, review
`audit_logs`/`security_events`, follow `docs/privacy/incident-response.md`.

## 5. Account deletion request

1. Verify the request belongs to the account owner.
2. `update users set status = 'pending_deletion'` (already done by the action) and revoke sessions.
3. Delete private files for that user's `stored_files` rows after the retention checks; keep financial
   rows (they reference a pseudonymous id).
4. Record the operation in `audit_logs`.
5. Confirm to the user without disclosing other data.

## 6. Common commands

```bash
npm run db:status          # pending migrations
npm run verify             # typecheck + lint + tests
npm run build && npm run test:e2e
npm run worker             # job worker
curl -X POST $APP_URL/api/internal/jobs/tick -H "x-jobs-secret: $JOBS_TICK_SECRET"
```
