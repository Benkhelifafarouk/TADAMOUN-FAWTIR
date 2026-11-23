-- =============================================================================
-- Reference seed — safe to run repeatedly (idempotent).
-- Official 58 wilayas, demo municipalities, service catalogue, eligibility
-- rule v1, assistance policies, neutral household tiers, fund, settings.
-- All monetary values are integer centimes (1 DZD = 100 centimes).
-- =============================================================================

insert into wilayas (code, name_ar, name_fr) values
  ('01','أدرار','Adrar'), ('02','الشلف','Chlef'), ('03','الأغواط','Laghouat'),
  ('04','أم البواقي','Oum El Bouaghi'), ('05','باتنة','Batna'), ('06','بجاية','Béjaïa'),
  ('07','بسكرة','Biskra'), ('08','بشار','Béchar'), ('09','البليدة','Blida'),
  ('10','البويرة','Bouira'), ('11','تمنراست','Tamanrasset'), ('12','تبسة','Tébessa'),
  ('13','تلمسان','Tlemcen'), ('14','تيارت','Tiaret'), ('15','تيزي وزو','Tizi Ouzou'),
  ('16','الجزائر','Alger'), ('17','الجلفة','Djelfa'), ('18','جيجل','Jijel'),
  ('19','سطيف','Sétif'), ('20','سعيدة','Saïda'), ('21','سكيكدة','Skikda'),
  ('22','سيدي بلعباس','Sidi Bel Abbès'), ('23','عنابة','Annaba'), ('24','قالمة','Guelma'),
  ('25','قسنطينة','Constantine'), ('26','المدية','Médéa'), ('27','مستغانم','Mostaganem'),
  ('28','المسيلة','M''Sila'), ('29','معسكر','Mascara'), ('30','ورقلة','Ouargla'),
  ('31','وهران','Oran'), ('32','البيض','El Bayadh'), ('33','إليزي','Illizi'),
  ('34','برج بوعريريج','Bordj Bou Arréridj'), ('35','بومرداس','Boumerdès'),
  ('36','الطارف','El Tarf'), ('37','تندوف','Tindouf'), ('38','تيسمسيلت','Tissemsilt'),
  ('39','الوادي','El Oued'), ('40','خنشلة','Khenchela'), ('41','سوق أهراس','Souk Ahras'),
  ('42','تيبازة','Tipaza'), ('43','ميلة','Mila'), ('44','عين الدفلى','Aïn Defla'),
  ('45','النعامة','Naâma'), ('46','عين تموشنت','Aïn Témouchent'), ('47','غرداية','Ghardaïa'),
  ('48','غليزان','Relizane'), ('49','تيميمون','Timimoun'), ('50','برج باجي مختار','Bordj Badji Mokhtar'),
  ('51','أولاد جلال','Ouled Djellal'), ('52','بني عباس','Béni Abbès'), ('53','عين صالح','In Salah'),
  ('54','عين قزام','In Guezzam'), ('55','تقرت','Touggourt'), ('56','جانت','Djanet'),
  ('57','المغير','El M''Ghair'), ('58','المنيعة','El Meniaa')
on conflict (code) do nothing;

insert into municipalities (wilaya_id, code, name_ar, name_fr)
select w.id, v.code, v.name_ar, v.name_fr
from (values
  ('16','16001','الجزائر الوسطى','Alger-Centre'),
  ('16','16002','باب الوادي','Bab El Oued'),
  ('16','16003','حيدرة','Hydra'),
  ('16','16004','براقي','Baraki'),
  ('31','31001','وهران','Oran'),
  ('31','31002','بئر الجير','Bir El Djir'),
  ('25','25001','قسنطينة','Constantine'),
  ('25','25002','الخروب','El Khroub'),
  ('09','09001','البليدة','Blida'),
  ('09','09002','بوفاريك','Boufarik'),
  ('15','15001','تيزي وزو','Tizi Ouzou'),
  ('19','19001','سطيف','Sétif'),
  ('23','23001','عنابة','Annaba'),
  ('17','17001','الجلفة','Djelfa'),
  ('47','47001','غرداية','Ghardaïa'),
  ('08','08001','بشار','Béchar')
) as v(wilaya_code, code, name_ar, name_fr)
join wilayas w on w.code = v.wilaya_code
on conflict (wilaya_id, code) do nothing;

insert into service_categories (code, name_ar, name_fr, description_ar, description_fr, consumption_unit, sort_order)
values
  ('electricity_gas','الكهرباء والغاز','Électricité et gaz',
   'فواتير الكهرباء والغاز المنزلي (سونلغاز)','Factures d''électricité et de gaz domestique (Sonelgaz)','kWh',10),
  ('water','المياه','Eau',
   'فواتير المياه المنزلية (الجزائرية للمياه)','Factures d''eau potable (ADE)','m³',20),
  ('internet','الإنترنت المنزلي','Internet à domicile',
   'اشتراكات الإنترنت المنزلي المرتبطة بالتعليم','Abonnements internet fixe liés à la scolarité','mois',30)
on conflict (code) do nothing;

