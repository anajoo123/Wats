import { isPlatformAdminPolicy } from '@/modules/auth/policy';
import type { UserRecord } from '@/modules/auth/repo';
import { isCircleMemberRepo } from '@/modules/circles/repo';
import { isBlockedBetweenRepo } from '@/modules/privacy/repo';
import { getNeedCircleIdsRepo, type NeedRecord } from './repo';
import type { NeedStatus } from './schema';

const TERMINAL_STATES = new Set<NeedStatus>(['completed', 'cancelled', 'expired']);

export function canViewNeedPolicy(user: UserRecord, need: NeedRecord, hasActiveBreakGlass = false): boolean {
  if (need.requester_id === user.id) return true;
  if (isPlatformAdminPolicy(user) && hasActiveBreakGlass) return true;
  if (need.status === 'draft') return false;
  if (isBlockedBetweenRepo(user.id, need.requester_id)) return false;

  const circles = getNeedCircleIdsRepo(need.id);
  return circles.some((cid) => isCircleMemberRepo(user.id, cid));
}

export function assertValidNeedTransitionPolicy(params: {
  need: NeedRecord;
  toStatus: NeedStatus;
  actor: UserRecord;
  isAssignedProvider: boolean;
  bothPartiesAcceptedMatch: boolean;
}): void {
  const { need, toStatus, actor, isAssignedProvider, bothPartiesAcceptedMatch } = params;

  if (TERMINAL_STATES.has(need.status)) {
    throw new Error('TERMINAL_STATE_IMMUTABLE');
  }

  if (toStatus === need.status) {
    throw new Error('NOOP_TRANSITION');
  }

  if (need.status === 'draft' && toStatus === 'published') {
    if (actor.id !== need.requester_id) throw new Error('ONLY_REQUESTER_CAN_PUBLISH');
    return;
  }

  if (need.status === 'published' && toStatus === 'matched') {
    return; // System or authorized match proposal
  }

  if (need.status === 'matched' && toStatus === 'accepted') {
    if (!bothPartiesAcceptedMatch) throw new Error('DUAL_ACCEPTANCE_REQUIRED');
    return;
  }

  if (need.status === 'accepted' && toStatus === 'in_progress') {
    if (!isAssignedProvider) throw new Error('ONLY_PROVIDER_CAN_START');
    return;
  }

  if (need.status === 'in_progress' && toStatus === 'completed') {
    if (actor.id !== need.requester_id) {
      throw new Error('ONLY_REQUESTER_CAN_COMPLETE');
    }
    return;
  }

  if (toStatus === 'published' && (need.status === 'matched' || need.status === 'accepted' || need.status === 'in_progress')) {
    if (!isAssignedProvider) throw new Error('ONLY_PROVIDER_CAN_WITHDRAW');
    return;
  }

  if (toStatus === 'cancelled') {
    if (actor.id !== need.requester_id) throw new Error('ONLY_REQUESTER_CAN_CANCEL');
    return;
  }

  if (toStatus === 'under_review') {
    if (!isPlatformAdminPolicy(actor)) throw new Error('ONLY_MODERATOR_CAN_REVIEW');
    return;
  }

  throw new Error('INVALID_STATE_TRANSITION');
}
