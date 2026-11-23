import type { Db, Tx } from '@/lib/db/types';
import { isoDate, jsonObject, num, numOrNull } from '@/lib/db/values';
import { notify } from '@/lib/notifications/service';
import { recordAudit, recordSecurityEvent } from '@/lib/security/audit';
import { evaluateEligibility } from './engine';
import { assertRuleConfig, loadActiveRule, loadPolicyForCategory, periodCommittedCentimes, periodWindow } from './rules';
import type { DecisionStatus, DocType, EngineInput, RuleConfig } from './types';

interface BillRow {
  id: string;
  beneficiary_id: string;
  provider_id: string;
  service_category_id: string;
  status: string;
  bill_reference: string | null;
  bill_reference_norm: string | null;
  account_number_hash: string | null;
  issue_date: Date | string | null;
  due_date: Date | string | null;
  period_start: Date | string | null;
  period_end: Date | string | null;
  total_centimes: unknown;
  provider_active: boolean;
  category_active: boolean;
  category_code: 'electricity_gas' | 'water' | 'internet';
  category_name_ar: string;
  category_name_fr: string;
  wilaya_id: string;
  wilaya_name_ar: string;
  wilaya_name_fr: string;
  municipality_id: string | null;
  profile_status: string;
  user_id: string;
  phone_verified_at: Date | string | null;
  user_status: string;
  household_size: number | null;
  children_count: number | null;
  monthly_income_centimes: unknown;
  risk_level: string | null;
  full_name: string;
}

export interface EvaluationResult {
  decisionId: string;
  decision: DecisionStatus;
  eligibleAmountCentimes: number;
  verificationStatus: string;
  requestId: string | null;
  publicRef: string | null;
}

const DEMO_REASON = 'DEMO_DATA';

function householdBand(size: number): string {
  if (size <= 2) return '1-2';
  if (size <= 5) return '3-5';
  return '6+';
}

/** Builds the donor-facing text: no name, address, account, reference or file. */
export function buildAnonymizedDescriptions(input: {
  categoryNameAr: string;
  categoryNameFr: string;
  wilayaNameAr: string;
  wilayaNameFr: string;
  householdSize: number;
  eligibleCentimes: number;
  billCentimes: number;
  service: 'electricity_gas' | 'water' | 'internet';
}): { ar: string; fr: string } {
  const band = householdBand(input.householdSize);
  const full = input.eligibleCentimes >= input.billCentimes;
  const ar = full
    ? `مساعدة في سداد كامل فاتورة ${input.categoryNameAr} لأسرة من ولاية ${input.wilayaNameAr}. حجم الأسرة بين ${band} أفراد، والمبلغ المؤهل يغطي كامل قيمة الفاتورة.`
    : `مساعدة في سداد فاتورة ${input.categoryNameAr} لأسرة من ولاية ${input.wilayaNameAr}. حجم الأسرة بين ${band} أفراد، والمبلغ المؤهل يمثل جزءاً من قيمة الفاتورة.`;
  const fr = full
    ? `Aide au paiement intégral d'une facture de ${input.categoryNameFr} pour une famille de la wilaya de ${input.wilayaNameFr}. Le foyer compte entre ${band} personnes et le montant éligible couvre la totalité de la facture.`
    : `Aide au paiement d'une facture de ${input.categoryNameFr} pour une famille de la wilaya de ${input.wilayaNameFr}. Le foyer compte entre ${band} personnes et le montant éligible couvre une partie de la facture.`;
  return { ar, fr };
}

async function loadBill(db: Db | Tx, billId: string): Promise<BillRow | null> {
  const rows = await db.query<BillRow>(
    `select b.id, b.beneficiary_id, b.provider_id, b.service_category_id, b.status,
            b.bill_reference, b.bill_reference_norm, b.account_number_hash,
            b.issue_date, b.due_date, b.period_start, b.period_end, b.total_centimes,
            sp.is_active as provider_active,
            sc.is_active as category_active,
            sc.code as category_code,
            sc.name_ar as category_name_ar,
            sc.name_fr as category_name_fr,
            bp.wilaya_id, w.name_ar as wilaya_name_ar, w.name_fr as wilaya_name_fr,
            bp.municipality_id, bp.status as profile_status, bp.user_id,
            u.phone_verified_at, u.status as user_status, u.full_name,
            h.size as household_size, h.children_count, h.monthly_income_centimes,
            ep.risk_level
       from bills b
       join service_providers sp on sp.id = b.provider_id
       join service_categories sc on sc.id = b.service_category_id
       join beneficiary_profiles bp on bp.id = b.beneficiary_id
       join users u on u.id = bp.user_id
       join wilayas w on w.id = bp.wilaya_id
       left join households h on h.beneficiary_id = bp.id
       left join eligibility_profiles ep on ep.beneficiary_id = bp.id
      where b.id = $1`,
    [billId],
  );
  return rows[0] ?? null;
}

