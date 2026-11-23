import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ActionForm, FieldError } from '@/components/action-form';
import { Alert, Card, DemoNotice, PageHeader } from '@/components/ui';
import { ProviderSelect } from '@/components/provider-select';
import { uploadBillAction } from '@/lib/actions/beneficiary';
import { requireUser } from '@/lib/auth/guards';
import { getCategories, getProviderOptions } from '@/lib/data/public';
import { getBeneficiaryContext } from '@/lib/data/workspace';
import { getDictionary, localePath, type Locale } from '@/lib/i18n';
import { isLocale } from '@/lib/i18n/config';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return { title: getDictionary(isLocale(locale) ? locale : 'ar').beneficiary.newBillTitle };
}

export default async function NewBillPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  if (!isLocale(raw)) notFound();
  const locale: Locale = raw;
  const dictionary = getDictionary(locale);
  const t = dictionary.beneficiary;
  const user = await requireUser(locale);

  const [context, categories, providers] = await Promise.all([
    getBeneficiaryContext(user.id),
    getCategories(),
    getProviderOptions(),
  ]);

  const ready = Boolean(context) && context?.status === 'complete' && context.householdSize !== null;

  return (
    <div className="space-y-6">
      <PageHeader eyebrow={dictionary.nav.newBill} title={t.newBillTitle} subtitle={t.newBillSubtitle} />

      {!ready ? (
        <Alert tone="warning" title={t.needProfileFirst}>
          <Link className="link" href={localePath(locale, '/app/profile')}>
            {t.completeProfile}
          </Link>
        </Alert>
      ) : null}

      {!user.phoneVerified ? (
        <Alert tone="warning" title={dictionary.auth.phonePending}>
          <Link className="link" href={localePath(locale, '/verify-phone')}>
            {dictionary.auth.verifyPhone}
          </Link>
        </Alert>
      ) : null}

      <Card>
        <ActionForm
          action={uploadBillAction}
          dictionary={dictionary}
          submitLabel={t.uploadBill}
          className="space-y-4"
        >
          <ProviderSelect
            categories={categories}
            providers={providers}
            locale={locale}
            categoryLabel={t.serviceType}
            providerLabel={t.provider}
            placeholder={dictionary.common.none}
          />
          <FieldError name="providerId" dictionary={dictionary} />
          <FieldError name="categoryId" dictionary={dictionary} />

          <div>
            <label className="field-label" htmlFor="file">
              {t.file} <span className="text-clay-500">*</span>
            </label>
            <input
              id="file"
              name="file"
              type="file"
              accept="image/jpeg,image/png,application/pdf"
              required
              className="block w-full rounded-lg border border-sand-300 bg-white px-3 py-2 text-sm file:me-3 file:rounded-md file:border-0 file:bg-brand-50 file:px-3 file:py-1.5 file:text-2xs file:font-semibold file:text-brand-800"
            />
            <p className="field-hint">{t.fileHint}</p>
            <FieldError name="file" dictionary={dictionary} />
          </div>

          <DemoNotice text={dictionary.transparency.demoText} />
        </ActionForm>
      </Card>

      <Card>
        <h2 className="text-sm font-bold">{dictionary.how.verificationTitle}</h2>
        <p className="mt-2 text-2xs leading-relaxed text-ink-500">{dictionary.how.verificationText}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {Object.values(dictionary.status.decision).map((label) => (
            <span key={label} className="rounded-full border border-sand-300 bg-sand-50 px-2.5 py-1 text-[10px] font-semibold text-ink-600">
              {label}
            </span>
          ))}
        </div>
      </Card>
    </div>
  );
}
