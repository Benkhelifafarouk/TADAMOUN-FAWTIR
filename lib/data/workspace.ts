import { getDb } from '@/lib/db';
import { num, numOrNull } from '@/lib/db/values';

export interface BeneficiaryContext {
  beneficiaryId: string;
  status: string;
  wilayaId: string;
  wilayaNameAr: string;
  wilayaNameFr: string;
  municipalityId: string | null;
  municipalityNameAr: string | null;
  municipalityNameFr: string | null;
  addressLine: string | null;
  householdId: string | null;
  householdSize: number | null;
  childrenCount: number | null;
  incomeCentimes: number | null;
  incomeSource: string | null;
  housingStatus: string | null;
  phoneVerified: boolean;
  counts: {
    bills: number;
    pendingDocuments: number;
    publishedRequests: number;
    approved: number;
    rejected: number;
    unreadNotifications: number;
  };
}

export async function getBeneficiaryContext(userId: string): Promise<BeneficiaryContext | null> {
  const db = await getDb();
  const rows = await db.query<Record<string, unknown>>(
    `select bp.id, bp.status, bp.wilaya_id, w.name_ar as wilaya_name_ar, w.name_fr as wilaya_name_fr,
            bp.municipality_id, m.name_ar as municipality_name_ar, m.name_fr as municipality_name_fr,
            bp.address_line, h.id as household_id, h.size, h.children_count,
            h.monthly_income_centimes, h.income_source, h.housing_status,
            u.phone_verified_at,
            (select count(*)::int from bills b where b.beneficiary_id = bp.id) as bills_count,
            (select count(*)::int from document_requests dr
              where dr.beneficiary_id = bp.id and dr.status = 'pending') as pending_docs,
            (select count(*)::int from assistance_requests ar
              where ar.beneficiary_id = bp.id and ar.status in ('published','partially_funded','funded','paid')) as published_count,
            (select count(*)::int from eligibility_decisions d
              where d.beneficiary_id = bp.id and d.decision = 'APPROVED') as approved_count,
            (select count(*)::int from eligibility_decisions d
              where d.beneficiary_id = bp.id and d.decision = 'REJECTED') as rejected_count,
            (select count(*)::int from notifications n
              where n.user_id = bp.user_id and n.read_at is null) as unread_count
       from beneficiary_profiles bp
       join users u on u.id = bp.user_id
       join wilayas w on w.id = bp.wilaya_id
       left join municipalities m on m.id = bp.municipality_id
       left join households h on h.beneficiary_id = bp.id
      where bp.user_id = $1`,
    [userId],
  );
  const row = rows[0];
  if (!row) return null;

  return {
    beneficiaryId: String(row.id),
    status: String(row.status),
    wilayaId: String(row.wilaya_id),
    wilayaNameAr: String(row.wilaya_name_ar),
    wilayaNameFr: String(row.wilaya_name_fr),
    municipalityId: row.municipality_id ? String(row.municipality_id) : null,
    municipalityNameAr: row.municipality_name_ar ? String(row.municipality_name_ar) : null,
    municipalityNameFr: row.municipality_name_fr ? String(row.municipality_name_fr) : null,
    addressLine: row.address_line ? String(row.address_line) : null,
    householdId: row.household_id ? String(row.household_id) : null,
    householdSize: numOrNull(row.size),
    childrenCount: numOrNull(row.children_count),
    incomeCentimes: numOrNull(row.monthly_income_centimes),
    incomeSource: row.income_source ? String(row.income_source) : null,
    housingStatus: row.housing_status ? String(row.housing_status) : null,
    phoneVerified: Boolean(row.phone_verified_at),
    counts: {
      bills: num(row.bills_count),
      pendingDocuments: num(row.pending_docs),
      publishedRequests: num(row.published_count),
      approved: num(row.approved_count),
      rejected: num(row.rejected_count),
      unreadNotifications: num(row.unread_count),
    },
  };
}

export interface BillListRow {
  id: string;
  status: string;
  categoryNameAr: string;
  categoryNameFr: string;
  providerNameAr: string;
  providerNameFr: string;
  billReference: string | null;
  totalCentimes: number | null;
  decision: string | null;
  eligibleCentimes: number | null;
  publicRef: string | null;
  createdAt: string;
}

