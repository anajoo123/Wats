import { assertNotBlockedPolicy, canViewContactRevealPolicy } from './policy';
import {
  createBlockRepo,
  getContactRevealForNeedRepo,
  getRevealedContactDetailsRepo,
  listBlockedUsersRepo,
  listConsentsRepo,
  removeBlockRepo,
  setContactRevealConsentRepo,
  upsertConsentRepo,
} from './repo';
import type { ConsentPurpose } from './schema';

export function getPrivacyStateService(userId: string) {
  return {
    consents: listConsentsRepo(userId),
    blocks: listBlockedUsersRepo(userId),
  };
}

export function updateConsentService(userId: string, purpose: ConsentPurpose, granted: boolean) {
  upsertConsentRepo(userId, purpose, granted);
  return listConsentsRepo(userId);
}

export function blockUserService(blockerId: string, blockedUserId: string, reason?: string) {
  if (blockerId === blockedUserId) {
    throw new Error('CANNOT_BLOCK_SELF');
  }
  createBlockRepo(blockerId, blockedUserId, reason);
  return listBlockedUsersRepo(blockerId);
}

export function unblockUserService(blockerId: string, blockedUserId: string) {
  removeBlockRepo(blockerId, blockedUserId);
  return listBlockedUsersRepo(blockerId);
}

export function updateContactRevealConsentService(needId: string, actorId: string, grant: boolean) {
  const existing = getContactRevealForNeedRepo(needId);
  if (!existing) throw new Error('CONTACT_REVEAL_NOT_INITIALIZED');
  if (!canViewContactRevealPolicy(actorId, existing.requester_id, existing.provider_id)) {
    throw new Error('FORBIDDEN');
  }
  assertNotBlockedPolicy(existing.requester_id, existing.provider_id);

  const updated = setContactRevealConsentRepo(needId, actorId, grant);
  const revealedContact = getRevealedContactDetailsRepo(needId, actorId);
  return {
    reveal: {
      need_id: updated.need_id,
      consent_requester: updated.consent_requester === 1,
      consent_provider: updated.consent_provider === 1,
      revealed: Boolean(updated.revealed_at),
      revealed_at: updated.revealed_at,
    },
    contact: revealedContact,
  };
}

export function getContactRevealService(needId: string, viewerId: string) {
  const existing = getContactRevealForNeedRepo(needId);
  if (!existing) return null;
  if (!canViewContactRevealPolicy(viewerId, existing.requester_id, existing.provider_id)) {
    throw new Error('FORBIDDEN');
  }
  return {
    reveal: {
      need_id: existing.need_id,
      consent_requester: existing.consent_requester === 1,
      consent_provider: existing.consent_provider === 1,
      revealed: Boolean(existing.revealed_at),
      revealed_at: existing.revealed_at,
    },
    contact: getRevealedContactDetailsRepo(needId, viewerId),
  };
}