async function ensureVerificationRequest(db: Db | Tx, bill: BillRow): Promise<string> {
  const existing = await db.query<{ id: string }>(
    `select id from verification_requests where bill_id = $1 order by attempt_no desc limit 1`,
    [bill.id],
  );
  if (existing[0]) return existing[0].id;
  const created = await db.query<{ id: string }>(
    `insert into verification_requests (bill_id, beneficiary_id, attempt_no, status)
     values ($1, $2, 1, 'processing') returning id`,
    [bill.id, bill.beneficiary_id],
  );
  return created[0].id;
}

async function documentOnFile(db: Db | Tx, beneficiaryId: string, docType: DocType): Promise<boolean> {
  const rows = await db.query<{ id: string }>(
    `select hd.id
       from household_documents hd
       join households h on h.id = hd.household_id
      where h.beneficiary_id = $1 and hd.doc_type = $2 and hd.status = 'accepted'
      limit 1`,
    [beneficiaryId, docType],
  );
  return rows.length > 0;
}

async function hasDuplicateFile(db: Db | Tx, billId: string): Promise<boolean> {
  const rows = await db.query<{ id: string }>(
    `select b2.id
       from bill_files bf
       join stored_files sf on sf.id = bf.file_id
       join bill_files bf2 on bf2.file_id <> bf.file_id
       join stored_files sf2 on sf2.id = bf2.file_id
       join bills b2 on b2.id = bf2.bill_id
      where bf.bill_id = $1
        and sf2.sha256 = sf.sha256
        and b2.id <> $1
        and b2.status in ('verified', 'published')
      limit 1`,
    [billId],
  );
  return rows.length > 0;
}

async function hasDuplicateReference(db: Db | Tx, bill: BillRow): Promise<boolean> {
  if (!bill.bill_reference_norm) return false;
  const rows = await db.query<{ id: string }>(
    `select id from bills
      where provider_id = $1
        and bill_reference_norm = $2
        and id <> $3
        and status in ('verified', 'published')
      limit 1`,
    [bill.provider_id, bill.bill_reference_norm, bill.id],
  );
  return rows.length > 0;
}

async function hasSimilarBill(db: Db | Tx, bill: BillRow, amount: number | null): Promise<boolean> {
  if (!bill.account_number_hash || amount === null) return false;
  const rows = await db.query<{ id: string }>(
    `select id from bills
      where account_number_hash = $1
        and total_centimes = $2
        and service_category_id = $3
        and id <> $4
        and status in ('verified', 'published')
        and created_at > now() - interval '180 days'
      limit 1`,
    [bill.account_number_hash, String(amount), bill.service_category_id, bill.id],
  );
  return rows.length > 0;
}

async function openFraudScore(db: Db | Tx, billId: string): Promise<number> {
  // Scoped to the bill under review. A household is only blocked at account
  // level through eligibility_profiles.risk_level, which an administrator must
  // set explicitly and which is audited � one duplicate must not silently
  // block unrelated future bills.
  const rows = await db.query<{ score: unknown }>(
    `select coalesce(max(score), 0) as score
       from fraud_signals
      where bill_id = $1 and status = 'open'`,
    [billId],
  );
  return num(rows[0]?.score);
}

