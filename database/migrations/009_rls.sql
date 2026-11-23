-- =============================================================================
-- 009 — Row Level Security and role grants
-- =============================================================================
-- Model: `anon` (public), `authenticated` (signed-in user, identified by
-- app.current_user_id), and the server's own owner connection (service role).
--
-- IMPORTANT / documented limitation: the Next.js server connects as the table
-- owner and therefore bypasses RLS. Server-side authorization in
-- `lib/auth/guards.ts` is the primary control; RLS is defence-in-depth against
-- direct PostgREST / anon-key access (Supabase) and is verified by
-- tests/security/rls.test.ts using a non-superuser role.
-- =============================================================================

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
end
$$;

grant usage on schema public to anon, authenticated;
grant execute on function app_current_user_id() to anon, authenticated;
grant execute on function app_has_role(text) to anon, authenticated;
grant execute on function app_is_admin() to anon, authenticated;
grant execute on function app_is_support() to anon, authenticated;

-- Broad grants, then restricted per table below. RLS still filters every row.
grant select, insert, update, delete on all tables in schema public to authenticated;

alter table wilayas                  enable row level security;
alter table municipalities           enable row level security;
alter table service_categories       enable row level security;
alter table service_providers        enable row level security;
alter table platform_settings        enable row level security;
alter table users                    enable row level security;
alter table user_roles               enable row level security;
alter table sessions                 enable row level security;
alter table otp_codes                enable row level security;
alter table consent_records          enable row level security;
alter table account_verification_events enable row level security;
alter table stored_files             enable row level security;
alter table beneficiary_profiles     enable row level security;
alter table households               enable row level security;
alter table household_members        enable row level security;
alter table household_documents      enable row level security;
alter table eligibility_profiles     enable row level security;
alter table bills                    enable row level security;
alter table bill_files               enable row level security;
alter table bill_ocr_results         enable row level security;
alter table bill_verification_events enable row level security;
alter table verification_requests    enable row level security;
alter table verification_evidence    enable row level security;
alter table document_requests        enable row level security;
alter table fraud_signals            enable row level security;
alter table eligibility_rules        enable row level security;
alter table eligibility_rule_versions enable row level security;
alter table assistance_policies      enable row level security;
alter table assistance_tiers         enable row level security;
alter table eligibility_decisions    enable row level security;
alter table eligibility_decision_reasons enable row level security;
alter table appeals                  enable row level security;
alter table donor_profiles           enable row level security;
alter table donations                enable row level security;
alter table payment_transactions     enable row level security;
alter table payment_events           enable row level security;
alter table donation_allocations     enable row level security;
alter table refunds                  enable row level security;
alter table solidarity_fund          enable row level security;
alter table fund_ledger_entries      enable row level security;
alter table receipts                 enable row level security;
alter table assistance_requests      enable row level security;
alter table request_status_history   enable row level security;
alter table public_request_views     enable row level security;
alter table notifications            enable row level security;
alter table support_tickets          enable row level security;
alter table audit_logs               enable row level security;
alter table security_events          enable row level security;
alter table jobs                     enable row level security;
alter table rate_limits              enable row level security;

-- ---------------------------------------------------------------------------
-- Reference data: readable by everyone, writable by admins only.
-- ---------------------------------------------------------------------------
create policy wilayas_public_read on wilayas for select to anon, authenticated using (is_active);
create policy wilayas_admin_all on wilayas for all to authenticated using (app_is_admin()) with check (app_is_admin());

create policy municipalities_public_read on municipalities for select to anon, authenticated using (is_active);
create policy municipalities_admin_all on municipalities for all to authenticated using (app_is_admin()) with check (app_is_admin());

create policy categories_public_read on service_categories for select to anon, authenticated using (is_active);
create policy categories_admin_all on service_categories for all to authenticated using (app_is_admin()) with check (app_is_admin());

create policy providers_public_read on service_providers for select to anon, authenticated using (is_active);
create policy providers_admin_all on service_providers for all to authenticated using (app_is_admin()) with check (app_is_admin());

