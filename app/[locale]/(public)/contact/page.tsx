import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requestMeta } from '@/lib/auth/session';
import { ActionForm, FieldError } from '@/components/action-form';
import { Alert, Card, Field, PageHeader } from '@/components/ui';
import { contactAction } from '@/lib/actions/public';
import { getDictionary, type Locale } from '@/lib/i18n';
import { isLocale } from '@/lib/i18n/config';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return { title: getDictionary(isLocale(locale) ? locale : 'ar').contact.title };
}

export default async function ContactPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  if (!isLocale(raw)) notFound();
  const locale: Locale = raw;
  const dictionary = getDictionary(locale);
  const meta = await requestMeta();

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <PageHeader eyebrow={dictionary.nav.contact} title={dictionary.contact.title} subtitle={dictionary.contact.subtitle} />

      <Card>
        <ActionForm
          action={contactAction}
          dictionary={dictionary}
          submitLabel={dictionary.contact.submit}
          hiddenFields={{ ipHash: meta.ipHash }}
        >
          <Field label={dictionary.contact.subject} htmlFor="subject" required>
            <input id="subject" name="subject" className="field-input" required maxLength={160} />
            <FieldError name="subject" dictionary={dictionary} />
          </Field>

          <Field label={dictionary.contact.email} htmlFor="email" hint={dictionary.common.optional}>
            <input id="email" name="email" type="email" className="field-input" autoComplete="email" />
            <FieldError name="email" dictionary={dictionary} />
          </Field>

          <Field label={dictionary.contact.message} htmlFor="message" required>
            <textarea id="message" name="message" rows={6} className="field-input" required maxLength={4000} />
            <FieldError name="message" dictionary={dictionary} />
          </Field>

          <Alert tone="warning">{dictionary.contact.supportNote}</Alert>
        </ActionForm>
      </Card>

      <p className="mt-4 text-center text-2xs text-ink-400">{dictionary.contact.responseTime}</p>
    </div>
  );
}
