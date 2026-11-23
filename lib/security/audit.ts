import type { Db } from '@/lib/db/types';
import { redact } from './hash';

export type SecuritySeverity = 'info' | 'low' | 'medium' | 'high' | 'critical';
type Queryable = Pick<Db, 'query'>;

export interface AuditEntry {
  actorUserId?: string | null;
  actorRole?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  beforeState?: unknown;
  afterState?: unknown;
  ipHash?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
}

/**
 * Audit trail: append-only at database level (trigger) and privilege level.
 * Payloads are passed through `redact` so secrets never reach the log.
 */
export async function recordAudit(db: Queryable, entry: AuditEntry): Promise<void> {
  await db.query(
    `insert into audit_logs
       (actor_user_id, actor_role, action, entity_type, entity_id,
        before_state, after_state, ip_hash, user_agent, request_id)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      entry.actorUserId ?? null,
      entry.actorRole ?? null,
      entry.action,
      entry.entityType,
      entry.entityId ?? null,
      entry.beforeState === undefined ? null : JSON.stringify(redact(entry.beforeState)),
      entry.afterState === undefined ? null : JSON.stringify(redact(entry.afterState)),
      entry.ipHash ?? null,
      entry.userAgent?.slice(0, 300) ?? null,
      entry.requestId ?? null,
    ],
  );
}

export interface SecurityEventInput {
  eventType: string;
  severity?: SecuritySeverity;
  userId?: string | null;
  ipHash?: string | null;
  route?: string | null;
  details?: Record<string, unknown>;
}

export async function recordSecurityEvent(db: Queryable, input: SecurityEventInput): Promise<void> {
  await db.query(
    `insert into security_events (event_type, severity, user_id, ip_hash, route, details)
     values ($1, $2, $3, $4, $5, $6)`,
    [
      input.eventType,
      input.severity ?? 'info',
      input.userId ?? null,
      input.ipHash ?? null,
      input.route ?? null,
      JSON.stringify(redact(input.details ?? {})),
    ],
  );
}

export const SecurityEvents = {
  LOGIN_SUCCESS: 'auth.login.success',
  LOGIN_FAILED: 'auth.login.failed',
  LOGIN_LOCKED: 'auth.login.locked',
  LOGIN_RATE_LIMITED: 'auth.login.rate_limited',
  REGISTER: 'auth.register',
  LOGOUT: 'auth.logout',
  OTP_REQUESTED: 'auth.otp.requested',
  OTP_FAILED: 'auth.otp.failed',
  OTP_LOCKED: 'auth.otp.locked',
  PHONE_VERIFIED: 'auth.phone.verified',
  ACCESS_DENIED: 'authz.denied',
  UPLOAD_REJECTED: 'upload.rejected',
  UPLOAD_SUSPICIOUS: 'upload.suspicious',
  DONATION_OVERFUND_ATTEMPT: 'donation.overfund_attempt',
  WEBHOOK_INVALID_SIGNATURE: 'payment.webhook.invalid_signature',
  ADMIN_ACTION: 'admin.action',
  MFA_ENABLED: 'auth.mfa.enabled',
  MFA_FAILED: 'auth.mfa.failed',
  DOCUMENT_ACCESSED: 'document.accessed',
  SECRET_MISSING: 'config.secret_missing',
} as const;