create policy settings_public_read on platform_settings for select to anon, authenticated using (is_public);
create policy settings_admin_all on platform_settings for all to authenticated using (app_is_admin()) with check (app_is_admin());

-- ---------------------------------------------------------------------------
-- Identity
-- ---------------------------------------------------------------------------
create policy users_self_read on users for select to authenticated
  using (id = app_current_user_id());
create policy users_admin_read on users for select to authenticated
  using (app_is_admin());

create policy user_roles_self_read on user_roles for select to authenticated
  using (user_id = app_current_user_id());
create policy user_roles_admin_read on user_roles for select to authenticated
  using (app_is_admin());

-- A user may only change their own editable profile columns (column grants below).
create policy users_self_update on users for update to authenticated
  using (id = app_current_user_id())
  with check (id = app_current_user_id());

create policy sessions_self_read on sessions for select to authenticated
  using (user_id = app_current_user_id());
create policy sessions_self_delete on sessions for delete to authenticated
  using (user_id = app_current_user_id());

create policy consent_self_read on consent_records for select to authenticated
  using (user_id = app_current_user_id());
create policy consent_self_insert on consent_records for insert to authenticated
  with check (user_id = app_current_user_id());

create policy verification_events_self_read on account_verification_events for select to authenticated
  using (user_id = app_current_user_id());

-- otp_codes: no policy at all. Service-role only; the code hash must never be
-- readable through a client token.

-- ---------------------------------------------------------------------------
-- Beneficiary domain
-- ---------------------------------------------------------------------------
create policy beneficiary_profiles_self_read on beneficiary_profiles for select to authenticated
  using (user_id = app_current_user_id());
create policy beneficiary_profiles_self_insert on beneficiary_profiles for insert to authenticated
  with check (user_id = app_current_user_id());
create policy beneficiary_profiles_self_update on beneficiary_profiles for update to authenticated
  using (user_id = app_current_user_id())
  with check (user_id = app_current_user_id());
create policy beneficiary_profiles_admin_read on beneficiary_profiles for select to authenticated
  using (app_is_admin());

create policy stored_files_self_read on stored_files for select to authenticated
  using (owner_user_id = app_current_user_id() and deleted_at is null);
create policy stored_files_admin_read on stored_files for select to authenticated
  using (app_is_admin());

create policy households_self_all on households for select to authenticated
  using (exists (select 1 from beneficiary_profiles bp
                 where bp.id = households.beneficiary_id and bp.user_id = app_current_user_id()));
create policy households_self_update on households for update to authenticated
  using (exists (select 1 from beneficiary_profiles bp
                 where bp.id = households.beneficiary_id and bp.user_id = app_current_user_id()))
  with check (exists (select 1 from beneficiary_profiles bp
                 where bp.id = households.beneficiary_id and bp.user_id = app_current_user_id()));

create policy household_members_self_read on household_members for select to authenticated
  using (exists (select 1 from households h
                 join beneficiary_profiles bp on bp.id = h.beneficiary_id
                 where h.id = household_members.household_id and bp.user_id = app_current_user_id()));

create policy household_documents_self_read on household_documents for select to authenticated
  using (exists (select 1 from households h
                 join beneficiary_profiles bp on bp.id = h.beneficiary_id
                 where h.id = household_documents.household_id and bp.user_id = app_current_user_id()));

create policy eligibility_profiles_self_read on eligibility_profiles for select to authenticated
  using (exists (select 1 from beneficiary_profiles bp
                 where bp.id = eligibility_profiles.beneficiary_id and bp.user_id = app_current_user_id()));

-- ---------------------------------------------------------------------------
-- Bills and verification
-- ---------------------------------------------------------------------------
create policy bills_self_read on bills for select to authenticated
  using (exists (select 1 from beneficiary_profiles bp
                 where bp.id = bills.beneficiary_id and bp.user_id = app_current_user_id()));
