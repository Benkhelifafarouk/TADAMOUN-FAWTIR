-- =============================================================================
-- 001 — Core helpers and reference data
-- =============================================================================
-- Portable plain PostgreSQL (15+). No extensions are required: UUIDs come from
-- the built-in gen_random_uuid() and all text comparison happens on normalised
-- expressions, so the same migrations run on Supabase and on embedded PGlite.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Helper functions used by Row Level Security policies.
-- ---------------------------------------------------------------------------
-- The application sets `app.current_user_id` for each authenticated request
-- (see lib/db/session-context.ts). Policies never trust client-supplied values:
-- the setting is applied on the server connection only.
create or replace function app_current_user_id()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('app.current_user_id', true), '')::uuid
$$;

comment on function app_current_user_id() is
  'Authenticated user id for the current database session, or NULL for anonymous access.';

-- SECURITY DEFINER so that role checks do not recurse through the RLS policy of
-- user_roles itself. search_path is pinned to defeat search_path hijacking.
create or replace function app_has_role(p_role text)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  return exists (
    select 1
    from user_roles ur
    where ur.user_id = app_current_user_id()
      and ur.role = p_role
  );
end;
$$;

create or replace function app_is_admin()
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  return exists (
    select 1
    from user_roles ur
    where ur.user_id = app_current_user_id()
      and ur.role = 'admin'
  );
end;
$$;

create or replace function app_is_support()
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  return exists (
    select 1
    from user_roles ur
    where ur.user_id = app_current_user_id()
      and ur.role in ('support', 'admin')
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- updated_at trigger
-- ---------------------------------------------------------------------------
create or replace function app_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Append-only protection for financial and audit records.
-- ---------------------------------------------------------------------------
create or replace function app_reject_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Table %.% is append-only: % is not permitted',
    tg_table_schema, tg_table_name, tg_op
    using errcode = 'restrict_violation';
end;
$$;

-- ---------------------------------------------------------------------------
-- Geography (official 58 wilayas; municipalities are seeded progressively)
-- ---------------------------------------------------------------------------
create table wilayas (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,
  name_ar     text not null,
  name_fr     text not null,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

create table municipalities (
  id          uuid primary key default gen_random_uuid(),
  wilaya_id   uuid not null references wilayas(id) on delete restrict,
  code        text not null,
  name_ar     text not null,
  name_fr     text not null,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (wilaya_id, code)
);
create index municipalities_wilaya_idx on municipalities (wilaya_id);

-- ---------------------------------------------------------------------------
-- Service catalogue
-- ---------------------------------------------------------------------------
create table service_categories (
  id             uuid primary key default gen_random_uuid(),
  code           text not null unique,
  name_ar        text not null,
  name_fr        text not null,
  description_ar text,
  description_fr text,
  consumption_unit text,
  sort_order     integer not null default 0,
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table service_providers (
  id            uuid primary key default gen_random_uuid(),
  category_id   uuid not null references service_categories(id) on delete restrict,
  code          text not null unique,
  name_ar       text not null,
  name_fr       text not null,
  -- Declarative hints for the extraction layer (label variants per provider).
  bill_format   jsonb not null default '{}'::jsonb,
  is_generic    boolean not null default false,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index service_providers_category_idx on service_providers (category_id);

-- ---------------------------------------------------------------------------
-- Platform configuration (typed key/value with an explicit public flag)
-- ---------------------------------------------------------------------------
create table platform_settings (
  key         text primary key,
  value       jsonb not null,
  description text,
  is_public   boolean not null default false,
  updated_by  uuid,
  updated_at  timestamptz not null default now()
);

create trigger platform_settings_touch
  before update on platform_settings
  for each row execute function app_touch_updated_at();

create trigger service_categories_touch
  before update on service_categories
  for each row execute function app_touch_updated_at();

create trigger service_providers_touch
  before update on service_providers
  for each row execute function app_touch_updated_at();
