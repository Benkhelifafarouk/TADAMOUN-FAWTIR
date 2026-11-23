-- =============================================================================
-- 012 — Correct the fund ledger sign rule for refunds
-- =============================================================================
-- A refund paid out of the solidarity fund reduces the balance, so it must be a
-- negative entry. The initial constraint treated refunds as inflows, which would
-- have made a refund increase the fund balance. Corrected before any refund code
-- is enabled.
-- =============================================================================

alter table fund_ledger_entries
  drop constraint if exists fund_ledger_sign_matches_type;

alter table fund_ledger_entries
  add constraint fund_ledger_sign_matches_type check (
    (entry_type = 'contribution' and amount_centimes > 0) or
    (entry_type = 'allocation' and amount_centimes < 0) or
    (entry_type = 'refund' and amount_centimes < 0) or
    (entry_type = 'adjustment' and amount_centimes <> 0)
  );
