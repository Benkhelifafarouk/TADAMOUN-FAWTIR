import { getDb } from '@/lib/db';
import { num } from '@/lib/db/values';

export interface AdminOverview {
  users: number;
  beneficiaries: number;
  bills: number;
  decisions: number;
  approvals: number;
  rejections: number;
  needsDocs: number;
  uncertain: number;
  docsPending: number;
  openSignals: number;
  security24h: number;
  confirmedCentimes: number;
  pendingCentimes: number;
  allocatedCentimes: number;
  paidOutCentimes: number;
  fundBalanceCentimes: number;
  publishedRequests: number;
  completedRequests: number;
}

export async function getAdminOverview(): Promise<AdminOverview> {
  const db = await getDb();
  const rows = await db.query<Record<string, unknown>>(
    `select
       (select count(*)::int from users where status = 'active') as users,
       (select count(*)::int from beneficiary_profiles) as beneficiaries,
       (select count(*)::int from bills) as bills,
       (select count(*)::int from eligibility_decisions) as decisions,
       (select count(*)::int from eligibility_decisions where decision = 'APPROVED') as approvals,
       (select count(*)::int from eligibility_decisions where decision = 'REJECTED') as rejections,
       (select count(*)::int from verification_requests where status = 'needs_documents') as needs_docs,
       (select count(*)::int from verification_requests where status = 'uncertain') as uncertain,
       (select count(*)::int from document_requests where status = 'pending') as docs_pending,
       (select count(*)::int from fraud_signals where status = 'open') as open_signals,
       (select count(*)::int from security_events where created_at > now() - interval '24 hours') as security_24h,
       (select coalesce(sum(amount_centimes), 0) from donations where status = 'paid') as confirmed,
       (select coalesce(sum(amount_centimes), 0) from donations where status = 'pending') as pending,
       (select coalesce(sum(amount_centimes), 0) from donation_allocations) as allocated,
       (select coalesce(sum(paid_amount_centimes), 0) from assistance_requests) as paid_out,
       (select balance_centimes from solidarity_fund limit 1) as fund_balance,
       (select count(*)::int from assistance_requests where status in ('published','partially_funded','funded','paid')) as published,
       (select count(*)::int from assistance_requests where status = 'paid') as completed`,
  );
  const row = rows[0] ?? {};
  return {
    users: num(row.users),
    beneficiaries: num(row.beneficiaries),
    bills: num(row.bills),
    decisions: num(row.decisions),
    approvals: num(row.approvals),
    rejections: num(row.rejections),
    needsDocs: num(row.needs_docs),
    uncertain: num(row.uncertain),
    docsPending: num(row.docs_pending),
    openSignals: num(row.open_signals),
    security24h: num(row.security_24h),
    confirmedCentimes: num(row.confirmed),
    pendingCentimes: num(row.pending),
    allocatedCentimes: num(row.allocated),
    paidOutCentimes: num(row.paid_out),
    fundBalanceCentimes: num(row.fund_balance),
    publishedRequests: num(row.published),
    completedRequests: num(row.completed),
  };
}

export interface DistributionRow {
  label: string;
  count: number;
  amountCentimes: number;
}

export async function getServiceDistribution(): Promise<DistributionRow[]> {
  const db = await getDb();
  const rows = await db.query<{ name_ar: string; name_fr: string; count: number; amount: unknown }>(
    `select sc.name_ar, sc.name_fr, count(ar.id)::int as count,
            coalesce(sum(ar.eligible_amount_centimes), 0) as amount
       from service_categories sc
       left join assistance_requests ar on ar.service_category_id = sc.id
      group by sc.id, sc.name_ar, sc.name_fr
      order by count desc`,
  );
  return rows.map((row) => ({ label: row.name_ar, count: num(row.count), amountCentimes: num(row.amount) }));
}

