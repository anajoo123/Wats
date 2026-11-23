import { isBlockedBetweenRepo } from '@/modules/privacy/repo';
import { assertCircleMemberPolicy } from './policy';
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
