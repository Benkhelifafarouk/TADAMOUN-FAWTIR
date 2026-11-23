import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ActionForm, FieldError } from '@/components/action-form';
import { Alert, Card, Money, PageHeader } from '@/components/ui';
import { createRuleVersionAction, savePolicyAction } from '@/lib/actions/admin';
import { requireRole } from '@/lib/auth/guards';
import { listPolicies, listRuleVersions } from '@/lib/data/admin';
import { getCategories } from '@/lib/data/public';
import { getDictionary, type Locale } from '@/lib/i18n';
import { isLocale } from '@/lib/i18n/config';
import { formatDate } from '@/lib/i18n/format';
import { num } from '@/lib/db/values';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return { title: getDictionary(isLocale(locale) ? locale : 'ar').admin.rulesTitle };
}

export default async function RulesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  if (!isLocale(raw)) notFound();
  const locale: Locale = raw;
  const dictionary = getDictionary(locale);
  const t = dictionary.admin;
  await requireRole(locale, ['admin']);

  const [versions, policies, categories] = await Promise.all([listRuleVersions(), listPolicies(), getCategories()]);
  const active = versions.find((version) => version.isActive) ?? versions[0];
  const config = active?.config ?? {};
  const income = (config.income ?? {}) as Record<string, unknown>;
  const risk = (config.risk ?? {}) as Record<string, unknown>;

  return (
    <div className="space-y-6">
      <PageHeader eyebrow={dictionary.nav.rules} title={t.rulesTitle} subtitle={t.rulesSubtitle} />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="text-base font-bold">{t.activeVersion}</h2>
          <p className="mt-1 text-2xs text-ink-400">
            v{active?.version ?? '—'} · {active ? formatDate(active.effectiveFrom, locale) : '—'}
          </p>
          <div className="mt-3 max-h-64 overflow-auto rounded-lg bg-ink-950/95 p-3">
            <pre dir="ltr" className="text-[10px] leading-relaxed text-sand-100">
              {JSON.stringify(config, null, 2)}
            </pre>
          </div>
          <p className="field-hint">{t.rulesJsonHint}</p>
        </Card>

        <Card>
          <h2 className="text-base font-bold">{t.newVersion}</h2>
          <div className="mt-3">
            <ActionForm action={createRuleVersionAction} dictionary={dictionary} submitLabel={t.createVersion}>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="field-label" htmlFor="minOverallConfidence">
                    minOverallConfidence
                  </label>
                  <input
                    id="minOverallConfidence"
                    name="minOverallConfidence"
                    type="number"
                    step="0.01"
                    min="0.1"
                    max="1"
                    defaultValue={String(config.minOverallConfidence ?? 0.75)}
                    className="field-input"
                  />
                  <FieldError name="minOverallConfidence" dictionary={dictionary} />
                </div>
                <div>
                  <label className="field-label" htmlFor="minCriticalFieldConfidence">
                    minCriticalFieldConfidence
                  </label>
                  <input
                    id="minCriticalFieldConfidence"
                    name="minCriticalFieldConfidence"
                    type="number"
                    step="0.01"
                    min="0.1"
                    max="1"
                    defaultValue={String(config.minCriticalFieldConfidence ?? 0.7)}
                    className="field-input"
                  />
                  <FieldError name="minCriticalFieldConfidence" dictionary={dictionary} />
                </div>
                <div>
                  <label className="field-label" htmlFor="maxBillAgeDays">
                    maxBillAgeDays
                  </label>
                  <input
                    id="maxBillAgeDays"
                    name="maxBillAgeDays"
                    type="number"
                    min="10"
                    max="730"
                    defaultValue={String(config.maxBillAgeDays ?? 150)}
                    className="field-input"
                  />
                  <FieldError name="maxBillAgeDays" dictionary={dictionary} />
                </div>
                <div>
                  <label className="field-label" htmlFor="blockAtScore">
                    blockAtScore
                  </label>
                  <input
                    id="blockAtScore"
                    name="blockAtScore"
                    type="number"
                    min="1"
                    max="100"
                    defaultValue={String(risk.blockAtScore ?? 75)}
                    className="field-input"
                  />
                  <FieldError name="blockAtScore" dictionary={dictionary} />
                </div>
                <div>
                  <label className="field-label" htmlFor="uncertainAtScore">
                    uncertainAtScore
                  </label>
                  <input
                    id="uncertainAtScore"
                    name="uncertainAtScore"
                    type="number"
                    min="1"
                    max="100"
                    defaultValue={String(risk.uncertainAtScore ?? 45)}
                    className="field-input"
                  />
                  <FieldError name="uncertainAtScore" dictionary={dictionary} />
                </div>
                <div>
                  <label className="field-label" htmlFor="maxMonthlyIncomePerPerson">
                    {dictionary.beneficiary.monthlyIncome} / {dictionary.beneficiary.householdSize}
                  </label>
                  <input
                    id="maxMonthlyIncomePerPerson"
                    name="maxMonthlyIncomePerPerson"
                    defaultValue={String(num(income.maxMonthlyIncomePerPersonCentimes) / 100 || 12000)}
                    className="field-input"
                    dir="ltr"
                  />
                  <FieldError name="maxMonthlyIncomePerPerson" dictionary={dictionary} />
                </div>
                <div>
                  <label className="field-label" htmlFor="absoluteMaxMonthlyIncome">
                    {dictionary.beneficiary.monthlyIncome} (max)
                  </label>
                  <input
                    id="absoluteMaxMonthlyIncome"
                    name="absoluteMaxMonthlyIncome"
                    defaultValue={String(num(income.absoluteMaxMonthlyIncomeCentimes) / 100 || 60000)}
                    className="field-input"
                    dir="ltr"
                  />
                  <FieldError name="absoluteMaxMonthlyIncome" dictionary={dictionary} />
                </div>
                <div>
                  <label className="field-label" htmlFor="requireDocumentAbovePerPerson">
                    {dictionary.docs.income_proof} &gt;
                  </label>
                  <input
                    id="requireDocumentAbovePerPerson"
                    name="requireDocumentAbovePerPerson"
                    defaultValue={String(num(income.requireDocumentAbovePerPersonCentimes) / 100 || 6000)}
                    className="field-input"
                    dir="ltr"
                  />
                  <FieldError name="requireDocumentAbovePerPerson" dictionary={dictionary} />
                </div>
              </div>
            </ActionForm>
          </div>
        </Card>
      </div>

      <Card>
        <h2 className="text-base font-bold">{t.policyTitle}</h2>
        <p className="mt-1 text-2xs text-ink-400">{t.policyTiers}</p>

        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          {policies.map((policy) => (
            <div key={policy.id} className="rounded-xl border border-sand-200 p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-bold">{locale === 'ar' ? policy.categoryNameAr : policy.categoryNameFr}</p>
                <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-bold text-brand-800">
                  v{policy.version}
                </span>
              </div>
              <p className="mt-1 text-2xs text-ink-400">{policy.period}</p>
              <p className="mt-2 text-lg font-bold">
                <Money centimes={policy.baseLimitCentimes} locale={locale} />
              </p>
              <ul className="mt-2 space-y-1 text-[10px] text-ink-500">
                {policy.tiers.map((tier) => (
                  <li key={`${tier.min}-${tier.max ?? 'max'}`}>
                    {tier.min}–{tier.max ?? '∞'} × {tier.multiplier}
                  </li>
                ))}
              </ul>

              <div className="mt-4">
                <ActionForm
                  action={savePolicyAction}
                  dictionary={dictionary}
                  submitLabel={t.savePolicy}
                  submitVariant="secondary"
                  hiddenFields={{ categoryId: categories.find((c) => c.code === policy.categoryCode)?.id ?? '' }}
                >
                  <div className="grid gap-2">
                    <div>
                      <label className="field-label !text-[10px]" htmlFor={`limit-${policy.id}`}>
                        {t.policyLimit}
                      </label>
                      <input
                        id={`limit-${policy.id}`}
                        name="limit"
                        defaultValue={String(policy.baseLimitCentimes / 100)}
                        className="field-input !py-1 text-2xs"
                        dir="ltr"
                      />
                      <FieldError name="limit" dictionary={dictionary} />
                    </div>
                    <div>
                      <label className="field-label !text-[10px]" htmlFor={`period-${policy.id}`}>
                        {t.policyPeriod}
                      </label>
                      <select id={`period-${policy.id}`} name="period" defaultValue={policy.period} className="field-input !py-1 text-2xs">
                        <option value="monthly">monthly</option>
                        <option value="quarterly">quarterly</option>
                        <option value="annual">annual</option>
                      </select>
                    </div>
                    <div className="grid grid-cols-3 gap-1">
                      {[1, 2, 3].map((index) => {
                        const tier = policy.tiers[index - 1];
                        return (
                          <div key={index}>
                            <label className="field-label !text-[10px]" htmlFor={`tier${index}-${policy.id}`}>
                              ×{index}
                            </label>
                            <input
                              id={`tier${index}-${policy.id}`}
                              name={`tier${index}Multiplier`}
                              defaultValue={String(tier?.multiplier ?? 1)}
                              className="field-input !px-1.5 !py-1 text-center text-2xs"
                              dir="ltr"
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </ActionForm>
              </div>
            </div>
          ))}
        </div>

        <Alert tone="warning">{dictionary.transparency.demoText}</Alert>
      </Card>
    </div>
  );
}