export async function getWilayaDistribution(): Promise<DistributionRow[]> {
  const db = await getDb();
  const rows = await db.query<{ name_ar: string; count: number; amount: unknown }>(
    `select w.name_ar, count(ar.id)::int as count, coalesce(sum(ar.eligible_amount_centimes), 0) as amount
       from assistance_requests ar
       join wilayas w on w.id = ar.wilaya_id
      group by w.id, w.name_ar
      order by count desc
      limit 10`,
  );
  return rows.map((row) => ({ label: row.name_ar, count: num(row.count), amountCentimes: num(row.amount) }));
}

export async function getDecisionDistribution(): Promise<{ decision: string; count: number }[]> {
  const db = await getDb();
  const rows = await db.query<{ decision: string; count: number }>(
    `select decision, count(*)::int as count
       from eligibility_decisions
      where created_at > now() - interval '90 days'
      group by decision order by count desc`,
  );
  return rows.map((row) => ({ decision: row.decision, count: num(row.count) }));
}

export interface AdminUserRow {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  roles: string[];
  status: string;
  phoneVerified: boolean;
  createdAt: string;
  billCount: number;
}

export async function listAdminUsers(limit = 200): Promise<AdminUserRow[]> {
  const db = await getDb();
  const rows = await db.query<Record<string, unknown>>(
    `select u.id, u.full_name, u.email, u.phone, u.status, u.phone_verified_at, u.created_at,
            coalesce((select array_agg(r.role::text) from user_roles r where r.user_id = u.id), '{}') as roles,
            (select count(*)::int from bills b join beneficiary_profiles bp on bp.id = b.beneficiary_id
              where bp.user_id = u.id) as bill_count
       from users u
      order by u.created_at desc
      limit $1`,
    [limit],
  );
  return rows.map((row) => ({
    id: String(row.id),
    fullName: String(row.full_name),
    email: String(row.email),
    phone: row.phone ? String(row.phone) : null,
    roles: ((row.roles as string[]) ?? []).filter(Boolean),
    status: String(row.status),
    phoneVerified: Boolean(row.phone_verified_at),
    createdAt: new Date(row.created_at as string).toISOString(),
    billCount: num(row.bill_count),
  }));
}

export interface VerificationMonitorRow {
  id: string;
  billId: string;
  status: string;
  attemptNo: number;
  categoryNameAr: string;
  wilayaNameAr: string;
  billReference: string | null;
  totalCentimes: number | null;
  decision: string | null;
  eligibleCentimes: number | null;
  decidedAt: string | null;
  createdAt: string;
  pendingDocs: number;
  riskScore: number;
  ocrDemo: boolean;
  engineVersion: string | null;
}

export async function listVerificationMonitor(limit = 100): Promise<VerificationMonitorRow[]> {
  const db = await getDb();
  const rows = await db.query<Record<string, unknown>>(
    `select vr.id, vr.bill_id, vr.status, vr.attempt_no, vr.created_at,
            sc.name_ar as category_name_ar, w.name_ar as wilaya_name_ar,
            b.bill_reference, b.total_centimes, b.risk_score,
            d.decision, d.eligible_amount_centimes, d.created_at as decided_at, d.engine_version,
            (select count(*)::int from document_requests dr where dr.verification_request_id = vr.id and dr.status = 'pending') as pending_docs,
            coalesce((select r.is_demo from bill_ocr_results r join bill_files bf on bf.id = r.bill_file_id
                       where bf.bill_id = vr.bill_id order by r.created_at desc limit 1), false) as ocr_demo
       from verification_requests vr
       join bills b on b.id = vr.bill_id
       join service_categories sc on sc.id = b.service_category_id
       join beneficiary_profiles bp on bp.id = vr.beneficiary_id
       join wilayas w on w.id = bp.wilaya_id
       left join eligibility_decisions d on d.id = vr.current_decision_id
      order by vr.created_at desc
      limit $1`,
    [limit],
  );
  return rows.map((row) => ({
    id: String(row.id),
    billId: String(row.bill_id),
    status: String(row.status),
    attemptNo: num(row.attempt_no),
    categoryNameAr: String(row.category_name_ar),
    wilayaNameAr: String(row.wilaya_name_ar),
    billReference: row.bill_reference ? String(row.bill_reference) : null,
    totalCentimes: row.total_centimes === null ? null : num(row.total_centimes),
    decision: row.decision ? String(row.decision) : null,
    eligibleCentimes: row.eligible_amount_centimes === null ? null : num(row.eligible_amount_centimes),
    decidedAt: row.decided_at ? new Date(row.decided_at as string).toISOString() : null,
    createdAt: new Date(row.created_at as string).toISOString(),
    pendingDocs: num(row.pending_docs),
    riskScore: num(row.risk_score),
    ocrDemo: Boolean(row.ocr_demo),
    engineVersion: row.engine_version ? String(row.engine_version) : null,
  }));
}

