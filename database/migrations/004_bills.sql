-- =============================================================================
-- 004 — Bills, OCR results, verification workflow, fraud signals
-- =============================================================================

create table bills (
  id                     uuid primary key default gen_random_uuid(),
  beneficiary_id         uuid not null references beneficiary_profiles(id) on delete restrict,
  provider_id            uuid not null references service_providers(id) on delete restrict,
  service_category_id    uuid not null references service_categories(id) on delete restrict,
  status                 text not null default 'uploaded' check (status in (
                           'uploaded', 'processing', 'verified', 'needs_documents',
                           'rejected', 'published', 'expired', 'withdrawn')),
  bill_reference         text,
  bill_reference_norm    text,
  -- Account numbers are stored as a keyed hash plus a 4-digit display suffix.
  account_number_hash    text,
  account_number_last4   text check (account_number_last4 is null or account_number_last4 ~ '^[0-9]{4}$'),
  issue_date             date,
  due_date               date,
  period_start           date,
  period_end             date,
  total_centimes         bigint check (total_centimes is null or total_centimes > 0),
  consumption            numeric(14, 2) check (consumption is null or consumption >= 0),
  consumption_unit       text,
  currency               char(3) not null default 'DZD',
  risk_score             integer not null default 0 check (risk_score between 0 and 100),
  duplicate_of_bill_id   uuid references bills(id) on delete set null,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  constraint bills_period_order check (
    period_start is null or period_end is null or period_start <= period_end)
);

create index bills_beneficiary_idx on bills (beneficiary_id, created_at desc);
create index bills_reference_idx on bills (provider_id, bill_reference_norm);
create index bills_period_lookup_idx on bills (provider_id, period_start, total_centimes);
create index bills_account_hash_idx on bills (account_number_hash);
create index bills_status_idx on bills (status, created_at desc);

create trigger bills_touch
  before update on bills
  for each row execute function app_touch_updated_at();

-- One physical file per bill upload attempt (re-uploads create a new file row).
create table bill_files (
  id          uuid primary key default gen_random_uuid(),
  bill_id     uuid not null references bills(id) on delete cascade,
  file_id     uuid not null unique references stored_files(id) on delete restrict,
  uploaded_at timestamptz not null default now()
);
create index bill_files_bill_idx on bill_files (bill_id);

create table bill_ocr_results (
  id                 uuid primary key default gen_random_uuid(),
  bill_file_id       uuid not null references bill_files(id) on delete cascade,
  provider           text not null,
  model              text,
  status             text not null check (status in ('success', 'partial', 'failed')),
  raw_text           text,
  parsed             jsonb not null default '{}'::jsonb,
  field_confidences  jsonb not null default '{}'::jsonb,
  is_demo            boolean not null default false,
  error_message      text,
  created_at         timestamptz not null default now()
);
create index bill_ocr_results_file_idx on bill_ocr_results (bill_file_id, created_at desc);

create table bill_verification_events (
  id            uuid primary key default gen_random_uuid(),
  bill_id       uuid not null references bills(id) on delete cascade,
  event_type    text not null,
  actor_type    text not null default 'system' check (actor_type in ('system', 'beneficiary', 'admin')),
  actor_user_id uuid references users(id) on delete set null,
  details       jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);
create index bill_verification_events_bill_idx on bill_verification_events (bill_id, created_at desc);

-- A verification run over a bill. Re-submissions create a new attempt while the
-- historical attempts (and their decisions) stay intact.
create table verification_requests (
  id                 uuid primary key default gen_random_uuid(),
  bill_id            uuid not null references bills(id) on delete cascade,
  beneficiary_id     uuid not null references beneficiary_profiles(id) on delete restrict,
  attempt_no         integer not null default 1 check (attempt_no >= 1),
  status             text not null default 'queued' check (status in (
                       'queued', 'processing', 'approved', 'rejected',
                       'needs_documents', 'uncertain', 'blocked')),
  current_decision_id uuid,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  decided_at         timestamptz,
  unique (bill_id, attempt_no)
);
create index verification_requests_beneficiary_idx on verification_requests (beneficiary_id, created_at desc);
create index verification_requests_status_idx on verification_requests (status, created_at);

create trigger verification_requests_touch
  before update on verification_requests
  for each row execute function app_touch_updated_at();

create table verification_evidence (
  id                     uuid primary key default gen_random_uuid(),
  verification_request_id uuid not null references verification_requests(id) on delete cascade,
  evidence_type          text not null check (evidence_type in (
                           'ocr_result', 'household_document', 'income_document',
                           'bill_file', 'duplicate_check', 'risk_assessment', 'policy_snapshot')),
  reference              text,
  file_id                uuid references stored_files(id) on delete restrict,
  details                jsonb not null default '{}'::jsonb,
  created_at             timestamptz not null default now()
);
create index verification_evidence_request_idx on verification_evidence (verification_request_id);

create table document_requests (
  id                     uuid primary key default gen_random_uuid(),
  verification_request_id uuid not null references verification_requests(id) on delete cascade,
  beneficiary_id         uuid not null references beneficiary_profiles(id) on delete restrict,
  doc_type               text not null check (doc_type in (
                           'family_status', 'income_proof', 'social_status',
                           'residence_proof', 'clearer_bill', 'other')),
  reason_code            text not null,
  status                 text not null default 'pending' check (status in ('pending', 'fulfilled', 'expired', 'cancelled')),
  due_at                 timestamptz,
  fulfilled_at           timestamptz,
  file_id                uuid references stored_files(id) on delete restrict,
  created_at             timestamptz not null default now()
);
create index document_requests_beneficiary_idx on document_requests (beneficiary_id, status);
create index document_requests_request_idx on document_requests (verification_request_id);

create table fraud_signals (
  id                     uuid primary key default gen_random_uuid(),
  verification_request_id uuid references verification_requests(id) on delete cascade,
  bill_id                uuid references bills(id) on delete cascade,
  beneficiary_id         uuid references beneficiary_profiles(id) on delete cascade,
  code                   text not null,
  severity               text not null check (severity in ('low', 'medium', 'high')),
  score                  integer not null default 0 check (score between 0 and 100),
  details                jsonb not null default '{}'::jsonb,
  status                 text not null default 'open' check (status in ('open', 'reviewed', 'dismissed')),
  created_at             timestamptz not null default now(),
  reviewed_at            timestamptz,
  reviewed_by            uuid references users(id) on delete set null
);
create index fraud_signals_bill_idx on fraud_signals (bill_id);
create index fraud_signals_status_idx on fraud_signals (status, severity, created_at desc);
