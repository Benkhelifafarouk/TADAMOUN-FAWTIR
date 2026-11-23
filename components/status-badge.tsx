import { Badge } from '@/components/ui';
import type { Dictionary } from '@/lib/i18n';

type Tone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info';

const toneByStatus: Record<string, Record<string, Tone>> = {
  bill: {
    uploaded: 'info',
    processing: 'info',
    verified: 'brand',
    needs_documents: 'warning',
    rejected: 'danger',
    published: 'success',
    expired: 'neutral',
    withdrawn: 'neutral',
  },
  verification: {
    queued: 'neutral',
    processing: 'info',
    approved: 'success',
    rejected: 'danger',
    needs_documents: 'warning',
    uncertain: 'warning',
    blocked: 'danger',
  },
  decision: {
    APPROVED: 'success',
    REJECTED: 'danger',
    NEEDS_ADDITIONAL_DOCUMENTS: 'warning',
    VERIFICATION_UNCERTAIN: 'warning',
    TEMPORARILY_BLOCKED: 'danger',
  },
  request: {
    draft: 'neutral',
    published: 'brand',
    partially_funded: 'info',
    funded: 'success',
    paid: 'success',
    expired: 'neutral',
    cancelled: 'neutral',
  },
  donation: {
    pending: 'warning',
    paid: 'success',
    failed: 'danger',
    cancelled: 'neutral',
    refunded: 'neutral',
    partially_refunded: 'neutral',
  },
  document: { pending: 'warning', fulfilled: 'success', expired: 'neutral', cancelled: 'neutral' },
  ticket: { open: 'warning', in_progress: 'info', resolved: 'success', closed: 'neutral' },
  appeal: { submitted: 'info', resolved: 'success', rejected: 'danger' },
  user: { active: 'success', suspended: 'danger', pending_deletion: 'warning', deleted: 'neutral' },
  fraud: { open: 'warning', reviewed: 'info', dismissed: 'neutral' },
  notification: { queued: 'neutral', sent: 'info', delivered: 'success', failed: 'danger' },
  severity: { info: 'info', low: 'neutral', medium: 'warning', high: 'danger', critical: 'danger', warning: 'warning', blocking: 'danger' },
  role: { beneficiary: 'brand', donor: 'info', support: 'neutral', admin: 'warning' },
};

export function StatusBadge({
  group,
  value,
  dictionary,
}: {
  group: keyof Dictionary['status'];
  value: string;
  dictionary: Dictionary;
}) {
  const map = dictionary.status[group] as unknown as Record<string, string>;
  const label = map[value] ?? value;
  const tone = toneByStatus[group]?.[value] ?? 'neutral';
  return <Badge tone={tone}>{label}</Badge>;
}

export function labelFor(group: keyof Dictionary['status'], value: string, dictionary: Dictionary): string {
  const map = dictionary.status[group] as unknown as Record<string, string>;
  return map[value] ?? value;
}
