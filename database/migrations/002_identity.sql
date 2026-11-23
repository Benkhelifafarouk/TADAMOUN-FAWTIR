-- =============================================================================
-- 002 — Identity, sessions, OTP, consent
-- =============================================================================

create table users (
  id                    uuid primary key default gen_random_uuid(),
  email                 text not null,
  email_normalized      text generated always as (lower(btrim(email))) stored,
  password_hash         text not null,
  full_name             text not null,
  phone                 text,
  -- Deterministic keyed hash of the phone number: used for duplicate-account
  -- signals without storing a second searchable copy of the number.
  phone_hash            text,
  phone_verified_at     timestamptz,
  preferred_locale      text not null default 'ar' check (preferred_locale in ('ar', 'fr')),
  status                text not null default 'active'
                        check (status in ('active', 'suspended', 'pending_deletion', 'deleted')),
  last_login_at         timestamptz,
  failed_login_count    integer not null default 0 check (failed_login_count >= 0),
  locked_until          timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint users_full_name_len check (char_length(full_name) between 2 and 120),
  constraint users_phone_format check (phone is null or phone ~ '^\+?[0-9]{8,15}$')
);

create unique index users_email_uq on users (email_normalized);
create unique index users_phone_uq on users (phone) where phone is not null;
create index users_phone_hash_idx on users (phone_hash) where phone_hash is not null;
create index users_status_idx on users (status);

create trigger users_touch
  before update on users
  for each row execute function app_touch_updated_at();

-- Roles are additive and authoritative; the "primary role" used for routing is
-- derived (admin > support > beneficiary > donor) rather than duplicated here.
create table user_roles (
  user_id    uuid not null references users(id) on delete cascade,
  role       text not null check (role in ('beneficiary', 'donor', 'support', 'admin')),
  granted_at timestamptz not null default now(),
  granted_by uuid references users(id) on delete set null,
  primary key (user_id, role)
);
create index user_roles_role_idx on user_roles (role);

create table sessions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references users(id) on delete cascade,
  token_hash    text not null unique,
  user_agent    text,
  ip_hash       text,
  created_at    timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  expires_at    timestamptz not null,
  revoked_at    timestamptz,
  revoked_reason text
);
create index sessions_user_idx on sessions (user_id);
create index sessions_expiry_idx on sessions (expires_at);

-- OTP codes are stored as keyed hashes only. The plaintext code is generated on
-- the server and delivered through the notification channel (dev: response/log).
create table otp_codes (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references users(id) on delete cascade,
  purpose          text not null check (purpose in ('phone_verification', 'login', 'sensitive_action')),
  destination_hash text not null,
  code_hash        text not null,
  attempts         integer not null default 0 check (attempts >= 0),
  max_attempts     integer not null default 5 check (max_attempts between 1 and 10),
  expires_at       timestamptz not null,
  consumed_at      timestamptz,
  created_at       timestamptz not null default now()
);
create index otp_codes_lookup_idx on otp_codes (user_id, purpose, created_at desc);

create table consent_records (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references users(id) on delete cascade,
  consent_type   text not null check (consent_type in ('terms', 'privacy', 'data_processing', 'marketing')),
  policy_version text not null,
  granted        boolean not null,
  locale         text not null check (locale in ('ar', 'fr')),
  ip_hash        text,
  created_at     timestamptz not null default now()
);
create index consent_records_user_idx on consent_records (user_id, consent_type);

create table account_verification_events (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references users(id) on delete cascade,
  event_type text not null,
  outcome    text not null check (outcome in ('success', 'failure', 'blocked')),
  details    jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index account_verification_events_user_idx on account_verification_events (user_id, created_at desc);
