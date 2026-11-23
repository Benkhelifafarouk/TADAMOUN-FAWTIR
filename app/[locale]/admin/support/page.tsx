import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ActionForm } from '@/components/action-form';
import { Card, EmptyState, PageHeader } from '@/components/ui';
import { StatusBadge } from '@/components/status-badge';
import { resolveTicketAction } from '@/lib/actions/admin';
import { requireRole } from '@/lib/auth/guards';
import { listSupportTickets } from '@/lib/data/admin';
import { getDictionary, type Locale } from '@/lib/i18n';
import { isLocale } from '@/lib/i18n/config';
import { formatDateTime } from '@/lib/i18n/format';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return { title: getDictionary(isLocale(locale) ? locale : 'ar').admin.supportTitle };
}

export default async function SupportPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  if (!isLocale(raw)) notFound();
  const locale: Locale = raw;
  const dictionary = getDictionary(locale);
  const t = dictionary.admin;
  await requireRole(locale, ['admin', 'support']);

  const tickets = await listSupportTickets();

  return (
    <div className="space-y-6">
      <PageHeader eyebrow={dictionary.nav.support} title={t.supportTitle} subtitle={t.supportSubtitle} />

      {tickets.length === 0 ? (
        <EmptyState title={t.noRows} />
      ) : (
        <ul className="space-y-4">
          {tickets.map((ticket) => (
            <li key={ticket.id}>
              <Card>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-bold text-ink-900">{ticket.subject}</p>
                    <p className="mt-1 text-2xs text-ink-400">
                      {formatDateTime(ticket.createdAt, locale)} · {ticket.contactEmail ?? '—'}
                    </p>
                  </div>
                  <StatusBadge group="ticket" value={ticket.status} dictionary={dictionary} />
                </div>

                <p className="mt-3 whitespace-pre-line rounded-lg border border-sand-200 bg-sand-50 px-3 py-2 text-2xs leading-relaxed text-ink-700">
                  {ticket.message}
                </p>

                <div className="mt-3 flex flex-wrap gap-2">
                  {(['in_progress', 'resolved', 'closed'] as const).map((status) => (
                    <ActionForm
                      key={status}
                      action={resolveTicketAction}
                      dictionary={dictionary}
                      submitLabel={
                        status === 'resolved'
                          ? t.resolve
                          : status === 'closed'
                            ? t.closeTicket
                            : t.supportTitle
                      }
                      submitVariant="secondary"
                      showSubmit
                      hiddenFields={{ ticketId: ticket.id, status }}
                    >
                      <span className="sr-only">{status}</span>
                    </ActionForm>
                  ))}
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <p className="text-2xs text-ink-400">{t.supportSubtitle}</p>
    </div>
  );
}
