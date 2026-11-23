import crypto from 'node:crypto';
import { getDb } from '@/lib/db/client';
import type { NeedCategory, NeedStatus, UrgencyLevel } from './schema';

export interface NeedRecord {
  id: string;
  requester_id: string;
  requester_name?: string;
  title: string;
  description: string;
  category: NeedCategory;
  urgency: UrgencyLevel;
  status: NeedStatus;
  is_sensitive: number;
  region_code: string;
  time_window_start: string;
  time_window_end: string;
  expires_at: string;
  attachment_path: string | null;
  is_sos: number;
  sos_official_ack_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface OfferRecord {
  id: string;
  provider_id: string;
  provider_name?: string;
  provider_trust_level?: number;
  circle_id: string;
  circle_name?: string;
  category: NeedCategory;
  title: string;
  description: string | null;
  region_code: string;
  available_from: string;
  available_until: string;
  capacity_total: number;
  capacity_remaining: number;
  is_active: number;
  created_at: string;
}

export function getNeedByIdRepo(needId: string): NeedRecord | null {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT n.*, p.display_name as requester_name
       FROM needs n
       JOIN profiles p ON p.user_id = n.requester_id
       WHERE n.id = ?`
    )
    .get(needId) as unknown as NeedRecord | undefined;
  return row ?? null;
}

export function getNeedCircleIdsRepo(needId: string): string[] {
  const db = getDb();
  const rows = db
    .prepare('SELECT circle_id FROM need_circles WHERE need_id = ?')
    .all(needId) as Array<{ circle_id: string }>;
  return rows.map((r) => r.circle_id);
}

export function listVisibleNeedsForUserRepo(userId: string): NeedRecord[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT DISTINCT n.*, p.display_name as requester_name
       FROM needs n
       JOIN profiles p ON p.user_id = n.requester_id
       WHERE (
         n.requester_id = ?
         OR (
           n.status <> 'draft'
           AND NOT EXISTS (
             SELECT 1 FROM blocks b
             WHERE (b.blocker_id = ? AND b.blocked_id = n.requester_id)
                OR (b.blocker_id = n.requester_id AND b.blocked_id = ?)
           )
           AND EXISTS (
             SELECT 1 FROM need_circles nc
             JOIN circle_members cm ON cm.circle_id = nc.circle_id
             WHERE nc.need_id = n.id
               AND cm.user_id = ?
               AND cm.status = 'active'
           )
         )
       )
       ORDER BY
         CASE n.urgency WHEN 'sos' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,
         n.created_at DESC`
    )
    .all(userId, userId, userId, userId) as unknown as NeedRecord[];
}

