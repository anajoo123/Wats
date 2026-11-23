import crypto from 'node:crypto';
import { getDb } from '@/lib/db/client';
import { assertAccountActivePolicy } from '@/modules/auth/policy';
import { getUserByIdRepo } from '@/modules/auth/repo';
import { canViewNeedPolicy } from '@/modules/needs/policy';
import { executeControlledNeedTransitionRepo, getNeedByIdRepo } from '@/modules/needs/repo';
import { SENSITIVE_CATEGORIES, type NeedCategory } from '@/modules/needs/schema';
import { assertMatchParticipantsPolicy } from './policy';
import { findEligibleCandidateOffersRepo, getMatchByIdRepo, upsertSuggestedMatchRepo } from './repo';
import type { MatchExplanation } from './schema';

export interface PureMatchInput {
  needCategory: NeedCategory;
  needIsSensitive: boolean;
  needRegionCode: string;
  needWindowStart: string;
  needWindowEnd: string;
  offerCategory: NeedCategory;
  offerRegionCode: string;
  offerAvailableFrom: string;
  offerAvailableUntil: string;
  offerCapacityRemaining: number;
  providerTrustLevel: number;
  providerApprovedSensitive: boolean;
  providerOpenTasksCount: number;
  // Explicitly ignored even if someone attempts to pass extra metadata:
  donations?: number;
  wealthTier?: number;
  pastAidCount?: number;
}

/**
 * Pure, explainable rule-based matching scorer (0–100).
 * Hard filters: category, capacity > 0, region overlap, time overlap, sensitive trust gate.
 * Weights: skill/category 40 + region proximity 25 + availability overlap 20 + load balance 15 = 100.
 * Zero dependency on wealth, donations, or past assistance count.
 */
export function evaluatePureMatch(input: PureMatchInput): { eligible: boolean; explanation: MatchExplanation | null } {
  // 1. Compatible category
  if (input.offerCategory !== input.needCategory) {
    return { eligible: false, explanation: null };
  }

  // 2. Active capacity > 0
  if (input.offerCapacityRemaining <= 0) {
    return { eligible: false, explanation: null };
  }

  // 3. Sensitive category qualification (trust >= 2 OR circle admin approval)
  const requiresSensitive = input.needIsSensitive || SENSITIVE_CATEGORIES.has(input.needCategory);
  const sensitiveQualified = !requiresSensitive || input.providerTrustLevel >= 2 || input.providerApprovedSensitive;
  if (!sensitiveQualified) {
    return { eligible: false, explanation: null };
  }

  // 4. Region hierarchy overlap (Country-Region-Cell)
  const [nCountry, nRegion, nCell] = input.needRegionCode.split('-');
  const [oCountry, oRegion, oCell] = input.offerRegionCode.split('-');
  if (!nCountry || nCountry !== oCountry) {
    return { eligible: false, explanation: null };
  }
  let regionScore = 5;
  let regionMatchLevel: MatchExplanation['region_match_level'] = 'same_country';
  if (nRegion === oRegion && nCell === oCell) {
    regionScore = 25;
    regionMatchLevel = 'exact_cell';
  } else if (nRegion === oRegion) {
    regionScore = 15;
    regionMatchLevel = 'same_region';
  }

  // 5. Time overlap
  const nStart = new Date(input.needWindowStart).getTime();
  const nEnd = new Date(input.needWindowEnd).getTime();
  const oStart = new Date(input.offerAvailableFrom).getTime();
  const oEnd = new Date(input.offerAvailableUntil).getTime();

  const overlapMs = Math.min(nEnd, oEnd) - Math.max(nStart, oStart);
  if (overlapMs <= 0) {
    return { eligible: false, explanation: null };
  }

  const needDurationMs = Math.max(1, nEnd - nStart);
  const overlapRatio = Math.min(1, overlapMs / needDurationMs);
  const availabilityScore = Math.round(overlapRatio * 20);

  // 6. Skill & Load balancing (fewer open tasks => higher score, max 15)
  const skillScore = 40;
  const loadBalanceScore = Math.max(0, 15 - Math.max(0, input.providerOpenTasksCount) * 5);

  const totalScore = Math.min(100, skillScore + regionScore + availabilityScore + loadBalanceScore);

  return {
    eligible: true,
    explanation: {
      skill_score: skillScore,
      region_score: regionScore,
      availability_score: availabilityScore,
      load_balance_score: loadBalanceScore,
      total_score: totalScore,
      region_match_level: regionMatchLevel,
      open_tasks_count: input.providerOpenTasksCount,
      sensitive_qualified: sensitiveQualified,
      factors_excluded: ['wealth', 'donations', 'past_aid_count'],
    },
  };
}

