import type { Db } from '@/lib/db/types';
import { isoDate, jsonObject, num, numOrNull } from '@/lib/db/values';
import { getDb } from '@/lib/db';
import { evaluateBill } from '@/lib/eligibility/service';
import { notify } from '@/lib/notifications/service';
import { runOcr } from '@/lib/ocr';
import { keyedHash, sha256Hex } from '@/lib/security/hash';
import { recordAudit, recordSecurityEvent, SecurityEvents } from '@/lib/security/audit';
import { getStorage, newStorageKey } from '@/lib/storage';
import { validateUpload, scanFile } from '@/lib/storage/validate';

export class BillError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'BillError';
  }
}

export function normalizeBillReference(reference: string | null | undefined): string | null {
  if (!reference) return null;
  const normalized = reference.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return normalized.length >= 4 ? normalized : null;
}

interface BeneficiaryContext {
  beneficiaryId: string;
  profileStatus: string;
  householdSize: number | null;
  incomeCentimes: number | null;
  phoneVerified: boolean;
}

async function loadBeneficiary(db: Db, userId: string): Promise<BeneficiaryContext | null> {
  const rows = await db.query<{
    id: string;
    status: string;
    size: number | null;
    monthly_income_centimes: unknown;
    phone_verified_at: Date | null;
  }>(
    `select bp.id, bp.status, h.size, h.monthly_income_centimes, u.phone_verified_at
       from beneficiary_profiles bp
       join users u on u.id = bp.user_id
       left join households h on h.beneficiary_id = bp.id
      where bp.user_id = $1`,
    [userId],
  );
  const row = rows[0];
  if (!row) return null;
  return {
    beneficiaryId: row.id,
    profileStatus: row.status,
    householdSize: numOrNull(row.size),
    incomeCentimes: numOrNull(row.monthly_income_centimes),
    phoneVerified: Boolean(row.phone_verified_at),
  };
}

async function addFraudSignal(
  db: Db,
  input: {
    billId: string;
    beneficiaryId: string;
    code: string;
    severity: 'low' | 'medium' | 'high';
    score: number;
    details: Record<string, unknown>;
  },
): Promise<void> {
  await db.query(
    `insert into fraud_signals (bill_id, beneficiary_id, code, severity, score, details, status)
     values ($1, $2, $3, $4, $5, $6, 'open')`,
    [input.billId, input.beneficiaryId, input.code, input.severity, input.score, JSON.stringify(input.details)],
  );
}

export interface SubmitBillResult {
  billId: string;
  decision: string;
  publicRef: string | null;
  ocrIsDemo: boolean;
}

/**
 * Full submission pipeline: validation → private storage → OCR → fraud signals →
 * automated eligibility → anonymised publication.
 */