async function latestOcr(db: Db | Tx, billId: string): Promise<{
  id: string;
  status: 'success' | 'partial' | 'failed';
  parsed: Record<string, unknown>;
  confidences: Record<string, number>;
  isDemo: boolean;
  overall: number;
} | null> {
  const rows = await db.query<{
    id: string;
    status: 'success' | 'partial' | 'failed';
    parsed: unknown;
    field_confidences: unknown;
    is_demo: boolean;
    provider: string;
  }>(
    `select r.id, r.status, r.parsed, r.field_confidences, r.is_demo, r.provider
       from bill_ocr_results r
       join bill_files bf on bf.id = r.bill_file_id
      where bf.bill_id = $1
      order by r.created_at desc
      limit 1`,
    [billId],
  );
  const row = rows[0];
  if (!row) return null;
  const parsed = jsonObject<Record<string, unknown>>(row.parsed);
  const confidences = jsonObject<Record<string, number>>(row.field_confidences);
  return {
    id: row.id,
    status: row.status,
    parsed,
    confidences,
    isDemo: Boolean(row.is_demo),
    overall: num(confidences.overall),
  };
}

async function periodCommitting(db: Db | Tx, beneficiaryId: string, categoryId: string, period: 'monthly' | 'quarterly' | 'annual'): Promise<number> {
  const window = periodWindow(period, new Date());
  return periodCommittedCentimes(db as Db, beneficiaryId, categoryId, window);
}

/**
 * Evaluates a bill, writes an immutable decision, and (on approval) publishes an
 * anonymised request. The engine is the only source of APPROVED.
 */