export interface FraudSignalRow {
  id: string;
  code: string;
  severity: string;
  score: number;
  status: string;
  details: Record<string, unknown>;
  createdAt: string;
  billId: string | null;
  beneficiaryWilaya: string | null;
}

export async function listFraudSignals(): Promise<FraudSignalRow[]> {
  const db = await getDb();
  const rows = await db.query<Record<string, unknown>>(
    `select f.id, f.code, f.severity, f.score, f.status, f.details, f.created_at, f.bill_id,
            w.name_ar as wilaya_name
       from fraud_signals f
       left join beneficiary_profiles bp on bp.id = f.beneficiary_id
       left join wilayas w on w.id = bp.wilaya_id
      order by f.created_at desc limit 200`,
  );
  return rows.map((row) => ({
    id: String(row.id),
    code: String(row.code),
    severity: String(row.severity),
    score: num(row.score),
    status: String(row.status),
    details: (typeof row.details === 'string' ? JSON.parse(row.details) : row.details) as Record<string, unknown>,
    createdAt: new Date(row.created_at as string).toISOString(),
    billId: row.bill_id ? String(row.bill_id) : null,
    beneficiaryWilaya: row.wilaya_name ? String(row.wilaya_name) : null,
  }));
}

export interface AdminDonationRow {
  id: string;
  status: string;
  target: string;
  amountCentimes: number;
  donorEmail: string | null;
  publicRef: string | null;
  createdAt: string;
  paidAt: string | null;
  receiptNumber: string | null;
  allocatedCentimes: number;
}

export async function listAdminDonations(limit = 200): Promise<AdminDonationRow[]> {
  const db = await getDb();
  const rows = await db.query<Record<string, unknown>>(
    `select d.id, d.status, d.target, d.amount_centimes, d.created_at, d.paid_at,
            u.email, ar.public_ref, r.receipt_number,
            coalesce((select sum(a.amount_centimes) from donation_allocations a where a.donation_id = d.id), 0) as allocated
       from donations d
       left join users u on u.id = d.donor_user_id
       left join assistance_requests ar on ar.id = d.assistance_request_id
       left join receipts r on r.donation_id = d.id
      order by d.created_at desc
      limit $1`,
    [limit],
  );
  return rows.map((row) => ({
    id: String(row.id),
    status: String(row.status),
    target: String(row.target),
    amountCentimes: num(row.amount_centimes),
    donorEmail: row.email ? String(row.email) : null,
    publicRef: row.public_ref ? String(row.public_ref) : null,
    createdAt: new Date(row.created_at as string).toISOString(),
    paidAt: row.paid_at ? new Date(row.paid_at as string).toISOString() : null,
    receiptNumber: row.receipt_number ? String(row.receipt_number) : null,
    allocatedCentimes: num(row.allocated),
  }));
}

export interface FundView {
  balanceCentimes: number;
  contributionsCentimes: number;
  allocatedCentimes: number;
  ledger: {
    id: string;
    entryType: string;
    amountCentimes: number;
    reason: string;
    createdAt: string;
    publicRef: string | null;
  }[];
  fundableRequests: { id: string; publicRef: string; remainingCentimes: number }[];
}

