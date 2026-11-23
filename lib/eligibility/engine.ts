import type {
  DecisionStatus,
  DocType,
  EngineInput,
  EngineOutput,
  NextAction,
  Reason,
  ReasonSeverity,
} from './types';

/**
 * Deterministic eligibility engine.
 *
 * Design constraints (see docs/eligibility-rules.md):
 *  - pure function: no I/O, no clocks, no randomness → fully unit testable;
 *  - every outcome carries reason codes, the rule version and a next action;
 *  - uncertain cases are never approved automatically;
 *  - consumption, wilaya or municipality are never used as wealth proxies;
 *  - AI/OCR only supplies evidence and confidence, never the decision.
 */

interface OutcomeMeta {
  amount?: number;
  missingDocuments?: DocType[];
  nextAction?: NextAction;
}

function build(
  input: EngineInput,
  decision: DecisionStatus,
  reasons: Reason[],
  meta: OutcomeMeta = {},
): EngineOutput {
  return {
    decision,
    eligibleAmountCentimes: decision === 'APPROVED' ? Math.max(0, meta.amount ?? 0) : 0,
    confidence: Math.round(input.bill.overallConfidence * 1000) / 1000,
    reasons,
    missingDocuments: meta.missingDocuments ?? [],
    nextAction: meta.nextAction ?? nextActionFor(decision, meta.missingDocuments ?? []),
    computedLimitCentimes: 0,
    ruleVersionId: input.ruleVersionId,
    ruleVersionNumber: input.ruleVersionNumber,
    engineVersion: input.config.engineVersion,
  };
}

function nextActionFor(decision: DecisionStatus, missing: DocType[]): NextAction {
  if (decision === 'NEEDS_ADDITIONAL_DOCUMENTS') {
    return missing.every((doc) => doc === 'clearer_bill') || missing.length === 0
      ? 'upload_clearer_bill'
      : 'upload_documents';
  }
  if (decision === 'TEMPORARILY_BLOCKED') return 'contact_support';
  return 'none';
}

function reason(code: string, severity: ReasonSeverity, params?: Record<string, string | number>): Reason {
  return { code, severity, params: params ?? undefined };
}

function daysBetween(later: Date, earlier: Date): number {
  return Math.floor((later.getTime() - earlier.getTime()) / 86_400_000);
}

