'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getDb } from '@/lib/db';
import { requireUserAction } from '@/lib/auth/guards';
import { cancelDonation, confirmDemoPayment, createDonation } from '@/lib/donations/service';
import { donationSchema, formToObject, zodParse } from '@/lib/validation/schemas';
import { runJobsSafely } from '@/lib/jobs/runner';
import type { ActionState } from './state';
import { toActionError } from './errors';

export async function createDonationAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = zodParse(donationSchema, formToObject(formData));
  if (!parsed.ok) return { ok: false, fieldErrors: parsed.fieldErrors, message: 'actionErrors.VALIDATION' };
  const locale = String(formData.get('locale') ?? 'ar');

  let donationId = '';
  try {
    const user = await requireUserAction();
    const db = await getDb();

    let requestId: string | null = null;
    if (parsed.data.target === 'request') {
      const rows = await db.query<{ id: string }>(
        `select id from assistance_requests
          where public_ref = $1 and status in ('published', 'partially_funded')`,
        [parsed.data.requestRef ?? null],
      );
      if (!rows[0]) return { ok: false, message: 'actionErrors.REQUEST_NOT_FOUND' };
      requestId = rows[0].id;
    }

    const donation = await createDonation(db, {
      userId: user.id,
      target: parsed.data.target,
      requestId,
      amountCentimes: parsed.data.amountCentimes,
      idempotencyKey: parsed.data.idempotencyKey ?? null,
    });
    donationId = donation.id;
  } catch (error) {
    return toActionError(error);
  }

  redirect(`/${locale}/donor/checkout/${donationId}`);
}

export async function confirmDemoPaymentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const locale = String(formData.get('locale') ?? 'ar');
  const donationId = String(formData.get('donationId') ?? '');

  try {
    const user = await requireUserAction();
    const db = await getDb();
    await confirmDemoPayment(db, { userId: user.id, donationId });
    await runJobsSafely(3);
  } catch (error) {
    return toActionError(error);
  }

  revalidatePath('/donor', 'layout');
  redirect(`/${locale}/donor/donations/${donationId}?paid=1`);
}

export async function cancelDonationAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const locale = String(formData.get('locale') ?? 'ar');
  const donationId = String(formData.get('donationId') ?? '');
  const requestRef = String(formData.get('requestRef') ?? '');

  try {
    const user = await requireUserAction();
    const db = await getDb();
    await cancelDonation(db, { userId: user.id, donationId });
  } catch (error) {
    return toActionError(error);
  }

  redirect(requestRef ? `/${locale}/requests/${requestRef}` : `/${locale}/donor`);
}
