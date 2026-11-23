-- =============================================================================
-- 008 — Operations: notifications, support, audit, security events, jobs, limits
-- =============================================================================

create table notifications (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references users(id) on delete cascade,
  type           text not null,
  title_key      text not null,
  body_key       text not null,
  params         jsonb not null default '{}'::jsonb,
  channel        text not null default 'in_app' check (channel in ('in_app', 'email', 'sms')),
  status         text not null default 'queued' check (status in ('queued', 'sent', 'delivered', 'failed')),
  dedupe_key     text unique,
  read_at        timestamptz,
  sent_at        timestamptz,
  failure_reason text,
  created_at     timestamptz not null default now()
);
create index notifications_user_idx on notifications (user_id, read_at, created_at desc);
create index notifications_status_idx on notifications (status, created_at);

create table support_tickets (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references users(id) on delete set null,
  subject      text not null check (char_length(subject) between 3 and 160),
  message      text not null check (char_length(message) between 10 and 4000),
  contact_email text,
  status       text not null default 'open' check (status in ('open', 'in_progress', 'resolved', 'closed')),
  priority     text not null default 'normal' check (priority in ('low', 'normal', 'high')),
  assigned_to  uuid references users(id) on delete set null,
  resolution   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index support_tickets_status_idx on support_tickets (status, created_at desc);

create trigger support_tickets_touch
  before update on support_tickets
  for each row execute function app_touch_updated_at();

create table audit_logs (
  id            uuid primary key default gen_random_uuid(),
  actor_user_id uuid references users(id) on delete set null,
  actor_role    text,
  action        text not null,
  entity_type   text not null,
  entity_id     text,
  before_state  jsonb,
  after_state   jsonb,
  ip_hash       text,
  user_agent    text,
  request_id    text,
  created_at    timestamptz not null default now()
);
create index audit_logs_created_idx on audit_logs (created_at desc);
create index audit_logs_entity_idx on audit_logs (entity_type, entity_id);
create index audit_logs_actor_idx on audit_logs (actor_user_id, created_at desc);

create table security_events (
  id         uuid primary key default gen_random_uuid(),
  event_type text not null,
  severity   text not null default 'info' check (severity in ('info', 'low', 'medium', 'high', 'critical')),
  user_id    uuid references users(id) on delete set null,
  ip_hash    text,
  route      text,
  details    jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index security_events_created_idx on security_events (created_at desc);
create index security_events_severity_idx on security_events (severity, created_at desc);

-- Durable job queue. Claiming uses SELECT ... FOR UPDATE SKIP LOCKED so several
-- workers can run concurrently without duplicate execution.
create table jobs (
  id           uuid primary key default gen_random_uuid(),
  type         text not null,
  payload      jsonb not null default '{}'::jsonb,
  status       text not null default 'queued' check (status in ('queued', 'running', 'succeeded', 'failed', 'dead')),
  attempts     integer not null default 0 check (attempts >= 0),
  max_attempts integer not null default 5 check (max_attempts between 1 and 20),
  run_at       timestamptz not null default now(),
  locked_at    timestamptz,
  locked_by    text,
  last_error   text,
  dedupe_key   text unique,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index jobs_due_idx on jobs (status, run_at) where status in ('queued', 'failed');
create index jobs_type_idx on jobs (type, created_at desc);

create trigger jobs_touch
  before update on jobs
  for each row execute function app_touch_updated_at();

create table rate_limits (
  key          text not null,
  window_start timestamptz not null,
  count        integer not null default 0 check (count >= 0),
  primary key (key, window_start)
);
create index rate_limits_window_idx on rate_limits (window_start);

-- ---------------------------------------------------------------------------
-- Append-only enforcement
-- ---------------------------------------------------------------------------
create trigger audit_logs_append_only
  before update or delete on audit_logs
  for each row execute function app_reject_mutation();

create trigger security_events_append_only
  before update or delete on security_events
  for each row execute function app_reject_mutation();
