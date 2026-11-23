import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { Card } from '@/components/ui';
import { requireUser } from '@/lib/auth/guards';
import { getReceipt } from '@/lib/data/workspace';
import { getDictionary, localePath, type Locale } from '@/lib/i18n';
import { isLocale } from '@/lib/i18n/config';
import { formatDate } from '@/lib/i18n/format';
import { formatMoney } from '@/lib/money';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return { title: getDictionary(isLocale(locale) ? locale : 'ar').donor.receiptTitle };
}

export default async function ReceiptPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale: raw, id } = await params;
  if (!isLocale(raw)) notFound();
  const locale: Locale = raw;
  const dictionary = getDictionary(locale);
  const t = dictionary.donor;
  const user = await requireUser(locale);

  const receipt = await getReceipt(user.id, id);
  if (!receipt) redirect(`/${locale}/donor/donations`);

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold">{t.receiptTitle}</h1>
        <div className="flex gap-2">
          <Link className="link text-2xs" href={localePath(locale, `/donor/donations/${receipt.donationId}`)}>
            {dictionary.common.back}
          </Link>
        </div>
      </div>

      <Card className="relative overflow-hidden">
        {receipt.isDemo ? (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 grid place-items-center opacity-[0.07]"
          >
            <span className="rotate-[-24deg] text-6xl font-black tracking-widest text-clay-600">DEMO</span>
          </div>
        ) : null}

        <div className="relative">
          <div className="flex items-start justify-between gap-4 border-b border-sand-200 pb-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-brand-700">{dictionary.common.appName}</p>
              <p className="mt-1 text-2xs text-ink-400">{dictionary.common.tagline}</p>
            </div>
            <div className="text-end">
              <p className="text-2xs text-ink-400">{t.receiptNumber}</p>
              <p className="font-mono text-xs font-bold">{receipt.receiptNumber}</p>
            </div>
          </div>

          <div className="mt-6 space-y-3 text-sm">
            <div className="flex justify-between gap-4">
              <span className="text-ink-500">{t.receiptIssued}</span>
              <span className="font-semibold">{formatDate(receipt.issuedAt, locale)}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-ink-500">{dictionary.auth.fullName}</span>
              <span className="font-semibold">{receipt.donorName ?? '—'}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-ink-500">{t.donationAmount}</span>
              <span className="text-lg font-bold">
                {formatMoney(receipt.amountCentimes, locale, locale === 'ar' ? 'دج' : 'DA')}
              </span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-ink-500">{t.allocatedTo}</span>
              <span className="font-mono text-xs">{receipt.publicRef ?? t.fundContribution}</span>
            </div>
          </div>

          <p className="mt-6 rounded-lg border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-2xs font-semibold text-amber-600">
            {t.receiptDemo}
          </p>

          <p className="mt-4 text-[10px] leading-relaxed text-ink-400">{dictionary.legal.draftNotice}</p>
        </div>
      </Card>

      <div className="no-print text-center">
        <p className="text-2xs text-ink-400">{dictionary.common.printHint}</p>
      </div>
    </div>
  );
}
