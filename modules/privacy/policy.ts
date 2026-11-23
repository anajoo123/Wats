import { isBlockedBetweenRepo } from './repo';

export function assertNotBlockedPolicy(uidA: string, uidB: string): void {
  if (isBlockedBetweenRepo(uidA, uidB)) {
    throw new Error('BLOCKED_INTERACTION');
  }
}

export function canViewContactRevealPolicy(
  viewerId: string,
  requesterId: string,
  providerId: string
): boolean {
  if (viewerId !== requesterId && viewerId !== providerId) return false;
  return !isBlockedBetweenRepo(requesterId, providerId);
}