export async function getFundView(): Promise<FundView> {
  const db = await getDb();
  const fundRows = await db.query<{
    balance_centimes: unknown;
    total_contributions_centimes: unknown;
    total_allocated_centimes: unknown;
  }>('select balance_centimes, total_contributions_centimes, total_allocated_centimes from solidarity_fund limit 1');

  const ledger = await db.query<{
    id: string;
    entry_type: string;
    amount_centimes: unknown;
    reason: string;
    created_at: Date;
    public_ref: string | null;
  }>(
    `select l.id, l.entry_type, l.amount_centimes, l.reason, l.created_at, ar.public_ref
       from fund_ledger_entries l
       left join assistance_requests ar on ar.id = l.assistance_request_id
      order by l.created_at desc limit 100`,
  );

  const requests = await db.query<{ id: string; public_ref: string; remaining: unknown }>(
    `select id, public_ref, (eligible_amount_centimes - funded_amount_centimes) as remaining
       from assistance_requests
      where status in ('published', 'partially_funded')
        and eligible_amount_centimes > funded_amount_centimes
      order by published_at asc limit 50`,
  );

  const fund = fundRows[0];
  return {
    balanceCentimes: num(fund?.balance_centimes),
    contributionsCentimes: num(fund?.total_contributions_centimes),
    allocatedCentimes: num(fund?.total_allocated_centimes),
    ledger: ledger.map((row) => ({
      id: row.id,
      entryType: row.entry_type,
      amountCentimes: num(row.amount_centimes),
      reason: row.reason,
      createdAt: new Date(row.created_at).toISOString(),
      publicRef: row.public_ref,
    })),
    fundableRequests: requests.map((row) => ({
      id: row.id,
      publicRef: row.public_ref,
      remainingCentimes: num(row.remaining),
    })),
  };
}

export interface FinancialReport {
  confirmedCentimes: number;
  pendingCentimes: number;
  refundedCentimes: number;
  allocatedCentimes: number;
  paidOutCentimes: number;
  fundInCentimes: number;
  fundOutCentimes: number;
  demoReceipts: number;
  realReceipts: number;
}

export async function getFinancialReport(from: Date, to: Date): Promise<FinancialReport> {
  const db = await getDb();
  const rows = await db.query<Record<string, unknown>>(
    `select
       (select coalesce(sum(amount_centimes),0) from donations where status = 'paid' and paid_at >= $1 and paid_at < $2) as confirmed,
       (select coalesce(sum(amount_centimes),0) from donations where status = 'pending' and created_at >= $1 and created_at < $2) as pending,
       (select coalesce(sum(amount_centimes),0) from refunds where status = 'processed' and processed_at >= $1 and processed_at < $2) as refunded,
       (select coalesce(sum(amount_centimes),0) from donation_allocations where created_at >= $1 and created_at < $2) as allocated,
       (select coalesce(sum(paid_amount_centimes),0) from assistance_requests where paid_at >= $1 and paid_at < $2) as paid_out,
       (select coalesce(sum(amount_centimes),0) from fund_ledger_entries where entry_type = 'contribution' and created_at >= $1 and created_at < $2) as fund_in,
       (select coalesce(sum(-amount_centimes),0) from fund_ledger_entries where entry_type = 'allocation' and created_at >= $1 and created_at < $2) as fund_out,
       (select count(*)::int from receipts where is_demo and issued_at >= $1 and issued_at < $2) as demo_receipts,
       (select count(*)::int from receipts where not is_demo and issued_at >= $1 and issued_at < $2) as real_receipts`,
    [from, to],
  );
  const row = rows[0] ?? {};
  return {
    confirmedCentimes: num(row.confirmed),
    pendingCentimes: num(row.pending),
    refundedCentimes: num(row.refunded),
    allocatedCentimes: num(row.allocated),
    paidOutCentimes: num(row.paid_out),
    fundInCentimes: num(row.fund_in),
    fundOutCentimes: num(row.fund_out),
    demoReceipts: num(row.demo_receipts),
    realReceipts: num(row.real_receipts),
  };
}

export interface SecurityEventRow {
  id: string;
  eventType: string;
  severity: string;
  route: string | null;
  details: Record<string, unknown>;
  createdAt: string;
}

