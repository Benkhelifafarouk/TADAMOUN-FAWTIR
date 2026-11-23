-- =============================================================================
-- 011 — Additions required by the implemented features
-- =============================================================================
-- Documented reasons for each change:
--   users.mfa_secret / mfa_enabled : TOTP second factor for administrators.
--   sessions.mfa_verified_at       : lets a sensitive admin action require a
--                                    recent second-factor check on this session.
--   assistance_requests.anonymized_description_fr : public text must exist in
--                                    both supported languages, not machine
--                                    translated at render time.
--   eligibility_decisions.next_action : beneficiary-facing next step code,
--                                    stored with the immutable decision.
--   verification_requests.last_error  : operational visibility for failures.
-- =============================================================================

alter table users
  add column mfa_secret text,
  add column mfa_enabled boolean not null default false;

alter table sessions
  add column mfa_verified_at timestamptz;

alter table assistance_requests
  add column anonymized_description_fr text;

alter table eligibility_decisions
  add column next_action text;

alter table verification_requests
  add column last_error text;

update assistance_requests
set anonymized_description_fr = anonymized_description
where anonymized_description_fr is null;

alter table assistance_requests
  alter column anonymized_description_fr set not null;

-- Re-create the public projection to include the French description.
create or replace view public_assistance_requests
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
  ar.expires_at,
  ar.anonymized_description_fr
from assistance_requests ar
join service_categories sc on sc.id = ar.service_category_id
join service_providers sp on sp.id = ar.provider_id
join wilayas w on w.id = ar.wilaya_id
left join municipalities m on m.id = ar.municipality_id
where ar.status in ('published', 'partially_funded', 'funded', 'paid')
  and ar.published_at is not null;

grant select on public_assistance_requests to anon, authenticated;
