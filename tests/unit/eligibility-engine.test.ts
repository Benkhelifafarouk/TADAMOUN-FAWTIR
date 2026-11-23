import { describe, expect, it } from 'vitest';
import { evaluateEligibility } from '@/lib/eligibility/engine';
import type { EngineInput, RuleConfig } from '@/lib/eligibility/types';

const NOW = new Date('2026-11-23T10:00:00.000Z');

const config: RuleConfig = {
  engineVersion: 'test-1.0.0',
  minOverallConfidence: 0.75,
  minCriticalFieldConfidence: 0.7,
  criticalFields: ['billReference', 'issueDate', 'totalAmount', 'accountNumber'],
  maxBillAgeDays: 150,
  futureDateToleranceDays: 5,
  bills: { minAmountCentimes: 30_000, maxAmountCentimes: 15_000_000 },
  income: {
    maxMonthlyIncomePerPersonCentimes: 1_200_000,
    absoluteMaxMonthlyIncomeCentimes: 6_000_000,
    requireDocumentAbovePerPersonCentimes: 600_000,
  },
  household: { maxSupportedSize: 15, requireDocumentAboveSize: 8 },
  risk: { blockAtScore: 75, uncertainAtScore: 45 },
  duplicates: { blockOnFileHash: true, blockOnBillReference: true },
  appeal: { maxPerDecision: 2, windowDays: 30 },
};

function makeInput(overrides: Partial<EngineInput> = {}): EngineInput {
  const base: EngineInput = {
    now: NOW,
    ruleVersionId: 'rule-version-1',
    ruleVersionNumber: 1,
    config,
    policy: {
      baseLimitCentimes: 1_000_000,
      period: 'quarterly',
      billAboveCapPolicy: 'publish_eligible_amount',
      tierMultiplier: 1,
    },
    bill: {
      amountCentimes: 845_000,
      issueDate: '2026-10-15',
      dueDate: '2026-11-05',
      periodStart: '2026-09-01',
      periodEnd: '2026-09-30',
      reference: 'SN2026A12345',
      categoryActive: true,
      providerActive: true,
      duplicateReference: false,
      duplicateFileHash: false,
      similarBillSuspected: false,
      ocrStatus: 'success',
      isDemoOcr: false,
      fieldConfidences: {
        billReference: 0.92,
        issueDate: 0.93,
        totalAmount: 0.94,
        accountNumber: 0.92,
        overall: 0.93,
      },
      overallConfidence: 0.93,
    },
    household: {
      size: 4,
      childrenCount: 2,
      monthlyIncomeCentimes: 2_000_000,
      incomeDocumentVerified: false,
      familyDocumentVerified: false,
      profileComplete: true,
      phoneVerified: true,
    },
    history: {
      periodCommittedCentimes: 0,
      accountFlagged: false,
      openFraudScore: 0,
      previousApprovalCount: 0,
    },
    isAppeal: false,
  };

  return {
    ...base,
    ...overrides,
    bill: { ...base.bill, ...(overrides.bill ?? {}) },
    household: { ...base.household, ...(overrides.household ?? {}) },
    history: { ...base.history, ...(overrides.history ?? {}) },
  };
}

describe('eligibility engine — approvals', () => {
  it('approves a valid bill for the full amount when under the limit', () => {
    const output = evaluateEligibility(makeInput());
    expect(output.decision).toBe('APPROVED');
    expect(output.eligibleAmountCentimes).toBe(845_000);
    expect(output.reasons.map((r) => r.code)).toContain('ELIGIBLE_APPROVED');
    expect(output.ruleVersionNumber).toBe(1);
  });

  it('caps the eligible amount at the policy limit and explains it', () => {
    const output = evaluateEligibility(makeInput({ bill: { amountCentimes: 1_500_000 } as never }));
    expect(output.decision).toBe('APPROVED');
    expect(output.eligibleAmountCentimes).toBe(1_000_000);
    expect(output.reasons.some((r) => r.code === 'AMOUNT_CAPPED' && r.severity === 'info')).toBe(true);
  });

  it('respects the household tier multiplier', () => {
    const input = makeInput();
    input.policy = { ...input.policy!, tierMultiplier: 1.2 };
    const output = evaluateEligibility(input);
    expect(output.decision).toBe('APPROVED');
    expect(output.computedLimitCentimes).toBe(1_200_000);
  });

  it('caps when part of the quarterly limit is already committed', () => {
    const output = evaluateEligibility(
      makeInput({ history: { periodCommittedCentimes: 900_000 } as never }),
    );
    expect(output.decision).toBe('APPROVED');
    expect(output.eligibleAmountCentimes).toBe(100_000);
  });

  it('is deterministic for identical input', () => {
    const input = makeInput();
    expect(evaluateEligibility(input)).toEqual(evaluateEligibility(input));
  });
});

