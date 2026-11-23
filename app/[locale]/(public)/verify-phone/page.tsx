import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { ActionForm, FieldError } from '@/components/action-form';
import { Alert, Card, Field } from '@/components/ui';
import { sendPhoneOtpAction, verifyPhoneOtpAction } from '@/lib/actions/auth';
import { getCurrentUser } from '@/lib/auth/session';
import { homePathForRoles } from '@/lib/auth/roles';
import { getDictionary, localePath, type Locale } from '@/lib/i18n';
import { isLocale } from '@/lib/i18n/config';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return { title: getDictionary(isLocale(locale) ? locale : 'ar').auth.otpTitle };
}

export default async function VerifyPhonePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  if (!isLocale(raw)) notFound();
  const locale: Locale = raw;
  const dictionary = getDictionary(locale);

  const user = await getCurrentUser();
  if (!user) redirect(`/${locale}/login`);

  if (user.phoneVerified) {
    return (
      <div className="mx-auto max-w-md px-4 py-12 sm:px-6">
        <Card>
          <h1 className="text-xl font-bold">{dictionary.auth.phoneVerified}</h1>
          <p className="mt-3 text-sm text-ink-600">{dictionary.auth.phoneVerified}</p>
          <a
            href={localePath(locale, homePathForRoles(user.roles))}
            className="mt-6 inline-flex rounded-lg bg-brand-700 px-4 py-2.5 text-sm font-semibold text-white"
          >
            {dictionary.common.dashboard}
          </a>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md px-4 py-12 sm:px-6">
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-bold">{dictionary.auth.otpTitle}</h1>
        <p className="mt-2 text-sm text-ink-500">{dictionary.auth.otpSubtitle}</p>
        <p className="mt-2 font-mono text-sm text-ink-800" dir="ltr">
          {user.phone ?? '—'}
        </p>
      </div>

      <Card>
        <ActionForm
          action={sendPhoneOtpAction}
          dictionary={dictionary}
          submitLabel={dictionary.auth.sendCode}
          hiddenFields={{ locale }}
        >
          <Alert tone="info">{dictionary.auth.verifyPhoneHint}</Alert>
        </ActionForm>

        <hr className="my-6 border-sand-200" />

        <ActionForm
          action={verifyPhoneOtpAction}
          dictionary={dictionary}
          submitLabel={dictionary.auth.verify}
          hiddenFields={{ locale }}
        >
          <Field label={dictionary.auth.otpCode} htmlFor="code" required>
            <input
              id="code"
              name="code"
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              required
              autoComplete="one-time-code"
              className="field-input text-center font-mono text-lg tracking-[0.4em]"
              dir="ltr"
              placeholder="000000"
            />
            <FieldError name="code" dictionary={dictionary} />
          </Field>
        </ActionForm>
      </Card>

      <p className="mt-4 text-center text-2xs leading-relaxed text-ink-400">
        {dictionary.auth.demoCode.replace(':', '')} — {dictionary.transparency.demoTitle}
      </p>
    </div>
  );
}
