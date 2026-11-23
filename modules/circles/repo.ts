import crypto from 'node:crypto';
import { getDb } from '@/lib/db/client';

export interface CircleRecord {
  id: string;
  name: string;
  description: string | null;
  country_code: string;
  region_code: string;
  invite_code: string;
  expansion_tier: string;
  created_by: string;
  created_at: string;
  member_role?: string;
  member_count?: number;
}

export function isCircleMemberRepo(userId: string, circleId: string): boolean {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT 1 as hit FROM circle_members
       WHERE circle_id = ? AND user_id = ? AND status = 'active' LIMIT 1`
    )
    .get(circleId, userId) as { hit: number } | undefined;
  return Boolean(row?.hit);
}

export function isCircleAdminRepo(userId: string, circleId: string): boolean {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT 1 as hit FROM circle_members
       WHERE circle_id = ? AND user_id = ? AND status = 'active'
         AND role IN ('owner', 'admin', 'coordinator')
       LIMIT 1`
    )
    .get(circleId, userId) as { hit: number } | undefined;
  return Boolean(row?.hit);
}

export function listUserCirclesRepo(userId: string): CircleRecord[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT c.*, cm.role as member_role,
              (SELECT COUNT(*) FROM circle_members cm2 WHERE cm2.circle_id = c.id AND cm2.status = 'active') as member_count
       FROM circles c
       JOIN circle_members cm ON cm.circle_id = c.id
       WHERE cm.user_id = ? AND cm.status = 'active'
       ORDER BY c.created_at ASC`
    )
    .all(userId) as unknown as CircleRecord[];
}

export function listCircleMembersRepo(circleId: string, viewerId: string) {
  const db = getDb();
  return db
    .prepare(
      `SELECT cm.user_id, cm.role, cm.approved_sensitive, cm.created_at,
              p.display_name, p.region_code, u.trust_level
       FROM circle_members cm
       JOIN profiles p ON p.user_id = cm.user_id
       JOIN users u ON u.id = cm.user_id
       WHERE cm.circle_id = ?
         AND cm.status = 'active'
         AND u.deactivated_at IS NULL
         AND NOT EXISTS (
           SELECT 1 FROM blocks b
           WHERE (b.blocker_id = ? AND b.blocked_id = cm.user_id)
              OR (b.blocker_id = cm.user_id AND b.blocked_id = ?)
         )
       ORDER BY cm.created_at ASC`
    )
    .all(circleId, viewerId, viewerId) as Array<{
      user_id: string;
      role: string;
      approved_sensitive: number;
      created_at: string;
      display_name: string;
      region_code: string;
      trust_level: number;
    }>;
}

export function createCircleRepo(input: {
  name: string;
  description?: string;
  countryCode: string;
  regionCode: string;
  createdBy: string;
}): CircleRecord {
  const db = getDb();
  const id = crypto.randomUUID();
  const inviteCode = `AWN-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare(
      `INSERT INTO circles (id, name, description, country_code, region_code, invite_code, expansion_tier, created_by)
       VALUES (?, ?, ?, ?, ?, ?, 'trust', ?)`
    ).run(id, input.name, input.description ?? null, input.countryCode, input.regionCode, inviteCode, input.createdBy);

    db.prepare(
      `INSERT INTO circle_members (id, circle_id, user_id, role, approved_sensitive, status)
       VALUES (?, ?, ?, 'owner', 1, 'active')`
    ).run(crypto.randomUUID(), id, input.createdBy);

    db.prepare(
      `INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id, metadata)
       VALUES (?, ?, 'circle_created', 'circle', ?, ?)`
    ).run(crypto.randomUUID(), input.createdBy, id, JSON.stringify({ region_code: input.regionCode }));

    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  return db.prepare('SELECT * FROM circles WHERE id = ?').get(id) as unknown as CircleRecord;
}

export function getCircleByInviteCodeRepo(inviteCode: string): CircleRecord | null {
  const db = getDb();
  const row = db
    .prepare('SELECT * FROM circles WHERE upper(invite_code) = upper(?)')
    .get(inviteCode.trim()) as unknown as CircleRecord | undefined;
  return row ?? null;
}

export function addCircleMemberRepo(circleId: string, userId: string): void {
  const db = getDb();
  db.prepare(
    `INSERT INTO circle_members (id, circle_id, user_id, role, approved_sensitive, status)
     VALUES (?, ?, ?, 'member', 0, 'active')
     ON CONFLICT(circle_id, user_id) DO UPDATE SET status = 'active'`
  ).run(crypto.randomUUID(), circleId, userId);

  db.prepare(
    `INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id, metadata)
     VALUES (?, ?, 'circle_joined', 'circle', ?, '{}')`
  ).run(crypto.randomUUID(), userId, circleId);
}
