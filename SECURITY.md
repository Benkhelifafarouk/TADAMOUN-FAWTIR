# Security policy

## Reporting a vulnerability

Do **not** open a public issue with reproduction steps for an unpatched vulnerability.

Contact: _security contact to be completed by the operator_ (dedicated mailbox, monitored).

Please include: affected component, version/commit, safe reproduction steps, impact, and any suggested
fix. You will receive an acknowledgement and a remediation plan. Do not test against real users' data,
production systems or third-party services without written authorisation.

## Scope

In scope: this repository and any deployment operated by the project owner.
Out of scope: real payment providers, utility providers, hosting providers, and any system you do not own.

## Known gaps (do not report as new)

- Image OCR is a labelled simulation when `DEMO_MODE=true`.
- No antivirus scanning on uploads.
- No encryption at rest for the local document volume.
- Demo mode relaxes the TOTP requirement for admin mutations (production mode does not).
- No account recovery / password reset flow.
- No independent penetration test has been performed; none is claimed.

See `docs/security/security-assessment.md` for the full assessment and residual risks.
