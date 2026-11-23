import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { ActionForm } from '@/components/action-form';
import { Alert, Card, DataRow, Money, PageHeader } from '@/components/ui';
import { StatusBadge } from '@/components/status-badge';
import { cancelDonationAction, confirmDemoPaymentAction } from '@/lib/actions/donor';
import { requireUser } from '@/lib/auth/guards';
import { getDonationDetail } from '@/lib/data/workspace';
import { getDictionary, type Locale } from '@/lib/i18n';
import { isLocale } from '@/lib/i18n/config';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return { title: getDictionary(isLocale(locale) ? locale : 'ar').donor.checkoutTitle };
}

export default async function CheckoutPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale: raw, id } = await params;
  if (!isLocale(raw)) notFound();
  const locale: Locale = raw;
  const dictionary = getDictionary(locale);
  const t = dictionary.donor;
  const user = await requireUser(locale);

  const donation = await getDonationDetail(user.id, id);
  if (!donation) redirect(`/${locale}/donor/donations`);
  if (donation.status !== 'pending') redirect(`/${locale}/donor/donations/${donation.id}`);

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <PageHeader
        eyebrow={dictionary.nav.donations}
        title={t.checkoutTitle}
        subtitle={t.checkoutSubtitle}
        action={<StatusBadge group="donation" value={donation.status} dictionary={dictionary} />}
      />

      <Card>
        <dl>
          <DataRow label={t.donationAmount}>
            <span className="text-lg font-bold">
              <Money centimes={donation.amountCentimes} locale={locale} />
            </span>
          </DataRow>
          <DataRow label={t.allocatedTo}>
            {donation.publicRef ?? (donation.target === 'fund' ? t.fundContribution : '—')}
          </DataRow>
          <DataRow label={dictionary.admin.auditTitle}>{donation.provider}</DataRow>
        </dl>

        <div className="mt-4">
          <Alert tone="warning" title={t.paymentDemoNotice} />
        </div>

        <div className="mt-6 space-y-3">
          <ActionForm
            action={confirmDemoPaymentAction}
            dictionary={dictionary}
            submitLabel={t.confirmDemoPayment}
            hiddenFields={{ locale, donationId: donation.id }}
          >
            <p className="text-2xs leading-relaxed text-ink-500">{t.progressAfter}</p>
          </ActionForm>

          <ActionForm
            action={cancelDonationAction}
            dictionary={dictionary}
            submitLabel={dictionary.common.cancel}
            submitVariant="secondary"
            hiddenFields={{ locale, donationId: donation.id, requestRef: donation.publicRef ?? '' }}
            showSubmit
          >
            <p className="text-2xs text-ink-400">{dictionary.common.note}</p>
          </ActionForm>
        </div>
      </Card>
    </div>
  );
}
