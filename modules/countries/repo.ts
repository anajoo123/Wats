import crypto from 'node:crypto';
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

export function upsertCountryConfigRepo(
  actorId: string,
  input: {
    countryCode: string;
    defaultLocale?: 'ar' | 'en';
    sosEnabled?: boolean;
    legalReviewStatus?: 'pending' | 'approved' | 'restricted';
    minAge?: number;
    dataRetentionDays?: number;
    emergencyNumbers?: CountryConfig['emergency_numbers'];
  }
): CountryConfig {
  const db = getDb();
  const code = input.countryCode.toUpperCase();
  const existing = getCountryByCodeRepo(code);
  const nowIso = new Date().toISOString();

  const merged = {
    defaultLocale: input.defaultLocale ?? existing?.default_locale ?? 'en',
    emergencyNumbers: input.emergencyNumbers ??
      existing?.emergency_numbers ?? { police: '911', ambulance: '911', fire: '911', unified: '911' },
    sosEnabled: input.sosEnabled !== undefined ? input.sosEnabled : existing?.sos_enabled ?? true,
    dataRetentionDays: input.dataRetentionDays ?? existing?.data_retention_days ?? 365,
    minAge: input.minAge ?? existing?.min_age ?? 18,
    legalReviewStatus: input.legalReviewStatus ?? existing?.legal_review_status ?? 'pending',
  };

  db.prepare(
    `INSERT INTO country_config (
      country_code, default_locale, emergency_numbers, sos_enabled,
      financial_features_enabled, data_retention_days, min_age, legal_review_status, updated_at
    ) VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?)
    ON CONFLICT(country_code) DO UPDATE SET
      default_locale = excluded.default_locale,
      emergency_numbers = excluded.emergency_numbers,
      sos_enabled = excluded.sos_enabled,
      data_retention_days = excluded.data_retention_days,
      min_age = excluded.min_age,
      legal_review_status = excluded.legal_review_status,
      updated_at = excluded.updated_at`
  ).run(
    code,
    merged.defaultLocale,
    JSON.stringify(merged.emergencyNumbers),
    merged.sosEnabled ? 1 : 0,
    merged.dataRetentionDays,
    merged.minAge,
    merged.legalReviewStatus,
    nowIso
  );

  db.prepare(
    `INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id, metadata)
     VALUES (?, ?, 'country_config_updated', 'country_config', ?, ?)`
  ).run(crypto.randomUUID(), actorId, code, JSON.stringify({ legal_review_status: merged.legalReviewStatus }));

  return getCountryByCodeRepo(code)!;
}