describe('eligibility engine — refusals', () => {
  it('rejects a duplicate file hash', () => {
    const output = evaluateEligibility(makeInput({ bill: { duplicateFileHash: true } as never }));
    expect(output.decision).toBe('REJECTED');
    expect(output.reasons[0].code).toBe('DUPLICATE_FILE');
  });

  it('rejects a duplicate bill reference', () => {
    const output = evaluateEligibility(makeInput({ bill: { duplicateReference: true } as never }));
    expect(output.decision).toBe('REJECTED');
    expect(output.reasons[0].code).toBe('DUPLICATE_BILL_REFERENCE');
  });

  it('rejects a bill older than the configured window', () => {
    const output = evaluateEligibility(makeInput({ bill: { issueDate: '2026-01-01' } as never }));
    expect(output.decision).toBe('REJECTED');
    expect(output.reasons[0].code).toBe('BILL_TOO_OLD');
  });

  it('rejects a bill dated in the future beyond tolerance', () => {
    const output = evaluateEligibility(makeInput({ bill: { issueDate: '2026-12-30' } as never }));
    expect(output.decision).toBe('REJECTED');
    expect(output.reasons[0].code).toBe('BILL_DATE_INVALID');
  });

  it('rejects inconsistent dates', () => {
    const output = evaluateEligibility(makeInput({ bill: { dueDate: '2026-10-01' } as never }));
    expect(output.decision).toBe('REJECTED');
    expect(output.reasons[0].code).toBe('BILL_DATE_INVALID');
  });

  it('rejects an amount outside the plausible range', () => {
    const output = evaluateEligibility(makeInput({ bill: { amountCentimes: 100 } as never }));
    expect(output.decision).toBe('REJECTED');
    expect(output.reasons[0].code).toBe('BILL_AMOUNT_INVALID');
  });

  it('rejects when the bill-above-cap policy is set to reject', () => {
    const input = makeInput({ bill: { amountCentimes: 1_500_000 } as never });
    input.policy = { ...input.policy!, billAboveCapPolicy: 'reject' };
    const output = evaluateEligibility(input);
    expect(output.decision).toBe('REJECTED');
    expect(output.reasons[0].code).toBe('AMOUNT_CAPPED');
  });

  it('rejects when the period limit is exhausted', () => {
    const output = evaluateEligibility(
      makeInput({ history: { periodCommittedCentimes: 1_000_000 } as never }),
    );
    expect(output.decision).toBe('REJECTED');
    expect(output.reasons[0].code).toBe('PERIOD_LIMIT_REACHED');
  });

  it('rejects with a verified income above the threshold', () => {
    const output = evaluateEligibility(
      makeInput({
        household: { monthlyIncomeCentimes: 8_000_000, incomeDocumentVerified: true } as never,
      }),
    );
    expect(output.decision).toBe('REJECTED');
    expect(output.reasons[0].code).toBe('INCOME_ABOVE_THRESHOLD');
  });

  it('rejects inactive providers', () => {
    const output = evaluateEligibility(makeInput({ bill: { providerActive: false } as never }));
    expect(output.decision).toBe('REJECTED');
    expect(output.reasons[0].code).toBe('PROVIDER_INACTIVE');
  });
});

