-- =============================================================================
-- 007 — Public assistance requests (anonymised projection of an approved bill)
-- =============================================================================
-- The donor-facing data lives in its own table + view. There is no foreign key
-- path exposed to donors, and the base tables stay inaccessible to the public
-- role. Nothing here contains a name, phone number, address, account number,
-- file URL, OCR text or identity document reference.
-- =============================================================================

create sequence public_request_ref_seq start 1000;

create table assistance_requests (
  id                       uuid primary key default gen_random_uuid(),
  bill_id                  uuid not null unique references bills(id) on delete restrict,
  beneficiary_id           uuid not null references beneficiary_profiles(id) on delete restrict,
  verification_decision_id uuid not null references eligibility_decisions(id) on delete restrict,
  service_category_id      uuid not null references service_categories(id) on delete restrict,
  provider_id              uuid not null references service_providers(id) on delete restrict,
  wilaya_id                uuid not null references wilayas(id) on delete restrict,
  municipality_id          uuid references municipalities(id) on delete restrict,
  show_municipality        boolean not null default false,
  public_ref               text not null unique default (
                             'TF-' || to_char(now(), 'YYYY') || '-' ||
                             lpad(nextval('public_request_ref_seq')::text, 6, '0')),
  status                   text not null default 'draft' check (status in (
                             'draft', 'published', 'partially_funded', 'funded',
                             'paid', 'expired', 'cancelled')),
  eligible_amount_centimes bigint not null check (eligible_amount_centimes > 0),
  funded_amount_centimes   bigint not null default 0 check (funded_amount_centimes >= 0),
  paid_amount_centimes     bigint not null default 0 check (paid_amount_centimes >= 0),
  anonymized_description   text not null,
  description_locale       text not null default 'ar' check (description_locale in ('ar', 'fr')),
  published_at             timestamptz,
  expires_at               timestamptz,
  funded_at                timestamptz,
  paid_at                  timestamptz,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  constraint requests_no_overfunding check (funded_amount_centimes <= eligible_amount_centimes),
  constraint requests_paid_within_funded check (paid_amount_centimes <= funded_amount_centimes),
  constraint requests_description_len check (char_length(anonymized_description) between 40 and 800)
);

create index assistance_requests_status_idx on assistance_requests (status, published_at desc);
create index assistance_requests_wilaya_idx on assistance_requests (wilaya_id, status);
create index assistance_requests_category_idx on assistance_requests (service_category_id, status);
create index assistance_requests_beneficiary_idx on assistance_requests (beneficiary_id, created_at desc);

create trigger assistance_requests_touch
  before update on assistance_requests
  for each row execute function app_touch_updated_at();

alter table donations
  add constraint donations_request_fk
  foreign key (assistance_request_id) references assistance_requests(id) on delete restrict;

alter table donation_allocations
  add constraint donation_allocations_request_fk
  foreign key (assistance_request_id) references assistance_requests(id) on delete restrict;

alter table fund_ledger_entries
  add constraint fund_ledger_request_fk
  foreign key (assistance_request_id) references assistance_requests(id) on delete restrict;

create table request_status_history (
  id            uuid primary key default gen_random_uuid(),
  request_id    uuid not null references assistance_requests(id) on delete cascade,
  from_status   text,
  to_status     text not null,
  reason        text not null,
  actor_type    text not null default 'system' check (actor_type in ('system', 'admin', 'donor')),
  actor_user_id uuid references users(id) on delete set null,
  created_at    timestamptz not null default now()
);
create index request_status_history_request_idx on request_status_history (request_id, created_at desc);

create table public_request_views (
  id           uuid primary key default gen_random_uuid(),
  request_id   uuid not null references assistance_requests(id) on delete cascade,
  session_hash text not null,
  referrer_host text,
  viewed_at    timestamptz not null default now()
);
create index public_request_views_request_idx on public_request_views (request_id, viewed_at desc);

-- ---------------------------------------------------------------------------
-- Donor-facing projection. Only published/funded/paid requests are visible.
-- SECURITY: grant SELECT on this view to `anon`; never grant on base tables.
-- ---------------------------------------------------------------------------
create view public_assistance_requests
with (security_invoker = false)
as
select
  ar.public_ref                                as reference,
  sc.code                                      as service_category_code,
  sc.name_ar                                   as category_name_ar,
  sc.name_fr                                   as category_name_fr,
  sp.name_ar                                   as provider_name_ar,
  sp.name_fr                                   as provider_name_fr,
  w.code                                       as wilaya_code,
  w.name_ar                                    as wilaya_name_ar,
  w.name_fr                                    as wilaya_name_fr,
  case when ar.show_municipality then m.name_ar end as municipality_name_ar,
  case when ar.show_municipality then m.name_fr end as municipality_name_fr,
  ar.status,
  ar.eligible_amount_centimes,
  ar.funded_amount_centimes,
  (ar.eligible_amount_centimes - ar.funded_amount_centimes) as remaining_amount_centimes,
  ar.anonymized_description,
  ar.description_locale,
  ar.published_at,
  ar.expires_at
from assistance_requests ar
join service_categories sc on sc.id = ar.service_category_id
join service_providers sp on sp.id = ar.provider_id
join wilayas w on w.id = ar.wilaya_id
left join municipalities m on m.id = ar.municipality_id
where ar.status in ('published', 'partially_funded', 'funded', 'paid')
  and ar.published_at is not null;

comment on view public_assistance_requests is
  'Anonymised donor-facing projection. Contains no beneficiary identity, account number, file reference or OCR text.';

create trigger request_status_history_append_only
  before update or delete on request_status_history
  for each row execute function app_reject_mutation();
