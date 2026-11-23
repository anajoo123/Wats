import { isBlockedBetweenRepo } from '@/modules/privacy/repo';

export function assertMatchParticipantsPolicy(
  actorId: string,
  requesterId: string,
  providerId: string
): 'requester' | 'provider' {
  if (isBlockedBetweenRepo(requesterId, providerId)) {
    throw new Error('BLOCKED_INTERACTION');
  }
  if (actorId === requesterId) return 'requester';
  if (actorId === providerId) return 'provider';
  throw new Error('FORBIDDEN');
}
