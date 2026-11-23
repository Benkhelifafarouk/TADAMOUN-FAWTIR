-- =============================================================================
-- 003 — Beneficiary profiles, households and private documents
-- =============================================================================

-- Private storage registry. Original documents live in a private bucket / local
-- directory; only the storage key is stored here, never a public URL.
create table stored_files (
  id                   uuid primary key default gen_random_uuid(),
  owner_user_id        uuid not null references users(id) on delete restrict,
  bucket               text not null check (bucket in (
                         'bills', 'identity_documents', 'income_documents',
                         'verification_evidence', 'public_assets')),
  storage_key          text not null unique,
  original_name        text,
  mime_type            text not null,
  size_bytes           bigint not null check (size_bytes > 0),
  sha256               text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  page_count           integer check (page_count is null or page_count > 0),
  width                integer check (width is null or width > 0),
  height               integer check (height is null or height > 0),
  scan_status          text not null default 'pending' check (scan_status in ('pending', 'clean', 'flagged')),
  is_private           boolean not null default true,
  metadata             jsonb not null default '{}'::jsonb,
  created_at           timestamptz not null default now(),
  deleted_at           timestamptz
);
create index stored_files_owner_idx on stored_files (owner_user_id, created_at desc);
create index stored_files_sha_idx on stored_files (sha256);
create index stored_files_bucket_idx on stored_files (bucket);

create table beneficiary_profiles (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null unique references users(id) on delete cascade,
  wilaya_id           uuid not null references wilayas(id) on delete restrict,
  municipality_id     uuid references municipalities(id) on delete restrict,
  -- Free-form private address, needed only for provider payment reconciliation.
  address_line        text,
  status              text not null default 'draft' check (status in ('draft', 'complete', 'suspended')),
  profile_completed_at timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index beneficiary_profiles_wilaya_idx on beneficiary_profiles (wilaya_id);

create trigger beneficiary_profiles_touch
  before update on beneficiary_profiles
  for each row execute function app_touch_updated_at();

create table households (
  id                    uuid primary key default gen_random_uuid(),
  beneficiary_id        uuid not null unique references beneficiary_profiles(id) on delete cascade,
  size                  integer not null check (size between 1 and 40),
  children_count        integer not null default 0 check (children_count >= 0),
  monthly_income_centimes bigint check (monthly_income_centimes is null or monthly_income_centimes >= 0),
  income_source         text,
  housing_status        text check (housing_status is null or housing_status in (
                          'owner', 'tenant', 'family_hosted', 'other')),
  notes_private         text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint households_children_le_size check (children_count <= size)
);

create trigger households_touch
  before update on households
  for each row execute function app_touch_updated_at();

create table household_members (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  relation     text not null check (relation in ('self', 'spouse', 'child', 'parent', 'other')),
  birth_year   integer check (birth_year is null or birth_year between 1900 and 2100),
  is_dependent boolean not null default true,
  created_at   timestamptz not null default now()
);
create index household_members_household_idx on household_members (household_id);

-- Documents attached to a household (family status, income proof, ...).
create table household_documents (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  doc_type     text not null check (doc_type in (
                 'family_status', 'income_proof', 'social_status',
                 'residence_proof', 'other')),
  file_id      uuid not null references stored_files(id) on delete restrict,
  status       text not null default 'submitted' check (status in ('submitted', 'accepted', 'rejected', 'expired')),
  created_at   timestamptz not null default now(),
  reviewed_at  timestamptz
);
create index household_documents_household_idx on household_documents (household_id);

-- Rolling eligibility snapshot used as engine input (never the sole authority).
create table eligibility_profiles (
  id                    uuid primary key default gen_random_uuid(),
  beneficiary_id        uuid not null unique references beneficiary_profiles(id) on delete cascade,
  declared_income_centimes bigint,
  household_size        integer,
  verification_confidence numeric(4, 3) check (verification_confidence is null or verification_confidence between 0 and 1),
  risk_level            text not null default 'normal' check (risk_level in ('normal', 'elevated', 'blocked')),
  last_evaluated_at     timestamptz,
  updated_at            timestamptz not null default now()
);

create trigger eligibility_profiles_touch
  before update on eligibility_profiles
  for each row execute function app_touch_updated_at();
