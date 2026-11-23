import crypto from 'node:crypto';
import { hashPassword, verifyPassword } from '@/lib/security/session';
import { getCountryConfigService } from '@/modules/countries/service';
import { assertAccountActivePolicy } from './policy';
import {
  createUserWithProfileRepo,
  deactivateAndAnonymizeUserRepo,
  exportUserDataRepo,
  getSelfPrivateContactRepo,
  getUserByEmailRepo,
  getUserByIdRepo,
  listActiveDirectoryUsersRepo,
  updateProfileAndContactRepo,
} from './repo';

export function registerUserService(input: {
  email: string;
  password: string;
  displayName: string;
  countryCode: string;
  regionCode: string;
  preferredLocale: 'ar' | 'en';
  timezone: string;
  confirmedMinAge: boolean;
  phoneE164?: string;
  preferredChannel: 'in_app' | 'phone' | 'whatsapp';
}) {
  const existing = getUserByEmailRepo(input.email);
  if (existing) {
    throw new Error('EMAIL_ALREADY_EXISTS');
  }
  const country = getCountryConfigService(input.countryCode);
  if (!input.confirmedMinAge) {
    throw new Error('AGE_CONFIRMATION_REQUIRED');
  }
  if (!input.regionCode.startsWith(`${country.country_code}-`)) {
    throw new Error('REGION_COUNTRY_MISMATCH');
  }

  const user = createUserWithProfileRepo({
    id: crypto.randomUUID(),
    email: input.email,
    passwordHash: hashPassword(input.password),
    displayName: input.displayName,
    countryCode: country.country_code,
    regionCode: input.regionCode,
    preferredLocale: input.preferredLocale,
    timezone: input.timezone,
    minAge: country.min_age,
    phoneE164: input.phoneE164,
    preferredChannel: input.preferredChannel,
  });

  return sanitizeUserForClient(user);
}

export function loginUserService(email: string, password: string) {
  const user = getUserByEmailRepo(email);
  if (!user || !user.password_hash) {
    throw new Error('INVALID_CREDENTIALS');
  }
  assertAccountActivePolicy(user);
  if (!verifyPassword(password, user.password_hash)) {
    throw new Error('INVALID_CREDENTIALS');
  }
  return sanitizeUserForClient(user);
}

export function getActiveSessionUserService(userId: string) {
  const user = getUserByIdRepo(userId);
  assertAccountActivePolicy(user);
  const privateContact = getSelfPrivateContactRepo(userId);
  return {
    ...sanitizeUserForClient(user),
    private_contact: privateContact ?? null,
  };
}

export function listSwitchableUsersService() {
  return listActiveDirectoryUsersRepo();
}

export function updateProfileService(
  userId: string,
  updates: Parameters<typeof updateProfileAndContactRepo>[1]
) {
  const user = getUserByIdRepo(userId);
  assertAccountActivePolicy(user);
  updateProfileAndContactRepo(userId, updates);
  return getActiveSessionUserService(userId);
}

export function exportMyDataService(userId: string) {
  const user = getUserByIdRepo(userId);
  assertAccountActivePolicy(user);
  return exportUserDataRepo(userId);
}

export function deactivateAccountService(userId: string, immediateAnonymize: boolean) {
  const user = getUserByIdRepo(userId);
  assertAccountActivePolicy(user);
  return deactivateAndAnonymizeUserRepo(userId, immediateAnonymize);
}

function sanitizeUserForClient(user: NonNullable<ReturnType<typeof getUserByIdRepo>>) {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    country_code: user.country_code,
    timezone: user.timezone,
    trust_level: user.trust_level,
    display_name: user.display_name,
    region_code: user.region_code,
    preferred_locale: user.preferred_locale,
    bio_short: user.bio_short,
  };
}