export async function listBills(userId: string, limit = 50): Promise<BillListRow[]> {
  const db = await getDb();
  const rows = await db.query<Record<string, unknown>>(
    `select b.id, b.status, sc.name_ar as category_name_ar, sc.name_fr as category_name_fr,
            sp.name_ar as provider_name_ar, sp.name_fr as provider_name_fr,
            b.bill_reference, b.total_centimes, b.created_at,
            ar.public_ref, ar.eligible_amount_centimes,
            (select d.decision from eligibility_decisions d
               join verification_requests vr on vr.id = d.verification_request_id
              where vr.bill_id = b.id order by d.created_at desc limit 1) as decision
       from bills b
       join beneficiary_profiles bp on bp.id = b.beneficiary_id
       join service_categories sc on sc.id = b.service_category_id
       join service_providers sp on sp.id = b.provider_id
       left join assistance_requests ar on ar.bill_id = b.id
      where bp.user_id = $1
      order by b.created_at desc
      limit $2`,
    [userId, limit],
  );
  return rows.map((row) => ({
    id: String(row.id),
    status: String(row.status),
    categoryNameAr: String(row.category_name_ar),
    categoryNameFr: String(row.category_name_fr),
    providerNameAr: String(row.provider_name_ar),
    providerNameFr: String(row.provider_name_fr),
    billReference: row.bill_reference ? String(row.bill_reference) : null,
    totalCentimes: numOrNull(row.total_centimes),
    decision: row.decision ? String(row.decision) : null,
    eligibleCentimes: numOrNull(row.eligible_amount_centimes),
    publicRef: row.public_ref ? String(row.public_ref) : null,
    createdAt: new Date(row.created_at as string).toISOString(),
  }));
}

export interface BeneficiaryRequestRow {
  id: string;
  publicRef: string;
  status: string;
  categoryNameAr: string;
  categoryNameFr: string;
  eligibleCentimes: number;
  fundedCentimes: number;
  paidCentimes: number;
  publishedAt: string | null;
  expiresAt: string | null;
}

export async function listBeneficiaryRequests(userId: string): Promise<BeneficiaryRequestRow[]> {
  const db = await getDb();
  const rows = await db.query<Record<string, unknown>>(
    `select ar.id, ar.public_ref, ar.status, sc.name_ar as category_name_ar, sc.name_fr as category_name_fr,
            ar.eligible_amount_centimes, ar.funded_amount_centimes, ar.paid_amount_centimes,
            ar.published_at, ar.expires_at
       from assistance_requests ar
       join beneficiary_profiles bp on bp.id = ar.beneficiary_id
       join service_categories sc on sc.id = ar.service_category_id
      where bp.user_id = $1
      order by ar.created_at desc`,
    [userId],
  );
  return rows.map((row) => ({
    id: String(row.id),
    publicRef: String(row.public_ref),
    status: String(row.status),
    categoryNameAr: String(row.category_name_ar),
    categoryNameFr: String(row.category_name_fr),
    eligibleCentimes: num(row.eligible_amount_centimes),
    fundedCentimes: num(row.funded_amount_centimes),
    paidCentimes: num(row.paid_amount_centimes),
    publishedAt: row.published_at ? new Date(row.published_at as string).toISOString() : null,
    expiresAt: row.expires_at ? new Date(row.expires_at as string).toISOString() : null,
  }));
}

export interface DocumentRequestRow {
  id: string;
  docType: string;
  status: string;
  reasonCode: string;
  dueAt: string | null;
  billId: string;
  publicRef: string | null;
  createdAt: string;
}

export async function listDocumentRequests(userId: string): Promise<DocumentRequestRow[]> {
  const db = await getDb();
  const rows = await db.query<Record<string, unknown>>(
    `select dr.id, dr.doc_type, dr.status, dr.reason_code, dr.due_at, dr.created_at,
            vr.bill_id, ar.public_ref
       from document_requests dr
       join verification_requests vr on vr.id = dr.verification_request_id
       join beneficiary_profiles bp on bp.id = dr.beneficiary_id
       left join assistance_requests ar on ar.bill_id = vr.bill_id
      where bp.user_id = $1
      order by dr.created_at desc`,
    [userId],
  );
  return rows.map((row) => ({
    id: String(row.id),
    docType: String(row.doc_type),
    status: String(row.status),
    reasonCode: String(row.reason_code),
    dueAt: row.due_at ? new Date(row.due_at as string).toISOString() : null,
    billId: String(row.bill_id),
    publicRef: row.public_ref ? String(row.public_ref) : null,
    createdAt: new Date(row.created_at as string).toISOString(),
  }));
}

