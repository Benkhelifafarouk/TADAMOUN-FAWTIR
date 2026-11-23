import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { randomUUID } from 'node:crypto';
import { ActionForm, FieldError } from '@/components/action-form';
import { Alert, Card, Field, Money, Progress } from '@/components/ui';
import { createDonationAction } from '@/lib/actions/donor';
import { requireUser } from '@/lib/auth/guards';
import { getPublicRequest } from '@/lib/data/public';
import { getDictionary, localePath, type Locale } from '@/lib/i18n';
import { isLocale } from '@/lib/i18n/config';
import { percent } from '@/lib/money';

export async function generateMetadata({ params }: { params: Promise<{ locale: string; ref: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const dictionary = getDictionary(isLocale(locale) ? locale : 'ar');
  return { title: dictionary.donor.donateTitle };
}

export default async function DonatePage({
  params,
}: {
  params: Promise<{ locale: string; ref: string }>;
}) {
  const { locale: raw, ref } = await params;
  if (!isLocale(raw)) notFound();
  const locale: Locale = raw;
  const dictionary = getDictionary(locale);
  await requireUser(locale);

  const request = await getPublicRequest(ref);
  if (!request) notFound();

  const open = request.remainingAmountCentimes > 0 && ['published', 'partially_funded'].includes(request.status);
  if (!open) redirect(`/${locale}/requests/${request.reference}`);

  const idempotencyKey = randomUUID();

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <h1 className="text-2xl font-bold">{dictionary.donor.donateTitle}</h1>
      <p className="mt-2 text-sm text-ink-500">{dictionary.donor.donateSubtitle}</p>

      <Card className="mt-6">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="font-mono text-2xs text-ink-400">{request.reference}</p>
            <p className="mt-1 text-base font-bold">
              {locale === 'ar' ? request.categoryNameAr : request.categoryNameFr}
            </p>
            <p className="text-2xs text-ink-500">{locale === 'ar' ? request.wilayaNameAr : request.wilayaNameFr}</p>
          </div>
          <div className="text-end">
            <p className="text-2xs text-ink-400">{dictionary.requests.remainingLabel}</p>
            <p className="text-lg font-bold text-ink-900">
              <Money centimes={request.remainingAmountCentimes} locale={locale} />
            </p>
          </div>
        </div>
        <div className="mt-4">
          <Progress
            value={percent(request.fundedAmountCentimes, request.eligibleAmountCentimes)}
            label={dictionary.common.progress}
          />
        </div>
      </Card>

      <Card className="mt-4">
        <ActionForm
          action={createDonationAction}
          dictionary={dictionary}
          submitLabel={dictionary.donor.donateNow}
          hiddenFields={{
            locale,
            requestRef: request.reference,
            target: 'request',
            idempotencyKey,
          }}
        >
          <Field
            label={dictionary.donor.amountLabel}
            htmlFor="amount"
            hint={dictionary.donor.amountHint}
            required
          >
            <input
              id="amount"
              name="amount"
              inputMode="decimal"
              autoComplete="off"
              required
              className="field-input"
              placeholder="2500"
            />
            <FieldError name="amount" dictionary={dictionary} />
          </Field>

          <Alert tone="warning" title={dictionary.donor.paymentDemoNotice} />
        </ActionForm>
      </Card>

      <p className="mt-4 text-2xs leading-relaxed text-ink-400">{dictionary.donor.progressAfter}</p>
      <p className="mt-2 text-2xs leading-relaxed text-ink-400">
        <a className="link" href={localePath(locale, `/requests/${request.reference}`)}>
          {dictionary.common.back}
        </a>
      </p>
    </div>
  );
}
