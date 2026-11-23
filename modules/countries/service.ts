import { getUserByIdRepo } from '@/modules/auth/repo';
import { assertModeratorPolicy } from '@/modules/moderation/policy';
import { getCountryByCodeRepo, listCountriesRepo, upsertCountryConfigRepo } from './repo';
import type { CountryConfig } from './schema';

export function listCountriesService(): CountryConfig[] {
  return listCountriesRepo();
}

export function getCountryConfigService(countryCode: string): CountryConfig {
  const cfg = getCountryByCodeRepo(countryCode);
  if (!cfg) {
    throw new Error('COUNTRY_NOT_SUPPORTED');
  }
  return cfg;
}

export function upsertCountryConfigService(
  actorId: string,
  input: Parameters<typeof upsertCountryConfigRepo>[1]
): CountryConfig {
  const mod = getUserByIdRepo(actorId);
  assertModeratorPolicy(mod);
  return upsertCountryConfigRepo(actorId, input);
}
