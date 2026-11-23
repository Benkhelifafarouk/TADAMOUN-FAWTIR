import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth/session';
import { verifyFileToken } from '@/lib/storage/signed-url';
import { getStorage } from '@/lib/storage';
import { recordAudit, recordSecurityEvent } from '@/lib/security/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Private document delivery.
 *
 * A document is only returned when BOTH conditions hold:
 *   1. a valid short-lived HMAC token for this key and owner, and
 *   2. a session belonging to that owner (or a recorded administrative access).
 * Responses are never cacheable and never publicly addressable.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await context.params;
  const token = new URL(request.url).searchParams.get('token') ?? '';
  const payload = verifyFileToken(token);

  if (!payload) {
    return NextResponse.json({ error: 'invalid_or_expired_link' }, { status: 403 });
  }

  const db = await getDb();
  const rows = await db.query<{
    id: string;
    storage_key: string;
    owner_user_id: string;
    mime_type: string;
    deleted_at: Date | null;
  }>('select id, storage_key, owner_user_id, mime_type, deleted_at from stored_files where id = $1', [id]);

  const file = rows[0];
  if (!file || file.deleted_at) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  if (file.storage_key !== payload.k || file.owner_user_id !== payload.u) {
    await recordSecurityEvent(db, {
      eventType: 'document.token_mismatch',
      severity: 'high',
      details: { fileId: id },
    });
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  const isOwner = user.id === file.owner_user_id;
  const isAdmin = user.roles.includes('admin');
  if (!isOwner && !isAdmin) {
    await recordSecurityEvent(db, {
      eventType: 'document.access_denied',
      severity: 'medium',
      userId: user.id,
      details: { fileId: id },
    });
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  if (!isOwner && isAdmin) {
    // Administrative access to a private document is always recorded.
    await recordAudit(db, {
      actorUserId: user.id,
      actorRole: 'admin',
      action: 'document.accessed_by_admin',
      entityType: 'stored_file',
      entityId: id,
    });
  }

  try {
    const buffer = await getStorage().get(file.storage_key);
    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'content-type': file.mime_type,
        'content-length': String(buffer.length),
        'content-disposition': `inline; filename="${file.id}.${file.mime_type === 'application/pdf' ? 'pdf' : 'jpg'}"`,
        'cache-control': 'no-store, private, max-age=0',
        'x-content-type-options': 'nosniff',
        'content-security-policy': "default-src 'none'; img-src 'self'; object-src 'none'; sandbox",
      },
    });
  } catch {
    return NextResponse.json({ error: 'storage_unavailable' }, { status: 500 });
  }
}
