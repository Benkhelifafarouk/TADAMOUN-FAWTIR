# Consent management

## 1. Consent types

| Type | When | Table value | Required? |
|---|---|---|---|
| Terms of service | registration | `terms` | yes |
| Privacy notice | registration | `privacy` | yes |
| Data processing (specific) | when a new purpose is introduced | `data_processing` | per purpose |
| Marketing | never used in this build | `marketing` | no |

The schema also supports `policy_version`, `locale`, `granted` and a hashed IP.

## 2. Recording

- Every consent is an **append-only row** in `consent_records`; withdrawal inserts a new row with
  `granted = false`. There is no update of a past consent.
- Registration writes `terms` and `privacy` with the current version (`2026-11-draft`) and the UI locale.
- The settings page exposes the current state and a checkbox to record a new decision per type.
- The current notice versions live in `platform_settings` (`privacy.policy_version`, `terms.version`).

## 3. Withdrawal and consequences

- Withdrawal is immediate for optional processing.
- Account deletion is a separate request (`requestDeletionAction`): it deactivates the account, revokes
  sessions and schedules deletion of private data, while financial records remain for the legal period.
- The UI explains what cannot be withdrawn (financial records) before confirming.

## 4. What is not consent

- Security processing (rate limiting, fraud signals, audit) relies on legitimate interest/legal
  obligation, not consent; the UI must not imply otherwise.
- Essential session cookies are not consent-based (no tracker).

## 5. Evidence and audit

`consent_records` rows are exported with the account data on request. A withdrawal is also reflected in
`audit_logs` (`consent.updated`) so that the sequence of decisions is reconstructable.

## 6. Gaps

- No consent-expiry/renewal reminder.
- A policy-version migration path (re-consent on material change) is designed but not automated.
- Consent wording must be reviewed by counsel (Law 18-07 art. 7 requires express, informed consent).
