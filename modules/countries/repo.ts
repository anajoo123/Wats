import { getDb } from '@/lib/db/client';
import type { CountryConfig } from './schema';

interface CountryRow {
  country_code: string;
  default_locale: 'ar' | 'en';
  emergency_numbers: string;
  sos_enabled: number;
  financial_features_enabled: number;
  data_retention_days: number;
  min_age: number;
  legal_review_status: 'pending' | 'approved' | 'restricted';
}

function mapCountry(row: CountryRow): CountryConfig {
  return {
    country_code: row.country_code,
    default_locale: row.default_locale,
    emergency_numbers: JSON.parse(row.emergency_numbers),
    sos_enabled: row.sos_enabled === 1,
    financial_features_enabled: row.financial_features_enabled === 1,
    data_retention_days: row.data_retention_days,
    min_age: row.min_age,
    legal_review_status: row.legal_review_status,
  };
}

export function listCountriesRepo(): CountryConfig[] {
  const db = getDb();
  const rows = db
    .prepare('SELECT * FROM country_config ORDER BY country_code ASC')
    .all() as unknown as CountryRow[];
  return rows.map(mapCountry);
}

export function getCountryByCodeRepo(code: string): CountryConfig | null {
  const db = getDb();
  const row = db
    .prepare('SELECT * FROM country_config WHERE country_code = ?')
    .get(code.toUpperCase()) as unknown as CountryRow | undefined;
  return row ? mapCountry(row) : null;
}