export async function listSecurityEvents(limit = 100): Promise<SecurityEventRow[]> {
  const db = await getDb();
  const rows = await db.query<Record<string, unknown>>(
    `select id, event_type, severity, route, details, created_at
       from security_events order by created_at desc limit $1`,
    [limit],
  );
  return rows.map((row) => ({
    id: String(row.id),
    eventType: String(row.event_type),
    severity: String(row.severity),
    route: row.route ? String(row.route) : null,
    details: (typeof row.details === 'string' ? JSON.parse(row.details) : row.details) as Record<string, unknown>,
    createdAt: new Date(row.created_at as string).toISOString(),
  }));
}

export interface AuditRow {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  actorRole: string | null;
  actorEmail: string | null;
  createdAt: string;
}

export async function listAuditLogs(limit = 100): Promise<AuditRow[]> {
  const db = await getDb();
  const rows = await db.query<Record<string, unknown>>(
    `select a.id, a.action, a.entity_type, a.entity_id, a.actor_role, a.created_at, u.email
       from audit_logs a
       left join users u on u.id = a.actor_user_id
      order by a.created_at desc limit $1`,
    [limit],
  );
  return rows.map((row) => ({
    id: String(row.id),
    action: String(row.action),
    entityType: String(row.entity_type),
    entityId: row.entity_id ? String(row.entity_id) : null,
    actorRole: row.actor_role ? String(row.actor_role) : null,
    actorEmail: row.email ? String(row.email) : null,
    createdAt: new Date(row.created_at as string).toISOString(),
  }));
}

export interface TicketRow {
  id: string;
  subject: string;
  message: string;
  status: string;
  priority: string;
  contactEmail: string | null;
  createdAt: string;
}

export async function listSupportTickets(): Promise<TicketRow[]> {
  const db = await getDb();
  const rows = await db.query<Record<string, unknown>>(
    `select id, subject, message, status, priority, contact_email, created_at
       from support_tickets order by created_at desc limit 200`,
  );
  return rows.map((row) => ({
    id: String(row.id),
    subject: String(row.subject),
    message: String(row.message),
    status: String(row.status),
    priority: String(row.priority),
    contactEmail: row.contact_email ? String(row.contact_email) : null,
    createdAt: new Date(row.created_at as string).toISOString(),
  }));
}

export async function listSettings(): Promise<{ key: string; value: unknown; isPublic: boolean; description: string | null }[]> {
  const db = await getDb();
  const rows = await db.query<{ key: string; value: unknown; is_public: boolean; description: string | null }>(
    'select key, value, is_public, description from platform_settings order by key',
  );
  return rows.map((row) => ({
    key: row.key,
    value: typeof row.value === 'string' ? JSON.parse(row.value) : row.value,
    isPublic: row.is_public,
    description: row.description,
  }));
}

export async function listAppealsAdmin(): Promise<
  { id: string; status: string; outcome: string | null; submittedAt: string; message: string; wilaya: string }[]
> {
  const db = await getDb();
  const rows = await db.query<Record<string, unknown>>(
    `select a.id, a.status, a.outcome, a.submitted_at, a.message, w.name_ar as wilaya
       from appeals a
       join beneficiary_profiles bp on bp.id = a.beneficiary_id
       join wilayas w on w.id = bp.wilaya_id
      order by a.submitted_at desc limit 200`,
  );
  return rows.map((row) => ({
    id: String(row.id),
    status: String(row.status),
    outcome: row.outcome ? String(row.outcome) : null,
    submittedAt: new Date(row.submitted_at as string).toISOString(),
    message: String(row.message),
    wilaya: String(row.wilaya),
  }));
}

export interface RuleVersionRow {
  id: string;
  version: number;
  isActive: boolean;
  effectiveFrom: string;
  config: Record<string, unknown>;
}

export async function listRuleVersions(): Promise<RuleVersionRow[]> {
  const db = await getDb();
  const rows = await db.query<Record<string, unknown>>(
    `select v.id, v.version, v.is_active, v.effective_from, v.config
       from eligibility_rule_versions v
       join eligibility_rules r on r.id = v.rule_id
      where r.key = 'standard_eligibility'
      order by v.version desc`,
  );
  return rows.map((row) => ({
    id: String(row.id),
    version: num(row.version),
    isActive: Boolean(row.is_active),
    effectiveFrom: new Date(row.effective_from as string).toISOString(),
    config: (typeof row.config === 'string' ? JSON.parse(row.config) : row.config) as Record<string, unknown>,
  }));
}

