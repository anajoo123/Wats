import { getDb } from '@/lib/db/client';
import { assertAccountActivePolicy } from '@/modules/auth/policy';
import { getUserByIdRepo } from '@/modules/auth/repo';
import { assertCircleMemberPolicy } from '@/modules/circles/policy';
import { assertCanPublishSurprisePolicy } from './policy';
import { claimSurpriseItemRepo, createSurpriseItemRepo, listVisibleSurprisesRepo } from './repo';

export function listVisibleSurprisesService(userId: string) {
  const user = getUserByIdRepo(userId);
  assertAccountActivePolicy(user);
  return listVisibleSurprisesRepo(userId);
}

export function createSurpriseItemService(
  userId: string,
  input: {
    circleId: string;
    title: string;
    description?: string;
    quantityAvailable: number;
    regionCode: string;
  }
) {
  const user = getUserByIdRepo(userId);
  assertAccountActivePolicy(user);
  assertCanPublishSurprisePolicy(user, input.circleId);
  return createSurpriseItemRepo({ ...input, partnerId: userId });
}

export function claimSurpriseItemService(userId: string, itemId: string) {
  const user = getUserByIdRepo(userId);
  assertAccountActivePolicy(user);

  const db = getDb();
  const row = db.prepare('SELECT circle_id FROM surprise_items WHERE id = ?').get(itemId) as
    | { circle_id: string }
    | undefined;
  if (!row) throw new Error('SURPRISE_NOT_FOUND');

  assertCircleMemberPolicy(userId, row.circle_id);
  return claimSurpriseItemRepo(itemId, userId);
}
