export type DecisionStatus =
  | 'APPROVED'
  | 'REJECTED'
  | 'NEEDS_ADDITIONAL_DOCUMENTS'
  | 'VERIFICATION_UNCERTAIN'
  | 'TEMPORARILY_BLOCKED';

export type DocType =
  | 'family_status'
  | 'income_proof'
  | 'social_status'
  | 'residence_proof'
  | 'clearer_bill'
  | 'other';

export type ReasonSeverity = 'info' | 'warning' | 'blocking';

export interface Reason {
  code: string;
  severity: ReasonSeverity;
  field?: string | null;
  params?: Record<string, string | number>;
}

export type NextAction =
  | 'none'
  | 'complete_profile'
  | 'verify_phone'
  | 'upload_documents'
  | 'upload_clearer_bill'
  | 'contact_support';

export interface RuleConfig {
  engineVersion: string;
  minOverallConfidence: number;
  minCriticalFieldConfidence: number;
  criticalFields: string[];
  maxBillAgeDays: number;
  futureDateToleranceDays: number;
  bills: { minAmountCentimes: number; maxAmountCentimes: number };
  income: {
    maxMonthlyIncomePerPersonCentimes: number;
    absoluteMaxMonthlyIncomeCentimes: number;
    requireDocumentAbovePerPersonCentimes: number;
  };
  household: { maxSupportedSize: number; requireDocumentAboveSize: number };
  risk: { blockAtScore: number; uncertainAtScore: number };
  duplicates: { blockOnFileHash: boolean; blockOnBillReference: boolean };
  appeal: { maxPerDecision: number; windowDays: number };
}

export interface PolicyInput {
  baseLimitCentimes: number;
  period: 'monthly' | 'quarterly' | 'annual';
  billAboveCapPolicy: 'publish_eligible_amount' | 'reject';
  tierMultiplier: number;
}

export interface EngineInput {
  now: Date;
  ruleVersionId: string;
  ruleVersionNumber: number;
  config: RuleConfig;
  policy: PolicyInput | null;
  bill: {
    amountCentimes: number | null;
    issueDate: string | null;
    dueDate: string | null;
    periodStart: string | null;
    periodEnd: string | null;
    reference: string | null;
    categoryActive: boolean;
    providerActive: boolean;
    duplicateReference: boolean;
    duplicateFileHash: boolean;
    similarBillSuspected: boolean;
    ocrStatus: 'success' | 'partial' | 'failed';
    isDemoOcr: boolean;
    fieldConfidences: Record<string, number>;
    overallConfidence: number;
  };
  household: {
    size: number | null;
    childrenCount: number;
    monthlyIncomeCentimes: number | null;
    incomeDocumentVerified: boolean;
    familyDocumentVerified: boolean;
    profileComplete: boolean;
    phoneVerified: boolean;
  };
  history: {
    periodCommittedCentimes: number;
    accountFlagged: boolean;
    openFraudScore: number;
    previousApprovalCount: number;
  };
  isAppeal: boolean;
}

export interface EngineOutput {
  decision: DecisionStatus;
  eligibleAmountCentimes: number;
  confidence: number;
  reasons: Reason[];
  missingDocuments: DocType[];
  nextAction: NextAction;
  computedLimitCentimes: number;
  ruleVersionId: string;
  ruleVersionNumber: number;
  engineVersion: string;
}

export interface DecisionRecord {
  id: string;
  decision: DecisionStatus;
  eligibleAmountCentimes: number;
  createdAt: Date;
  round: number;
  reasons: Reason[];
  missingDocuments: DocType[];
  nextAction: NextAction | null;
  appealId: string | null;
}
