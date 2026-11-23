import { getDb } from '@/lib/db/client';
import type { UserRecord } from '@/modules/auth/repo';
import { isCircleMemberRepo } from '@/modules/circles/repo';

const CITY_OR_HIGHER_TIERS = new Set(['city', 'country', 'global']);

export function assertCanPublishSurprisePolicy(user: UserRecord, circleId: string): void {
  if (!isCircleMemberRepo(user.id, circleId)) {
    throw new Error('NOT_CIRCLE_MEMBER');
  }
  const db = getDb();
  const circle = db
    .prepare('SELECT expansion_tier FROM circles WHERE id = ?')
    .get(circleId) as { expansion_tier: string } | undefined;

  const isEligibleRole = user.role === 'partner' || user.role === 'admin' || user.trust_level >= 4;
  const isCityTier = Boolean(circle && CITY_OR_HIGHER_TIERS.has(circle.expansion_tier));

  if (!isEligibleRole || !isCityTier) {
    throw new Error('PARTNER_OR_CITY_TIER_REQUIRED');
  }
}
