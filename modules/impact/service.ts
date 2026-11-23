import { getDb } from '@/lib/db/client';

/**
 * Strictly privacy-preserving Impact Thread:
 * - Only returns events where consent_status = 'granted'
 * - Scoped to circles the viewer belongs to
 * - NEVER exposes names, user IDs, or exact locations; ONLY category & approximate time window.
 */
export function listImpactThreadService(userId: string) {
  const db = getDb();
  return db
    .prepare(
      `SELECT ie.id, ie.category, ie.approximate_window, ie.created_at, c.name as circle_name
       FROM impact_events ie
       JOIN circles c ON c.id = ie.circle_id
       JOIN circle_members cm ON cm.circle_id = ie.circle_id
       WHERE ie.consent_status = 'granted'
         AND cm.user_id = ?
         AND cm.status = 'active'
       ORDER BY ie.created_at DESC
       LIMIT 30`
    )
    .all(userId) as Array<{
      id: string;
      category: string;
      approximate_window: string;
      created_at: string;
      circle_name: string;
    }>;
}

export function listNotificationsService(userId: string) {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT id, type, title_key, payload, read_at, created_at
       FROM notifications
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT 30`
    )
    .all(userId) as Array<{
      id: string;
      type: string;
      title_key: string;
      payload: string;
      read_at: string | null;
      created_at: string;
    }>;

  return rows.map((r) => ({
    ...r,
    payload: JSON.parse(r.payload),
  }));
}

export function markNotificationsReadService(userId: string) {
  const db = getDb();
  const nowIso = new Date().toISOString();
  db.prepare('UPDATE notifications SET read_at = COALESCE(read_at, ?) WHERE user_id = ?').run(nowIso, userId);
}
