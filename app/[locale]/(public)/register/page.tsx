import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ActionForm, FieldError } from '@/components/action-form';
import { Alert, Card, Field } from '@/components/ui';
import { registerAction } from '@/lib/actions/auth';
import { getCurrentUser } from '@/lib/auth/session';
import { homePathForRoles } from '@/lib/auth/roles';
import { getDictionary, localePath, type Locale } from '@/lib/i18n';
import { isLocale } from '@/lib/i18n/config';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return { title: getDictionary(isLocale(locale) ? locale : 'ar').auth.registerTitle };
}

export default async function RegisterPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale: raw } = await params;
  if (!isLocale(raw)) notFound();
  const locale: Locale = raw;
  const dictionary = getDictionary(locale);
  const query = await searchParams;

  const user = await getCurrentUser();
  if (user) redirect(`/${locale}${homePathForRoles(user.roles)}`);

  const defaultRole = query.role === 'beneficiary' ? 'beneficiary' : 'donor';

  return (
    <div className="mx-auto max-w-lg px-4 py-12 sm:px-6">
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-bold">{dictionary.auth.registerTitle}</h1>
        <p className="mt-2 text-sm text-ink-500">{dictionary.auth.registerSubtitle}</p>
      </div>

      <Card>
        <ActionForm
          action={registerAction}
          dictionary={dictionary}
          submitLabel={dictionary.auth.submitRegister}
          hiddenFields={{ locale }}
        >
          <fieldset>
            <legend className="field-label">{dictionary.auth.role}</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex cursor-pointer gap-2 rounded-lg border border-sand-300 bg-white p-3 text-2xs hover:border-brand-300 has-[:checked]:border-brand-600 has-[:checked]:bg-brand-50">
                <input type="radio" name="role" value="beneficiary" defaultChecked={defaultRole === 'beneficiary'} className="mt-0.5" />
                <span>
                  <span className="block font-bold text-ink-900">{dictionary.auth.roleBeneficiary}</span>
                  <span className="mt-1 block leading-relaxed text-ink-500">{dictionary.auth.roleBeneficiaryHint}</span>
                </span>
              </label>
              <label className="flex cursor-pointer gap-2 rounded-lg border border-sand-300 bg-white p-3 text-2xs hover:border-brand-300 has-[:checked]:border-brand-600 has-[:checked]:bg-brand-50">
                <input type="radio" name="role" value="donor" defaultChecked={defaultRole === 'donor'} className="mt-0.5" />
                <span>
                  <span className="block font-bold text-ink-900">{dictionary.auth.roleDonor}</span>
                  <span className="mt-1 block leading-relaxed text-ink-500">{dictionary.auth.roleDonorHint}</span>
                </span>
              </label>
            </div>
            <FieldError name="role" dictionary={dictionary} />
          </fieldset>

          <Field label={dictionary.auth.fullName} htmlFor="fullName" hint={dictionary.auth.fullNameHint} required>
            <input id="fullName" name="fullName" className="field-input" autoComplete="name" required maxLength={120} />
            <FieldError name="fullName" dictionary={dictionary} />
          </Field>

          <Field label={dictionary.auth.email} htmlFor="email" required>
            <input id="email" name="email" type="email" autoComplete="email" required className="field-input" dir="ltr" />
            <FieldError name="email" dictionary={dictionary} />
          </Field>

          <Field label={dictionary.auth.phone} htmlFor="phone" hint={dictionary.auth.phoneHint} required>
            <input
              id="phone"
              name="phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              required
              className="field-input"
              dir="ltr"
              placeholder="0550123456"
            />
            <FieldError name="phone" dictionary={dictionary} />
          </Field>

          <Field label={dictionary.auth.password} htmlFor="password" hint={dictionary.validation.passwordStrength} required>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={10}
              className="field-input"
              dir="ltr"
            />
            <FieldError name="password" dictionary={dictionary} />
          </Field>

          <Field label={dictionary.auth.confirmPassword} htmlFor="confirmPassword" required>
            <input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              required
              className="field-input"
              dir="ltr"
            />
            <FieldError name="confirmPassword" dictionary={dictionary} />
          </Field>

          <div className="space-y-2 rounded-lg border border-sand-300 bg-sand-50 p-3">
            <label className="flex items-start gap-2 text-2xs leading-relaxed text-ink-600">
              <input type="checkbox" name="consentTerms" required className="mt-0.5" />
              <span>
                {dictionary.auth.consentTerms} —{' '}
                <Link className="link" href={localePath(locale, '/legal/terms')}>
                  {dictionary.legal.termsTitle}
                </Link>
              </span>
            </label>
            <label className="flex items-start gap-2 text-2xs leading-relaxed text-ink-600">
              <input type="checkbox" name="consentPrivacy" required className="mt-0.5" />
              <span>
                {dictionary.auth.consentPrivacy} —{' '}
                <Link className="link" href={localePath(locale, '/legal/privacy')}>
                  {dictionary.legal.privacyTitle}
                </Link>
              </span>
            </label>
            <FieldError name="consentTerms" dictionary={dictionary} />
          </div>

          <Alert tone="info">{dictionary.auth.rolesNote}</Alert>
        </ActionForm>

        <p className="mt-6 border-t border-sand-200 pt-4 text-center text-2xs text-ink-500">
          {dictionary.auth.haveAccount}{' '}
          <Link className="link" href={localePath(locale, '/login')}>
            {dictionary.nav.login}
          </Link>
        </p>
      </Card>
    </div>
  );
}