export interface PolicyRow {
  id: string;
  categoryCode: string;
  categoryNameAr: string;
  categoryNameFr: string;
  period: string;
  baseLimitCentimes: number;
  isActive: boolean;
  version: number;
  tiers: { min: number; max: number | null; multiplier: number }[];
}

export async function listPolicies(): Promise<PolicyRow[]> {
  const db = await getDb();
  const rows = await db.query<Record<string, unknown>>(
    `select p.id, p.period, p.base_limit_centimes, p.is_active, p.version,
            sc.code as category_code, sc.name_ar, sc.name_fr
       from assistance_policies p
       join service_categories sc on sc.id = p.service_category_id
      order by sc.sort_order, p.effective_from desc`,
  );
  const tiers = await db.query<{ policy_id: string; min_household_size: number; max_household_size: number | null; multiplier: unknown }>(
    'select policy_id, min_household_size, max_household_size, multiplier from assistance_tiers order by min_household_size',
  );
  return rows.map((row) => ({
    id: String(row.id),
    categoryCode: String(row.category_code),
    categoryNameAr: String(row.name_ar),
    categoryNameFr: String(row.name_fr),
    period: String(row.period),
    baseLimitCentimes: num(row.base_limit_centimes),
    isActive: Boolean(row.is_active),
    version: num(row.version),
    tiers: tiers
      .filter((tier) => tier.policy_id === row.id)
      .map((tier) => ({
        min: num(tier.min_household_size),
        max: tier.max_household_size === null ? null : num(tier.max_household_size),
        multiplier: num(tier.multiplier),
      })),
  }));
}

export interface ProviderRow {
  id: string;
  code: string;
  nameAr: string;
  nameFr: string;
  categoryCode: string;
  categoryNameAr: string;
  isActive: boolean;
  isGeneric: boolean;
}

export async function listProviders(): Promise<ProviderRow[]> {
  const db = await getDb();
  const rows = await db.query<Record<string, unknown>>(
    `select p.id, p.code, p.name_ar, p.name_fr, p.is_active, p.is_generic,
            sc.code as category_code, sc.name_ar as category_name_ar
       from service_providers p
       join service_categories sc on sc.id = p.category_id
      order by sc.sort_order, p.name_ar`,
  );
  return rows.map((row) => ({
    id: String(row.id),
    code: String(row.code),
    nameAr: String(row.name_ar),
    nameFr: String(row.name_fr),
    categoryCode: String(row.category_code),
    categoryNameAr: String(row.category_name_ar),
    isActive: Boolean(row.is_active),
    isGeneric: Boolean(row.is_generic),
  }));
}

export async function listMunicipalityRows(): Promise<
  { id: string; code: string; nameAr: string; nameFr: string; wilayaCode: string }[]
> {
  const db = await getDb();
  const rows = await db.query<Record<string, unknown>>(
    `select m.id, m.code, m.name_ar, m.name_fr, w.code as wilaya_code
       from municipalities m join wilayas w on w.id = m.wilaya_id
      order by w.code, m.code`,
  );
  return rows.map((row) => ({
    id: String(row.id),
    code: String(row.code),
    nameAr: String(row.name_ar),
    nameFr: String(row.name_fr),
    wilayaCode: String(row.wilaya_code),
  }));
}

export async function listFundableRequestsForPayout(): Promise<
  { id: string; publicRef: string; fundedCentimes: number; status: string }[]
> {
  const db = await getDb();
  const rows = await db.query<{ id: string; public_ref: string; funded: unknown; status: string }>(
    `select id, public_ref, funded_amount_centimes as funded, status
       from assistance_requests
      where status = 'funded' and paid_amount_centimes = 0
      order by funded_at asc limit 50`,
  );
  return rows.map((row) => ({
    id: row.id,
    publicRef: row.public_ref,
    fundedCentimes: num(row.funded),
    status: row.status,
  }));
}
