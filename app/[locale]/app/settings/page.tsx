import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ActionForm } from '@/components/action-form';
import { Alert, Card, DataRow, PageHeader } from '@/components/ui';
import { requestDeletionAction, updateConsentAction } from '@/lib/actions/beneficiary';
import { requireUser } from '@/lib/auth/guards';
import { getDb } from '@/lib/db';
import { listAppealsForBeneficiary } from '@/lib/data/workspace';
import { getDictionary, localePath, type Locale } from '@/lib/i18n';
import { isLocale } from '@/lib/i18n/config';
import { formatDate } from '@/lib/i18n/format';
import { StatusBadge } from '@/components/status-badge';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return { title: getDictionary(isLocale(locale) ? locale : 'ar').beneficiary.settingsTitle };
}

export default async function SettingsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  if (!isLocale(raw)) notFound();
  const locale: Locale = raw;
  const dictionary = getDictionary(locale);
  const user = await requireUser(locale);

  const db = await getDb();
  const consents = await db.query<{ consent_type: string; granted: boolean; policy_version: string; created_at: Date }>(
    `select consent_type, granted, policy_version, created_at
       from consent_records where user_id = $1
      order by created_at desc limit 20`,
    [user.id],
  );
  const appeals = await listAppealsForBeneficiary(user.id);

  return (
    <div className="space-y-6">
      <PageHeader eyebrow={dictionary.nav.settings} title={dictionary.beneficiary.settingsTitle} subtitle={dictionary.beneficiary.privacyTitle} />

      <Card>
        <h2 className="text-base font-bold">{dictionary.common.account}</h2>
        <dl className="mt-3">
          <DataRow label={dictionary.auth.fullName}>{user.fullName}</DataRow>
          <DataRow label={dictionary.auth.email}>{user.email}</DataRow>
          <DataRow label={dictionary.auth.phone}>{user.phone ?? '—'}</DataRow>
          <DataRow label={dictionary.auth.phoneVerified}>
            {user.phoneVerified ? dictionary.auth.phoneVerified : dictionary.auth.phonePending}
          </DataRow>
          <DataRow label={dictionary.auth.language}>
            {user.preferredLocale === 'ar' ? dictionary.common.arabic : dictionary.common.french}
          </DataRow>
        </dl>
      </Card>

      <Card>
        <h2 className="text-base font-bold">{dictionary.beneficiary.consentTitle}</h2>
        <p className="mt-2 text-2xs text-ink-500">{dictionary.legal.rightsText}</p>

        <div className="mt-4 space-y-3">
          {(['terms', 'privacy'] as const).map((type) => (
            <div key={type} className="rounded-lg border border-sand-200 p-3">
              <p className="text-sm font-semibold text-ink-800">
                {type === 'terms' ? dictionary.legal.termsTitle : dictionary.legal.privacyTitle}
              </p>
              <ActionForm
                action={updateConsentAction}
                dictionary={dictionary}
                submitLabel={dictionary.common.save}
                submitVariant="secondary"
                hiddenFields={{ consentType: type }}
                className="mt-2"
              >
                <label className="flex items-start gap-2 text-2xs text-ink-600">
                  <input type="checkbox" name="granted" defaultChecked className="mt-0.5" />
                  <span>{type === 'terms' ? dictionary.auth.consentTerms : dictionary.auth.consentPrivacy}</span>
                </label>
              </ActionForm>
            </div>
          ))}
        </div>

        {consents.length > 0 ? (
          <details className="mt-4">
            <summary className="cursor-pointer text-2xs font-semibold text-ink-500">
              {dictionary.beneficiary.consentTitle}
            </summary>
            <ul className="mt-2 space-y-1 text-2xs text-ink-500">
              {consents.map((consent, index) => (
                <li key={index} className="flex justify-between gap-2">
                  <span>{consent.consent_type}</span>
                  <span className="font-mono">
                    {consent.granted ? '✓' : '✕'} {consent.policy_version} — {formatDate(consent.created_at, locale)}
                  </span>
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </Card>

      <Card>
        <h2 className="text-base font-bold">{dictionary.beneficiary.appealTitle}</h2>
        {appeals.length === 0 ? (
          <p className="mt-2 text-2xs text-ink-400">{dictionary.common.noData}</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {appeals.map((appeal) => (
              <li key={appeal.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-sand-200 px-3 py-2 text-2xs">
                <span className="text-ink-600">{formatDate(appeal.submittedAt, locale)}</span>
                <StatusBadge group="appeal" value={appeal.status} dictionary={dictionary} />
                <span className="text-ink-500">
                  {appeal.outcome ? dictionary.status.decision[appeal.outcome as 'APPROVED'] ?? appeal.outcome : '—'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="border-clay-500/30">
        <h2 className="text-base font-bold text-clay-600">{dictionary.beneficiary.requestDeletion}</h2>
        <p className="mt-2 text-2xs leading-relaxed text-ink-500">{dictionary.beneficiary.deletionHint}</p>
        <div className="mt-4">
          <ActionForm
            action={requestDeletionAction}
            dictionary={dictionary}
            submitLabel={dictionary.beneficiary.requestDeletion}
            submitVariant="danger"
            hiddenFields={{ locale }}
          >
            <Alert tone="warning">{dictionary.legal.retentionText}</Alert>
          </ActionForm>
        </div>
      </Card>

      <p className="text-2xs text-ink-400">
        <Link className="link" href={localePath(locale, '/contact')}>
          {dictionary.beneficiary.contactSupport}
        </Link>
      </p>
    </div>
  );
}