export async function submitBill(input: {
  userId: string;
  providerId: string;
  categoryId: string;
  file: File;
  ipHash?: string | null;
}): Promise<SubmitBillResult> {
  const db = await getDb();
  const beneficiary = await loadBeneficiary(db, input.userId);
  if (!beneficiary) throw new BillError('PROFILE_INCOMPLETE');
  if (!beneficiary.phoneVerified) throw new BillError('PHONE_UNVERIFIED');
  if (beneficiary.profileStatus !== 'complete' || beneficiary.householdSize === null) {
    throw new BillError('PROFILE_INCOMPLETE');
  }

  const providerRows = await db.query<{ id: string; category_id: string; is_active: boolean; code: string }>(
    'select id, category_id, is_active, code from service_providers where id = $1',
    [input.providerId],
  );
  const provider = providerRows[0];
  if (!provider) throw new BillError('PROVIDER_INVALID');
  if (provider.category_id !== input.categoryId) throw new BillError('CATEGORY_MISMATCH');
  if (!provider.is_active) throw new BillError('PROVIDER_INACTIVE');

  if (!(input.file instanceof File) || input.file.size === 0) throw new BillError('FILE_REQUIRED');

  const buffer = Buffer.from(await input.file.arrayBuffer());
  const validation = validateUpload(buffer, input.file.type);
  if (!validation.ok) {
    await recordSecurityEvent(db, {
      eventType: SecurityEvents.UPLOAD_REJECTED,
      severity: 'low',
      userId: input.userId,
      ipHash: input.ipHash ?? null,
      details: { reason: validation.reason, size: buffer.length, declared: input.file.type },
    });
    throw new BillError(`FILE_${validation.reason.toUpperCase()}`);
  }

  const sha256 = sha256Hex(buffer);
  const scan = await scanFile(buffer);
  const storageKey = newStorageKey('bills', validation.inspection.extension);
  await getStorage().put(storageKey, buffer);

  const billId = await db.transaction(async (tx) => {
    const fileRow = await tx.query<{ id: string }>(
      `insert into stored_files
         (owner_user_id, bucket, storage_key, original_name, mime_type, size_bytes, sha256,
          width, height, scan_status, is_private)
       values ($1, 'bills', $2, null, $3, $4, $5, $6, $7, $8, true)
       returning id`,
      [
        input.userId,
        storageKey,
        validation.inspection.mime,
        String(buffer.length),
        sha256,
        validation.inspection.width,
        validation.inspection.height,
        scan === 'clean' ? 'clean' : 'pending',
      ],
    );

    const created = await tx.query<{ id: string }>(
      `insert into bills
         (beneficiary_id, provider_id, service_category_id, status, currency)
       values ($1, $2, $3, 'processing', 'DZD')
       returning id`,
      [beneficiary.beneficiaryId, input.providerId, input.categoryId],
    );
    const id = created[0].id;

    await tx.query(
      `insert into bill_files (bill_id, file_id) values ($1, $2)`,
      [id, fileRow[0].id],
    );

    await tx.query(
      `insert into bill_verification_events (bill_id, event_type, actor_type, actor_user_id, details)
       values ($1, 'bill_uploaded', 'beneficiary', $2, $3)`,
      [id, input.userId, JSON.stringify({ mime: validation.inspection.mime, size: buffer.length, scan })],
    );

    return id;
  });

  // OCR runs outside the insert transaction: a slow provider must not hold locks.
  let ocr;
  try {
    ocr = await runOcr({
      buffer,
      mimeType: validation.inspection.mime,
      providerCode: provider.code,
      categoryCode: null,
    });
  } catch {
    ocr = null;
  }

  const extraction = ocr?.extraction ?? null;
  const reference = extraction?.billReference.value ?? null;
  const accountNumber = extraction?.accountNumber.value ?? null;
  const totalCentimes = extraction?.totalCentimes.value ? Number(extraction.totalCentimes.value) : null;
  const issueDate = extraction?.issueDate.value ?? null;
  const dueDate = extraction?.dueDate.value ?? null;
  const periodStart = extraction?.periodStart.value ?? null;
  const periodEnd = extraction?.periodEnd.value ?? null;
  const consumption = extraction?.consumption.value ? Number(extraction.consumption.value) : null;

  const fieldConfidences: Record<string, number> = extraction
    ? {
        billReference: extraction.billReference.confidence,
        accountNumber: extraction.accountNumber.confidence,
        issueDate: extraction.issueDate.confidence,
        totalAmount: extraction.totalCentimes.confidence,
        dueDate: extraction.dueDate.confidence,
        overall: extraction.overallConfidence,
      }
    : { overall: 0 };

  const fileRows = await db.query<{ id: string }>('select id from bill_files where bill_id = $1', [billId]);
  const fileId = fileRows[0]?.id;

  if (fileId && ocr) {
    await db.query(
      `insert into bill_ocr_results
         (bill_file_id, provider, model, status, raw_text, parsed, field_confidences, is_demo, error_message)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        fileId,
        ocr.providerName,
        null,
        ocr.status,
        ocr.rawText,
        JSON.stringify(extraction ?? {}),
        JSON.stringify(fieldConfidences),
        ocr.isDemo,
        ocr.errorCode ?? null,
      ],
    );
  }

  if (ocr?.pageCount) {
    await db.query(
      `update stored_files set page_count = $2
        where id = (select file_id from bill_files where bill_id = $1)`,
      [billId, String(ocr.pageCount)],
    );
  }

  await db.query(
    `update bills
        set bill_reference = $2,
            bill_reference_norm = $3,
            account_number_hash = $4,
            account_number_last4 = $5,
            issue_date = $6,
            due_date = $7,
            period_start = $8,
            period_end = $9,
            total_centimes = $10,
            consumption = $11,
            consumption_unit = $12
      where id = $1`,
    [
      billId,
      reference,
      normalizeBillReference(reference),
      accountNumber ? keyedHash(accountNumber, 'account') : null,
      accountNumber ? accountNumber.slice(-4) : null,
      issueDate,
      dueDate,
      periodStart,
      periodEnd,
      totalCentimes === null ? null : String(totalCentimes),
      consumption === null ? null : String(consumption),
      extraction?.consumptionUnit.value ?? null,
    ],
  );

  // Fraud signals are explicit, reviewable evidence — never a silent rejection.
  const duplicateFile = await db.query<{ id: string }>(
    `select b2.id
       from bill_files bf
       join stored_files sf on sf.id = bf.file_id
       join stored_files sf2 on sf2.sha256 = sf.sha256 and sf2.id <> sf.id
       join bill_files bf2 on bf2.file_id = sf2.id
       join bills b2 on b2.id = bf2.bill_id
      where bf.bill_id = $1 and b2.status in ('verified', 'published')
      limit 1`,
    [billId],
  );
  if (duplicateFile.length > 0) {
    await addFraudSignal(db, {
      billId,
      beneficiaryId: beneficiary.beneficiaryId,
      code: 'DUPLICATE_FILE_HASH',
      severity: 'high',
      score: 75,
      details: { matchedBillId: duplicateFile[0].id },
    });
  }

  const normalizedReference = normalizeBillReference(reference);
  if (normalizedReference) {
    const duplicateReference = await db.query<{ id: string }>(
      `select id from bills
        where provider_id = $1 and bill_reference_norm = $2 and id <> $3
          and status in ('verified', 'published')
        limit 1`,
      [input.providerId, normalizedReference, billId],
    );
    if (duplicateReference.length > 0) {
      await addFraudSignal(db, {
        billId,
        beneficiaryId: beneficiary.beneficiaryId,
        code: 'DUPLICATE_BILL_REFERENCE',
        severity: 'high',
        score: 70,
        details: { matchedBillId: duplicateReference[0].id },
      });
    }
  }

  if (issueDate && dueDate && new Date(dueDate) < new Date(issueDate)) {
    await addFraudSignal(db, {
      billId,
      beneficiaryId: beneficiary.beneficiaryId,
      code: 'IMPOSSIBLE_DATES',
      severity: 'medium',
      score: 45,
      details: { issueDate, dueDate },
    });
  }

  if (validation.inspection.width !== null && validation.inspection.width < 600) {
    await addFraudSignal(db, {
      billId,
      beneficiaryId: beneficiary.beneficiaryId,
      code: 'LOW_IMAGE_RESOLUTION',
      severity: 'low',
      score: 15,
      details: { width: validation.inspection.width, height: validation.inspection.height },
    });
  }

  const riskRows = await db.query<{ score: unknown }>(
    `select coalesce(max(score), 0) as score from fraud_signals where bill_id = $1 and status = 'open'`,
    [billId],
  );
  await db.query('update bills set risk_score = $2 where id = $1', [billId, String(num(riskRows[0]?.score))]);

  await notify(db, {
    userId: input.userId,
    event: 'bill_received',
    params: { reference: billId.slice(0, 8) },
    dedupeKey: `bill_received:${billId}`,
  });

  let decision = 'PENDING';
  let publicRef: string | null = null;
  try {
    const evaluation = await evaluateBill(db, billId, { actorUserId: input.userId });
    decision = evaluation.decision;
    publicRef = evaluation.publicRef;
  } catch (error) {
    await db.query(
      `update bills set status = 'processing' where id = $1 and status = 'processing'`,
      [billId],
    );
    await recordSecurityEvent(db, {
      eventType: 'eligibility.evaluation_failed',
      severity: 'high',
      userId: input.userId,
      details: { billId, error: error instanceof Error ? error.message : 'unknown' },
    });
    const { enqueueJob } = await import('@/lib/jobs/queue');
    await enqueueJob(db, {
      type: 'evaluate_bill',
      payload: { billId },
      dedupeKey: `evaluate_bill:${billId}`,
      maxAttempts: 5,
    });
  }

  await notify(db, {
    userId: input.userId,
    event: 'ocr_done',
    dedupeKey: `ocr_done:${billId}`,
    params: { provider: ocr?.providerName ?? 'none' },
  });

  await recordAudit(db, {
    actorUserId: input.userId,
    actorRole: 'beneficiary',
    action: 'bill.submitted',
    entityType: 'bill',
    entityId: billId,
    afterState: {
      providerId: input.providerId,
      isDemoOcr: ocr?.isDemo ?? false,
      ocrStatus: ocr?.status ?? 'failed',
      decision,
    },
  });

  return { billId, decision, publicRef, ocrIsDemo: ocr?.isDemo ?? false };
}

/** Attaches an uploaded household document and re-runs the automated decision. */
export async function submitHouseholdDocument(input: {
  userId: string;
  docType: 'family_status' | 'income_proof' | 'social_status' | 'residence_proof' | 'clearer_bill' | 'other';
  file: File;
  documentRequestId?: string | null;
}): Promise<{ billId: string | null; decision: string }> {
  const db = await getDb();
  const rows = await db.query<{ beneficiary_id: string; household_id: string }>(
    `select bp.id as beneficiary_id, h.id as household_id
       from beneficiary_profiles bp
       join users u on u.id = bp.user_id
       left join households h on h.beneficiary_id = bp.id
      where bp.user_id = $1`,
    [input.userId],
  );
  const context = rows[0];
  if (!context) throw new BillError('PROFILE_INCOMPLETE');

  if (!(input.file instanceof File) || input.file.size === 0) throw new BillError('FILE_REQUIRED');
  const buffer = Buffer.from(await input.file.arrayBuffer());
  const validation = validateUpload(buffer, input.file.type);
  if (!validation.ok) throw new BillError(`FILE_${validation.reason.toUpperCase()}`);

  const bucket = input.docType === 'income_proof' ? 'income_documents' : input.docType === 'clearer_bill' ? 'bills' : 'identity_documents';
  const key = newStorageKey(bucket, validation.inspection.extension);
  await getStorage().put(key, buffer);

  // Capture the bills waiting for this document before the request is fulfilled.
  const waiting = await db.query<{ bill_id: string }>(
    `select distinct vr.bill_id
       from document_requests dr
       join verification_requests vr on vr.id = dr.verification_request_id
      where dr.beneficiary_id = $1 and dr.doc_type = $2 and dr.status = 'pending'
      limit 10`,
    [context.beneficiary_id, input.docType],
  );

  const fileId = await db.transaction(async (tx) => {
    const inserted = await tx.query<{ id: string }>(
      `insert into stored_files
         (owner_user_id, bucket, storage_key, original_name, mime_type, size_bytes, sha256,
          width, height, scan_status, is_private)
       values ($1, $2, $3, null, $4, $5, $6, $7, $8, 'pending', true)
       returning id`,
      [
        input.userId,
        bucket,
        key,
        validation.inspection.mime,
        String(buffer.length),
        sha256Hex(buffer),
        validation.inspection.width,
        validation.inspection.height,
      ],
    );
    const id = inserted[0].id;

    if (input.documentRequestId) {
      const updated = await tx.query<{ id: string }>(
        `update document_requests
            set status = 'fulfilled', fulfilled_at = now(), file_id = $3
          where id = $1 and beneficiary_id = $2 and status = 'pending'
          returning id`,
        [input.documentRequestId, context.beneficiary_id, id],
      );
      if (!updated[0]) throw new BillError('DOCUMENT_REQUEST_INVALID');
    }

    if (input.docType !== 'clearer_bill' && context.household_id) {
      await tx.query(
        `insert into household_documents (household_id, doc_type, file_id, status, reviewed_at)
         values ($1, $2, $3, 'accepted', now())`,
        [context.household_id, input.docType, id],
      );
    }

    return id;
  });

  // Re-evaluate every bill that was waiting for this document.
  const targetBills = waiting.map((row) => row.bill_id);

  if (targetBills.length === 0) {
    const latest = await db.query<{ bill_id: string }>(
      `select vr.bill_id from verification_requests vr
        where vr.beneficiary_id = $1
        order by vr.created_at desc limit 1`,
      [context.beneficiary_id],
    );
    if (latest[0]) targetBills.push(latest[0].bill_id);
  }

  let decision = 'NONE';
  for (const billId of targetBills.slice(0, 3)) {
    const result = await evaluateBill(db, billId, { actorUserId: input.userId });
    decision = result.decision;
  }

  await notify(db, {
    userId: input.userId,
    event: 'document_received',
    dedupeKey: `document:${fileId}`,
    params: { docType: input.docType },
  });

  await recordAudit(db, {
    actorUserId: input.userId,
    actorRole: 'beneficiary',
    action: 'document.uploaded',
    entityType: 'stored_file',
    entityId: fileId,
    afterState: { docType: input.docType, decision },
  });

  return { billId: targetBills[0] ?? null, decision };
}

export interface BillDetail {
  id: string;
  status: string;
  serviceCode: string;
  serviceNameAr: string;
  serviceNameFr: string;
  providerNameAr: string;
  providerNameFr: string;
  billReference: string | null;
  totalCentimes: number | null;
  eligibleAmountCentimes: number | null;
  issueDate: string | null;
  dueDate: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  consumption: string | null;
  consumptionUnit: string | null;
  riskScore: number;
  createdAt: string;
  ocr: {
    provider: string;
    status: string;
    isDemo: boolean;
    overall: number;
    parsed: Record<string, unknown>;
  } | null;
  decision: {
    id: string;
    decision: string;
    eligibleAmountCentimes: number;
    createdAt: string;
    engineVersion: string;
    nextAction: string | null;
    reasons: { code: string; severity: string; params: Record<string, unknown> }[];
  } | null;
  documentRequests: { id: string; docType: string; status: string; reasonCode: string; dueAt: string | null }[];
  publicReference: string | null;
}

export async function getBillDetail(db: Db, billId: string, userId: string): Promise<BillDetail | null> {
  const rows = await db.query<Record<string, unknown>>(
    `select b.id, b.status, b.bill_reference, b.total_centimes, b.issue_date, b.due_date,
            b.period_start, b.period_end, b.consumption, b.consumption_unit, b.risk_score,
            b.created_at, b.bill_reference_norm,
            sc.code as service_code, sc.name_ar as service_name_ar, sc.name_fr as service_name_fr,
            sp.name_ar as provider_name_ar, sp.name_fr as provider_name_fr,
            ar.public_ref, ar.eligible_amount_centimes
       from bills b
       join service_categories sc on sc.id = b.service_category_id
       join service_providers sp on sp.id = b.provider_id
       join beneficiary_profiles bp on bp.id = b.beneficiary_id
       left join assistance_requests ar on ar.bill_id = b.id
      where b.id = $1 and bp.user_id = $2`,
    [billId, userId],
  );
  const row = rows[0];
  if (!row) return null;

  const ocrRows = await db.query<{
    provider: string;
    status: string;
    is_demo: boolean;
    field_confidences: unknown;
    parsed: unknown;
  }>(
    `select r.provider, r.status, r.is_demo, r.field_confidences, r.parsed
       from bill_ocr_results r
       join bill_files bf on bf.id = r.bill_file_id
      where bf.bill_id = $1
      order by r.created_at desc limit 1`,
    [billId],
  );

  const decisionRows = await db.query<{
    id: string;
    decision: string;
    eligible_amount_centimes: unknown;
    created_at: Date;
    engine_version: string;
    next_action: string | null;
    reasons: unknown;
  }>(
    `select d.id, d.decision, d.eligible_amount_centimes, d.created_at, d.engine_version, d.next_action,
            coalesce(
              (select jsonb_agg(jsonb_build_object('code', r.code, 'severity', r.severity, 'params', r.params)
                                order by r.ordinal)
                 from eligibility_decision_reasons r where r.decision_id = d.id),
              '[]'::jsonb
            ) as reasons
       from eligibility_decisions d
       join verification_requests vr on vr.id = d.verification_request_id
      where vr.bill_id = $1
      order by d.created_at desc limit 1`,
    [billId],
  );

  const docs = await db.query<{ id: string; doc_type: string; status: string; reason_code: string; due_at: Date | null }>(
    `select dr.id, dr.doc_type, dr.status, dr.reason_code, dr.due_at
       from document_requests dr
       join verification_requests vr on vr.id = dr.verification_request_id
      where vr.bill_id = $1
      order by dr.created_at desc`,
    [billId],
  );

  const ocr = ocrRows[0];
  const decision = decisionRows[0];
  const confidences = ocr ? jsonObject<Record<string, number>>(ocr.field_confidences) : {};

  return {
    id: String(row.id),
    status: String(row.status),
    serviceCode: String(row.service_code),
    serviceNameAr: String(row.service_name_ar),
    serviceNameFr: String(row.service_name_fr),
    providerNameAr: String(row.provider_name_ar),
    providerNameFr: String(row.provider_name_fr),
    billReference: row.bill_reference ? String(row.bill_reference) : null,
    totalCentimes: numOrNull(row.total_centimes),
    eligibleAmountCentimes: numOrNull(row.eligible_amount_centimes),
    issueDate: isoDate(row.issue_date),
    dueDate: isoDate(row.due_date),
    periodStart: isoDate(row.period_start),
    periodEnd: isoDate(row.period_end),
    consumption: row.consumption ? String(row.consumption) : null,
    consumptionUnit: row.consumption_unit ? String(row.consumption_unit) : null,
    riskScore: num(row.risk_score),
    createdAt: new Date(row.created_at as string).toISOString(),
    ocr: ocr
      ? {
          provider: ocr.provider,
          status: ocr.status,
          isDemo: Boolean(ocr.is_demo),
          overall: num(confidences.overall),
          parsed: jsonObject(ocr.parsed),
        }
      : null,
    decision: decision
      ? {
          id: decision.id,
          decision: decision.decision,
          eligibleAmountCentimes: num(decision.eligible_amount_centimes),
          createdAt: new Date(decision.created_at).toISOString(),
          engineVersion: decision.engine_version,
          nextAction: decision.next_action,
          reasons: (jsonObject<unknown[]>(decision.reasons) as { code: string; severity: string; params: Record<string, unknown> }[]) ?? [],
        }
      : null,
    documentRequests: docs.map((d) => ({
      id: d.id,
      docType: d.doc_type,
      status: d.status,
      reasonCode: d.reason_code,
      dueAt: d.due_at ? new Date(d.due_at).toISOString() : null,
    })),
    publicReference: row.public_ref ? String(row.public_ref) : null,
  };
}
