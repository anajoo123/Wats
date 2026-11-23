import crypto from 'node:crypto';
import { getDb } from '@/lib/db/client';
import { isBlockedBetweenRepo } from '@/modules/privacy/repo';
import { assertCircleAdminPolicy, assertCircleMemberPolicy } from './policy';
import {
  addCircleMemberRepo,
  createCircleRepo,
  getCircleByInviteCodeRepo,
  listCircleMembersRepo,
  listUserCirclesRepo,
} from './repo';

export function listMyCirclesService(userId: string) {
  const circles = listUserCirclesRepo(userId);
  return circles.map((circle) => ({
    ...circle,
    members: listCircleMembersRepo(circle.id, userId),
  }));
}

export function createCircleService(input: {
  name: string;
  description?: string;
  countryCode: string;
  regionCode: string;
  createdBy: string;
}) {
  if (!input.regionCode.startsWith(`${input.countryCode}-`)) {
    throw new Error('REGION_COUNTRY_MISMATCH');
  }
  return createCircleRepo(input);
}

export function joinCircleByInviteService(userId: string, inviteCode: string) {
  const circle = getCircleByInviteCodeRepo(inviteCode);
  if (!circle) {
    throw new Error('INVALID_INVITE_CODE');
  }
  if (isBlockedBetweenRepo(userId, circle.created_by)) {
    throw new Error('INVALID_INVITE_CODE'); // Do not leak circle existence across blocks
  }
  addCircleMemberRepo(circle.id, userId);
  return circle;
}

export function getCircleMembersService(userId: string, circleId: string) {
  assertCircleMemberPolicy(userId, circleId);
  return listCircleMembersRepo(circleId, userId);
}

const EXPANSION_ORDER = ['trust', 'neighborhood', 'city', 'country', 'global'] as const;

export function expandCircleTierService(userId: string, circleId: string) {
  assertCircleAdminPolicy(userId, circleId);
  const db = getDb();

  // Section 14 gate: zero open reports before advancing expansion tier
  const openReports = db
    .prepare(`SELECT COUNT(*) as cnt FROM reports WHERE status IN ('new', 'reviewing')`)
    .get() as { cnt: number };
  if (openReports.cnt > 0) {
    throw new Error('OPEN_REPORTS_BLOCK_EXPANSION');
  }

  const circle = db.prepare('SELECT expansion_tier FROM circles WHERE id = ?').get(circleId) as
    | { expansion_tier: (typeof EXPANSION_ORDER)[number] }
    | undefined;
  if (!circle) throw new Error('CIRCLE_NOT_FOUND');

  const idx = EXPANSION_ORDER.indexOf(circle.expansion_tier);
  const nextTier = EXPANSION_ORDER[Math.min(EXPANSION_ORDER.length - 1, idx + 1)];
  const nowIso = new Date().toISOString();

  db.prepare('UPDATE circles SET expansion_tier = ?, updated_at = ? WHERE id = ?').run(
    nextTier,
    nowIso,
    circleId
  );

  db.prepare(
    `INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id, metadata)
     VALUES (?, ?, 'circle_tier_expanded', 'circle', ?, ?)`
  ).run(
    crypto.randomUUID(),
    userId,
    circleId,
    JSON.stringify({ from: circle.expansion_tier, to: nextTier })
  );

  return { circle_id: circleId, expansion_tier: nextTier };
}
