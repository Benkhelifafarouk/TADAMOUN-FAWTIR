# Legal readiness checklist — Algeria

> **Not legal advice.** This is an engineering readiness tracker. Statuses reflect what the codebase
> does and what still requires a qualified Algerian lawyer, the ANPDP, a licensed payment provider or
> the utility companies. Sources are listed at the end; the sourced brief is
> [`algeria-legal-research.md`](algeria-legal-research.md).

## 1. Status summary

| Area | Status | What exists in the code | What is missing |
|---|---|---|---|
| Privacy notice | **DRAFT** | `/legal/privacy`, versioned consent records | Counsel review, controller identity, final wording |
| Terms of service | **DRAFT** | `/legal/terms` | Counsel review, liability, dispute clause |
| Law 18-07 declaration/authorisation | **BLOCKED** | Data inventory, retention schedule, security measures | ANPDP filing, receipt/authorisation |
| Sensitive data (income, family docs) | **BLOCKED** | Minimisation, private storage, audit | Legal basis confirmation / ANPDP authorisation |
| Cross-border transfers | **BLOCKED (not configured)** | No external OCR/hosting configured | Hosting region decision + transfer assessment |
| Data subject rights process | **PARTIAL** | Access/correction/deletion request path, audit | Formal procedure and legal deadlines |
| Retention enforcement | **PARTIAL** | Schedule documented, some cleanup jobs | Automated purge of documents/logs |
| Cookie policy | **N/A (one essential cookie)** | Session cookie only, no trackers | Confirm with counsel if analytics added |
| Charitable collection / fundraising | **BLOCKED** | Donation flow is demo-only | Confirmation of legal vehicle and authorisations |
| Association requirement | **DELIBERATELY ABSENT** | No associations, no partner accounts | Counsel to confirm an individual/company may operate without an accredited association |
| Payment services | **BLOCKED** | Demo provider only, `PAYMENTS_LIVE_ENABLED` rejected | Licensed PSP agreement, CIB/Edahabia onboarding |
| Tax / receipts | **BLOCKED** | DEMO receipts marked non-accounting | DGI rules, receipt format, accounting treatment |
| Provider settlement | **BLOCKED** | Payout recorded manually with a reference | Agreements with Sonelgaz/ADE/ISPs, reconciliation process |
| Incident response | **DRAFT** | Procedure, security events, audit | Named roles, ANPDP notification procedure |
| Independent security review | **NOT DONE** | Internal review + tests | External penetration test / ASVS review |

## 2. Applicable requirements and open questions

### 2.1 Personal data — Law 18-07 (10 June 2018)

Verified points from the Official Journal (see sources):

- **Consent** must be express and withdrawable (art. 7). The platform records versioned consent at
  registration and exposes withdrawal; wording still needs review.
- **Prior declaration or authorisation**: every processing operation must be declared to, or authorised
  by, the ANPDP *before* processing starts (arts. 12–14), including purposes, recipients, retention and
  transfers. **Not filed.**
- **Sensitive data** is prohibited in principle (art. 18); income/family documents may fall in or near
  this category. Collection at scale needs a legal basis confirmed by counsel.
- **Retention** must not exceed the declared period (art. 9(e)); keeping data longer is punishable
  (art. 65). The schedule exists but automated purge is incomplete.
- **Security** measures must be proportionate (art. 38) and processors bound by contract (art. 39).
- **Authority**: ANPDP is operational (Presidential Decree 23-73); filing procedure must be confirmed.

**Ask counsel:** declaration vs authorisation regime for vulnerable-household data; current ANPDP
procedure and timeline; whether our consent wording is “express and informed”.

### 2.2 Cross-border transfers

The deployment currently performs **no** transfer: hosting is not chosen and external OCR is disabled.
If hosting or OCR is outside Algeria, a transfer assessment and (where required) ANPDP authorisation must
precede activation. **Do not enable `EXTERNAL_AI_PROCESSING_ENABLED` before this is resolved.**

### 2.3 Charitable collection and associations

The product deliberately has **no associations** (anti-favouritism requirement). The legal question is
whether a private platform may collect public donations for third-party bills without being an
accredited association or foundation, and what registrations/authorisations apply. Research found the
associations framework (Law 12-06) but **no verified text permitting an individual/company to run a
public donation platform**. **BLOCKED — counsel must confirm before any real collection.**

### 2.4 Payment services

Receiving card donations requires a licensed payment institution / PSP arrangement and Bank of Algeria
compliance; CIB/Edahabia acceptance goes through the authorised monétique scheme. The code contains no
card handling (no PAN/CVV storage, provider-hosted flow expected) and refuses to start with
`PAYMENTS_LIVE_ENABLED=true`. **BLOCKED — PSP agreement required.**

### 2.5 Tax, accounting and receipts

Donation deductibility, receipt format, VAT/accounting treatment and the exact retention period for
financial records were **not verified** from a primary DGI source. Current receipts are marked `DEMO` and
explicitly state they are not accounting documents. **PENDING — accountant + counsel.**

### 2.6 Paying third-party bills

Paying a utility bill on behalf of a household requires a lawful settlement mechanism and an agreement
with the utility/provider (or a payment intermediary). The platform currently records a manual payout
reference; it does not move money. **BLOCKED — provider agreements.**

## 3. Technical controls already supporting compliance

- Data minimisation (no national ID, hashed account numbers and IPs, no filenames).
- Private storage + short-lived signed access + audited admin access.
- Anonymised public projection asserted by tests (no identity columns).
- Versioned consent, immutable decisions, append-only financial and audit records.
- Deletion request path with session revocation.
- Environment validation that refuses demo mode or live payments in production.
- Documented retention schedule and data processing inventory.

## 4. Go-live gate (all must be true)

1. [ ] Counsel has approved privacy notice, terms, retention and the legal vehicle for donations.
2. [ ] ANPDP declaration/authorisation obtained (receipt on file).
3. [ ] Hosting region and any transfer assessed and authorised if required.
4. [ ] Licensed PSP agreement signed; webhook contract implemented and verified in staging.
5. [ ] Utility/provider settlement agreements signed and a reconciliation procedure tested.
6. [ ] Tax/receipt format confirmed by an accountant.
7. [ ] Independent penetration test completed; critical/high findings fixed and retested.
8. [ ] Automated retention purge implemented and verified.
9. [ ] SMS/e-mail provider contracted and OTP delivery tested.
10. [ ] Antivirus scanning enabled on uploads.
11. [ ] `DEMO_MODE=false`, `PAYMENTS_LIVE_ENABLED=true` only after 1–6, `PUBLIC_DONATIONS_ENABLED=true`.
12. [ ] Incident response roles named and tested with a table-top exercise.

## 5. Sources

- Law 18-07, *Journal Officiel* n° 34, 10 June 2018 —
  <https://www.joradp.dz/FTP/jo-francais/2018/F2018034.pdf>
- ANPDP official site (activity reports 2023–2025, 2024 decisions) — <https://www.anpdp.dz/>
- Presidential Decree 23-73, JO n° 10, 15 February 2023 —
  <https://www.joradp.dz/FTP/jo-francais/2023/F2023010.pdf>
- Additional sources, confidence levels and open questions: [`algeria-legal-research.md`](algeria-legal-research.md)

_Last reviewed: 23 November 2026. Re-verify before launch; legislation may have changed._
