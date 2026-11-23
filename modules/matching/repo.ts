import crypto from 'node:crypto';
import { getDb } from '@/lib/db/client';
import type { NeedCategory } from '@/modules/needs/schema';

export interface CandidateOfferRow {
  id: string;
  provider_id: string;
  provider_name: string;
  provider_trust_level: number;
  circle_id: string;
  approved_sensitive: number;
  category: NeedCategory;
  region_code: string;
  available_from: string;
  available_until: string;
  capacity_remaining: number;
  open_tasks_count: number;
}

export function findEligibleCandidateOffersRepo(needId: string, requesterId: string): CandidateOfferRow[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT o.id, o.provider_id, p.display_name as provider_name,
              u.trust_level as provider_trust_level, o.circle_id,
              cm.approved_sensitive, o.category, o.region_code,
              o.available_from, o.available_until, o.capacity_remaining,
              (
                SELECT COUNT(*) FROM assistance_sessions s
                WHERE s.provider_id = o.provider_id AND s.completed_at IS NULL
              ) as open_tasks_count
       FROM offers o
       JOIN need_circles nc ON nc.circle_id = o.circle_id
       JOIN circle_members cm ON cm.circle_id = o.circle_id AND cm.user_id = o.provider_id AND cm.status = 'active'
       JOIN users u ON u.id = o.provider_id
       JOIN profiles p ON p.user_id = o.provider_id
       WHERE nc.need_id = ?
         AND o.is_active = 1
         AND o.capacity_remaining > 0
         AND o.provider_id <> ?
         AND u.deactivated_at IS NULL
         AND u.anonymized_at IS NULL
         AND NOT EXISTS (
           SELECT 1 FROM blocks b
           WHERE (b.blocker_id = ? AND b.blocked_id = o.provider_id)
              OR (b.blocker_id = o.provider_id AND b.blocked_id = ?)
         )`
    )
    .all(needId, requesterId, requesterId, requesterId) as unknown as CandidateOfferRow[];
}

export function upsertSuggestedMatchRepo(input: {
  needId: string;
  offerId: string;
  providerId: string;
  score: number;
  explanation: string;
}) {
  const db = getDb();
  const id = crypto.randomUUID();
  const nowIso = new Date().toISOString();

  db.prepare(
    `INSERT INTO assistance_matches (id, need_id, offer_id, provider_id, score, explanation, status)
     VALUES (?, ?, ?, ?, ?, ?, 'suggested')
     ON CONFLICT(need_id, offer_id) DO UPDATE SET
       score = excluded.score,
       explanation = excluded.explanation,
       status = CASE WHEN assistance_matches.status IN ('declined', 'withdrawn') THEN 'suggested' ELSE assistance_matches.status END,
       updated_at = ?`
  ).run(id, input.needId, input.offerId, input.providerId, input.score, input.explanation, nowIso);

  return db
    .prepare(
      `SELECT m.*, p.display_name as provider_name
       FROM assistance_matches m
       JOIN profiles p ON p.user_id = m.provider_id
       WHERE m.need_id = ? AND m.offer_id = ?`
    )
    .get(input.needId, input.offerId);
}

export function getMatchByIdRepo(matchId: string) {
  const db = getDb();
  return db
    .prepare(
      `SELECT m.*, n.requester_id, n.status as need_status
       FROM assistance_matches m
       JOIN needs n ON n.id = m.need_id
       WHERE m.id = ?`
    )
    .get(matchId) as
    | {
        id: string;
        need_id: string;
        offer_id: string;
        provider_id: string;
        score: number;
        explanation: string;
        status: 'suggested' | 'accepted_by_requester' | 'accepted_by_provider' | 'accepted_both' | 'declined' | 'withdrawn';
        requester_id: string;
        need_status: string;
      }
    | undefined;
}
