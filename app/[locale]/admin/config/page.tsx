import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ActionForm, FieldError } from '@/components/action-form';
import { Badge, Card, PageHeader } from '@/components/ui';
import { addMunicipalityAction, addProviderAction } from '@/lib/actions/admin';
import { toggleProviderAction } from '@/lib/actions/admin-finance';
import { requireRole } from '@/lib/auth/guards';
import { listMunicipalityRows, listProviders } from '@/lib/data/admin';
import { getCategories, getWilayaIdOptions } from '@/lib/data/public';
import { getDictionary, type Locale } from '@/lib/i18n';
import { isLocale } from '@/lib/i18n/config';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return { title: getDictionary(isLocale(locale) ? locale : 'ar').admin.catalogueTitle };
}

export default async function ConfigPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  if (!isLocale(raw)) notFound();
  const locale: Locale = raw;
  const dictionary = getDictionary(locale);
  const t = dictionary.admin;
  await requireRole(locale, ['admin']);

  const [providers, municipalities, categories, wilayas] = await Promise.all([
    listProviders(),
    listMunicipalityRows(),
    getCategories(),
    getWilayaIdOptions(),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader eyebrow={dictionary.nav.catalogue} title={t.catalogueTitle} subtitle={t.geoTitle} />

      <Card>
        <h2 className="text-base font-bold">{t.catalogueTitle}</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="table-app">
            <thead>
              <tr>
                <th>{t.providerName}</th>
                <th>{t.category}</th>
                <th>{dictionary.common.status}</th>
                <th>{dictionary.common.actions}</th>
              </tr>
            </thead>
            <tbody>
              {providers.map((provider) => (
                <tr key={provider.id}>
                  <td>
                    <span className="font-medium">{locale === 'ar' ? provider.nameAr : provider.nameFr}</span>
                    <span className="block font-mono text-[10px] text-ink-400">{provider.code}</span>
                  </td>
                  <td className="text-2xs">{provider.categoryNameAr}</td>
                  <td>
                    <Badge tone={provider.isActive ? 'success' : 'neutral'}>
                      {provider.isActive ? dictionary.status.user.active : dictionary.status.bill.expired}
                    </Badge>
                  </td>
                  <td>
                    <ActionForm
                      action={toggleProviderAction}
                      dictionary={dictionary}
                      submitLabel={provider.isActive ? t.suspend : t.activate}
                      submitVariant="secondary"
                      showSubmit
                      hiddenFields={{ providerId: provider.id, active: provider.isActive ? 'false' : 'true' }}
                    >
                      <span className="sr-only">{provider.code}</span>
                    </ActionForm>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-6 rounded-xl border border-sand-200 p-4">
          <h3 className="text-sm font-bold">{t.addMunicipality.replace(dictionary.admin.geoTitle, t.providerName)}</h3>
          <ActionForm action={addProviderAction} dictionary={dictionary} submitLabel={dictionary.common.create}>
            <div>
              <label className="field-label" htmlFor="categoryId">
                {t.category}
              </label>
              <select id="categoryId" name="categoryId" className="field-input" required>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {locale === 'ar' ? category.nameAr : category.nameFr}
                  </option>
                ))}
              </select>
              <FieldError name="categoryId" dictionary={dictionary} />
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label className="field-label" htmlFor="code">
                  code
                </label>
                <input id="code" name="code" required pattern="[a-z0-9_]{3,40}" className="field-input" dir="ltr" />
                <FieldError name="code" dictionary={dictionary} />
              </div>
              <div>
                <label className="field-label" htmlFor="nameAr">
                  {dictionary.common.arabic}
                </label>
                <input id="nameAr" name="nameAr" required className="field-input" />
                <FieldError name="nameAr" dictionary={dictionary} />
              </div>
              <div>
                <label className="field-label" htmlFor="nameFr">
                  {dictionary.common.french}
                </label>
                <input id="nameFr" name="nameFr" required className="field-input" dir="ltr" />
                <FieldError name="nameFr" dictionary={dictionary} />
              </div>
            </div>
          </ActionForm>
        </div>
      </Card>

      <Card>
        <h2 className="text-base font-bold">{t.geoTitle}</h2>

        <div className="mt-4 rounded-xl border border-sand-200 p-4">
          <h3 className="text-sm font-bold">{t.addMunicipality}</h3>
          <ActionForm action={addMunicipalityAction} dictionary={dictionary} submitLabel={dictionary.common.create}>
            <div className="grid gap-3 sm:grid-cols-4">
              <div>
                <label className="field-label" htmlFor="wilayaId">
                  {dictionary.beneficiary.wilaya}
                </label>
                <select id="wilayaId" name="wilayaId" className="field-input" required>
                  {wilayas.map((wilaya) => (
                    <option key={wilaya.id} value={wilaya.id}>
                      {locale === 'ar' ? wilaya.nameAr : wilaya.nameFr}
                    </option>
                  ))}
                </select>
                <FieldError name="wilayaId" dictionary={dictionary} />
              </div>
              <div>
                <label className="field-label" htmlFor="code">
                  code
                </label>
                <input id="code" name="code" required className="field-input" dir="ltr" placeholder="16005" />
                <FieldError name="code" dictionary={dictionary} />
              </div>
              <div>
                <label className="field-label" htmlFor="nameArM">
                  {t.municipalityNameAr}
                </label>
                <input id="nameArM" name="nameAr" required className="field-input" />
                <FieldError name="nameAr" dictionary={dictionary} />
              </div>
              <div>
                <label className="field-label" htmlFor="nameFrM">
                  {t.municipalityNameFr}
                </label>
                <input id="nameFrM" name="nameFr" required className="field-input" dir="ltr" />
                <FieldError name="nameFr" dictionary={dictionary} />
              </div>
            </div>
          </ActionForm>
        </div>

        <ul className="mt-4 grid gap-2 sm:grid-cols-2">
          {municipalities.map((municipality) => (
            <li key={municipality.id} className="flex items-center justify-between gap-2 rounded-lg border border-sand-200 px-3 py-2 text-2xs">
              <span className="font-mono text-ink-400">{municipality.wilayaCode}</span>
              <span className="text-ink-700">{municipality.nameAr}</span>
              <span dir="ltr" className="text-ink-400">
                {municipality.nameFr}
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
