import crypto from 'node:crypto';
import { getDb } from '@/lib/db/client';
import type { ConsentPurpose } from './schema';

export function isBlockedBetweenRepo(uidA: string, uidB: string): boolean {
  if (!uidA || !uidB || uidA === uidB) return false;
  const db = getDb();
  const row = db
    .prepare(
      `SELECT 1 as hit FROM blocks
       WHERE (blocker_id = ? AND blocked_id = ?)
          OR (blocker_id = ? AND blocked_id = ?)
       LIMIT 1`
    )
    .get(uidA, uidB, uidB, uidA) as { hit: number } | undefined;
  return Boolean(row?.hit);
}

export function listBlockedUsersRepo(userId: string) {
  const db = getDb();
  return db
    .prepare(
      `SELECT b.id, b.blocked_id, b.reason, b.created_at, p.display_name
       FROM blocks b
       LEFT JOIN profiles p ON p.user_id = b.blocked_id
       WHERE b.blocker_id = ?
       ORDER BY b.created_at DESC`
    )
    .all(userId) as Array<{
      id: string;
      blocked_id: string;
      reason: string | null;
      created_at: string;
      display_name: string | null;
    }>;
}

export function createBlockRepo(blockerId: string, blockedId: string, reason?: string): void {
  const db = getDb();
  db.prepare(
    `INSERT OR IGNORE INTO blocks (id, blocker_id, blocked_id, reason)
     VALUES (?, ?, ?, ?)`
  ).run(crypto.randomUUID(), blockerId, blockedId, reason ?? null);

  db.prepare(
    `INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id, metadata)
     VALUES (?, ?, 'user_blocked', 'block', ?, ?)`
  ).run(crypto.randomUUID(), blockerId, blockedId, JSON.stringify({ mutual_invisibility: true }));
}

export function removeBlockRepo(blockerId: string, blockedId: string): void {
  const db = getDb();
  db.prepare('DELETE FROM blocks WHERE blocker_id = ? AND blocked_id = ?').run(blockerId, blockedId);
}

export function listConsentsRepo(userId: string) {
  const db = getDb();
  return db
    .prepare('SELECT purpose, version, status, granted_at, revoked_at FROM consents WHERE user_id = ?')
    .all(userId) as Array<{
      purpose: ConsentPurpose;
      version: number;
      status: 'granted' | 'revoked';
      granted_at: string | null;
      revoked_at: string | null;
    }>;
}

export function hasGrantedConsentRepo(userId: string, purpose: ConsentPurpose): boolean {
  const db = getDb();
  const row = db
    .prepare(`SELECT status FROM consents WHERE user_id = ? AND purpose = ?`)
    .get(userId, purpose) as { status: string } | undefined;
  return row?.status === 'granted';
}

export function upsertConsentRepo(userId: string, purpose: ConsentPurpose, granted: boolean) {
  const db = getDb();
  const nowIso = new Date().toISOString();
  const status = granted ? 'granted' : 'revoked';
  db.prepare(
    `INSERT INTO consents (id, user_id, purpose, version, status, granted_at, revoked_at)
     VALUES (?, ?, ?, 1, ?, ?, ?)
     ON CONFLICT(user_id, purpose) DO UPDATE SET
       status = excluded.status,
       version = consents.version + 1,
       granted_at = CASE WHEN excluded.status = 'granted' THEN excluded.granted_at ELSE consents.granted_at END,
       revoked_at = CASE WHEN excluded.status = 'revoked' THEN excluded.revoked_at ELSE NULL END,
       updated_at = ?`
  ).run(
    crypto.randomUUID(),
    userId,
    purpose,
    status,
    granted ? nowIso : null,
    granted ? null : nowIso,
    nowIso
  );

  db.prepare(
    `INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id, metadata)
     VALUES (?, ?, 'consent_updated', 'consent', ?, ?)`
  ).run(crypto.randomUUID(), userId, purpose, JSON.stringify({ status }));
}

export function getContactRevealForNeedRepo(needId: string) {
  const db = getDb();
  return db
    .prepare('SELECT * FROM contact_reveals WHERE need_id = ?')
    .get(needId) as
    | {
        id: string;
        need_id: string;
        requester_id: string;
        provider_id: string;
        consent_requester: number;
        consent_provider: number;
        revealed_at: string | null;
      }
    | undefined;
}

export function setContactRevealConsentRepo(needId: string, actorId: string, grant: boolean) {
  const db = getDb();
  const row = getContactRevealForNeedRepo(needId);
  if (!row) throw new Error('CONTACT_REVEAL_NOT_INITIALIZED');

  const nowIso = new Date().toISOString();
  if (actorId === row.requester_id) {
    db.prepare(
      `UPDATE contact_reveals
       SET consent_requester = ?,
           revealed_at = CASE WHEN ? = 1 AND consent_provider = 1 THEN COALESCE(revealed_at, ?) ELSE NULL END,
           updated_at = ?
       WHERE need_id = ?`
    ).run(grant ? 1 : 0, grant ? 1 : 0, nowIso, nowIso, needId);
  } else if (actorId === row.provider_id) {
    db.prepare(
      `UPDATE contact_reveals
       SET consent_provider = ?,
           revealed_at = CASE WHEN consent_requester = 1 AND ? = 1 THEN COALESCE(revealed_at, ?) ELSE NULL END,
           updated_at = ?
       WHERE need_id = ?`
    ).run(grant ? 1 : 0, grant ? 1 : 0, nowIso, nowIso, needId);
  } else {
    throw new Error('FORBIDDEN');
  }

  return getContactRevealForNeedRepo(needId)!;
}

export function getRevealedContactDetailsRepo(needId: string, viewerId: string) {
  const db = getDb();
  const reveal = getContactRevealForNeedRepo(needId);
  if (!reveal) return null;
  if (viewerId !== reveal.requester_id && viewerId !== reveal.provider_id) return null;
  if (reveal.consent_requester !== 1 || reveal.consent_provider !== 1 || !reveal.revealed_at) {
    return null;
  }
  if (isBlockedBetweenRepo(reveal.requester_id, reveal.provider_id)) {
    return null;
  }

  const targetUserId = viewerId === reveal.requester_id ? reveal.provider_id : reveal.requester_id;
  const contact = db
    .prepare(
      `SELECT pc.phone_e164, pc.preferred_channel, pc.emergency_note, p.display_name
       FROM private_contacts pc
       JOIN profiles p ON p.user_id = pc.user_id
       WHERE pc.user_id = ?`
    )
    .get(targetUserId) as
    | {
        phone_e164: string | null;
        preferred_channel: string;
        emergency_note: string | null;
        display_name: string;
      }
    | undefined;

  return contact || null;
}