create policy bills_admin_read on bills for select to authenticated using (app_is_admin());

create policy bill_files_self_read on bill_files for select to authenticated
  using (exists (select 1 from bills b
                 join beneficiary_profiles bp on bp.id = b.beneficiary_id
                 where b.id = bill_files.bill_id and bp.user_id = app_current_user_id()));

create policy verification_requests_self_read on verification_requests for select to authenticated
  using (exists (select 1 from beneficiary_profiles bp
                 where bp.id = verification_requests.beneficiary_id and bp.user_id = app_current_user_id()));
create policy verification_requests_admin_read on verification_requests for select to authenticated
  using (app_is_admin());

create policy document_requests_self_read on document_requests for select to authenticated
  using (exists (select 1 from beneficiary_profiles bp
                 where bp.id = document_requests.beneficiary_id and bp.user_id = app_current_user_id()));
create policy document_requests_admin_read on document_requests for select to authenticated
  using (app_is_admin());

create policy decisions_self_read on eligibility_decisions for select to authenticated
  using (exists (select 1 from beneficiary_profiles bp
                 where bp.id = eligibility_decisions.beneficiary_id and bp.user_id = app_current_user_id()));
create policy decisions_admin_read on eligibility_decisions for select to authenticated
  using (app_is_admin());

create policy decision_reasons_self_read on eligibility_decision_reasons for select to authenticated
  using (exists (select 1 from eligibility_decisions d
                 join beneficiary_profiles bp on bp.id = d.beneficiary_id
                 where d.id = eligibility_decision_reasons.decision_id and bp.user_id = app_current_user_id()));

create policy appeals_self_read on appeals for select to authenticated
  using (exists (select 1 from beneficiary_profiles bp
                 where bp.id = appeals.beneficiary_id and bp.user_id = app_current_user_id()));

create policy fraud_signals_admin_read on fraud_signals for select to authenticated
  using (app_is_admin());

create policy rules_authenticated_read on eligibility_rules for select to authenticated using (true);
create policy rule_versions_admin_read on eligibility_rule_versions for select to authenticated
  using (app_is_admin());
create policy policies_authenticated_read on assistance_policies for select to authenticated using (is_active);
create policy tiers_authenticated_read on assistance_tiers for select to authenticated
  using (exists (select 1 from assistance_policies p where p.id = assistance_tiers.policy_id and p.is_active));

-- ---------------------------------------------------------------------------
-- Requests (public read happens through the view, never through base tables)
-- ---------------------------------------------------------------------------
create policy requests_self_read on assistance_requests for select to authenticated
  using (exists (select 1 from beneficiary_profiles bp
                 where bp.id = assistance_requests.beneficiary_id and bp.user_id = app_current_user_id()));
create policy requests_admin_read on assistance_requests for select to authenticated
  using (app_is_admin());

create policy request_history_self_read on request_status_history for select to authenticated
  using (exists (select 1 from assistance_requests ar
                 join beneficiary_profiles bp on bp.id = ar.beneficiary_id
                 where ar.id = request_status_history.request_id and bp.user_id = app_current_user_id()));

create policy request_views_admin_read on public_request_views for select to authenticated
  using (app_is_admin());

-- ---------------------------------------------------------------------------
-- Donations
-- ---------------------------------------------------------------------------
create policy donor_profiles_self_read on donor_profiles for select to authenticated
  using (user_id = app_current_user_id());
create policy donor_profiles_self_update on donor_profiles for update to authenticated
  using (user_id = app_current_user_id()) with check (user_id = app_current_user_id());

create policy donations_self_read on donations for select to authenticated
  using (donor_user_id = app_current_user_id());
create policy donations_admin_read on donations for select to authenticated
  using (app_is_admin());

create policy payment_transactions_self_read on payment_transactions for select to authenticated
  using (exists (select 1 from donations d
                 where d.id = payment_transactions.donation_id
                   and d.donor_user_id = app_current_user_id()));

