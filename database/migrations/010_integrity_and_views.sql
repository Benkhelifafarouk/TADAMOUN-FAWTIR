-- =============================================================================
-- 010 — Integrity guards, public transparency view, indexes
-- =============================================================================
-- These triggers are the last line of defence for financial invariants. They
-- hold even if an application bug or a manual SQL statement tries to break them.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. An allocation may never push a request above its eligible amount.
--    The request row is locked so concurrent allocations serialise.
-- ---------------------------------------------------------------------------
create or replace function app_guard_allocation()
returns trigger
language plpgsql
as $$
declare
  v_eligible bigint;
  v_status   text;
  v_allocated bigint;
begin
  select eligible_amount_centimes, status
    into v_eligible, v_status
  from assistance_requests
  where id = new.assistance_request_id
  for update;

  if v_eligible is null then
    raise exception 'ALLOCATION_TARGET_MISSING' using errcode = 'check_violation';
  end if;

  if v_status not in ('published', 'partially_funded', 'funded') then
    raise exception 'ALLOCATION_TARGET_NOT_FUNDABLE (status=%)', v_status
      using errcode = 'check_violation';
  end if;

  select coalesce(sum(amount_centimes), 0)
    into v_allocated
  from donation_allocations
  where assistance_request_id = new.assistance_request_id;

  if v_allocated + new.amount_centimes > v_eligible then
    raise exception 'OVERFUNDING_BLOCKED (allocated=%, new=%, eligible=%)',
      v_allocated, new.amount_centimes, v_eligible
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger donation_allocations_guard
  before insert on donation_allocations
  for each row execute function app_guard_allocation();

-- ---------------------------------------------------------------------------
-- 2. A request may only be published from an APPROVED automated decision, and
--    may never ask for more than that decision granted. There is intentionally
--    no administrative override: the only path is a new engine decision.
-- ---------------------------------------------------------------------------
create or replace function app_guard_request_publish()
returns trigger
language plpgsql
as $$
declare
  v_decision text;
  v_amount   bigint;
begin
  if new.status in ('published', 'partially_funded', 'funded', 'paid') then
    select decision, eligible_amount_centimes
      into v_decision, v_amount
    from eligibility_decisions
    where id = new.verification_decision_id;

    if v_decision is distinct from 'APPROVED' then
      raise exception 'PUBLISH_REQUIRES_APPROVED_DECISION (decision=%)', coalesce(v_decision, 'missing')
        using errcode = 'check_violation';
    end if;

    if new.eligible_amount_centimes > v_amount then
      raise exception 'PUBLISH_AMOUNT_EXCEEDS_DECISION (requested=%, approved=%)',
        new.eligible_amount_centimes, v_amount
        using errcode = 'check_violation';
    end if;

    if new.published_at is null then
      new.published_at = now();
    end if;
  end if;

  return new;
end;
$$;

create trigger assistance_requests_publish_guard
  before insert or update on assistance_requests
  for each row execute function app_guard_request_publish();

-- ---------------------------------------------------------------------------
-- 3. The solidarity fund can never allocate more than its balance.
-- ---------------------------------------------------------------------------
create or replace function app_guard_fund_ledger()
returns trigger
language plpgsql
as $$
declare
  v_balance bigint;
begin
  select balance_centimes into v_balance
  from solidarity_fund
  where id = new.fund_id
  for update;

  if v_balance is null then
    raise exception 'FUND_MISSING' using errcode = 'check_violation';
  end if;

  if v_balance + new.amount_centimes < 0 then
    raise exception 'FUND_INSUFFICIENT_BALANCE (balance=%, entry=%)', v_balance, new.amount_centimes
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger fund_ledger_guard
  before insert on fund_ledger_entries
  for each row execute function app_guard_fund_ledger();

-- ---------------------------------------------------------------------------
-- 4. A paid donation cannot silently return to "pending".
-- ---------------------------------------------------------------------------
create or replace function app_guard_donation_status()
returns trigger
language plpgsql
as $$
begin
  if old.status = 'paid' and new.status not in ('paid', 'refunded', 'partially_refunded') then
    raise exception 'DONATION_STATUS_REGRESSION (% -> %)', old.status, new.status
      using errcode = 'check_violation';
  end if;
  if old.status = 'refunded' and new.status <> 'refunded' then
    raise exception 'REFUNDED_DONATION_IS_FINAL' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger donations_status_guard
  before update on donations
  for each row execute function app_guard_donation_status();

-- ---------------------------------------------------------------------------
-- 5. Receipt numbering
-- ---------------------------------------------------------------------------
create or replace function app_next_receipt_number()
returns text
language sql
volatile
as $$
  select 'TF-RCPT-' || to_char(now(), 'YYYY') || '-' ||
         lpad(nextval('receipt_number_seq')::text, 6, '0')
$$;

-- ---------------------------------------------------------------------------
-- 6. Public transparency views (aggregated, no personal data)
-- ---------------------------------------------------------------------------
create view public_fund_summary
with (security_invoker = false)
as
select
  name,
  balance_centimes,
  total_contributions_centimes,
  total_allocated_centimes,
  updated_at
from solidarity_fund;

grant select on public_fund_summary to anon, authenticated;

-- Aggregated transparency counters, safe for public display.
create view public_platform_stats
with (security_invoker = false)
as
select
  (select count(*) from assistance_requests
    where status in ('published', 'partially_funded', 'funded', 'paid')) as published_requests,
  (select count(*) from assistance_requests where status = 'paid') as completed_requests,
  (select coalesce(sum(amount_centimes), 0) from donation_allocations) as allocated_centimes,
  (select count(distinct beneficiary_id) from assistance_requests
    where published_at is not null) as supported_households,
  (select coalesce(sum(amount_centimes), 0) from fund_ledger_entries
    where entry_type = 'contribution') as fund_contributions_centimes;

grant select on public_platform_stats to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 7. Hot-path indexes
-- ---------------------------------------------------------------------------
create index notifications_unread_idx on notifications (user_id, created_at desc)
  where read_at is null;

create index support_tickets_open_idx on support_tickets (status, created_at desc)
  where status in ('open', 'in_progress');

create index requests_browse_idx on assistance_requests (status, published_at desc)
  where status in ('published', 'partially_funded', 'funded');

create index requests_remaining_idx on assistance_requests
  ((eligible_amount_centimes - funded_amount_centimes))
  where status in ('published', 'partially_funded');

create index bills_pending_idx on bills (status, created_at)
  where status in ('uploaded', 'processing', 'needs_documents');

create index document_requests_pending_idx on document_requests (beneficiary_id, created_at desc)
  where status = 'pending';

create index decisions_pending_appeals_idx on appeals (beneficiary_id, submitted_at desc)
  where status = 'submitted';

comment on table assistance_requests is
  'Anonymised public assistance request. Published only from an APPROVED automated eligibility decision; no manual approval path exists.';
