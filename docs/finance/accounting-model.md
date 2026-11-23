# Financial accounting model

## 1. Units and precision

- Currency: **DZD**, stored as integer **centimes** (`bigint`, 1 DZD = 100 centimes).
- Every amount column is named `*_centimes`; no floating point is used for money.
- Parsing/formatting is centralised in `lib/money.ts`; UI formatting uses `Intl.NumberFormat`
  (`ar-DZ` with Latin digits, `fr-DZ`).
- Currency code is stored as `char(3) = 'DZD'` for future multi-currency avoidance of ambiguity.

## 2. States (never conflated)

| State | Table/column | Meaning |
|---|---|---|
| Pledge | `donations.status = 'pending'` | Donor intent recorded, no money collected |
| Payment | `donations.status = 'paid'`, `payment_transactions.status = 'captured'` | Money collected (demo: simulated) |
| Allocation | `donation_allocations` row | Paid money attached to a specific request |
| Payout | `assistance_requests.paid_amount_centimes` + `paid_at` | Money sent to the utility provider |
| Refund | `refunds` row + `donations.status = 'refunded'` | Money returned (only unallocated donations) |

A cancelled or refunded donation is never counted as delivered assistance. Reports query each state
separately (`getFinancialReport`).

## 3. Donation lifecycle

```text
createDonation
  ├─ request must be published/partially_funded
  ├─ amount ≤ remaining (eligible − funded)
  ├─ INSERT donations(pending, idempotency_key unique)
  └─ INSERT payment_transactions(created, provider_ref = demo_<donationId>)

confirmDemoPayment (server action, ownership checked)
  └─ BEGIN
      ├─ SELECT donation FOR UPDATE
      ├─ if already paid → idempotent return (no second allocation)
      ├─ if not pending → error
      ├─ target = request:
      │    ├─ SELECT request FOR UPDATE
      │    ├─ amount ≤ remaining, else DONATION_OVERFUND_ATTEMPT security event + error
      │    ├─ INSERT donation_allocations   ← trigger sums allocations, refuses > eligible
      │    ├─ UPDATE request funded += amount; status partially_funded|funded; funded_at
      │    ├─ INSERT request_status_history
      │    └─ notify beneficiary
      ├─ target = fund:
      │    ├─ SELECT fund FOR UPDATE
      │    ├─ UPDATE balance += amount, contributions += amount
      │    └─ INSERT fund_ledger_entries(contribution, +amount)
      ├─ UPDATE donations(paid, paid_at)
      ├─ UPDATE payment_transactions(captured)
      ├─ INSERT payment_events(payment.captured, signature_verified)
      ├─ INSERT receipts(receipt_number, is_demo = true)
      └─ audit
     COMMIT
```

Idempotency keys:

- `donations.idempotency_key` unique — a repeated checkout submit returns the same donation.
- `payment_events (provider, external_event_id)` unique — duplicate provider callbacks are ignored.
- `receipts.donation_id` unique — one receipt per donation.
- Job dedupe keys prevent duplicate background execution.

## 4. Overfunding protection (four layers)

1. Application check at creation and at payment (`amount ≤ eligible − funded`).
2. Row lock (`SELECT … FOR UPDATE`) on the request during allocation.
3. `app_guard_allocation()` trigger: locks the request, sums existing allocations, rejects
   `sum + new > eligible`, and rejects allocations to non-fundable requests.
4. `CHECK (funded_amount_centimes <= eligible_amount_centimes)` on the request.

Tests: unit/integration (`refuses to overfund`), DB trigger (`OVERFUNDING_BLOCKED`), and race-free by
construction thanks to the row lock.

## 5. Solidarity fund

Single row in `solidarity_fund` (guarded by a `singleton` unique constraint).

Sign convention (enforced by CHECK):

| `entry_type` | Sign | Example |
|---|---|---|
| `contribution` | positive | donor contributes 5 000 DZD → +500 000 |
| `allocation` | negative | 4 000 DZD allocated to a request → −400 000 |
| `refund` | negative | refund out of the fund → −amount |
| `adjustment` | either | documented correction, requires a reason |

Allocation algorithm (`allocateFundToRequest`):

1. Lock the fund row; refuse if `balance < amount`.
2. Lock the request; verify status and `amount ≤ remaining`.
3. Select paid fund donations with their unallocated remainder, **FIFO** (`paid_at`, then `created_at`).
4. For each, insert an allocation for `min(available, remaining)` and a matching negative ledger entry.
5. Update fund balance/allocated totals and the request funded amount + status history.
6. Audit the operation with the reason.

`app_guard_fund_ledger()` refuses any entry that would make the balance negative, so even a manual SQL
mistake cannot overdraw the fund.

## 6. Refunds

- Allowed only for `paid` donations with **no allocations**.
- Creates a `refunds` row (`processed` for the demo provider), sets the donation to `refunded`, marks
  the payment transaction refunded, and — for fund donations — writes a negative `refund` ledger entry
  and decreases the fund totals.
- Refunding an allocated donation is refused (`REFUND_BLOCKED_ALLOCATED`): the money already belongs to
  a funded request. It must be handled as a support case, not by silently removing an allocation from
  an append-only table.
- Partial refunds are modelled in the schema (`partially_refunded`) but not exposed in the UI.

## 7. Payouts to providers

`markRequestPaidAction` (admin, audited) is the only path:

- requires `status = funded`, asks for the provider payment reference;
- sets `paid_amount_centimes = funded_amount_centimes`, `paid_at`, status `paid`;
- appends a `request_status_history` row with `PROVIDER_PAYMENT:<reference>`;
- notifies the beneficiary.

There is no automated bank integration; the settlement itself happens outside the platform (as
documented in the legal checklist).

## 8. Receipts

- Numbering: `TF-RCPT-YYYY-NNNNNN` via a sequence (`app_next_receipt_number()`).
- `is_demo = true` for every receipt created by the demo provider; the printable page shows a DEMO
  watermark and states it is not an accounting document.
- One receipt per donation (unique constraint).

## 9. Reconciliation

`jobs.type = 'reconcile_fund'`:

- compares `solidarity_fund.balance_centimes` with `SUM(fund_ledger_entries.amount_centimes)`;
- compares each request's `funded_amount_centimes` with `SUM(donation_allocations.amount_centimes)`;
- emits a `critical`/`high` security event on mismatch — it never auto-corrects money.

`jobs.type = 'expire_requests'` expires unfunded published requests after `expires_at`, which frees the
period commitment.

## 10. Reporting

`getFinancialReport(from, to)` returns, per period:

- confirmed donations (paid, by `paid_at`), pending pledges, refunds (processed),
- allocated amount (allocations created in the period),
- paid out to providers (by `paid_at` of the request),
- fund contributions and fund allocations (from the ledger),
- demo vs real receipt counts (expected: only demo).

No statistic mixes states, and no demo payment is ever presented as a real donation.

## 11. Not implemented

- Real card/CIB/Edahabia collection (requires a licensed PSP agreement).
- Chargebacks and their accounting.
- Payout automation and bank reconciliation files.
- Multi-currency.
- Interest/adjustment workflows beyond a reasoned ledger entry.
