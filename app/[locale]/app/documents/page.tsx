import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ActionForm, FieldError } from '@/components/action-form';
import { Alert, Card, EmptyState, PageHeader } from '@/components/ui';
import { StatusBadge } from '@/components/status-badge';
import { uploadDocumentAction } from '@/lib/actions/beneficiary';
import { requireUser } from '@/lib/auth/guards';
import { listDocumentRequests } from '@/lib/data/workspace';
import { getDictionary, type Locale } from '@/lib/i18n';
import { isLocale } from '@/lib/i18n/config';
import { formatDate } from '@/lib/i18n/format';
import { docLabel, reasonLabel } from '@/lib/i18n/labels';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return { title: getDictionary(isLocale(locale) ? locale : 'ar').beneficiary.documentsTitle };
}

export default async function DocumentsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  if (!isLocale(raw)) notFound();
  const locale: Locale = raw;
  const dictionary = getDictionary(locale);
  const t = dictionary.beneficiary;
  const user = await requireUser(locale);

  const documents = await listDocumentRequests(user.id);
  const pending = documents.filter((doc) => doc.status === 'pending');
  const past = documents.filter((doc) => doc.status !== 'pending');

  return (
    <div className="space-y-6">
      <PageHeader eyebrow={dictionary.nav.documents} title={t.documentsTitle} subtitle={t.documentsSubtitle} />

      <Alert tone="info">{dictionary.docs.whyNeeded} {t.privacyNote}</Alert>

      {pending.length === 0 ? (
        <EmptyState title={dictionary.common.noData} hint={t.documentsSubtitle} />
      ) : (
        <ul className="space-y-4">
          {pending.map((doc) => (
            <li key={doc.id}>
              <Card>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-bold">{docLabel(dictionary, doc.docType)}</p>
                    <p className="mt-1 text-2xs text-ink-500">
                      {dictionary.docs.whyNeeded} {reasonLabel(dictionary, doc.reasonCode)}
                    </p>
                    <p className="mt-1 text-2xs text-ink-400">
                      {t.dueDate}: {formatDate(doc.dueAt, locale)}
                    </p>
                  </div>
                  <StatusBadge group="document" value={doc.status} dictionary={dictionary} />
                </div>

                <div className="mt-4">
                  <ActionForm
                    action={uploadDocumentAction}
                    dictionary={dictionary}
                    submitLabel={t.uploadDocument}
                    hiddenFields={{ docType: doc.docType, requestId: doc.id }}
                  >
                    <input
                      name="file"
                      type="file"
                      required
                      accept="image/jpeg,image/png,application/pdf"
                      className="block w-full rounded-lg border border-sand-300 bg-white px-3 py-2 text-2xs file:me-3 file:rounded-md file:border-0 file:bg-brand-50 file:px-3 file:py-1.5 file:text-2xs file:font-semibold file:text-brand-800"
                    />
                    <FieldError name="file" dictionary={dictionary} />
                  </ActionForm>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}

      {past.length > 0 ? (
        <Card className="overflow-x-auto p-0">
          <table className="table-app">
            <thead>
              <tr>
                <th>{t.docType}</th>
                <th>{dictionary.common.status}</th>
                <th>{dictionary.common.date}</th>
              </tr>
            </thead>
            <tbody>
              {past.map((doc) => (
                <tr key={doc.id}>
                  <td>{docLabel(dictionary, doc.docType)}</td>
                  <td>
                    <StatusBadge group="document" value={doc.status} dictionary={dictionary} />
                  </td>
                  <td className="text-2xs text-ink-500">{formatDate(doc.createdAt, locale)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ) : null}
    </div>
  );
}
