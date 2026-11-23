-- =============================================================================
-- 006 — Donors, donations, payments, allocations, solidarity fund, receipts
-- =============================================================================
-- Money is stored as integer minor units (centimes, 1 DZD = 100 centimes).
-- Every financial fact is append-only; corrections happen through new rows.
-- A donation may be PLEDGED, PAID, ALLOCATED and PAID-OUT — four distinct states
-- that must never be conflated in reporting.
-- =============================================================================

create table donor_profiles (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null unique references users(id) on delete cascade,
  display_name  text,
  is_anonymous  boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create trigger donor_profiles_touch
  before update on donor_profiles
  for each row execute function app_touch_updated_at();

create table donations (
  id                    uuid primary key default gen_random_uuid(),
  donor_user_id         uuid references users(id) on delete set null,
  donor_profile_id      uuid references donor_profiles(id) on delete set null,
  target                text not null check (target in ('request', 'fund')),
  assistance_request_id uuid, -- FK added in 007 (assistance_requests)
  amount_centimes       bigint not null check (amount_centimes > 0),
  currency              char(3) not null default 'DZD',
  status                text not null default 'pending' check (status in (
                          'pending', 'paid', 'failed', 'cancelled', 'refunded', 'partially_refunded')),
  payment_provider      text not null default 'demo',
  provider_payment_id   text,
  idempotency_key       text not null unique,
  created_at            timestamptz not null default now(),
  paid_at               timestamptz,
  updated_at            timestamptz not null default now(),
  constraint donations_target_shape check (
    (target = 'request' and assistance_request_id is not null) or
    (target = 'fund' and assistance_request_id is null))
);
create index donations_donor_idx on donations (donor_user_id, created_at desc);
create index donations_request_idx on donations (assistance_request_id);
create index donations_status_idx on donations (status, created_at desc);

create trigger donations_touch
  before update on donations
  for each row execute function app_touch_updated_at();

create table payment_transactions (
  id              uuid primary key default gen_random_uuid(),
  donation_id     uuid not null references donations(id) on delete restrict,
  provider        text not null,
  provider_ref    text,
  amount_centimes bigint not null check (amount_centimes > 0),
  status          text not null default 'created' check (status in (
                    'created', 'authorized', 'captured', 'failed', 'refunded')),
  raw_status      text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index payment_transactions_donation_idx on payment_transactions (donation_id, created_at desc);
create unique index payment_transactions_provider_ref_uq
  on payment_transactions (provider, provider_ref) where provider_ref is not null;

create trigger payment_transactions_touch
  before update on payment_transactions
  for each row execute function app_touch_updated_at();

-- Raw provider callbacks. Append-only, deduplicated by (provider, external id).
create table payment_events (
  id                 uuid primary key default gen_random_uuid(),
  provider           text not null,
  external_event_id  text not null,
  transaction_id     uuid references payment_transactions(id) on delete restrict,
  event_type         text not null,
  signature_verified boolean not null default false,
  payload            jsonb not null default '{}'::jsonb,
  processed_at       timestamptz,
  created_at         timestamptz not null default now(),
  unique (provider, external_event_id)
);
create index payment_events_transaction_idx on payment_events (transaction_id);

create table donation_allocations (
  id                    uuid primary key default gen_random_uuid(),
  donation_id           uuid not null references donations(id) on delete restrict,
  assistance_request_id uuid not null, -- FK added in 007
  amount_centimes       bigint not null check (amount_centimes > 0),
  source                text not null default 'direct' check (source in ('direct', 'fund')),
  allocation_rule       text not null default 'donor_selected_request',
  created_by            uuid references users(id) on delete set null,
  created_at            timestamptz not null default now(),
  unique (donation_id, assistance_request_id)
);
create index donation_allocations_request_idx on donation_allocations (assistance_request_id, created_at desc);
create index donation_allocations_donation_idx on donation_allocations (donation_id);

create table refunds (
  id                 uuid primary key default gen_random_uuid(),
  donation_id        uuid not null references donations(id) on delete restrict,
  amount_centimes    bigint not null check (amount_centimes > 0),
  status             text not null default 'requested' check (status in ('requested', 'approved', 'processed', 'failed')),
  reason             text not null,
  provider_refund_ref text,
  created_at         timestamptz not null default now(),
  processed_at       timestamptz
);
create index refunds_donation_idx on refunds (donation_id);

-- Single-row fund. Balance is also derivable from fund_ledger_entries; the
-- stored balance is a transactional cache reconciled by a job.
create table solidarity_fund (
  id                          uuid primary key default gen_random_uuid(),
  name                        text not null default 'الصندوق التضامني العام',
  balance_centimes            bigint not null default 0 check (balance_centimes >= 0),
  total_contributions_centimes bigint not null default 0 check (total_contributions_centimes >= 0),
  total_allocated_centimes    bigint not null default 0 check (total_allocated_centimes >= 0),
  updated_at                  timestamptz not null default now(),
  singleton                   boolean not null default true unique check (singleton)
);

create trigger solidarity_fund_touch
  before update on solidarity_fund
  for each row execute function app_touch_updated_at();

create table fund_ledger_entries (
  id                    uuid primary key default gen_random_uuid(),
  fund_id               uuid not null references solidarity_fund(id) on delete restrict,
  entry_type            text not null check (entry_type in ('contribution', 'allocation', 'refund', 'adjustment')),
  -- Signed: contributions positive, allocations negative.
  amount_centimes       bigint not null check (amount_centimes <> 0),
  donation_id           uuid references donations(id) on delete restrict,
  assistance_request_id uuid,
  allocation_id         uuid references donation_allocations(id) on delete restrict,
  reason                text not null,
  created_by            uuid references users(id) on delete set null,
  created_at            timestamptz not null default now(),
  constraint fund_ledger_sign_matches_type check (
    (entry_type in ('contribution', 'refund') and amount_centimes > 0) or
    (entry_type = 'allocation' and amount_centimes < 0) or
    (entry_type = 'adjustment' and amount_centimes <> 0))
);
create index fund_ledger_fund_idx on fund_ledger_entries (fund_id, created_at desc);
create index fund_ledger_donation_idx on fund_ledger_entries (donation_id);

create sequence receipt_number_seq start 1;

create table receipts (
  id              uuid primary key default gen_random_uuid(),
  donation_id     uuid not null unique references donations(id) on delete restrict,
  receipt_number  text not null unique,
  amount_centimes bigint not null check (amount_centimes > 0),
  is_demo         boolean not null default true,
  language        text not null default 'ar' check (language in ('ar', 'fr')),
  issued_at       timestamptz not null default now(),
  issued_to_name  text
);
create index receipts_issued_idx on receipts (issued_at desc);

-- ---------------------------------------------------------------------------
-- Append-only enforcement
-- ---------------------------------------------------------------------------
create trigger payment_events_append_only
  before update or delete on payment_events
  for each row execute function app_reject_mutation();

create trigger fund_ledger_append_only
  before update or delete on fund_ledger_entries
  for each row execute function app_reject_mutation();

create trigger donation_allocations_append_only
  before update or delete on donation_allocations
  for each row execute function app_reject_mutation();

create trigger receipts_append_only
  before update or delete on receipts
  for each row execute function app_reject_mutation();