export interface NotificationRow {
  id: string;
  event: string;
  titleKey: string;
  bodyKey: string;
  params: Record<string, string | number>;
  status: string;
  readAt: string | null;
  createdAt: string;
}

export async function listNotifications(userId: string, limit = 50): Promise<NotificationRow[]> {
  const db = await getDb();
  const rows = await db.query<Record<string, unknown>>(
    `select id, type as event, title_key, body_key, params, status, read_at, created_at
       from notifications where user_id = $1
      order by created_at desc limit $2`,
    [userId, limit],
  );
  return rows.map((row) => ({
    id: String(row.id),
    event: String(row.event),
    titleKey: String(row.title_key),
    bodyKey: String(row.body_key),
    params: (typeof row.params === 'string' ? JSON.parse(row.params) : row.params) as Record<string, string | number>,
    status: String(row.status),
    readAt: row.read_at ? new Date(row.read_at as string).toISOString() : null,
    createdAt: new Date(row.created_at as string).toISOString(),
  }));
}

export interface DonorSummary {
  totalPaidCentimes: number;
  supportedRequests: number;
  pendingCount: number;
  donationCount: number;
}

export async function getDonorSummary(userId: string): Promise<DonorSummary> {
  const db = await getDb();
  const rows = await db.query<{
    total: unknown;
    pending: number;
    total_count: number;
    supported: number;
  }>(
    `select
       coalesce(sum(case when status = 'paid' then amount_centimes else 0 end), 0) as total,
       count(*) filter (where status = 'pending')::int as pending,
       count(*)::int as total_count,
       count(distinct assistance_request_id) filter (where status = 'paid' and assistance_request_id is not null)::int as supported
     from donations where donor_user_id = $1`,
    [userId],
  );
  const row = rows[0];
  return {
    totalPaidCentimes: num(row?.total),
    supportedRequests: num(row?.supported),
    pendingCount: num(row?.pending),
    donationCount: num(row?.total_count),
  };
}

export interface DonationRow {
  id: string;
  status: string;
  target: 'request' | 'fund';
  amountCentimes: number;
  publicRef: string | null;
  createdAt: string;
  paidAt: string | null;
  receiptId: string | null;
  allocatedCentimes: number;
}

export async function listDonations(userId: string, limit = 100): Promise<DonationRow[]> {
  const db = await getDb();
  const rows = await db.query<Record<string, unknown>>(
    `select d.id, d.status, d.target, d.amount_centimes, d.created_at, d.paid_at,
            ar.public_ref, r.id as receipt_id,
            coalesce((select sum(a.amount_centimes) from donation_allocations a where a.donation_id = d.id), 0) as allocated
       from donations d
       left join assistance_requests ar on ar.id = d.assistance_request_id
       left join receipts r on r.donation_id = d.id
      where d.donor_user_id = $1
      order by d.created_at desc
      limit $2`,
    [userId, limit],
  );
  return rows.map((row) => ({
    id: String(row.id),
    status: String(row.status),
    target: row.target as 'request' | 'fund',
    amountCentimes: num(row.amount_centimes),
    publicRef: row.public_ref ? String(row.public_ref) : null,
    createdAt: new Date(row.created_at as string).toISOString(),
    paidAt: row.paid_at ? new Date(row.paid_at as string).toISOString() : null,
    receiptId: row.receipt_id ? String(row.receipt_id) : null,
    allocatedCentimes: num(row.allocated),
  }));
}

export interface DonationDetail extends DonationRow {
  provider: string;
  providerRef: string | null;
  paymentStatus: string | null;
  allocations: { requestId: string; publicRef: string | null; amountCentimes: number; createdAt: string; source: string }[];
  receiptNumber: string | null;
  isDemo: boolean;
}

