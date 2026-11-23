import { isPlatformAdminPolicy } from '@/modules/auth/policy';
import type { UserRecord } from '@/modules/auth/repo';
import { hasActiveBreakGlassRepo } from './repo';

export function assertModeratorPolicy(user: UserRecord | null): asserts user is UserRecord {
  if (!isPlatformAdminPolicy(user)) {
    throw new Error('MODERATOR_ROLE_REQUIRED');
  }
}

export function assertBreakGlassPolicy(adminId: string, targetId: string): void {
  if (!hasActiveBreakGlassRepo(adminId, targetId)) {
    throw new Error('BREAK_GLASS_REQUIRED');
  }
}
