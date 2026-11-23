import type { UserRecord } from './repo';

export function assertAccountActivePolicy(user: UserRecord | null): asserts user is UserRecord {
  if (!user) {
    throw new Error('UNAUTHORIZED');
  }
  if (user.deactivated_at || user.anonymized_at) {
    throw new Error('ACCOUNT_DEACTIVATED');
  }
}

export function isPlatformAdminPolicy(user: UserRecord | null): boolean {
  if (!user || user.deactivated_at || user.anonymized_at) return false;
  return user.role === 'moderator' || user.role === 'admin';
}