export function generateMatchesForNeedService(needId: string, actorId: string) {
  const actor = getUserByIdRepo(actorId);
  assertAccountActivePolicy(actor);

  const need = getNeedByIdRepo(needId);
  if (!need) throw new Error('NEED_NOT_FOUND');
  if (!canViewNeedPolicy(actor, need)) throw new Error('FORBIDDEN');
  if (need.status !== 'published' && need.status !== 'matched') {
    throw new Error('NEED_NOT_MATCHABLE');
  }

  const candidates = findEligibleCandidateOffersRepo(need.id, need.requester_id);
  const scored: Array<ReturnType<typeof upsertSuggestedMatchRepo>> = [];

  for (const cand of candidates) {
    const res = evaluatePureMatch({
      needCategory: need.category,
      needIsSensitive: need.is_sensitive === 1,
      needRegionCode: need.region_code,
      needWindowStart: need.time_window_start,
      needWindowEnd: need.time_window_end,
      offerCategory: cand.category,
      offerRegionCode: cand.region_code,
      offerAvailableFrom: cand.available_from,
      offerAvailableUntil: cand.available_until,
      offerCapacityRemaining: cand.capacity_remaining,
      providerTrustLevel: cand.provider_trust_level,
      providerApprovedSensitive: cand.approved_sensitive === 1,
      providerOpenTasksCount: cand.open_tasks_count,
    });

    if (res.eligible && res.explanation) {
      const saved = upsertSuggestedMatchRepo({
        needId: need.id,
        offerId: cand.id,
        providerId: cand.provider_id,
        score: res.explanation.total_score,
        explanation: JSON.stringify(res.explanation),
      });
      scored.push(saved);
    }
  }

  if (scored.length > 0 && need.status === 'published') {
    executeControlledNeedTransitionRepo(need.id, 'published', 'matched', actorId, 'explainable_match_suggested');
  }

  return scored;
}

export function respondToMatchService(
  matchId: string,
  actorId: string,
  decision: 'accept' | 'decline'
) {
  const actor = getUserByIdRepo(actorId);
  assertAccountActivePolicy(actor);

  const match = getMatchByIdRepo(matchId);
  if (!match) throw new Error('MATCH_NOT_FOUND');

  const party = assertMatchParticipantsPolicy(actorId, match.requester_id, match.provider_id);
  const db = getDb();
  const nowIso = new Date().toISOString();

  if (decision === 'decline') {
    db.prepare(`UPDATE assistance_matches SET status = 'declined', updated_at = ? WHERE id = ?`).run(
      nowIso,
      matchId
    );
    return { status: 'declined', need_status: match.need_status };
  }

  let nextMatchStatus: typeof match.status = match.status;
  if (party === 'requester') {
    nextMatchStatus =
      match.status === 'accepted_by_provider' || match.status === 'accepted_both'
        ? 'accepted_both'
        : 'accepted_by_requester';
  } else {
    nextMatchStatus =
      match.status === 'accepted_by_requester' || match.status === 'accepted_both'
        ? 'accepted_both'
        : 'accepted_by_provider';
  }

  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare(`UPDATE assistance_matches SET status = ?, updated_at = ? WHERE id = ?`).run(
      nextMatchStatus,
      nowIso,
      matchId
    );

    if (nextMatchStatus === 'accepted_both') {
      const offer = db
        .prepare('SELECT capacity_remaining FROM offers WHERE id = ?')
        .get(match.offer_id) as { capacity_remaining: number } | undefined;
      if (!offer || offer.capacity_remaining <= 0) {
        throw new Error('OFFER_CAPACITY_EXHAUSTED');
      }

      db.prepare(
        `UPDATE offers SET capacity_remaining = capacity_remaining - 1, updated_at = ? WHERE id = ?`
      ).run(nowIso, match.offer_id);

      db.prepare(
        `INSERT OR IGNORE INTO assistance_sessions (id, need_id, match_id, requester_id, provider_id)
         VALUES (?, ?, ?, ?, ?)`
      ).run(crypto.randomUUID(), match.need_id, match.id, match.requester_id, match.provider_id);

      db.prepare(
        `INSERT OR IGNORE INTO contact_reveals (id, need_id, requester_id, provider_id, consent_requester, consent_provider)
         VALUES (?, ?, ?, ?, 0, 0)`
      ).run(crypto.randomUUID(), match.need_id, match.requester_id, match.provider_id);

      // Notify both parties
      const notify = db.prepare(
        `INSERT INTO notifications (id, user_id, type, title_key, payload)
         VALUES (?, ?, 'match_accepted', 'notif.match_accepted', ?)`
      );
      notify.run(crypto.randomUUID(), match.requester_id, JSON.stringify({ need_id: match.need_id }));
      notify.run(crypto.randomUUID(), match.provider_id, JSON.stringify({ need_id: match.need_id }));
    }

    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  let updatedNeedStatus = match.need_status;
  if (nextMatchStatus === 'accepted_both' && match.need_status === 'matched') {
    const updatedNeed = executeControlledNeedTransitionRepo(
      match.need_id,
      'matched',
      'accepted',
      actorId,
      'dual_party_acceptance'
    );
    updatedNeedStatus = updatedNeed.status;
  }

  return {
    status: nextMatchStatus,
    need_status: updatedNeedStatus,
  };
}
