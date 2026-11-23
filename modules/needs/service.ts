import crypto from 'node:crypto';
import { getDb } from '@/lib/db/client';
import { createSignedMediaToken } from '@/lib/security/storage';
import { assertAccountActivePolicy } from '@/modules/auth/policy';
import { getUserByIdRepo } from '@/modules/auth/repo';
import { assertCircleMemberPolicy } from '@/modules/circles/policy';
import { hasGrantedConsentRepo } from '@/modules/privacy/repo';
import { assertValidNeedTransitionPolicy, canViewNeedPolicy } from './policy';
import {
  createNeedRepo,
  createOfferRepo,
  executeControlledNeedTransitionRepo,
  expireOverdueNeedsRepo,
  getNeedByIdRepo,
  getNeedCircleIdsRepo,
  listVisibleNeedsForUserRepo,
  listVisibleOffersForUserRepo,
} from './repo';
import { SENSITIVE_CATEGORIES, type NeedCategory, type NeedStatus, type UrgencyLevel } from './schema';

export function listVisibleNeedsService(userId: string) {
  const user = getUserByIdRepo(userId);
  assertAccountActivePolicy(user);
  expireOverdueNeedsRepo();

  const needs = listVisibleNeedsForUserRepo(userId);
  const db = getDb();

  return needs.map((n) => {
    const circleIds = getNeedCircleIdsRepo(n.id);
    const activeMatch = db
      .prepare(
        `SELECT m.*, p.display_name as provider_name
         FROM assistance_matches m
         JOIN profiles p ON p.user_id = m.provider_id
         WHERE m.need_id = ? AND m.status IN ('suggested', 'accepted_by_requester', 'accepted_by_provider', 'accepted_both')
         ORDER BY m.score DESC`
      )
      .all(n.id) as Array<{
        id: string;
        need_id: string;
        offer_id: string;
        provider_id: string;
        provider_name: string;
        score: number;
        explanation: string;
        status: string;
      }>;

    return {
      ...n,
      is_sensitive: n.is_sensitive === 1,
      is_sos: n.is_sos === 1,
      circle_ids: circleIds,
      signed_attachment_url: n.attachment_path
        ? `/api/storage/signed?token=${encodeURIComponent(createSignedMediaToken(n.attachment_path, userId))}`
        : null,
      matches: activeMatch.map((m) => ({
        ...m,
        explanation: JSON.parse(m.explanation),
      })),
    };
  });
}

export function createNeedService(
  userId: string,
  input: {
    title: string;
    description: string;
    category: NeedCategory;
    urgency: UrgencyLevel;
    circleIds: string[];
    regionCode: string;
    timeWindowStart: string;
    timeWindowEnd: string;
    expiresAt?: string;
    isSensitive?: boolean;
    attachmentPath?: string | null;
    publishImmediately?: boolean;
    isSos?: boolean;
    sosOfficialAckAt?: string | null;
  }
) {
  const user = getUserByIdRepo(userId);
  assertAccountActivePolicy(user);

  for (const cid of input.circleIds) {
    assertCircleMemberPolicy(userId, cid);
  }

  if (new Date(input.timeWindowEnd) < new Date(input.timeWindowStart)) {
    throw new Error('INVALID_TIME_WINDOW');
  }

  const expiresAt =
    input.expiresAt || new Date(new Date(input.timeWindowEnd).getTime() + 24 * 3600_000).toISOString();

  const isSensitive = Boolean(input.isSensitive) || SENSITIVE_CATEGORIES.has(input.category);

  const created = createNeedRepo({
    id: crypto.randomUUID(),
    requesterId: userId,
    title: input.title,
    description: input.description,
    category: input.category,
    urgency: input.urgency,
    isSensitive,
    regionCode: input.regionCode,
    timeWindowStart: input.timeWindowStart,
    timeWindowEnd: input.timeWindowEnd,
    expiresAt,
    attachmentPath: input.attachmentPath ?? null,
    circleIds: input.circleIds,
    isSos: input.isSos,
    sosOfficialAckAt: input.sosOfficialAckAt,
  });

  if (input.publishImmediately !== false) {
    return executeControlledNeedTransitionRepo(created.id, 'draft', 'published', userId, 'publish_on_create');
  }

  return created;
}