insert into service_providers (category_id, code, name_ar, name_fr, bill_format, is_generic)
select c.id, v.code, v.name_ar, v.name_fr, v.bill_format::jsonb, v.is_generic
from (values
  ('electricity_gas','sonelgaz','سونلغاز','Sonelgaz',
   '{"labels":{"amount":["المبلغ الإجمالي","montant total","montant à payer"],"reference":["رقم الفاتورة","n° facture","référence"],"account":["رقم الزبون","n° client","compte"]}}', false),
  ('water','ade','الجزائرية للمياه','ADE (Algérienne des Eaux)',
   '{"labels":{"amount":["المبلغ الإجمالي","montant total"],"reference":["رقم الفاتورة","n° facture"],"account":["رقم الاشتراك","n° abonné"]}}', false),
  ('internet','algerie_telecom','اتصالات الجزائر','Algérie Télécom',
   '{"labels":{"amount":["المبلغ الإجمالي","montant"],"reference":["رقم الفاتورة","n° facture"],"account":["رقم الخط","n° ligne"]}}', false),
  ('internet','isp_generic','مزوّد إنترنت آخر','Autre fournisseur Internet',
   '{}', true)
) as v(category_code, code, name_ar, name_fr, bill_format, is_generic)
join service_categories c on c.code = v.category_code
on conflict (code) do nothing;

-- ---------------------------------------------------------------------------
-- Eligibility rule v1 (initial configurable policy, not a legal threshold)
-- ---------------------------------------------------------------------------
insert into eligibility_rules (key, name_ar, name_fr, description)
values ('standard_eligibility','أهلية الدعم القياسية','Éligibilité standard',
        'Deterministic, versioned eligibility policy. Values are configurable policy settings reviewed by the operator.')
on conflict (key) do nothing;

insert into eligibility_rule_versions (rule_id, version, config, is_active)
select r.id, 1, '{
  "engineVersion": "1.0.0",
  "minOverallConfidence": 0.75,
  "minCriticalFieldConfidence": 0.70,
  "criticalFields": ["billReference", "issueDate", "totalAmount", "accountNumber"],
  "maxBillAgeDays": 150,
  "futureDateToleranceDays": 5,
  "bills": { "minAmountCentimes": 30000, "maxAmountCentimes": 15000000 },
  "income": {
    "maxMonthlyIncomePerPersonCentimes": 1200000,
    "absoluteMaxMonthlyIncomeCentimes": 6000000,
    "requireDocumentAbovePerPersonCentimes": 600000
  },
  "household": { "maxSupportedSize": 15, "requireDocumentAboveSize": 8 },
  "risk": { "blockAtScore": 75, "uncertainAtScore": 45 },
  "duplicates": { "blockOnFileHash": true, "blockOnBillReference": true },
  "appeal": { "maxPerDecision": 2, "windowDays": 30 }
}'::jsonb, true
from eligibility_rules r
where r.key = 'standard_eligibility'
  and not exists (select 1 from eligibility_rule_versions v where v.rule_id = r.id and v.version = 1);

-- ---------------------------------------------------------------------------
-- Assistance policies (INITIAL DESIGN VALUES — not official Algerian limits)
-- ---------------------------------------------------------------------------
insert into assistance_policies (service_category_id, period, base_limit_centimes, bill_above_cap_policy, version, is_active)
select c.id, v.period, v.limit_centimes, 'publish_eligible_amount', 1, true
from (values
  ('electricity_gas','quarterly', 1000000::bigint),  -- 10 000 DZD
  ('water','quarterly', 300000::bigint),             --  3 000 DZD
  ('internet','monthly', 200000::bigint)             --  2 000 DZD
) as v(category_code, period, limit_centimes)
join service_categories c on c.code = v.category_code
where not exists (
  select 1 from assistance_policies p
  where p.service_category_id = c.id and p.is_active
);

-- Neutral tiers (multiplier 1.0). Real multipliers must be approved by policy
-- owners and entered through the admin console; the code never invents them.
insert into assistance_tiers (policy_id, min_household_size, max_household_size, multiplier)
select p.id, v.min_size, v.max_size, 1.00
from assistance_policies p
cross join (values (1, 2), (3, 5), (6, null)) as v(min_size, max_size)
where p.is_active
  and not exists (
    select 1 from assistance_tiers t
    where t.policy_id = p.id and t.min_household_size = v.min_size
      and t.max_household_size is not distinct from v.max_size
  );

-- ---------------------------------------------------------------------------
-- Solidarity fund + platform settings
-- ---------------------------------------------------------------------------
insert into solidarity_fund (name, balance_centimes)
select 'الصندوق التضامني العام', 0
where not exists (select 1 from solidarity_fund);

insert into platform_settings (key, value, description, is_public) values
  ('platform.name', '{"ar":"تضامن فواتير","fr":"Tadamoun Fawtir"}', 'Public platform name', true),
  ('platform.support_email', '"support@example.dz"', 'Support contact (placeholder)', true),
  ('privacy.policy_version', '"2026-11-draft"', 'Version of the privacy notice shown at consent', true),
  ('terms.version', '"2026-11-draft"', 'Version of the terms of service', true),
  ('payments.live_enabled', 'false', 'Real money collection. Must stay false until legal + PSP sign-off.', false),
  ('payments.provider', '"demo"', 'Active payment adapter', false),
  ('fund.auto_allocate', 'false', 'Automatically allocate fund balance to published requests', false),
  ('donations.public_enabled', 'true', 'Whether the public donation flow is offered', true),
  ('demo.mode', 'true', 'Demo (synthetic) data mode', true),
  ('data.retention_policy_version', '"2026-11-draft"', 'Retention schedule version', false),
  ('security.mfa_required_for_admin', 'true', 'Administrators must use MFA', false)
on conflict (key) do nothing;
