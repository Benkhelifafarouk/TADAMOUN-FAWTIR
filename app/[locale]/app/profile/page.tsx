import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ActionForm, FieldError } from '@/components/action-form';
import { Alert, Card, Field, PageHeader } from '@/components/ui';
import { GeoSelect } from '@/components/geo-select';
import { saveHouseholdProfileAction } from '@/lib/actions/beneficiary';
import { requireUser } from '@/lib/auth/guards';
import { getBeneficiaryContext } from '@/lib/data/workspace';
import { getMunicipalityOptions, getWilayaIdOptions } from '@/lib/data/public';
import { getDictionary, type Locale } from '@/lib/i18n';
import { isLocale } from '@/lib/i18n/config';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return { title: getDictionary(isLocale(locale) ? locale : 'ar').beneficiary.profileTitle };
}

export default async function ProfilePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  if (!isLocale(raw)) notFound();
  const locale: Locale = raw;
  const dictionary = getDictionary(locale);
  const t = dictionary.beneficiary;
  const user = await requireUser(locale);

  const [context, wilayas, municipalities] = await Promise.all([
    getBeneficiaryContext(user.id),
    getWilayaIdOptions(),
    getMunicipalityOptions(),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader eyebrow={dictionary.nav.profile} title={t.profileTitle} subtitle={t.profileSubtitle} />

      <Alert tone="info">{t.privacyNote}</Alert>

      <Card>
        <ActionForm action={saveHouseholdProfileAction} dictionary={dictionary} submitLabel={t.saveProfile}>
          <GeoSelect
            wilayas={wilayas}
            municipalities={municipalities}
            locale={locale}
            defaultWilayaId={context?.wilayaId}
            defaultMunicipalityId={context?.municipalityId ?? undefined}
            wilayaLabel={t.wilaya}
            municipalityLabel={t.municipality}
            allLabel={dictionary.common.none}
          />
          <FieldError name="wilayaId" dictionary={dictionary} />
          <FieldError name="municipalityId" dictionary={dictionary} />

          <Field label={t.address} htmlFor="address" hint={t.addressHint}>
            <input id="address" name="address" className="field-input" defaultValue={context?.addressLine ?? ''} maxLength={240} />
            <FieldError name="address" dictionary={dictionary} />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t.householdSize} htmlFor="size" required>
              <input
                id="size"
                name="size"
                type="number"
                min={1}
                max={40}
                required
                className="field-input"
                defaultValue={context?.householdSize ?? ''}
              />
              <FieldError name="size" dictionary={dictionary} />
            </Field>

            <Field label={t.childrenCount} htmlFor="children">
              <input
                id="children"
                name="children"
                type="number"
                min={0}
                max={40}
                className="field-input"
                defaultValue={context?.childrenCount ?? 0}
              />
              <FieldError name="children" dictionary={dictionary} />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t.monthlyIncome} htmlFor="monthlyIncome" hint={dictionary.common.optional}>
              <input
                id="monthlyIncome"
                name="monthlyIncome"
                inputMode="decimal"
                className="field-input"
                dir="ltr"
                defaultValue={context?.incomeCentimes ? String(context.incomeCentimes / 100) : ''}
                placeholder="25000"
              />
              <FieldError name="monthlyIncome" dictionary={dictionary} />
            </Field>

            <Field label={t.incomeSource} htmlFor="incomeSource">
              <input id="incomeSource" name="incomeSource" className="field-input" defaultValue={context?.incomeSource ?? ''} />
              <FieldError name="incomeSource" dictionary={dictionary} />
            </Field>
          </div>

          <Field label={t.housingStatus} htmlFor="housingStatus">
            <select id="housingStatus" name="housingStatus" className="field-input" defaultValue={context?.housingStatus ?? ''}>
              <option value="">{dictionary.common.none}</option>
              <option value="owner">{t.housing.owner}</option>
              <option value="tenant">{t.housing.tenant}</option>
              <option value="family_hosted">{t.housing.family_hosted}</option>
              <option value="other">{t.housing.other}</option>
            </select>
            <FieldError name="housingStatus" dictionary={dictionary} />
          </Field>

        </ActionForm>
      </Card>
    </div>
  );
}