create policy allocations_donor_read on donation_allocations for select to authenticated
  using (exists (select 1 from donations d
                 where d.id = donation_allocations.donation_id
                   and d.donor_user_id = app_current_user_id()));
create policy allocations_beneficiary_read on donation_allocations for select to authenticated
  using (exists (select 1 from assistance_requests ar
                 join beneficiary_profiles bp on bp.id = ar.beneficiary_id
                 where ar.id = donation_allocations.assistance_request_id
                   and bp.user_id = app_current_user_id()));
create policy allocations_admin_read on donation_allocations for select to authenticated
  using (app_is_admin());

create policy refunds_self_read on refunds for select to authenticated
  using (exists (select 1 from donations d
                 where d.id = refunds.donation_id and d.donor_user_id = app_current_user_id()));

create policy fund_authenticated_read on solidarity_fund for select to authenticated using (true);
create policy fund_ledger_admin_read on fund_ledger_entries for select to authenticated using (app_is_admin());

create policy receipts_self_read on receipts for select to authenticated
  using (exists (select 1 from donations d
                 where d.id = receipts.donation_id and d.donor_user_id = app_current_user_id()));
create policy receipts_admin_read on receipts for select to authenticated using (app_is_admin());

-- ---------------------------------------------------------------------------
-- Operations
-- ---------------------------------------------------------------------------
create policy notifications_self_read on notifications for select to authenticated
  using (user_id = app_current_user_id());
create policy notifications_self_update on notifications for update to authenticated
  using (user_id = app_current_user_id()) with check (user_id = app_current_user_id());

create policy tickets_self_read on support_tickets for select to authenticated
  using (user_id = app_current_user_id() or contact_email = (select email from users u where u.id = app_current_user_id()));
create policy tickets_self_insert on support_tickets for insert to authenticated
  with check (user_id = app_current_user_id());
create policy tickets_admin_read on support_tickets for select to authenticated using (app_is_admin() or app_is_support());

create policy audit_admin_read on audit_logs for select to authenticated using (app_is_admin());
create policy security_admin_read on security_events for select to authenticated using (app_is_admin());
create policy jobs_admin_read on jobs for select to authenticated using (app_is_admin());

-- ---------------------------------------------------------------------------
-- Privilege tightening: these tables are append-only or server-only.
-- ---------------------------------------------------------------------------
revoke update, delete on audit_logs, security_events, fund_ledger_entries,
  payment_events, donation_allocations, receipts, request_status_history,
  eligibility_decisions, eligibility_decision_reasons from authenticated;

revoke insert, update, delete on otp_codes, sessions, user_roles, verification_evidence,
  fraud_signals, bill_ocr_results, bill_files, stored_files, payment_transactions,
  jobs, rate_limits, public_request_views, eligibility_profiles, household_members,
  household_documents, account_verification_events, eligibility_rule_versions,
  assistance_policies, assistance_tiers, platform_settings, wilayas, municipalities,
  service_categories, service_providers, solidarity_fund from authenticated;

revoke update on users from authenticated;
grant update (full_name, phone, preferred_locale) on users to authenticated;

revoke update on notifications from authenticated;
grant update (read_at) on notifications to authenticated;

revoke update, delete on donations from authenticated;
revoke update on donor_profiles from authenticated;
grant update (display_name, is_anonymous) on donor_profiles to authenticated;

revoke update on appeals from authenticated;
revoke update on bills, beneficiary_profiles from authenticated;
grant update (address_line, municipality_id, wilaya_id) on beneficiary_profiles to authenticated;
revoke update on households from authenticated;
grant update (size, children_count, monthly_income_centimes, income_source, housing_status)
  on households to authenticated;

-- Public projection: the only donor-facing database object.
grant select on public_assistance_requests to anon, authenticated;

-- Anonymous visitors may read public platform settings and reference tables only.
grant select on wilayas, municipalities, service_categories, service_providers to anon;
grant select on platform_settings to anon;
