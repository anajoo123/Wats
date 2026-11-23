import crypto from 'node:crypto';
import { getDb } from '@/lib/db/client';

export function findAuthorizedSosRecipientsRepo(circleId: string, requesterId: string): string[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT cm.user_id
       FROM circle_members cm
       JOIN users u ON u.id = cm.user_id
       WHERE cm.circle_id = ?
         AND cm.status = 'active'
         AND cm.user_id <> ?
         AND u.deactivated_at IS NULL
         AND (u.trust_level >= 2 OR cm.role IN ('owner', 'admin', 'coordinator') OR cm.approved_sensitive = 1)
         AND NOT EXISTS (
           SELECT 1 FROM blocks b
           WHERE (b.blocker_id = ? AND b.blocked_id = cm.user_id)
              OR (b.blocker_id = cm.user_id AND b.blocked_id = ?)
         )`
    )
    .all(circleId, requesterId, requesterId, requesterId) as Array<{ user_id: string }>;

  return rows.map((r) => r.user_id);
}

export function notifySosRecipientsRepo(recipientIds: string[], needId: string, circleId: string): void {
  const db = getDb();
  const stmt = db.prepare(
    `INSERT INTO notifications (id, user_id, type, title_key, payload)
     VALUES (?, ?, 'sos_alert', 'notif.sos_alert', ?)`
  );
  for (const uid of recipientIds) {
    stmt.run(
      crypto.randomUUID(),
      uid,
      JSON.stringify({ need_id: needId, circle_id: circleId, community_only_disclaimer: true })
    );
  }
}
