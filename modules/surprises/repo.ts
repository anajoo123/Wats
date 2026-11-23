import crypto from 'node:crypto';
import { getDb } from '@/lib/db/client';

export function listVisibleSurprisesRepo(userId: string) {
  const db = getDb();
  return db
    .prepare(
      `SELECT si.*, c.name as circle_name, c.expansion_tier, p.display_name as partner_name,
              (SELECT sc.status FROM surprise_claims sc WHERE sc.item_id = si.id AND sc.recipient_id = ?) as my_claim_status
       FROM surprise_items si
       JOIN circles c ON c.id = si.circle_id
       JOIN circle_members cm ON cm.circle_id = si.circle_id
       JOIN profiles p ON p.user_id = si.partner_id
       WHERE cm.user_id = ?
         AND cm.status = 'active'
         AND si.is_active = 1
       ORDER BY si.created_at DESC`
    )
    .all(userId, userId) as Array<{
      id: string;
      circle_id: string;
      circle_name: string;
      expansion_tier: string;
      partner_id: string;
      partner_name: string;
      title: string;
      description: string | null;
      quantity_available: number;
      region_code: string;
      my_claim_status: string | null;
      created_at: string;
    }>;
}

export function createSurpriseItemRepo(input: {
  circleId: string;
  partnerId: string;
  title: string;
  description?: string;
  quantityAvailable: number;
  regionCode: string;
}) {
  const db = getDb();
  const id = crypto.randomUUID();
  db.prepare(
    `INSERT INTO surprise_items (id, circle_id, partner_id, title, description, quantity_available, region_code, is_active)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1)`
  ).run(id, input.circleId, input.partnerId, input.title, input.description ?? null, input.quantityAvailable, input.regionCode);

  db.prepare(
    `INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id, metadata)
     VALUES (?, ?, 'surprise_item_created', 'surprise_item', ?, ?)`
  ).run(crypto.randomUUID(), input.partnerId, id, JSON.stringify({ circle_id: input.circleId }));

  return db.prepare('SELECT * FROM surprise_items WHERE id = ?').get(id);
}

export function claimSurpriseItemRepo(itemId: string, recipientId: string) {
  const db = getDb();
  const item = db
    .prepare('SELECT * FROM surprise_items WHERE id = ? AND is_active = 1')
    .get(itemId) as
    | { id: string; circle_id: string; quantity_available: number }
    | undefined;
  if (!item) throw new Error('SURPRISE_NOT_FOUND');
  if (item.quantity_available <= 0) throw new Error('ITEM_OUT_OF_STOCK');

  const existing = db
    .prepare('SELECT id FROM surprise_claims WHERE item_id = ? AND recipient_id = ?')
    .get(itemId, recipientId);
  if (existing) throw new Error('ALREADY_CLAIMED');

  const claimId = crypto.randomUUID();
  const nowIso = new Date().toISOString();

  db.exec('BEGIN IMMEDIATE');
  try {
    const res = db
      .prepare(
        `UPDATE surprise_items
         SET quantity_available = quantity_available - 1, updated_at = ?
         WHERE id = ? AND quantity_available > 0`
      )
      .run(nowIso, itemId);
    if (res.changes === 0) throw new Error('ITEM_OUT_OF_STOCK');

    db.prepare(
      `INSERT INTO surprise_claims (id, item_id, recipient_id, status)
       VALUES (?, ?, ?, 'reserved')`
    ).run(claimId, itemId, recipientId);

    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  return db.prepare('SELECT * FROM surprise_claims WHERE id = ?').get(claimId);
}
