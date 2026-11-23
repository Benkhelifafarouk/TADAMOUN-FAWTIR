import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ActionForm, FieldError } from '@/components/action-form';
import { Alert, Badge, ButtonLink, Card, DataRow, DemoBadge, Money, PageHeader } from '@/components/ui';
import { StatusBadge } from '@/components/status-badge';
import { getBillDetail } from '@/lib/bills/service';
import { getDb } from '@/lib/db';
import { requireUser } from '@/lib/auth/guards';
import { uploadDocumentAction } from '@/lib/actions/beneficiary';
import { getDictionary, localePath, type Locale } from '@/lib/i18n';
import { isLocale } from '@/lib/i18n/config';
import { formatDate } from '@/lib/i18n/format';
import { docLabel, nextActionLabel, reasonLabel } from '@/lib/i18n/labels';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return { title: getDictionary(isLocale(locale) ? locale : 'ar').beneficiary.billDetail };
}

export default async function BillDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale: raw, id } = await params;
  if (!isLocale(raw)) notFound();
  const locale: Locale = raw;
  const dictionary = getDictionary(locale);
  const t = dictionary.beneficiary;
  const user = await requireUser(locale);

  const db = await getDb();
  const bill = await getBillDetail(db, id, user.id);
  if (!bill) redirect(`/${locale}/app/bills`);

  const parsed = bill.ocr?.parsed as Record<string, { value?: string | null; confidence?: number }> | undefined;
  const pendingDocs = bill.documentRequests.filter((doc) => doc.status === 'pending');
  const rejected = bill.decision && ['REJECTED', 'VERIFICATION_UNCERTAIN', 'TEMPORARILY_BLOCKED'].includes(bill.decision.decision);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={dictionary.nav.myBills}
        title={t.billDetail}
        subtitle={bill.billReference ?? bill.id.slice(0, 8)}
        action={
          <div className="flex flex-wrap gap-2">
            <StatusBadge group="bill" value={bill.status} dictionary={dictionary} />
            {bill.decision ? <StatusBadge group="decision" value={bill.decision.decision} dictionary={dictionary} /> : null}
          </div>
        }
      />

      {bill.ocr?.isDemo ? (
        <Alert tone="warning" title={dictionary.common.demo}>
          {dictionary.transparency.demoText}
        </Alert>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-base font-bold">{t.extractedTitle}</h2>
            {bill.ocr?.isDemo ? <DemoBadge label={dictionary.common.demo} /> : null}
          </div>
          <dl>
            <DataRow label={dictionary.beneficiary.provider}>
              {locale === 'ar' ? bill.providerNameAr : bill.providerNameFr}
            </DataRow>
            <DataRow label={dictionary.beneficiary.serviceType}>
              {locale === 'ar' ? bill.serviceNameAr : bill.serviceNameFr}
            </DataRow>
            <DataRow label={t.billReference}>{bill.billReference ?? '—'}</DataRow>
            <DataRow label={t.billAmount}>
              {bill.totalCentimes === null ? '—' : <Money centimes={bill.totalCentimes} locale={locale} />}
            </DataRow>
            <DataRow label={dictionary.common.date}>{formatDate(bill.issueDate, locale)}</DataRow>
            <DataRow label={t.expiresAt}>{formatDate(bill.dueDate, locale)}</DataRow>
            <DataRow label={t.period}>
              {bill.periodStart ? `${formatDate(bill.periodStart, locale)} — ${formatDate(bill.periodEnd, locale)}` : '—'}
            </DataRow>
            <DataRow label={t.consumption}>
              {bill.consumption ? `${bill.consumption} ${bill.consumptionUnit ?? ''}` : '—'}
            </DataRow>
            <DataRow label={t.confidence}>
              {bill.ocr ? `${Math.round(bill.ocr.overall * 100)}%` : '—'}
            </DataRow>
          </dl>
          <p className="field-hint">{t.extractedHint}</p>
          {parsed ? (
            <details className="mt-3">
              <summary className="cursor-pointer text-2xs font-semibold text-ink-500">{dictionary.common.details}</summary>
              <pre dir="ltr" className="mt-2 max-h-56 overflow-auto rounded-lg bg-ink-950/95 p-3 text-[10px] leading-relaxed text-sand-100">
                {JSON.stringify(parsed, null, 2)}
              </pre>
            </details>
          ) : null}
        </Card>

        <div className="space-y-4">
          <Card>
            <h2 className="text-base font-bold">{t.decisionTitle}</h2>
            {bill.decision ? (
              <>
                <p className="mt-2">
                  <StatusBadge group="decision" value={bill.decision.decision} dictionary={dictionary} />
                </p>
                <dl className="mt-3">
                  <DataRow label={t.eligibleAmount}>
                    {bill.decision.eligibleAmountCentimes > 0 ? (
                      <Money centimes={bill.decision.eligibleAmountCentimes} locale={locale} />
                    ) : (
                      '—'
                    )}
                  </DataRow>
                  <DataRow label={dictionary.admin.decidedAt}>{formatDate(bill.decision.createdAt, locale)}</DataRow>
                  <DataRow label={dictionary.admin.engineVersionLabel}>{bill.decision.engineVersion}</DataRow>
                </dl>

                <h3 className="mt-4 text-2xs font-bold uppercase tracking-wide text-ink-400">{t.reasonsTitle}</h3>
                <ul className="mt-2 space-y-1.5">
                  {bill.decision.reasons.map((reason, index) => (
                    <li key={`${reason.code}-${index}`} className="flex gap-2 text-2xs leading-relaxed text-ink-600">
                      <Badge tone={reason.severity === 'blocking' ? 'danger' : reason.severity === 'warning' ? 'warning' : 'info'}>
                        {dictionary.status.severity[reason.severity as 'info'] ?? reason.severity}
                      </Badge>
                      <span>{reasonLabel(dictionary, reason.code)}</span>
                    </li>
                  ))}
                </ul>

                {nextActionLabel(dictionary, bill.decision.nextAction) ? (
                  <div className="mt-4 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2">
                    <p className="text-2xs font-bold text-brand-900">{t.nextSteps}</p>
                    <p className="mt-1 text-2xs text-brand-800">{nextActionLabel(dictionary, bill.decision.nextAction)}</p>
                  </div>
                ) : null}

                {rejected ? (
                  <div className="mt-4">
                    <ButtonLink href={localePath(locale, `/app/appeals/${bill.decision.id}`)} variant="secondary">
                      {t.appealTitle}
                    </ButtonLink>
                  </div>
                ) : null}
              </>
            ) : (
              <p className="mt-2 text-sm text-ink-500">{t.billProcessing}</p>
            )}
            <p className="field-hint mt-3">{t.decisionHint}</p>
          </Card>

          {pendingDocs.length > 0 ? (
            <Card className="border-amber-500/40">
              <h2 className="text-base font-bold text-amber-600">{t.pendingDocuments}</h2>
              <ul className="mt-3 space-y-4">
                {pendingDocs.map((doc) => (
                  <li key={doc.id} className="rounded-lg border border-sand-200 p-3">
                    <p className="text-sm font-semibold text-ink-900">{docLabel(dictionary, doc.docType)}</p>
                    <p className="mt-1 text-2xs text-ink-500">
                      {dictionary.docs.whyNeeded} {reasonLabel(dictionary, doc.reasonCode)}
                    </p>
                    <p className="mt-1 text-2xs text-ink-400">
                      {t.dueDate}: {formatDate(doc.dueAt, locale)}
                    </p>
                    <div className="mt-3">
                      <ActionForm
                        action={uploadDocumentAction}
                        dictionary={dictionary}
                        submitLabel={t.uploadDocument}
                        hiddenFields={{ docType: doc.docType, requestId: doc.id }}
                      >
                        <input
                          name="file"
                          type="file"
                          required
                          accept="image/jpeg,image/png,application/pdf"
                          className="block w-full text-2xs file:me-2 file:rounded-md file:border-0 file:bg-brand-50 file:px-2.5 file:py-1.5 file:text-2xs file:font-semibold file:text-brand-800"
                        />
                        <FieldError name="file" dictionary={dictionary} />
                      </ActionForm>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          {bill.publicReference ? (
            <Card className="bg-brand-50">
              <p className="text-2xs font-bold uppercase tracking-wide text-brand-700">{dictionary.status.request.published}</p>
              <p className="mt-2 font-mono text-sm text-ink-900">{bill.publicReference}</p>
              <Link className="link mt-2 inline-flex text-2xs" href={localePath(locale, `/requests/${bill.publicReference}`)}>
                {t.viewRequest}
              </Link>
            </Card>
          ) : null}
        </div>
      </div>

      <div className="text-2xs text-ink-400">
        <Link className="link" href={localePath(locale, '/app/bills')}>
          {dictionary.common.back}
        </Link>
      </div>
    </div>
  );
}
