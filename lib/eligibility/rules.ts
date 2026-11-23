import type { Db } from '@/lib/db/types';
import { jsonObject, num } from '@/lib/db/values';
import type { PolicyInput, RuleConfig } from './types';

export interface LoadedRule {
  versionId: string;
  versionNumber: number;
  config: RuleConfig;
}

export async function loadActiveRule(db: Pick<Db, 'query'>): Promise<LoadedRule | null> {
  const rows = await db.query<{ id: string; version: number; config: unknown }>(
    `select v.id, v.version, v.config
       from eligibility_rule_versions v
       join eligibility_rules r on r.id = v.rule_id
      where r.key = 'standard_eligibility'
        and v.is_active
        and v.effective_from <= now()
        and (v.effective_to is null or v.effective_to > now())
      order by v.version desc
      limit 1`,
  );
  const row = rows[0];
  if (!row) return null;
  return { versionId: row.id, versionNumber: num(row.version), config: jsonObject<RuleConfig>(row.config) };
}

export interface PeriodWindow {
  start: Date;
  end: Date;
}

/** Calendar-aligned accounting period (never a rolling window). */
export function periodWindow(period: 'monthly' | 'quarterly' | 'annual', now: Date): PeriodWindow {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  if (period === 'monthly') {
    return { start: new Date(Date.UTC(year, month, 1)), end: new Date(Date.UTC(year, month + 1, 1)) };
  }
  if (period === 'quarterly') {
    const quarterStart = Math.floor(month / 3) * 3;
    return {
      start: new Date(Date.UTC(year, quarterStart, 1)),
      end: new Date(Date.UTC(year, quarterStart + 3, 1)),
    };
  }
  return { start: new Date(Date.UTC(year, 0, 1)), end: new Date(Date.UTC(year + 1, 0, 1)) };
}

export async function loadPolicyForCategory(
  db: Pick<Db, 'query'>,
  categoryId: string,
  householdSize: number,
): Promise<{ policy: PolicyInput | null; policyId: string | null }> {
  const rows = await db.query<{
    id: string;
    base_limit_centimes: unknown;
    period: 'monthly' | 'quarterly' | 'annual';
    bill_above_cap_policy: 'publish_eligible_amount' | 'reject';
  }>(
    `select id, base_limit_centimes, period, bill_above_cap_policy
       from assistance_policies
      where service_category_id = $1
        and is_active
        and effective_from <= now()
        and (effective_to is null or effective_to > now())
      order by effective_from desc
      limit 1`,
    [categoryId],
  );
  const row = rows[0];
  if (!row) return { policy: null, policyId: null };

  const tiers = await db.query<{ multiplier: unknown }>(
    `select multiplier
       from assistance_tiers
      where policy_id = $1
        and min_household_size <= $2
        and (max_household_size is null or max_household_size >= $2)
      order by min_household_size desc
      limit 1`,
    [row.id, householdSize],
  );

  const multiplier = tiers[0] ? num(tiers[0].multiplier) : 1;
  return {
    policyId: row.id,
    policy: {
      baseLimitCentimes: num(row.base_limit_centimes),
      period: row.period,
      billAboveCapPolicy: row.bill_above_cap_policy,
      tierMultiplier: multiplier > 0 ? multiplier : 1,
    },
  };
}

export async function periodCommittedCentimes(
  db: Pick<Db, 'query'>,
  beneficiaryId: string,
  categoryId: string,
  window: PeriodWindow,
): Promise<number> {
  const rows = await db.query<{ committed: unknown }>(
    `select coalesce(sum(eligible_amount_centimes), 0) as committed
       from assistance_requests
      where beneficiary_id = $1
        and service_category_id = $2
        and status in ('published', 'partially_funded', 'funded', 'paid')
        and published_at is not null
        and published_at >= $3
        and published_at < $4`,
    [beneficiaryId, categoryId, window.start, window.end],
  );
  return num(rows[0]?.committed);
}

/** Validates a stored rule config; refuses to run with an incomplete policy. */
export function assertRuleConfig(config: RuleConfig): void {
  const required: (keyof RuleConfig)[] = [
    'engineVersion',
    'minOverallConfidence',
    'minCriticalFieldConfidence',
    'maxBillAgeDays',
  ];
  for (const key of required) {
    if (config[key] === undefined || config[key] === null) {
      throw new Error(`RULE_CONFIG_INVALID:${key}`);
    }
  }
  if (!config.income || !config.bills || !config.household || !config.risk || !config.duplicates) {
    throw new Error('RULE_CONFIG_INVALID:sections');
  }
}
