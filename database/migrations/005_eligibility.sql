-- =============================================================================
-- 005 — Eligibility rules, assistance policy, decisions, appeals
-- =============================================================================
-- Eligibility is decided by a deterministic engine that reads the active rule
-- version. Decisions are append-only: a reassessment (including an appeal)
-- creates a NEW decision that references the one it supersedes.
-- =============================================================================

create table eligibility_rules (
  id          uuid primary key default gen_random_uuid(),
  key         text not null unique,
  name_ar     text not null,
  name_fr     text not null,
  description text,
  created_at  timestamptz not null default now()
);

create table eligibility_rule_versions (
  id             uuid primary key default gen_random_uuid(),
  rule_id        uuid not null references eligibility_rules(id) on delete cascade,
  version        integer not null check (version >= 1),
  config         jsonb not null,
  effective_from timestamptz not null default now(),
  effective_to   timestamptz,
  is_active      boolean not null default true,
  created_by     uuid references users(id) on delete set null,
  created_at     timestamptz not null default now(),
  unique (rule_id, version),
  constraint rule_version_effective_order check (effective_to is null or effective_to > effective_from)
);
create index rule_versions_active_idx on eligibility_rule_versions (rule_id, is_active, effective_from desc);

-- Financial assistance limits: fully database-configured, never hardcoded.
create table assistance_policies (
  id                       uuid primary key default gen_random_uuid(),
  service_category_id      uuid not null references service_categories(id) on delete restrict,
  period                   text not null check (period in ('monthly', 'quarterly', 'annual')),
  base_limit_centimes      bigint not null check (base_limit_centimes > 0),
  -- What to do when the bill total exceeds the eligible cap.
  bill_above_cap_policy    text not null default 'publish_eligible_amount'
                           check (bill_above_cap_policy in ('publish_eligible_amount', 'reject')),
  version                  integer not null default 1 check (version >= 1),
  is_active                boolean not null default true,
  effective_from           timestamptz not null default now(),
  effective_to             timestamptz,
  created_by               uuid references users(id) on delete set null,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  constraint policy_effective_order check (effective_to is null or effective_to > effective_from)
);

create unique index assistance_policies_one_active
  on assistance_policies (service_category_id, period)
  where is_active;

create trigger assistance_policies_touch
  before update on assistance_policies
  for each row execute function app_touch_updated_at();

-- Household-size tiers. Seeded neutral (multiplier 1.0): the actual policy has
-- to be approved by the operator, it is not guessed by the code.
create table assistance_tiers (
  id                     uuid primary key default gen_random_uuid(),
  policy_id              uuid not null references assistance_policies(id) on delete cascade,
  min_household_size     integer not null check (min_household_size >= 1),
  max_household_size     integer check (max_household_size is null or max_household_size >= min_household_size),
  multiplier             numeric(4, 2) not null default 1.00 check (multiplier between 0.10 and 5.00),
  fixed_limit_centimes   bigint check (fixed_limit_centimes is null or fixed_limit_centimes > 0),
  created_at             timestamptz not null default now(),
  constraint tier_range_unique unique (policy_id, min_household_size, max_household_size)
);
create index assistance_tiers_policy_idx on assistance_tiers (policy_id, min_household_size);

create table eligibility_decisions (
  id                       uuid primary key default gen_random_uuid(),
  verification_request_id  uuid not null references verification_requests(id) on delete cascade,
  beneficiary_id           uuid not null references beneficiary_profiles(id) on delete restrict,
  decision                 text not null check (decision in (
                             'APPROVED', 'REJECTED', 'NEEDS_ADDITIONAL_DOCUMENTS',
                             'VERIFICATION_UNCERTAIN', 'TEMPORARILY_BLOCKED')),
  rule_version_id          uuid references eligibility_rule_versions(id) on delete restrict,
  policy_snapshot          jsonb not null default '{}'::jsonb,
  eligible_amount_centimes bigint not null default 0 check (eligible_amount_centimes >= 0),
  bill_amount_centimes     bigint,
  period_committed_centimes bigint,
  confidence               numeric(4, 3) check (confidence is null or confidence between 0 and 1),
  engine_version           text not null,
  decided_by               text not null default 'engine' check (decided_by in ('engine', 'appeal_engine')),
  supersedes_decision_id   uuid references eligibility_decisions(id) on delete set null,
  appeal_id                uuid,
  created_at               timestamptz not null default now()
);
create index decisions_request_idx on eligibility_decisions (verification_request_id, created_at desc);
create index decisions_beneficiary_idx on eligibility_decisions (beneficiary_id, created_at desc);

create table eligibility_decision_reasons (
  id          uuid primary key default gen_random_uuid(),
  decision_id uuid not null references eligibility_decisions(id) on delete cascade,
  code        text not null,
  severity    text not null check (severity in ('info', 'warning', 'blocking')),
  field       text,
  params      jsonb not null default '{}'::jsonb,
  ordinal     integer not null default 0
);
create index decision_reasons_decision_idx on eligibility_decision_reasons (decision_id, ordinal);

create table appeals (
  id              uuid primary key default gen_random_uuid(),
  beneficiary_id  uuid not null references beneficiary_profiles(id) on delete restrict,
  decision_id     uuid not null references eligibility_decisions(id) on delete restrict,
  message         text not null check (char_length(message) between 20 and 4000),
  status          text not null default 'submitted' check (status in ('submitted', 'resolved', 'rejected')),
  outcome         text,
  new_decision_id uuid references eligibility_decisions(id) on delete set null,
  submitted_at    timestamptz not null default now(),
  resolved_at     timestamptz
);
create index appeals_beneficiary_idx on appeals (beneficiary_id, submitted_at desc);
create index appeals_decision_idx on appeals (decision_id);

alter table verification_requests
  add constraint verification_requests_current_decision_fk
  foreign key (current_decision_id) references eligibility_decisions(id) on delete set null;

alter table eligibility_decisions
  add constraint eligibility_decisions_appeal_fk
  foreign key (appeal_id) references appeals(id) on delete set null;

-- ---------------------------------------------------------------------------
-- Append-only enforcement
-- ---------------------------------------------------------------------------
create trigger eligibility_decisions_append_only
  before update or delete on eligibility_decisions
  for each row execute function app_reject_mutation();

create trigger eligibility_decision_reasons_append_only
  before update or delete on eligibility_decision_reasons
  for each row execute function app_reject_mutation();

create trigger appeals_no_delete
  before delete on appeals
  for each row execute function app_reject_mutation();