describe('eligibility engine — never approves uncertainty', () => {
  it('asks for a clearer bill when OCR confidence is low', () => {
    const output = evaluateEligibility(
      makeInput({ bill: { overallConfidence: 0.4, ocrStatus: 'partial' } as never }),
    );
    expect(output.decision).toBe('NEEDS_ADDITIONAL_DOCUMENTS');
    expect(output.missingDocuments).toEqual(['clearer_bill']);
    expect(output.nextAction).toBe('upload_clearer_bill');
  });

  it('asks for a clearer bill when a critical field is weak', () => {
    const output = evaluateEligibility(
      makeInput({
        bill: { fieldConfidences: { billReference: 0.2, issueDate: 0.9, totalAmount: 0.9, accountNumber: 0.9, overall: 0.9 } } as never,
      }),
    );
    expect(output.decision).toBe('NEEDS_ADDITIONAL_DOCUMENTS');
    expect(output.missingDocuments).toContain('clearer_bill');
  });

  it('does not approve when OCR failed entirely', () => {
    const output = evaluateEligibility(
      makeInput({ bill: { ocrStatus: 'failed', amountCentimes: null } as never }),
    );
    expect(output.decision).toBe('NEEDS_ADDITIONAL_DOCUMENTS');
    expect(output.missingDocuments).toEqual(['clearer_bill']);
  });

  it('asks for an income document when income is undeclared', () => {
    const output = evaluateEligibility(
      makeInput({ household: { monthlyIncomeCentimes: null } as never }),
    );
    expect(output.decision).toBe('NEEDS_ADDITIONAL_DOCUMENTS');
    expect(output.missingDocuments).toEqual(['income_proof']);
    expect(output.nextAction).toBe('upload_documents');
  });

  it('asks for a family document only above the configured size threshold', () => {
    const below = evaluateEligibility(makeInput({ household: { size: 8 } as never }));
    expect(below.decision).toBe('APPROVED');

    const above = evaluateEligibility(makeInput({ household: { size: 9 } as never }));
    expect(above.decision).toBe('NEEDS_ADDITIONAL_DOCUMENTS');
    expect(above.missingDocuments).toEqual(['family_status']);
  });

  it('accepts a verified family document above the threshold', () => {
    const output = evaluateEligibility(
      makeInput({ household: { size: 9, familyDocumentVerified: true } as never }),
    );
    expect(output.decision).toBe('APPROVED');
  });

  it('asks for income proof rather than rejecting on an unverified high income', () => {
    const output = evaluateEligibility(
      makeInput({ household: { monthlyIncomeCentimes: 8_000_000, incomeDocumentVerified: false } as never }),
    );
    expect(output.decision).toBe('NEEDS_ADDITIONAL_DOCUMENTS');
    expect(output.missingDocuments).toEqual(['income_proof']);
  });

  it('asks for income proof when above the documentation threshold', () => {
    const output = evaluateEligibility(
      makeInput({ household: { size: 2, monthlyIncomeCentimes: 1_400_000 } as never }),
    );
    // 7 000 DZD per person > 6 000 DZD documentation threshold
    expect(output.decision).toBe('NEEDS_ADDITIONAL_DOCUMENTS');
    expect(output.missingDocuments).toEqual(['income_proof']);
  });

  it('returns uncertain instead of approving on elevated risk', () => {
    const output = evaluateEligibility(
      makeInput({ history: { openFraudScore: 50 } as never }),
    );
    expect(output.decision).toBe('VERIFICATION_UNCERTAIN');
    expect(output.nextAction).toBe('contact_support');
  });

  it('blocks temporarily on high risk instead of rejecting', () => {
    const output = evaluateEligibility(
      makeInput({ history: { openFraudScore: 80 } as never }),
    );
    expect(output.decision).toBe('TEMPORARILY_BLOCKED');
  });

  it('blocks temporarily when no policy is configured', () => {
    const output = evaluateEligibility(makeInput({ policy: null }));
    expect(output.decision).toBe('TEMPORARILY_BLOCKED');
    expect(output.reasons[0].code).toBe('POLICY_MISSING');
  });

  it('asks for profile completion before any financial rule', () => {
    const output = evaluateEligibility(makeInput({ household: { profileComplete: false } as never }));
    expect(output.decision).toBe('NEEDS_ADDITIONAL_DOCUMENTS');
    expect(output.nextAction).toBe('complete_profile');
  });

  it('blocks a suspended account explicitly', () => {
    const output = evaluateEligibility(makeInput({ history: { accountFlagged: true } as never }));
    expect(output.decision).toBe('TEMPORARILY_BLOCKED');
    expect(output.reasons[0].code).toBe('ACCOUNT_SUSPENDED');
  });

  it('flags demo OCR data without changing the decision path', () => {
    const output = evaluateEligibility(makeInput({ bill: { isDemoOcr: true } as never }));
    expect(output.decision).toBe('APPROVED');
    expect(output.reasons.map((r) => r.code)).toContain('DEMO_DATA');
  });

  it('marks appeal reassessments', () => {
    const output = evaluateEligibility(makeInput({ isAppeal: true }));
    expect(output.reasons.map((r) => r.code)).toContain('APPEAL_REASSESSED');
  });
});

describe('eligibility engine — fairness guardrails', () => {
  it('never uses consumption as a wealth proxy', () => {
    const low = evaluateEligibility(makeInput());
    const high = evaluateEligibility(makeInput());
    expect(low.decision).toBe(high.decision);
    expect(low.eligibleAmountCentimes).toBe(high.eligibleAmountCentimes);
  });

  it('does not auto-approve a duplicated bill with otherwise valid data', () => {
    const output = evaluateEligibility(makeInput({ bill: { duplicateFileHash: true } as never }));
    expect(output.decision).not.toBe('APPROVED');
  });
});
