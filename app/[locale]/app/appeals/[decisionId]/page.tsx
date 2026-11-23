import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ActionForm, FieldError } from '@/components/action-form';
import { Alert, Badge, Card, PageHeader } from '@/components/ui';
import { submitAppealAction } from '@/lib/actions/beneficiary';
import { requireUser } from '@/lib/auth/guards';
import { getDb } from '@/lib/db';
import { getDictionary, localePath, type Locale } from '@/lib/i18n';
import { isLocale } from '@/lib/i18n/config';
import { formatDate } from '@/lib/i18n/format';
import { reasonLabel } from '@/lib/i18n/labels';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return { title: getDictionary(isLocale(locale) ? locale : 'ar').beneficiary.appealTitle };
}

export default async function AppealPage({
  params,
}: {
  params: Promise<{ locale: string; decisionId: string }>;
}) {
  const { locale: raw, decisionId } = await params;
  if (!isLocale(raw)) notFound();
  const locale: Locale = raw;
  const dictionary = getDictionary(locale);
  const t = dictionary.beneficiary;
  const user = await requireUser(locale);

  const db = await getDb();
  const rows = await db.query<{
    id: string;
    decision: string;
    created_at: Date;
    eligible_amount_centimes: unknown;
    bill_id: string;
    category_name_ar: string;
    category_name_fr: string;
  }>(
    `select d.id, d.decision, d.created_at, d.eligible_amount_centimes,
            vr.bill_id, sc.name_ar as category_name_ar, sc.name_fr as category_name_fr
       from eligibility_decisions d
       join verification_requests vr on vr.id = d.verification_request_id
       join bills b on b.id = vr.bill_id
       join service_categories sc on sc.id = b.service_category_id
       join beneficiary_profiles bp on bp.id = d.beneficiary_id
      where d.id = $1 and bp.user_id = $2`,
    [decisionId, user.id],
  );
  const decision = rows[0];
  if (!decision) redirect(`/${locale}/app`);

  const reasons = await db.query<{ code: string; severity: string }>(
    'select code, severity from eligibility_decision_reasons where decision_id = $1 order by ordinal',
    [decisionId],
  );

  const appealable = decision.decision !== 'APPROVED';

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader eyebrow={dictionary.nav.appeals} title={t.appealTitle} subtitle={t.appealSubtitle} />

      <Card>
        <p className="text-2xs font-semibold uppercase tracking-wide text-ink-400">{t.decisionTitle}</p>
        <p className="mt-1 text-sm font-bold">
          {locale === 'ar' ? decision.category_name_ar : decision.category_name_fr} —{' '}
          {dictionary.status.decision[decision.decision as 'APPROVED'] ?? decision.decision}
        </p>
        <p className="mt-1 text-2xs text-ink-500">{formatDate(decision.created_at, locale)}</p>

        <ul className="mt-4 space-y-1.5">
          {reasons.map((reason, index) => (
            <li key={`${reason.code}-${index}`} className="flex gap-2 text-2xs text-ink-600">
              <Badge tone={reason.severity === 'blocking' ? 'danger' : 'info'}>{reason.severity}</Badge>
              {reasonLabel(dictionary, reason.code)}
            </li>
          ))}
        </ul>
      </Card>

      {appealable ? (
        <Card>
          <ActionForm
            action={submitAppealAction}
            dictionary={dictionary}
            submitLabel={t.appealSubmit}
            hiddenFields={{ decisionId }}
          >
            <div>
              <label className="field-label" htmlFor="message">
                {t.appealMessage}
              </label>
              <textarea
                id="message"
                name="message"
                rows={6}
                required
                minLength={20}
                maxLength={4000}
                className="field-input"
              />
              <p className="field-hint">{t.appealSubtitle}</p>
              <FieldError name="message" dictionary={dictionary} />
            </div>
            <Alert tone="info">{dictionary.legal.rightsText}</Alert>
          </ActionForm>
        </Card>
      ) : (
        <Alert tone="success">{t.decisionHint}</Alert>
      )}

      <p className="text-2xs text-ink-400">
        <Link className="link" href={localePath(locale, `/app/bills/${decision.bill_id}`)}>
          {dictionary.common.back}
        </Link>
      </p>
    </div>
  );
}