export function transitionNeedService(
  needId: string,
  toStatus: NeedStatus,
  actorId: string,
  reason?: string
) {
  const actor = getUserByIdRepo(actorId);
  assertAccountActivePolicy(actor);

  const need = getNeedByIdRepo(needId);
  if (!need) throw new Error('NEED_NOT_FOUND');

  if (!canViewNeedPolicy(actor, need)) {
    throw new Error('FORBIDDEN');
  }

  const db = getDb();
  const activeMatch = db
    .prepare(
      `SELECT * FROM assistance_matches
       WHERE need_id = ? AND status IN ('suggested', 'accepted_by_requester', 'accepted_by_provider', 'accepted_both')
       ORDER BY updated_at DESC LIMIT 1`
    )
    .get(needId) as
    | { id: string; provider_id: string; offer_id: string; status: string }
    | undefined;

  const isAssignedProvider = activeMatch ? activeMatch.provider_id === actorId : false;
  const bothPartiesAcceptedMatch = activeMatch ? activeMatch.status === 'accepted_both' : false;

  assertValidNeedTransitionPolicy({
    need,
    toStatus,
    actor,
    isAssignedProvider,
    bothPartiesAcceptedMatch,
  });

  const updated = executeControlledNeedTransitionRepo(needId, need.status, toStatus, actorId, reason);
  const nowIso = new Date().toISOString();

  // Side effects of valid transitions
  if (toStatus === 'in_progress' && activeMatch) {
    db.prepare(
      `UPDATE assistance_sessions SET started_at = COALESCE(started_at, ?), updated_at = ? WHERE need_id = ?`
    ).run(nowIso, nowIso, needId);
  }

  // Provider withdrawal returns need to published & restores offer capacity
  if (toStatus === 'published' && activeMatch && isAssignedProvider) {
    db.prepare(`UPDATE assistance_matches SET status = 'withdrawn', updated_at = ? WHERE id = ?`).run(
      nowIso,
      activeMatch.id
    );
    db.prepare(
      `UPDATE offers SET capacity_remaining = MIN(capacity_total, capacity_remaining + 1), updated_at = ? WHERE id = ?`
    ).run(nowIso, activeMatch.offer_id);
    db.prepare('DELETE FROM assistance_sessions WHERE need_id = ?').run(needId);
    db.prepare('DELETE FROM contact_reveals WHERE need_id = ?').run(needId);
  }

  // Completion: finalize session + create anonymized impact_event ONLY if ALL participants consented
  if (toStatus === 'completed') {
    db.prepare(`UPDATE assistance_sessions SET completed_at = ?, updated_at = ? WHERE need_id = ?`).run(
      nowIso,
      nowIso,
      needId
    );
    const providerId = activeMatch?.provider_id;
    if (providerId) {
      db.prepare(
        `UPDATE offers SET capacity_remaining = MIN(capacity_total, capacity_remaining + 1), updated_at = ? WHERE id = ?`
      ).run(nowIso, activeMatch.offer_id);
    }

    const requesterConsented = hasGrantedConsentRepo(need.requester_id, 'publish_impact');
    const providerConsented = providerId ? hasGrantedConsentRepo(providerId, 'publish_impact') : false;
    const allConsented = requesterConsented && providerConsented;
    const circleIds = getNeedCircleIdsRepo(needId);

    if (circleIds[0]) {
      db.prepare(
        `INSERT OR IGNORE INTO impact_events (id, need_id, circle_id, category, approximate_window, consent_status)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run(
        crypto.randomUUID(),
        needId,
        circleIds[0],
        need.category,
        getApproximateWindowBucket(new Date()),
        allConsented ? 'granted' : 'revoked'
      );
    }
  }

  return updated;
}

export function listVisibleOffersService(userId: string) {
  const user = getUserByIdRepo(userId);
  assertAccountActivePolicy(user);
  return listVisibleOffersForUserRepo(userId);
}

export function createOfferService(
  userId: string,
  input: {
    circleId: string;
    category: NeedCategory;
    title: string;
    description?: string;
    regionCode: string;
    availableFrom: string;
    availableUntil: string;
    capacityTotal: number;
  }
) {
  const user = getUserByIdRepo(userId);
  assertAccountActivePolicy(user);
  assertCircleMemberPolicy(userId, input.circleId);

  if (new Date(input.availableUntil) < new Date(input.availableFrom)) {
    throw new Error('INVALID_TIME_WINDOW');
  }

  return createOfferRepo({
    id: crypto.randomUUID(),
    providerId: userId,
    circleId: input.circleId,
    category: input.category,
    title: input.title,
    description: input.description,
    regionCode: input.regionCode,
    availableFrom: input.availableFrom,
    availableUntil: input.availableUntil,
    capacityTotal: input.capacityTotal,
  });
}

function getApproximateWindowBucket(date: Date): string {
  const hour = date.getUTCHours();
  if (hour >= 5 && hour < 12) return 'morning_window';
  if (hour >= 12 && hour < 17) return 'afternoon_window';
  if (hour >= 17 && hour < 22) return 'evening_window';
  return 'night_window';
}

export function recordSessionCheckinService(
  needId: string,
  actorId: string,
  checkinStatus: 'safe' | 'needs_followup'
) {
  const actor = getUserByIdRepo(actorId);
  assertAccountActivePolicy(actor);

  const db = getDb();
  const session = db
    .prepare('SELECT * FROM assistance_sessions WHERE need_id = ?')
    .get(needId) as
    | { id: string; requester_id: string; provider_id: string; checkin_status: string }
    | undefined;

  if (!session) throw new Error('NEED_NOT_FOUND');
  if (actorId !== session.requester_id && actorId !== session.provider_id) {
    throw new Error('FORBIDDEN');
  }

  const nowIso = new Date().toISOString();
  db.prepare('UPDATE assistance_sessions SET checkin_status = ?, updated_at = ? WHERE need_id = ?').run(
    checkinStatus,
    nowIso,
    needId
  );

  if (checkinStatus === 'needs_followup') {
    const circleIds = getNeedCircleIdsRepo(needId);
    for (const cid of circleIds) {
      const admins = db
        .prepare(
          `SELECT user_id FROM circle_members WHERE circle_id = ? AND status = 'active' AND role IN ('owner', 'admin', 'coordinator')`
        )
        .all(cid) as Array<{ user_id: string }>;
      for (const adm of admins) {
        db.prepare(
          `INSERT INTO notifications (id, user_id, type, title_key, payload)
           VALUES (?, ?, 'safety_checkin', 'notif.safety_followup', ?)`
        ).run(crypto.randomUUID(), adm.user_id, JSON.stringify({ need_id: needId }));
      }
    }
  }

  return { need_id: needId, checkin_status: checkinStatus };
}
