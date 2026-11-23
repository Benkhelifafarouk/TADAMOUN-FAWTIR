# Algeria — Legal Research Brief: Donation & Utility-Bill Payment Platform

**Purpose:** input to `legal-readiness-checklist.md`. **Not legal advice.** Sources checked 23 Nov 2026. Real money collection stays disabled until counsel signs off.

## 1. Personal data — Law 18-07 of 10 June 2018 · **Confidence: HIGH**

Verified from the Official Journal ([Law 18-07, JO n° 34, 10 June 2018](https://www.joradp.dz/FTP/jo-francais/2018/F2018034.pdf)):

- **Consent (art. 7):** processing "ne peut être effectué qu'avec le consentement exprès de la personne concernée", withdrawable at any time. Exemptions are narrow: legal obligation, vital interests, contract, public-interest mission, legitimate interest.
- **Prior declaration or authorisation (arts. 12–14):** *every* processing operation must be declared to, or authorised by, the national authority before it starts. A receipt issues within 48 hours and processing may begin on receipt (art. 13); the declaration states purposes, recipients, **retention period**, transfers abroad and security measures (art. 14).
- **Sensitive data (art. 18):** prohibited in principle; permitted only on an indispensable public-interest ground, or with express consent where a legal provision allows it, or with ANPDP authorisation. Processing it without consent carries 2–5 years' imprisonment (art. 57).
- **Rights:** information (art. 32), access (art. 34), rectification and opposition (arts. 35–36, enforced via art. 47).
- **Retention (art. 9(e)):** no longer than necessary; keeping data beyond the declared period is punishable (art. 65). **Security (art. 38):** measures proportionate to risk, with a written processor contract (art. 39).
- **Authority (art. 22):** the ANPDP is an independent administrative authority attached to the Presidency, seated in Algiers.

**The ANPDP is operational.** Its [official site](https://www.anpdp.dz/) publishes activity reports for 2023, 2024 and 2025, plus 2024 decisions on transfers abroad and interconnection. Its executive secretariat was organised by [Presidential Decree 23-73 of 14 February 2023, JO n° 10, 15 February 2023](https://www.joradp.dz/FTP/jo-francais/2023/F2023010.pdf).

**Uncertain:** no amending law found (a 2024–2026 amendment cannot be excluded); ANPDP forms not inspected.

**Ask counsel:** "Does our processing fall under the declaration or the authorisation regime, given beneficiary vulnerability data, and what is the ANPDP's current filing procedure and realistic receipt timeline?"

## 2. Cross-border transfer and hosting · **Confidence: HIGH on the rule; MEDIUM on practice**

- **Transfer abroad (art. 44):** only with ANPDP authorisation **and** where the destination State ensures sufficient protection. Derogations (art. 45) include express consent, contract performance and public interest.
- **Penalty (art. 67):** unlawful transfer — 1 to 5 years' imprisonment and 500,000–1,000,000 DA.
- **No localisation in 18-07:** I read the full text; no article requires storage in Algeria and "territoire national" appears nowhere in it.
- **Sectoral localisation applies to payments:** a PSP "doit établir son siège social et héberger sa plate-forme de paiement et ses redondances, sur le territoire national" ([Regulation 25-02, 14 April 2025](https://www.bank-of-algeria.dz/stoodroa/2025/05/REG.N%C2%B025-02.FR_.pdf), art. 4).

**Uncertain:** no adequacy list found; EU hosting is not prohibited, but each transfer needs authorisation.

**Ask counsel:** "For a platform hosted in the EU transferring beneficiary data to Sonelgaz/ADE, is an art. 44 authorisation required, and on what evidence of adequacy?"

## 3. Associations and fundraising · **Confidence: HIGH on Law 12-06; MEDIUM on the 1977 ordonnance**

From [Law 12-06 of 12 January 2012, JO n° 2, 15 January 2012](https://www.joradp.dz/ftp/jo-francais/2012/f2012002.pdf):

- A registered association may "recevoir des dons et legs, conformément à la législation en vigueur" (art. 17). Resources include cash and in-kind donations, legacies, "les revenus des quêtes" and public subsidies (art. 29).
- **Public appeals need authorisation:** associations may benefit from "des quêtes publiques **autorisées** dans les conditions et formes prévues par la législation et la réglementation en vigueur" (art. 33).
- The governing instrument is **Ordonnance n° 77-3 of 19 February 1977 relative aux quêtes** ([JO n° 16, 23 February 1977, p. 254](https://www.joradp.dz/FTP/jo-francais/1977/F1977016.pdf)). The PDF is a scan: the index confirms the title and that door-to-door collections are prohibited, but the licence requirement and offence exist only in secondary sources — **art. 1 unread in the primary text**.
- **Operating an unregistered association:** 3–6 months' imprisonment and 100,000–300,000 DA (art. 46).
- **Foreign funding:** funds from foreign NGOs and legations are prohibited outside established cooperation and require prior agreement of the competent authority (art. 30).
- **Foundations** are "associations à caractère spécifique", created by notarial deed, and may receive donations (art. 49).

**Bottom line:** an individual or company cannot lawfully run a public appeal on its own account. The defensible structure is an authorised association (or foundation) holding the quête authorisation and the bank account, with the company as technical provider.

**Ask counsel:** "May the company operate the platform and hold funds as agent of an authorised association, or must the association hold both the account and the quête authorisation?"

## 4. Payments · **Confidence: HIGH**

- [Law 23-09 of 21 June 2023](https://www.bank-of-algeria.dz/cadre-legislatif-et-reglementaire/) is the Monetary and Banking Law (Bank of Algeria's own description).
- [Regulation 25-02 of 14 April 2025](https://www.bank-of-algeria.dz/stoodroa/2025/05/REG.N%C2%B025-02.FR_.pdf) licenses PSPs: only an approved PSP may provide the listed services, including "l'exécution des opérations de paiement effectuées avec une carte de paiement" and "l'acquisition d'opérations de paiement" (art. 7). Minimum capital is **160,000,000 DA** (art. 14); user funds are segregated in a "compte de cantonnement" (art. 23); AML/CFT rules apply (art. 29); using the PSP designation without approval is prohibited (art. 3).
- **Card acceptance runs through the interbank network.** [SATIM](https://www.satim.dz/) lists 19 member banks; e-commerce requires "intégration webmarchand" and site homologation (34 certified sites).

**Conclusion:** the platform cannot acquire or route card donations itself; it must be a merchant of a licensed bank/PSP, or use the association's acquirer.

**Ask counsel:** "Can we act as technical merchant of record under a bank's acquiring contract while donations are credited directly to the association, and which SATIM homologation applies?"

## 5. Tax, accounting and receipts · **Confidence: LOW**

**Verified:** associations must send annual moral and financial reports to the competent public authority within 30 days of adoption (Law 12-06, art. 19); resources must serve statutory purposes only, and misuse constitutes "abus de biens sociaux" (art. 31).

**Not verified — no primary DGI text located:** corporate deductibility (a 2025 VAT change is reported on a blog only), any prescribed donation-receipt format, and the applicable accounting standard.

**Working assumption, not a finding:** a donation is not a supply, so the platform issues a receipt, not an invoice; utility invoices stay in the beneficiary's name.

**Ask counsel:** "What receipt must we issue, is it deductible for corporate donors, and does any platform fee trigger VAT registration?"

## 6. Paying third-party bills · **Confidence: MEDIUM/LOW**

No specific regime for paying a utility bill for another person was located. Three constraints apply: (i) the collection must itself be authorised (item 3); (ii) holding and transmitting funds as a business may fall within payment services reserved to licensed PSPs (item 4); (iii) obtaining the beneficiary's bill and account data is processing of personal data (item 1).

**Ask counsel:** "Does paying Sonelgaz/ADE accounts in beneficiaries' names require a convention with each utility, and does pooling donations before payment constitute a payment service?"

## Open verification list

1. Adoption status of the draft associations/donation-collection law — still a draft in September 2025 per [HRW, 25 September 2025](https://www.hrw.org/fr/news/2025/09/25/algerie-les-restrictions-injustifiees-pesant-sur-les-associations-devraient-etre).
2. Full text of Ordonnance 77-03 and its 25 May 1977 implementing order (scanned JO).
3. Any 2025–2026 DGI guidance on donation receipts and deductibility.