export async function evaluateBill(
  db: Db,
  billId: string,
  options: { appealId?: string; isAppeal?: boolean; actorUserId?: string | null } = {},
): Promise<EvaluationResult> {
  const bill = await loadBill(db, billId);
  if (!bill) throw new Error('BILL_NOT_FOUND');

  const rule = await loadActiveRule(db);
  if (!rule) throw new Error('ELIGIBILITY_RULE_MISSING');
  assertRuleConfig(rule.config);
  const config: RuleConfig = rule.config;

  const verificationId = await ensureVerificationRequest(db, bill);
  const ocr = await latestOcr(db, bill.id);

  if (options.appealId) {
    const existing = await db.query<{ id: string; decision: DecisionStatus }>(
      `select id, decision from eligibility_decisions where appeal_id = $1 limit 1`,
      [options.appealId],
    );
    if (existing[0]) {
      return {
        decisionId: existing[0].id,
        decision: existing[0].decision,
        eligibleAmountCentimes: 0,
        verificationStatus: 'unchanged',
        requestId: null,
        publicRef: null,
      };
    }
  }

  const householdSize = numOrNull(bill.household_size);
  const { policy, policyId } = await loadPolicyForCategory(
    db,
    bill.service_category_id,
    householdSize ?? 1,
  );

  const amount = numOrNull(bill.total_centimes);
  const [duplicateFile, duplicateReference, similarBill, fraudScore, incomeDoc, familyDoc] = await Promise.all([
    hasDuplicateFile(db, bill.id),
    hasDuplicateReference(db, bill),
    hasSimilarBill(db, bill, amount),
    openFraudScore(db, bill.id),
    documentOnFile(db, bill.beneficiary_id, 'income_proof'),
    documentOnFile(db, bill.beneficiary_id, 'family_status'),
  ]);

  const committed = policy ? await periodCommitting(db, bill.beneficiary_id, bill.service_category_id, policy.period) : 0;

  const input: EngineInput = {
    now: new Date(),
    ruleVersionId: rule.versionId,
    ruleVersionNumber: rule.versionNumber,
    config,
    policy,
    bill: {
      amountCentimes: amount,
      issueDate: isoDate(bill.issue_date),
      dueDate: isoDate(bill.due_date),
      periodStart: isoDate(bill.period_start),
      periodEnd: isoDate(bill.period_end),
      reference: bill.bill_reference,
      categoryActive: Boolean(bill.category_active),
      providerActive: Boolean(bill.provider_active),
      duplicateReference,
      duplicateFileHash: duplicateFile,
      similarBillSuspected: similarBill,
      ocrStatus: ocr?.status ?? 'failed',
      isDemoOcr: ocr?.isDemo ?? false,
      fieldConfidences: ocr?.confidences ?? {},
      overallConfidence: ocr?.overall ?? 0,
    },
    household: {
      size: householdSize,
      childrenCount: numOrNull(bill.children_count) ?? 0,
      monthlyIncomeCentimes: numOrNull(bill.monthly_income_centimes),
      incomeDocumentVerified: incomeDoc,
      familyDocumentVerified: familyDoc,
      profileComplete: bill.profile_status === 'complete' && householdSize !== null,
      phoneVerified: Boolean(bill.phone_verified_at),
    },
    history: {
      periodCommittedCentimes: committed,
      accountFlagged: bill.risk_level === 'blocked' || bill.user_status === 'suspended',
      openFraudScore: fraudScore,
      previousApprovalCount: 0,
    },
    isAppeal: Boolean(options.isAppeal),
  };

  const output = evaluateEligibility(input);

  const verificationStatus =
    output.decision === 'APPROVED'
      ? 'approved'
      : output.decision === 'REJECTED'
        ? 'rejected'
        : output.decision === 'NEEDS_ADDITIONAL_DOCUMENTS'
          ? 'needs_documents'
          : output.decision === 'VERIFICATION_UNCERTAIN'
            ? 'uncertain'
            : 'blocked';

  const result = await db.transaction(async (tx) => {
    const decisionRow = await tx.query<{ id: string }>(
      `insert into eligibility_decisions
         (verification_request_id, beneficiary_id, decision, rule_version_id, policy_snapshot,
          eligible_amount_centimes, bill_amount_centimes, period_committed_centimes, confidence,
          engine_version, decided_by, appeal_id, next_action,
          supersedes_decision_id)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
               (select current_decision_id from verification_requests where id = $1))
       returning id`,
      [
        verificationId,
        bill.beneficiary_id,
        output.decision,
        rule.versionId,
        JSON.stringify({
          policyId,
          baseLimitCentimes: policy?.baseLimitCentimes ?? null,
          period: policy?.period ?? null,
          tierMultiplier: policy?.tierMultiplier ?? null,
          computedLimitCentimes: output.computedLimitCentimes,
          periodCommittedCentimes: committed,
        }),
        String(output.eligibleAmountCentimes),
        amount === null ? null : String(amount),
        String(committed),
        String(output.confidence),
        output.engineVersion,
        options.isAppeal ? 'appeal_engine' : 'engine',
        options.appealId ?? null,
        output.nextAction,
      ],
    );
    const decisionId = decisionRow[0].id;

    for (const [index, reason] of output.reasons.entries()) {
      await tx.query(
        `insert into eligibility_decision_reasons (decision_id, code, severity, field, params, ordinal)
         values ($1, $2, $3, $4, $5, $6)`,
        [
          decisionId,
          reason.code,
          reason.severity,
          reason.field ?? null,
          JSON.stringify(reason.params ?? {}),
          index,
        ],
      );
    }

    await tx.query(
      `update verification_requests
          set status = $2, current_decision_id = $3, decided_at = now(), last_error = null
        where id = $1`,
      [verificationId, verificationStatus, decisionId],
    );

    const billStatus =
      output.decision === 'APPROVED'
        ? 'verified'
        : output.decision === 'REJECTED'
          ? 'rejected'
          : output.decision === 'NEEDS_ADDITIONAL_DOCUMENTS'
            ? 'needs_documents'
            : 'processing';
    await tx.query('update bills set status = $2 where id = $1', [bill.id, billStatus]);

    for (const docType of output.missingDocuments) {
      const pending = await tx.query<{ id: string }>(
        `select id from document_requests
          where verification_request_id = $1 and doc_type = $2 and status = 'pending' limit 1`,
        [verificationId, docType],
      );
      if (pending[0]) continue;
      await tx.query(
        `insert into document_requests
           (verification_request_id, beneficiary_id, doc_type, reason_code, status, due_at)
         values ($1, $2, $3, $4, 'pending', now() + interval '14 days')`,
        [verificationId, bill.beneficiary_id, docType, output.reasons[0]?.code ?? 'MISSING_DOCUMENT'],
      );
    }

    await tx.query(
      `insert into verification_evidence (verification_request_id, evidence_type, reference, details)
       values ($1, 'policy_snapshot', $2, $3)`,
      [verificationId, rule.versionId, JSON.stringify({ ruleVersion: rule.versionNumber, engine: output.engineVersion })],
    );
    if (ocr) {
      await tx.query(
        `insert into verification_evidence (verification_request_id, evidence_type, reference, details)
         values ($1, 'ocr_result', $2, $3)`,
        [verificationId, ocr.id, JSON.stringify({ provider: ocr.isDemo ? 'demo' : 'real', overall: ocr.overall })],
      );
    }
    await tx.query(
      `insert into verification_evidence (verification_request_id, evidence_type, reference, details)
       values ($1, 'risk_assessment', $2, $3)`,
      [verificationId, `${verificationId}:${fraudScore}`, JSON.stringify({ score: fraudScore, duplicates: { duplicateFile, duplicateReference, similarBill } })],
    );

    let requestId: string | null = null;
    let publicRef: string | null = null;

    if (output.decision === 'APPROVED') {
      const descriptions = buildAnonymizedDescriptions({
        categoryNameAr: bill.category_name_ar,
        categoryNameFr: bill.category_name_fr,
        wilayaNameAr: bill.wilaya_name_ar,
        wilayaNameFr: bill.wilaya_name_fr,
        householdSize: householdSize ?? 1,
        eligibleCentimes: output.eligibleAmountCentimes,
        billCentimes: amount ?? output.eligibleAmountCentimes,
        service: bill.category_code,
      });

      const existing = await tx.query<{ id: string; public_ref: string; funded_amount_centimes: unknown; status: string }>(
        'select id, public_ref, funded_amount_centimes, status from assistance_requests where bill_id = $1',
        [bill.id],
      );

      if (existing[0]) {
        requestId = existing[0].id;
        publicRef = existing[0].public_ref;
        const funded = num(existing[0].funded_amount_centimes);
        if (funded === 0 && existing[0].status !== 'paid') {
          await tx.query(
            `update assistance_requests
                set verification_decision_id = $2,
                    eligible_amount_centimes = $3,
                    anonymized_description = $4,
                    anonymized_description_fr = $5,
                    status = 'published',
                    published_at = coalesce(published_at, now())
              where id = $1`,
            [requestId, decisionId, String(output.eligibleAmountCentimes), descriptions.ar, descriptions.fr],
          );
        }
      } else {
        const expiryRows = await tx.query<{ value: unknown }>(
          `select value from platform_settings where key = 'request.expiry_days'`,
        );
        const expiryDays = num(jsonObject<{ days?: number }>(expiryRows[0]?.value).days) || 45;

        const created = await tx.query<{ id: string; public_ref: string }>(
          `insert into assistance_requests
             (bill_id, beneficiary_id, verification_decision_id, service_category_id, provider_id,
              wilaya_id, municipality_id, show_municipality, status, eligible_amount_centimes,
              anonymized_description, anonymized_description_fr, description_locale,
              published_at, expires_at)
           values ($1, $2, $3, $4, $5, $6, $7, false, 'published', $8, $9, $10, 'ar', now(),
                   now() + ($11 || ' days')::interval)
           returning id, public_ref`,
          [
            bill.id,
            bill.beneficiary_id,
            decisionId,
            bill.service_category_id,
            bill.provider_id,
            bill.wilaya_id,
            bill.municipality_id,
            String(output.eligibleAmountCentimes),
            descriptions.ar,
            descriptions.fr,
            String(expiryDays),
          ],
        );
        requestId = created[0].id;
        publicRef = created[0].public_ref;

        await tx.query(
          `insert into request_status_history (request_id, from_status, to_status, reason, actor_type)
           values ($1, null, 'published', 'AUTOMATED_ELIGIBILITY_APPROVED', 'system')`,
          [requestId],
        );
      }

      await tx.query('update bills set status = $2 where id = $1', [bill.id, 'published']);
    }

    await tx.query(
      `insert into eligibility_profiles
         (beneficiary_id, declared_income_centimes, household_size, verification_confidence, last_evaluated_at)
       values ($1, $2, $3, $4, now())
       on conflict (beneficiary_id) do update
         set declared_income_centimes = excluded.declared_income_centimes,
             household_size = excluded.household_size,
             verification_confidence = excluded.verification_confidence,
             last_evaluated_at = now()`,
      [
        bill.beneficiary_id,
        bill.monthly_income_centimes === null ? null : String(num(bill.monthly_income_centimes)),
        householdSize,
        String(output.confidence),
      ],
    );

    const event =
      output.decision === 'APPROVED'
        ? 'decision_approved'
        : output.decision === 'REJECTED'
          ? 'decision_rejected'
          : output.decision === 'NEEDS_ADDITIONAL_DOCUMENTS'
            ? 'documents_required'
            : 'decision_uncertain';

    await notify(tx, {
      userId: bill.user_id,
      event,
      params: { amount: output.eligibleAmountCentimes },
      dedupeKey: `decision:${decisionId}`,
    });

    if (requestId && options.isAppeal) {
      await notify(tx, {
        userId: bill.user_id,
        event: 'request_published',
        params: { reference: publicRef ?? '' },
        dedupeKey: `published:${requestId}`,
      });
    }

    await recordAudit(tx, {
      actorUserId: options.actorUserId ?? null,
      actorRole: 'system',
      action: 'eligibility.evaluated',
      entityType: 'verification_request',
      entityId: verificationId,
      afterState: {
        decision: output.decision,
        eligible: output.eligibleAmountCentimes,
        ruleVersion: rule.versionNumber,
        reasons: output.reasons.map((r) => r.code),
      },
    });

    if (ocr && ocr.isDemo) {
      await recordSecurityEvent(tx, {
        eventType: 'ocr.demo_data_used',
        severity: 'info',
        userId: bill.user_id,
        details: { billId: bill.id, note: DEMO_REASON },
      });
    }

    return { decisionId, requestId, publicRef };
  });

  return {
    decisionId: result.decisionId,
    decision: output.decision,
    eligibleAmountCentimes: output.eligibleAmountCentimes,
    verificationStatus,
    requestId: result.requestId,
    publicRef: result.publicRef,
  };
}

