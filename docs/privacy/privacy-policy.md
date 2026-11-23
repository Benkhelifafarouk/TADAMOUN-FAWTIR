# Privacy policy — DRAFT

> **DRAFT — NOT LEGAL ADVICE.** This text has not been reviewed by a qualified Algerian lawyer and must
> not be published as the final notice. It is a starting point for review against Law 18-07 of 10 June
> 2018 and any applicable implementing texts. See `docs/legal/legal-readiness-checklist.md`.

**Version:** 2026-11-draft · **Applies to:** the TADAMOUN FAWTIR platform (the “platform”).
**Data controller:** _to be completed_ (legal name, address, registration, contact).
**Contact for data protection:** _to be completed_ (dedicated address, not a personal mailbox).

## 1. Purpose of the processing

The platform allows a household to submit a utility bill privately, have its eligibility assessed by an
automated rules engine, and — if approved — have an anonymised assistance request published so that
donors can contribute to paying that bill. Donors never receive the identity of a beneficiary.

## 2. Data we collect

| Category | Examples | Why |
|---|---|---|
| Account data | name, e-mail, phone number, password hash, preferred language | create and secure the account, contact the user |
| Household data | wilaya, municipality, address (private), household size, number of children, declared income, housing status | assess eligibility with published rules |
| Bills and documents | bill image/PDF, extracted fields, family-status or income documents requested to resolve a specific doubt | verify the request; verify only what is needed |
| Verification data | OCR confidence, duplicate signals, fraud indicators, decision reasons, appeals | make and explain an automated decision; prevent fraud |
| Donation data | donation amount, state, allocation, receipts, provider reference | process and trace donations |
| Technical data | hashed IP address, user agent, session identifiers, security events | security, abuse prevention, audit |
| Consent records | policy version, date, language, granted/withdrawn | demonstrate compliance |

We do **not** collect national identity numbers, bank card numbers, CVVs or payment credentials. The
platform never stores card data: the demo provider does not process cards, and a future integration must
use a provider-hosted page or approved tokenisation.

## 3. Legal basis

- **Consent** (Law 18-07, art. 7): account creation, privacy notice, optional processing.
- **Performance of the service** requested by the user: assessing a bill, publishing an anonymised
  request, issuing a donation receipt.
- **Legal obligations**: retention of financial records, response to lawful requests.

Consent can be withdrawn at any time from the account settings; withdrawal does not affect processing
already carried out. Some processing (financial records) cannot be erased on demand because of legal
retention duties.

## 4. What is published

Only an anonymised projection is public: public reference, wilaya (and municipality only if explicitly
enabled), service category, eligible amount, funded amount, remaining amount, publication date and a
generic description (household size band, service, wilaya). It contains **no** name, phone number,
address, account number, bill reference, file link, OCR text or identity document.

Original bills are never used as public images. If a visual is ever needed, it must be a separate,
inspected and redacted image.

## 5. Recipients and transfers

| Recipient | Data | Notes |
|---|---|---|
| Hosting provider | all platform data | _to be selected_; must offer appropriate safeguards |
| Payment provider | donation amount, reference | demo only today; a licensed PSP is required for real payments |
| OCR/AI provider | bill image/text | **disabled by default**; enabling requires a privacy assessment |
| Utility providers | minimum settlement data | only what is necessary to pay the bill |
| Authorities | as legally required | with a written request |

No sale of personal data, no advertising, no profiling for marketing.

**Cross-border transfers:** not configured in this deployment. If hosting or an external OCR provider is
located outside Algeria, the transfer must be assessed and, where required, authorised by the ANPDP
before any data leaves the country. This is an open legal question (see the checklist).

## 6. Retention

See `docs/privacy/retention-policy.md`. In short: account and household data while the account is active
and then for the period required by law; bills and private documents only as long as necessary for
verification and dispute handling; financial records for the legal accounting period; technical logs for
a limited security period; OTP codes for minutes.

## 7. Security

Private documents are stored outside the public web root, served only through short-lived signed links
bound to the owner’s session, and accessed by administrators only with an audit record. Passwords are
hashed with scrypt. Sessions are opaque, httpOnly and revocable. Access to data is restricted by role and
enforced at the application and database levels. See `docs/security/security-assessment.md`.

No system is perfectly secure. If you believe your data has been compromised, contact the address above.

## 8. Your rights

Subject to the conditions of Law 18-07: information, access, rectification, objection, and deletion of
your account. Requests are recorded and handled within the period required by law. You may also lodge a
complaint with the ANPDP (_procedure to be confirmed with counsel_).

Deletion: the account is deactivated immediately and its private documents are scheduled for deletion.
Financial records (donations, allocations, receipts) may be retained for the legal period, without
unnecessary identity data.

## 9. Cookies

Only one essential cookie is used: the session cookie (`tf_session`), httpOnly, SameSite=Lax, Secure in
production. No analytics, advertising or third-party tracking cookies are set. A cookie banner is
therefore not required for the current build, but this must be confirmed by counsel if analytics are
added.

## 10. Children

The platform is intended for adults representing a household. It does not knowingly create accounts for
minors. Household composition may include children’s ages/relations, which are private and never
published individually.

## 11. Changes

A new version is published with a new version identifier; material changes require a new consent record.
The current version is stored with each consent.

## 12. Open points for legal review

1. Whether the processing requires a **prior declaration** or an **authorisation** from the ANPDP.
2. The lawful basis for processing household income and family documents (potentially sensitive).
3. Retention periods for verification evidence and rejected applications.
4. Cross-border hosting/OCR transfer conditions.
5. The exact identity and registration of the controller.
6. Whether a cookie banner is required for the session cookie alone.
