import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ActionForm, FieldError } from '@/components/action-form';
import { Alert, Badge, Card, PageHeader } from '@/components/ui';
import { updateSettingAction } from '@/lib/actions/admin';
import { confirmMfaAction, disableMfaAction, enrollMfaAction, verifyMfaAction } from '@/lib/actions/admin-finance';
import { hasRecentMfa, requireRole } from '@/lib/auth/guards';
import { listSettings } from '@/lib/data/admin';
import { getDictionary, type Locale } from '@/lib/i18n';
import { isLocale } from '@/lib/i18n/config';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return { title: getDictionary(isLocale(locale) ? locale : 'ar').admin.settingsTitle };
}

export default async function SettingsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  if (!isLocale(raw)) notFound();
  const locale: Locale = raw;
  const dictionary = getDictionary(locale);
  const t = dictionary.admin;
  const user = await requireRole(locale, ['admin']);
  const settings = await listSettings();
  const mfaReady = hasRecentMfa(user);

  return (
    <div className="space-y-6">
      <PageHeader eyebrow={dictionary.nav.settings} title={t.settingsTitle} subtitle={t.settingsSubtitle} />

      <Card>
        <h2 className="text-base font-bold">{t.mfaTitle}</h2>
        <p className="mt-2 text-2xs text-ink-500">{t.mfaRequiredNote}</p>
        <p className="mt-2">
          <Badge tone={user.mfaEnabled && mfaReady ? 'success' : 'warning'}>
            {user.mfaEnabled ? (mfaReady ? t.mfaEnabled : t.mfaVerify) : t.mfaTitle}
          </Badge>
        </p>

        {!user.mfaEnabled ? (
          <div className="mt-4 space-y-4">
            <ActionForm action={enrollMfaAction} dictionary={dictionary} submitLabel={t.mfaEnable} submitVariant="secondary">
              <p className="text-2xs text-ink-500">{t.mfaScanHint}</p>
            </ActionForm>
            <ActionForm action={confirmMfaAction} dictionary={dictionary} submitLabel={dictionary.common.confirm}>
              <div>
                <label className="field-label" htmlFor="code">
                  {t.mfaCode}
                </label>
                <input id="code" name="code" inputMode="numeric" pattern="[0-9]{6}" required className="field-input" dir="ltr" />
                <FieldError name="code" dictionary={dictionary} />
              </div>
            </ActionForm>
          </div>
        ) : (
          <div className="mt-4">
            {!mfaReady ? (
              <div className="mb-4 space-y-3">
                <Alert tone="warning">{t.mfaRequiredNote}</Alert>
                <ActionForm action={verifyMfaAction} dictionary={dictionary} submitLabel={dictionary.common.confirm}>
                  <div>
                    <label className="field-label" htmlFor="verify-code">
                      {t.mfaCode}
                    </label>
                    <input
                      id="verify-code"
                      name="code"
                      inputMode="numeric"
                      pattern="[0-9]{6}"
                      required
                      className="field-input"
                      dir="ltr"
                    />
                    <FieldError name="code" dictionary={dictionary} />
                  </div>
                </ActionForm>
              </div>
            ) : null}
            <ActionForm action={disableMfaAction} dictionary={dictionary} submitLabel={t.mfaDisable} submitVariant="danger">
              <div>
                <label className="field-label" htmlFor="code">
                  {t.mfaCode}
                </label>
                <input id="code" name="code" inputMode="numeric" pattern="[0-9]{6}" required className="field-input" dir="ltr" />
                <FieldError name="code" dictionary={dictionary} />
              </div>
            </ActionForm>
          </div>
        )}
      </Card>

      <Card>
        <h2 className="text-base font-bold">{t.settingsTitle}</h2>
        {!mfaReady ? (
          <div className="mt-3">
            <Alert tone="warning">{t.mfaRequiredNote}</Alert>
          </div>
        ) : null}
        <ul className="mt-4 space-y-3">
          {settings.map((setting) => (
            <li key={setting.key} className="rounded-lg border border-sand-200 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-mono text-2xs text-ink-700">{setting.key}</span>
                <Badge tone={setting.isPublic ? 'info' : 'neutral'}>{setting.isPublic ? 'public' : 'internal'}</Badge>
              </div>
              {setting.description ? <p className="mt-1 text-[10px] text-ink-400">{setting.description}</p> : null}
              <div className="mt-2">
                <ActionForm
                  action={updateSettingAction}
                  dictionary={dictionary}
                  submitLabel={dictionary.common.save}
                  submitVariant="secondary"
                  showSubmit
                  hiddenFields={{ key: setting.key }}
                >
                  <input
                    name="value"
                    defaultValue={JSON.stringify(setting.value)}
                    className="field-input !py-1 font-mono text-2xs"
                    dir="ltr"
                  />
                  <FieldError name="value" dictionary={dictionary} />
                </ActionForm>
              </div>
            </li>
          ))}
        </ul>
        <Alert tone="warning">{dictionary.transparency.demoText}</Alert>
      </Card>
    </div>
  );
}
