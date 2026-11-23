import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ActionForm, FieldError } from '@/components/action-form';
import { Alert, Card, Field } from '@/components/ui';
import { loginAction } from '@/lib/actions/auth';
import { getCurrentUser } from '@/lib/auth/session';
import { homePathForRoles } from '@/lib/auth/roles';
import { getDictionary, localePath, type Locale } from '@/lib/i18n';
import { isLocale } from '@/lib/i18n/config';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return { title: getDictionary(isLocale(locale) ? locale : 'ar').auth.loginTitle };
}

export default async function LoginPage({
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

  return (
    <div className="mx-auto max-w-md px-4 py-12 sm:px-6">
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-bold">{dictionary.auth.loginTitle}</h1>
        <p className="mt-2 text-sm text-ink-500">{dictionary.auth.loginSubtitle}</p>
      </div>

      {query.error === 'account' ? (
        <div className="mb-4">
          <Alert tone="danger">{dictionary.auth.accountSuspended}</Alert>
        </div>
      ) : null}

      <Card>
        <ActionForm
          action={loginAction}
          dictionary={dictionary}
          submitLabel={dictionary.auth.submitLogin}
          hiddenFields={{ locale }}
        >
          <Field label={dictionary.auth.email} htmlFor="email" required>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              className="field-input"
              dir="ltr"
            />
            <FieldError name="email" dictionary={dictionary} />
          </Field>

          <Field label={dictionary.auth.password} htmlFor="password" required>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              minLength={1}
              className="field-input"
              dir="ltr"
            />
            <FieldError name="password" dictionary={dictionary} />
          </Field>
        </ActionForm>

        <p className="mt-6 border-t border-sand-200 pt-4 text-center text-2xs text-ink-500">
          {dictionary.auth.noAccount}{' '}
          <Link className="link" href={localePath(locale, '/register')}>
            {dictionary.nav.register}
          </Link>
        </p>
      </Card>

      <p className="mt-6 text-center text-2xs leading-relaxed text-ink-400">{dictionary.auth.adminMfaNote}</p>
    </div>
  );
}
