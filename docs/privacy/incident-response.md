# Incident response procedure

> Operational draft. Legal notification duties must be confirmed by counsel; this document does not
> assert that any notification is legally required or sufficient.

## 1. Roles

| Role | Responsibility | Assigned to |
|---|---|---|
| Incident lead | coordinates, decides severity, communicates | _to be named_ |
| Technical responder | contains, preserves evidence, fixes | _to be named_ |
| Data protection contact | assesses personal-data impact, prepares notifications | _to be named_ |
| Communications | user/Public messaging | _to be named_ |

## 2. Severity

| Level | Example | Target response |
|---|---|---|
| **SEV1 — Critical** | confirmed personal-data breach, fund ledger mismatch, admin account compromise, payments enabled by mistake | immediate, all hands |
| **SEV2 — High** | repeated unauthorized access attempts succeeding partially, document link leak, mass duplicate fraud, worker outage > 2 h | < 1 h |
| **SEV3 — Medium** | OCR provider outage, notification backlog, isolated abuse | < 1 day |
| **SEV4 — Low** | single failed login burst, cosmetic security header regression | next working day |

## 3. Detection sources

- `security_events` (`high`/`critical` severity), especially: `finance.fund_reconciliation_mismatch`,
  `document.token_mismatch`, `payment.webhook.invalid_signature`, `auth.login.locked`,
  `donation.overfund_attempt`, `admin.*`.
- `audit_logs` anomalies (unexpected administrative action).
- `/api/health` failing or job `dead` rows.
- User reports via support tickets.

## 4. Procedure

1. **Triage** — confirm it is real, assign severity, open an incident note with timestamps (UTC).
2. **Contain** — revoke sessions (`revokeAllSessions`), suspend the account, disable the affected
   integration (`OCR_PROVIDER=http` → `demo`, `PAYMENTS_LIVE_ENABLED` stays false), rotate secrets
   (`APP_SECRET` invalidates sessions and tokens).
3. **Preserve evidence** — export `security_events`, `audit_logs`, relevant rows; do not edit
   append-only tables; keep the database backup taken before remediation.
4. **Assess impact** — which data categories, how many people, whether documents or financial records
   were exposed; use the data inventory to map recipients.
5. **Remediate** — fix, add a regression test, re-run `npm run verify` and the smoke test.
6. **Notify** — the data protection contact decides, with counsel, whether the ANPDP and/or data
   subjects must be informed, and in what timeframe. Do not promise a notification that has not been
   legally validated.
7. **Recover** — restore service, verify reconciliation, monitor for 72 h.
8. **Post-mortem** — blameless, within 5 working days; actions tracked with owners and dates.

## 5. Specific playbooks

### Fund or request reconciliation mismatch
- Do not “fix” balances by editing ledgers (they are append-only).
- Freeze allocations (`fund.auto_allocate` is already false), export the ledger and allocations, identify
  the first divergent row, and reconcile against provider statements.
- Add a correction entry only with a documented reason and dual approval.

### Leaked signed document link
- Links expire in 5 minutes and are bound to the owner session; if a session is suspected compromised,
  revoke it (`sessions.revoked_at`), rotate `FILE_SIGNING_SECRET` (invalidates all links), audit access
  logs for `document.token_mismatch` / `document.accessed_by_admin`.

### Suspicious donation pattern
- Review `donations`, `payment_events`, `security_events`; suspend the account if needed; never delete
  financial rows.

## 6. Contacts and legal references

- Technical: _to be completed_
- Data protection: _to be completed_
- ANPDP notification procedure: _to be confirmed with counsel_ (Law 18-07)

## 7. Evidence handling

- Keep original logs and database snapshots read-only.
- Record every action in the incident note (who, when, what command).
- Never place personal documents in the incident note; reference their identifiers.