export async function getDonationDetail(userId: string, donationId: string): Promise<DonationDetail | null> {
  const db = await getDb();
  const rows = await db.query<Record<string, unknown>>(
    `select d.id, d.status, d.target, d.amount_centimes, d.created_at, d.paid_at,
            d.payment_provider as provider, d.provider_payment_id as provider_ref,
            ar.public_ref, r.id as receipt_id, r.receipt_number, r.is_demo,
            pt.status as payment_status,
            coalesce((select sum(a.amount_centimes) from donation_allocations a where a.donation_id = d.id), 0) as allocated
       from donations d
       left join assistance_requests ar on ar.id = d.assistance_request_id
       left join receipts r on r.donation_id = d.id
       left join payment_transactions pt on pt.donation_id = d.id
      where d.id = $1 and d.donor_user_id = $2`,
    [donationId, userId],
  );
  const row = rows[0];
  if (!row) return null;

  const allocations = await db.query<{
    assistance_request_id: string;
    public_ref: string | null;
    amount_centimes: unknown;
    created_at: Date;
    source: string;
  }>(
    `select a.assistance_request_id, ar.public_ref, a.amount_centimes, a.created_at, a.source
       from donation_allocations a
       left join assistance_requests ar on ar.id = a.assistance_request_id
      where a.donation_id = $1
      order by a.created_at`,
    [donationId],
  );

  return {
    id: String(row.id),
    status: String(row.status),
    target: row.target as 'request' | 'fund',
    amountCentimes: num(row.amount_centimes),
    publicRef: row.public_ref ? String(row.public_ref) : null,
    createdAt: new Date(row.created_at as string).toISOString(),
    paidAt: row.paid_at ? new Date(row.paid_at as string).toISOString() : null,
    receiptId: row.receipt_id ? String(row.receipt_id) : null,
    allocatedCentimes: num(row.allocated),
    provider: String(row.provider),
    providerRef: row.provider_ref ? String(row.provider_ref) : null,
    paymentStatus: row.payment_status ? String(row.payment_status) : null,
    receiptNumber: row.receipt_number ? String(row.receipt_number) : null,
    isDemo: row.is_demo === undefined ? true : Boolean(row.is_demo),
    allocations: allocations.map((a) => ({
      requestId: a.assistance_request_id,
      publicRef: a.public_ref,
      amountCentimes: num(a.amount_centimes),
      createdAt: new Date(a.created_at).toISOString(),
      source: a.source,
    })),
  };
}

export interface ReceiptData {
  receiptNumber: string;
  amountCentimes: number;
  issuedAt: string;
  isDemo: boolean;
  donorName: string | null;
  donationId: string;
  publicRef: string | null;
}

export async function getReceipt(userId: string, donationId: string): Promise<ReceiptData | null> {
  const db = await getDb();
  const rows = await db.query<Record<string, unknown>>(
    `select r.receipt_number, r.amount_centimes, r.issued_at, r.is_demo,
            d.donor_user_id, d.id as donation_id, u.full_name, ar.public_ref
       from receipts r
       join donations d on d.id = r.donation_id
       join users u on u.id = d.donor_user_id
       left join assistance_requests ar on ar.id = d.assistance_request_id
      where d.id = $1 and d.donor_user_id = $2`,
    [donationId, userId],
  );
  const row = rows[0];
  if (!row) return null;
  return {
    receiptNumber: String(row.receipt_number),
    amountCentimes: num(row.amount_centimes),
    issuedAt: new Date(row.issued_at as string).toISOString(),
    isDemo: Boolean(row.is_demo),
    donorName: row.full_name ? String(row.full_name) : null,
    donationId: String(row.donation_id),
    publicRef: row.public_ref ? String(row.public_ref) : null,
  };
}

export async function listAppealsForBeneficiary(userId: string): Promise<
  { id: string; status: string; outcome: string | null; submittedAt: string; decision: string }[]
> {
  const db = await getDb();
  const rows = await db.query<Record<string, unknown>>(
    `select a.id, a.status, a.outcome, a.submitted_at, d.decision
       from appeals a
       join eligibility_decisions d on d.id = a.decision_id
       join beneficiary_profiles bp on bp.id = a.beneficiary_id
      where bp.user_id = $1
      order by a.submitted_at desc`,
    [userId],
  );
  return rows.map((row) => ({
    id: String(row.id),
    status: String(row.status),
    outcome: row.outcome ? String(row.outcome) : null,
    submittedAt: new Date(row.submitted_at as string).toISOString(),
    decision: String(row.decision),
  }));
}
