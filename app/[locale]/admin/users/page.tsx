import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ActionForm, FieldError } from '@/components/action-form';
import { Alert, Card, PageHeader } from '@/components/ui';
import { StatusBadge } from '@/components/status-badge';
import { updateUserStatusAction } from '@/lib/actions/admin';
import { requireRole } from '@/lib/auth/guards';
import { listAdminUsers } from '@/lib/data/admin';
import { getDictionary, type Locale } from '@/lib/i18n';
import { isLocale } from '@/lib/i18n/config';
import { formatDate } from '@/lib/i18n/format';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return { title: getDictionary(isLocale(locale) ? locale : 'ar').admin.usersTitle };
}

export default async function AdminUsersPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  if (!isLocale(raw)) notFound();
  const locale: Locale = raw;
  const dictionary = getDictionary(locale);
  const t = dictionary.admin;
  const user = await requireRole(locale, ['admin']);
  const users = await listAdminUsers();

  return (
    <div className="space-y-6">
      <PageHeader eyebrow={dictionary.nav.users} title={t.usersTitle} subtitle={t.usersSubtitle} />

      {!user.mfaEnabled ? (
        <Alert tone="warning" title={dictionary.admin.mfaTitle}>
          {dictionary.admin.mfaRequiredNote}
        </Alert>
      ) : null}

      <Card className="overflow-x-auto p-0">
        <table className="table-app">
          <thead>
            <tr>
              <th>{dictionary.auth.fullName}</th>
              <th className="hidden md:table-cell">{dictionary.auth.email}</th>
              <th className="hidden md:table-cell">{t.role}</th>
              <th>{t.userStatus}</th>
              <th className="hidden md:table-cell">{dictionary.auth.phoneVerified}</th>
              <th className="hidden md:table-cell">{dictionary.common.date}</th>
              <th>{dictionary.common.actions}</th>
            </tr>
          </thead>
          <tbody>
            {users.map((row) => (
              <tr key={row.id}>
                <td className="font-medium">{row.fullName}</td>
                <td className="hidden text-2xs md:table-cell" dir="ltr">
                  {row.email}
                </td>
                <td className="hidden md:table-cell">
                  <div className="flex flex-wrap gap-1">
                    {row.roles.map((role) => (
                      <StatusBadge key={role} group="role" value={role} dictionary={dictionary} />
                    ))}
                  </div>
                </td>
                <td>
                  <StatusBadge group="user" value={row.status} dictionary={dictionary} />
                </td>
                <td className="hidden text-2xs md:table-cell">{row.phoneVerified ? '✓' : '—'}</td>
                <td className="hidden text-2xs text-ink-500 md:table-cell">{formatDate(row.createdAt, locale)}</td>
                <td>
                  <div className="min-w-[13rem]">
                    <ActionForm
                      action={updateUserStatusAction}
                      dictionary={dictionary}
                      submitLabel={dictionary.common.save}
                      submitVariant="secondary"
                      showSubmit
                      hiddenFields={{ userId: row.id }}
                    >
                      <div className="flex gap-1.5">
                        <select name="status" defaultValue={row.status === 'active' ? 'suspended' : 'active'} className="field-input !py-1 text-2xs">
                          <option value="active">{t.activate}</option>
                          <option value="suspended">{t.suspend}</option>
                        </select>
                        <input name="reason" placeholder={t.allocateReason} className="field-input !py-1 text-2xs" />
                      </div>
                      <FieldError name="reason" dictionary={dictionary} />
                    </ActionForm>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <p className="text-2xs text-ink-400">{t.noManualApprovalHint}</p>
    </div>
  );
}
