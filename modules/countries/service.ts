import { getCountryByCodeRepo, listCountriesRepo } from './repo';
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