export function createNeedRepo(input: {
  id: string;
  requesterId: string;
  title: string;
  description: string;
  category: NeedCategory;
  urgency: UrgencyLevel;
  isSensitive: boolean;
  regionCode: string;
  timeWindowStart: string;
  timeWindowEnd: string;
  expiresAt: string;
  attachmentPath?: string | null;
  circleIds: string[];
  isSos?: boolean;
  sosOfficialAckAt?: string | null;
}): NeedRecord {
  const db = getDb();

  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare(
      `INSERT INTO needs (
        id, requester_id, title, description, category, urgency, status,
        is_sensitive, region_code, time_window_start, time_window_end, expires_at,
        attachment_path, is_sos, sos_official_ack_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      input.id,
      input.requesterId,
      input.title,
      input.description,
      input.category,
      input.urgency,
      input.isSensitive ? 1 : 0,
      input.regionCode,
      input.timeWindowStart,
      input.timeWindowEnd,
      input.expiresAt,
      input.attachmentPath ?? null,
      input.isSos ? 1 : 0,
      input.sosOfficialAckAt ?? null
    );

    const linkCircle = db.prepare('INSERT INTO need_circles (need_id, circle_id) VALUES (?, ?)');
    for (const cid of input.circleIds) {
      linkCircle.run(input.id, cid);
    }

    db.prepare(
      `INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id, metadata)
       VALUES (?, ?, 'need_created', 'need', ?, ?)`
    ).run(
      crypto.randomUUID(),
      input.requesterId,
      input.id,
      JSON.stringify({ category: input.category, circles: input.circleIds.length, is_sos: Boolean(input.isSos) })
    );

    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  return getNeedByIdRepo(input.id)!;
}

export function executeControlledNeedTransitionRepo(
  needId: string,
  fromStatus: NeedStatus,
  toStatus: NeedStatus,
  actorId: string | null,
  reason?: string
): NeedRecord {
  const db = getDb();
  const nowIso = new Date().toISOString();

  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare('UPDATE _need_transition_guard SET allow_flag = 1 WHERE id = 1').run();
    db.prepare('UPDATE needs SET status = ?, updated_at = ? WHERE id = ?').run(toStatus, nowIso, needId);
    db.prepare('UPDATE _need_transition_guard SET allow_flag = 0 WHERE id = 1').run();

    db.prepare(
      `INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id, metadata)
       VALUES (?, ?, 'need_transition', 'need', ?, ?)`
    ).run(
      crypto.randomUUID(),
      actorId,
      needId,
      JSON.stringify({ from: fromStatus, to: toStatus, reason: reason ?? null })
    );

    db.exec('COMMIT');
  } catch (err) {
    db.prepare('UPDATE _need_transition_guard SET allow_flag = 0 WHERE id = 1').run();
    db.exec('ROLLBACK');
    throw err;
  }

  return getNeedByIdRepo(needId)!;
}

export function listVisibleOffersForUserRepo(userId: string): OfferRecord[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT o.*, p.display_name as provider_name, u.trust_level as provider_trust_level, c.name as circle_name
       FROM offers o
       JOIN profiles p ON p.user_id = o.provider_id
       JOIN users u ON u.id = o.provider_id
       JOIN circles c ON c.id = o.circle_id
       WHERE o.is_active = 1
         AND u.deactivated_at IS NULL
         AND EXISTS (
           SELECT 1 FROM circle_members cm
           WHERE cm.circle_id = o.circle_id AND cm.user_id = ? AND cm.status = 'active'
         )
         AND NOT EXISTS (
           SELECT 1 FROM blocks b
           WHERE (b.blocker_id = ? AND b.blocked_id = o.provider_id)
              OR (b.blocker_id = o.provider_id AND b.blocked_id = ?)
         )
       ORDER BY o.created_at DESC`
    )
    .all(userId, userId, userId) as unknown as OfferRecord[];
}

export function createOfferRepo(input: {
  id: string;
  providerId: string;
  circleId: string;
  category: NeedCategory;
  title: string;
  description?: string;
  regionCode: string;
  availableFrom: string;
  availableUntil: string;
  capacityTotal: number;
}): OfferRecord {
  const db = getDb();
  db.prepare(
    `INSERT INTO offers (id, provider_id, circle_id, category, title, description, region_code, available_from, available_until, capacity_total, capacity_remaining, is_active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`
  ).run(
    input.id,
    input.providerId,
    input.circleId,
    input.category,
    input.title,
    input.description ?? null,
    input.regionCode,
    input.availableFrom,
    input.availableUntil,
    input.capacityTotal,
    input.capacityTotal
  );

  return db
    .prepare(
      `SELECT o.*, p.display_name as provider_name, u.trust_level as provider_trust_level, c.name as circle_name
       FROM offers o
       JOIN profiles p ON p.user_id = o.provider_id
       JOIN users u ON u.id = o.provider_id
       JOIN circles c ON c.id = o.circle_id
       WHERE o.id = ?`
    )
    .get(input.id) as unknown as OfferRecord;
}

export function expireOverdueNeedsRepo(): number {
  const db = getDb();
  const nowIso = new Date().toISOString();
  const overdue = db
    .prepare(`SELECT id FROM needs WHERE status = 'published' AND expires_at <= ?`)
    .all(nowIso) as Array<{ id: string }>;

  for (const row of overdue) {
    executeControlledNeedTransitionRepo(row.id, 'published', 'expired', null, 'scheduled_expiration');
  }
  return overdue.length;
}
