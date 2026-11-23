'use server';

import { revalidatePath } from 'next/cache';
import { getDb } from '@/lib/db';
import { requireUserAction } from '@/lib/auth/guards';
import { requestMeta } from '@/lib/auth/session';
import { recordSecurityEvent } from '@/lib/security/audit';
import { runDueJobs } from '@/lib/jobs/runner';
import { supportTicketSchema, zodParse, formToObject } from '@/lib/validation/schemas';
import type { ActionState } from './state';
import { guardRateLimit, toActionError } from './errors';

/** Public contact form: rate limited by hashed IP, stored as a support ticket. */
export async function contactAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = zodParse(supportTicketSchema, formToObject(formData));
  if (!parsed.ok) return { ok: false, fieldErrors: parsed.fieldErrors, message: 'actionErrors.VALIDATION' };

  try {
    const db = await getDb();
    const user = await requireUserAction().catch(() => null);
    const meta = await requestMeta();

    // An authenticated user is limited by account, an anonymous visitor by IP.
    const limited = await guardRateLimit('contact', user?.id ?? meta.ipHash, 5, 3600, db);
    if (limited) return limited;

    await db.query(
      `insert into support_tickets (user_id, subject, message, contact_email, priority)
       values ($1, $2, $3, $4, 'normal')`,
      [user?.id ?? null, parsed.data.subject, parsed.data.message, parsed.data.email || user?.email || null],
    );

    await recordSecurityEvent(db, {
      eventType: 'support.ticket_created',
      severity: 'info',
      userId: user?.id ?? null,
      ipHash: meta.ipHash,
    });

    return { ok: true, message: 'contact.success' };
  } catch (error) {
    return toActionError(error);
  }
}

/** Administrator-triggered worker tick (same handler as the secret-protected endpoint). */
export async function runJobsAction(_prev: ActionState): Promise<ActionState> {
  try {
    const user = await requireUserAction();
    if (!user.roles.includes('admin')) return { ok: false, message: 'actionErrors.FORBIDDEN' };
    const db = await getDb();
    const summary = await runDueJobs(db, { limit: 10 });
    await recordSecurityEvent(db, {
      eventType: 'admin.jobs_run',
      severity: 'info',
      userId: user.id,
      details: { processed: summary.processed, succeeded: summary.succeeded, failed: summary.failed },
    });
    revalidatePath('/admin/system');
    return {
      ok: true,
      message: 'admin.jobsRan',
      data: { processed: summary.processed, succeeded: summary.succeeded, failed: summary.failed },
    };
  } catch (error) {
    return toActionError(error);
  }
}