function parseIsoDate(value: string | null): Date | null {
  if (!value) return null;
  const date = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function evaluateEligibility(input: EngineInput): EngineOutput {
  const { config, bill, household, history, policy, now } = input;
  const reasons: Reason[] = [];
  const info: Reason[] = [];

  if (input.isAppeal) info.push(reason('APPEAL_REASSESSED', 'info'));
  if (bill.isDemoOcr) info.push(reason('DEMO_DATA', 'info'));

  // 1. Account-level block (verification suspension, never a wealth judgement).
  if (history.accountFlagged) {
    return build(input, 'TEMPORARILY_BLOCKED', [reason('ACCOUNT_SUSPENDED', 'blocking')], {
      nextAction: 'contact_support',
    });
  }

  // 2. Household profile must exist before any financial rule can apply.
  if (!household.profileComplete || household.size === null || household.size < 1) {
    return build(input, 'NEEDS_ADDITIONAL_DOCUMENTS', [reason('HOUSEHOLD_PROFILE_INCOMPLETE', 'blocking')], {
      nextAction: 'complete_profile',
    });
  }

  // 3. Catalogue availability.
  if (!bill.categoryActive) return build(input, 'REJECTED', [reason('SERVICE_INACTIVE', 'blocking')]);
  if (!bill.providerActive) return build(input, 'REJECTED', [reason('PROVIDER_INACTIVE', 'blocking')]);

  // 4. Hard duplicate evidence (only exact, verifiable signals).
  if (bill.duplicateFileHash && config.duplicates.blockOnFileHash) {
    return build(input, 'REJECTED', [reason('DUPLICATE_FILE', 'blocking')], { nextAction: 'contact_support' });
  }
  if (bill.duplicateReference && config.duplicates.blockOnBillReference) {
    return build(input, 'REJECTED', [reason('DUPLICATE_BILL_REFERENCE', 'blocking')], {
      nextAction: 'contact_support',
    });
  }

  // 5. Readability: undocumented and unverifiable values are never invented.
  if (bill.ocrStatus === 'failed' || bill.amountCentimes === null) {
    return build(input, 'NEEDS_ADDITIONAL_DOCUMENTS', [reason('BILL_UNREADABLE', 'blocking')], {
      missingDocuments: ['clearer_bill'],
      nextAction: 'upload_clearer_bill',
    });
  }

  const weakCriticalFields = config.criticalFields.filter(
    (field) => (bill.fieldConfidences[field] ?? 0) < config.minCriticalFieldConfidence,
  );
  if (bill.overallConfidence < config.minOverallConfidence || weakCriticalFields.length > 0) {
    return build(
      input,
      'NEEDS_ADDITIONAL_DOCUMENTS',
      [
        reason('BILL_LOW_CONFIDENCE', 'blocking', {
          overall: bill.overallConfidence,
          threshold: config.minOverallConfidence,
        }),
      ],
      {
        missingDocuments: ['clearer_bill'],
        nextAction: 'upload_clearer_bill',
      },
    );
  }

  // 6. Amount plausibility.
  if (
    bill.amountCentimes < config.bills.minAmountCentimes ||
    bill.amountCentimes > config.bills.maxAmountCentimes
  ) {
    return build(input, 'REJECTED', [
      reason('BILL_AMOUNT_INVALID', 'blocking', {
        amount: bill.amountCentimes,
        min: config.bills.minAmountCentimes,
        max: config.bills.maxAmountCentimes,
      }),
    ]);
  }

  // 7. Date coherence.
  const issueDate = parseIsoDate(bill.issueDate);
  const dueDate = parseIsoDate(bill.dueDate);
  const periodStart = parseIsoDate(bill.periodStart);
  const periodEnd = parseIsoDate(bill.periodEnd);

  if (!issueDate) {
    return build(input, 'NEEDS_ADDITIONAL_DOCUMENTS', [reason('BILL_UNREADABLE', 'blocking')], {
      missingDocuments: ['clearer_bill'],
      nextAction: 'upload_clearer_bill',
    });
  }

  const toleranceMs = config.futureDateToleranceDays * 86_400_000;
  if (issueDate.getTime() > now.getTime() + toleranceMs) {
    return build(input, 'REJECTED', [reason('BILL_DATE_INVALID', 'blocking', { issueDate: bill.issueDate ?? '' })]);
  }
  const ageDays = daysBetween(now, issueDate);
  if (ageDays > config.maxBillAgeDays) {
    return build(
      input,
      'REJECTED',
      [reason('BILL_TOO_OLD', 'blocking', { ageDays, maxDays: config.maxBillAgeDays })],
      { nextAction: 'none' },
    );
  }
  if (periodStart && periodEnd && periodStart.getTime() > periodEnd.getTime()) {
    return build(input, 'REJECTED', [reason('BILL_DATE_INVALID', 'blocking', { field: 'period' })]);
  }
  if (dueDate && dueDate.getTime() < issueDate.getTime()) {
    return build(input, 'REJECTED', [reason('BILL_DATE_INVALID', 'blocking', { field: 'dueDate' })]);
  }

  // 8. Risk signals: risk never silently approves and never auto-accuses.
  if (history.openFraudScore >= config.risk.blockAtScore) {
    return build(
      input,
      'TEMPORARILY_BLOCKED',
      [reason('RISK_SCORE_HIGH', 'blocking', { score: history.openFraudScore })],
      { nextAction: 'contact_support' },
    );
  }
  if (history.openFraudScore >= config.risk.uncertainAtScore) {
    return build(
      input,
      'VERIFICATION_UNCERTAIN',
      [reason('RISK_SCORE_ELEVATED', 'warning', { score: history.openFraudScore })],
      { nextAction: 'contact_support' },
    );
  }
  if (bill.similarBillSuspected) {
    return build(input, 'VERIFICATION_UNCERTAIN', [reason('DUPLICATE_SUSPECTED', 'warning')], {
      nextAction: 'contact_support',
    });
  }

  // 9. Household size: only a document is requested when it changes the outcome.
  if (household.size > config.household.maxSupportedSize) {
    return build(
      input,
      'NEEDS_ADDITIONAL_DOCUMENTS',
      [reason('HOUSEHOLD_SIZE_UNSUPPORTED', 'blocking', { size: household.size })],
      { missingDocuments: ['family_status'], nextAction: 'upload_documents' },
    );
  }
  if (household.size > config.household.requireDocumentAboveSize && !household.familyDocumentVerified) {
    return build(input, 'NEEDS_ADDITIONAL_DOCUMENTS', [reason('MISSING_FAMILY_DOCUMENT', 'blocking')], {
      missingDocuments: ['family_status'],
      nextAction: 'upload_documents',
    });
  }

  // 10. Declared income. Declared values are not taken on trust when a document
  //     is required, and a verified income above the threshold is a refusal.
  if (household.monthlyIncomeCentimes === null) {
    return build(input, 'NEEDS_ADDITIONAL_DOCUMENTS', [reason('MISSING_INCOME_DOCUMENT', 'blocking')], {
      missingDocuments: ['income_proof'],
      nextAction: 'upload_documents',
    });
  }

  const perPerson = Math.floor(household.monthlyIncomeCentimes / household.size);
  if (
    perPerson > config.income.maxMonthlyIncomePerPersonCentimes ||
    household.monthlyIncomeCentimes > config.income.absoluteMaxMonthlyIncomeCentimes
  ) {
    if (!household.incomeDocumentVerified) {
      return build(input, 'NEEDS_ADDITIONAL_DOCUMENTS', [reason('MISSING_INCOME_DOCUMENT', 'blocking')], {
        missingDocuments: ['income_proof'],
        nextAction: 'upload_documents',
      });
    }
    const code =
      household.monthlyIncomeCentimes > config.income.absoluteMaxMonthlyIncomeCentimes
        ? 'INCOME_ABOVE_THRESHOLD'
        : 'INCOME_PER_PERSON_ABOVE_THRESHOLD';
    return build(input, 'REJECTED', [
      reason(code, 'blocking', {
        income: household.monthlyIncomeCentimes,
        perPerson,
        threshold: config.income.maxMonthlyIncomePerPersonCentimes,
      }),
    ]);
  }

  if (
    perPerson > config.income.requireDocumentAbovePerPersonCentimes &&
    !household.incomeDocumentVerified
  ) {
    return build(input, 'NEEDS_ADDITIONAL_DOCUMENTS', [reason('MISSING_INCOME_DOCUMENT', 'blocking')], {
      missingDocuments: ['income_proof'],
      nextAction: 'upload_documents',
    });
  }

  // 11. Policy availability: an operational gap must never look like a refusal.
  if (!policy) {
    return build(input, 'TEMPORARILY_BLOCKED', [reason('POLICY_MISSING', 'blocking')], {
      nextAction: 'contact_support',
    });
  }

  // 12. Assistance limits (database-configured, never hardcoded).
  const multiplier = policy.tierMultiplier > 0 ? policy.tierMultiplier : 1;
  const limit = Math.floor(policy.baseLimitCentimes * multiplier);
  const availableForPeriod = Math.max(0, limit - history.periodCommittedCentimes);

  if (availableForPeriod <= 0) {
    return build(
      input,
      'REJECTED',
      [
        reason('PERIOD_LIMIT_REACHED', 'blocking', {
          limit,
          committed: history.periodCommittedCentimes,
          period: policy.period,
        }),
      ],
      { nextAction: 'none' },
    );
  }

  if (policy.billAboveCapPolicy === 'reject' && bill.amountCentimes > limit) {
    return build(
      input,
      'REJECTED',
      [reason('AMOUNT_CAPPED', 'blocking', { amount: bill.amountCentimes, limit })],
      { nextAction: 'none' },
    );
  }

  const eligible = Math.min(bill.amountCentimes, limit, availableForPeriod);
  if (eligible < 100) {
    return build(input, 'REJECTED', [
      reason('AMOUNT_CAPPED', 'blocking', { amount: bill.amountCentimes, eligible }),
    ]);
  }

  if (eligible < bill.amountCentimes) {
    info.push(
      reason('AMOUNT_CAPPED', 'info', {
        billAmount: bill.amountCentimes,
        eligible,
        limit,
        committed: history.periodCommittedCentimes,
      }),
    );
  }

  reasons.push(reason('ELIGIBLE_APPROVED', 'info', { eligible, limit }));

  const output = build(input, 'APPROVED', [...reasons, ...info], { amount: eligible, nextAction: 'none' });
  output.computedLimitCentimes = limit;
  return output;
}