export interface AppealOutcome {
  appealId: string;
  decisionId: string;
  decision: DecisionStatus;
}

/**
 * Appeal: never mutates the original decision. A new decision is produced by the
 * engine with `appeal_id` set and the previous decision referenced.
 */
export async function submitAppeal(
  db: Db,
  params: { userId: string; decisionId: string; message: string },
): Promise<AppealOutcome> {
  const rows = await db.query<{
    id: string;
    decision: DecisionStatus;
    beneficiary_id: string;
    verification_request_id: string;
    bill_id: string;
    created_at: Date;
    user_id: string;
  }>(
    `select d.id, d.decision, d.beneficiary_id, d.verification_request_id, vr.bill_id,
            d.created_at, bp.user_id
       from eligibility_decisions d
       join verification_requests vr on vr.id = d.verification_request_id
       join beneficiary_profiles bp on bp.id = d.beneficiary_id
      where d.id = $1`,
    [params.decisionId],
  );
  const decision = rows[0];
  if (!decision) throw new Error('DECISION_NOT_FOUND');
  if (decision.user_id !== params.userId) throw new Error('FORBIDDEN');
  if (decision.decision === 'APPROVED') throw new Error('APPEAL_NOT_ALLOWED');

  const rule = await loadActiveRule(db);
  if (!rule) throw new Error('ELIGIBILITY_RULE_MISSING');

  const appealConfig = rule.config.appeal ?? { maxPerDecision: 2, windowDays: 30 };
  const ageDays = (Date.now() - new Date(decision.created_at).getTime()) / 86_400_000;
  if (ageDays > appealConfig.windowDays) throw new Error('APPEAL_WINDOW_CLOSED');

  const priorAppeals = await db.query<{ count: number }>(
    'select count(*)::int as count from appeals where decision_id = $1',
    [decision.id],
  );
  if (num(priorAppeals[0]?.count) >= appealConfig.maxPerDecision) throw new Error('APPEAL_LIMIT_REACHED');

  const appealRow = await db.query<{ id: string }>(
    `insert into appeals (beneficiary_id, decision_id, message, status)
     values ($1, $2, $3, 'submitted') returning id`,
    [decision.beneficiary_id, decision.id, params.message],
  );
  const appealId = appealRow[0].id;

  const evaluation = await evaluateBill(db, decision.bill_id, {
    appealId,
    isAppeal: true,
    actorUserId: params.userId,
  });

  await db.query(
    `update appeals
        set status = 'resolved', outcome = $2, new_decision_id = $3, resolved_at = now()
      where id = $1`,
    [appealId, evaluation.decision, evaluation.decisionId],
  );

  await notify(db, {
    userId: params.userId,
    event: 'appeal_result',
    params: { decision: evaluation.decision },
    dedupeKey: `appeal:${appealId}`,
  });

  return { appealId, decisionId: evaluation.decisionId, decision: evaluation.decision };
}
