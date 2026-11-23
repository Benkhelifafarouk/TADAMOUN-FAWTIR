# Retention policy — DRAFT

> **DRAFT — NOT LEGAL ADVICE.** Retention periods below are operational defaults; the legally binding
> periods must be confirmed by Algerian counsel and declared to the ANPDP (Law 18-07, art. 9(e), art. 14).

## 1. Principles

- Keep the minimum necessary for the declared purpose.
- Never keep private documents longer than the verification/dispute need.
- Financial records are kept for the legal accounting period, with identity minimised where possible.
- Deletion is executed, not just hidden; a scheduled job and an operator procedure exist.
- A deletion request is recorded in the audit trail.

## 2. Schedule

| Data | Purpose | Default retention | Enforcement today |
|---|---|---|---|
| Account (users) | service, security | while active + 30 days after deletion request, then anonymised | manual/operator; automated anonymisation not implemented |
| Household profile | eligibility | while active; archived on account deletion | profile status set to `suspended` |
| Bills (original files) | verification, dispute | 12 months after the decision, then deleted | **not automated yet** (gap) |
| Requested documents (family/income) | resolve a specific doubt | 12 months after decision, then deleted | **not automated yet** (gap) |
| OCR results / verification evidence | explain a decision, appeals | 24 months (decision traceability) | not automated |
| Eligibility decisions + reasons | fairness audit, appeals | 5 years (immutable) | append-only, no deletion |
| Donations, allocations, receipts | accounting, audit | legal accounting period (to be confirmed; do not delete before) | append-only |
| Fund ledger | accounting | permanent (aggregated, no personal data) | append-only |
| Audit logs | security, accountability | 24 months | not automated |
| Security events | security | 12 months | not automated |
| OTP codes | authentication | 24 hours, consumed or expired | delete job not implemented (rows are inert) |
| Sessions | authentication | until expiry/revocation (30 days max) | expires naturally |
| Notifications | user communication | 12 months | not automated |
| Support tickets | support, disputes | 24 months | not automated |
| Rate-limit counters | abuse prevention | 48 hours | cleanup job |
| Jobs | operations | 30 days after success | cleanup job |

## 3. Deletion workflow (implemented)

1. The user requests deletion from `/app/settings`.
2. `users.status = 'pending_deletion'`, beneficiary profile suspended, all sessions revoked, security
   event recorded.
3. The account can no longer authenticate.
4. An operator (or a future retention job) removes private files and anonymises identity fields, keeping
   only what is legally required (financial records referencing a pseudonymous id).

## 4. Known gaps

- No automated purge job for bills/documents/logs yet; the schedule is documented but only partially
  enforced (`cleanup` job covers rate limits and finished jobs).
- Anonymisation of a deleted user's financial references is manual.
- The legal accounting period for donations in Algeria has not been confirmed by counsel.

## 5. Backups

Backups inherit the same retention and must be deleted on the same schedule. A backup restore must not
resurrect data whose retention period has expired (documented procedure in the operations runbook).
