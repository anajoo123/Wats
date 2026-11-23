import { isCircleAdminRepo, isCircleMemberRepo } from './repo';

export function assertCircleMemberPolicy(userId: string, circleId: string): void {
  if (!isCircleMemberRepo(userId, circleId)) {
    throw new Error('NOT_CIRCLE_MEMBER');
  }
}

export function assertCircleAdminPolicy(userId: string, circleId: string): void {
  if (!isCircleAdminRepo(userId, circleId)) {
    throw new Error('NOT_CIRCLE_ADMIN');
  }
}
