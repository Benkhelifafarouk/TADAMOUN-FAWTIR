# Data processing inventory

> Working record for the operator and counsel. Not a substitute for a formal register declared to the
> ANPDP. Processing is **not** declared yet — see `docs/legal/legal-readiness-checklist.md`.

| # | Processing | Data subjects | Data categories | Purpose | Basis (provisional) | Recipients | Transfer abroad | Retention |
|---|---|---|---|---|---|---|---|---|
| 1 | Account creation & authentication | beneficiaries, donors, staff | name, e-mail, phone, password hash, locale, sessions, OTP hashes, IP hash, user agent | provide a secure account | consent + contract | hosting | none configured | account life + 30 days |
| 2 | Phone verification | beneficiaries, donors | phone, OTP hash, attempts | prevent abuse, confirm reachability | contract | SMS provider (none configured) | none | OTP 24 h |
| 3 | Household profile | beneficiaries | wilaya, municipality, address, household size, children count, declared income, housing | assess eligibility | consent; possibly sensitive → counsel review | hosting | none | active + archive |
| 4 | Bill submission & OCR | beneficiaries | bill file, extracted fields, account number hash, consumption, confidences | verify the request | contract | OCR provider only if explicitly enabled | none by default | 12 months after decision (target) |
| 5 | Additional documents | beneficiaries | family-status / income / residence documents | resolve a specific verification doubt | consent; potentially sensitive | hosting | none | 12 months after decision (target) |
| 6 | Automated eligibility decision | beneficiaries | verification evidence, reasons, amounts, rule version | fair, explainable decision | contract + legal obligation (accountability) | hosting | none | 5 years, immutable |
| 7 | Appeals | beneficiaries | message, evidence, outcome | remedy | contract | hosting | none | 5 years |
| 8 | Anonymised publication | beneficiaries (anonymised) | wilaya, service, amounts, generic description | allow donations | consent | public (view) | n/a | until expiry + history |
| 9 | Donations & receipts | donors | name, e-mail, amount, state, allocation, receipt number | process and evidence donations | contract + accounting obligation | payment provider (demo) | none | legal accounting period |
| 10 | Solidarity fund | donors (aggregated) | contribution amounts, allocation reasons | pool and allocate funds | contract | public aggregates | n/a | permanent (aggregated) |
| 11 | Notifications | all users | event, parameters, read state | inform users | contract | e-mail/SMS provider (none) | none | 12 months (target) |
| 12 | Support tickets | users, visitors | subject, message, contact e-mail | support | consent/contract | hosting | none | 24 months (target) |
| 13 | Security monitoring | all users, visitors | event type, severity, hashed IP, route, details | detect and investigate abuse | legitimate interest / legal obligation | hosting, SIEM (none) | none | 12 months (target) |
| 14 | Audit trail | staff, users (actions) | actor, action, entity, before/after (redacted), IP hash | accountability, financial integrity | legal obligation | hosting | none | 24 months (target) |
| 15 | Fraud signals | beneficiaries | duplicate indicators, risk score, resolution | prevent fraud and abuse | legitimate interest | hosting | none | with verification evidence |
| 16 | Rate limiting | all | hashed identifier, window, count | protect the service | legitimate interest | hosting | none | 48 h |

## Sensitive-data assessment

Household income evidence, family-status documents and social-status documents may reveal social
difficulties and family situation. Under Law 18-07, sensitive data is prohibited in principle and
permitted only under narrow conditions (express consent where legally allowed, indispensable public
interest, or ANPDP authorisation). **This must be resolved with counsel before collecting such documents
at scale.** Mitigations already in place: collection only when necessary, private storage, short-lived
access links, audit of administrative access, and no publication of the documents.

## External processors

| Processor | Status | Contract | Transfer | Notes |
|---|---|---|---|---|
| Hosting | not selected | required | depends on region | must document security measures |
| Payment provider | demo (internal) | n/a | n/a | real PSP agreement required |
| OCR/AI provider | disabled | required before enabling | likely abroad | privacy assessment first |
| SMS/e-mail provider | none | required | likely abroad | OTP cannot be delivered without it |
| Antivirus scanner | none | required | n/a | documented gap |

## Data minimisation decisions

- No national ID number is collected.
- No original filename is stored (path cannot leak a name).
- Account numbers are stored as a keyed hash + last 4 digits only.
- IP addresses are stored as a keyed hash.
- Public views exclude every identity and document field (asserted by a test).
