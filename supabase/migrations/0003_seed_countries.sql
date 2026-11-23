-- 0003_seed_countries.sql
-- Global readiness seed: adding a country is data-only, zero code changes.

INSERT INTO country_config (
  country_code, default_locale, emergency_numbers,
  sos_enabled, financial_features_enabled, data_retention_days, min_age, legal_review_status
) VALUES
  ('SA', 'ar', '{"police":"999","ambulance":"997","fire":"998","unified":"911"}'::jsonb, true, false, 365, 18, 'approved'),
  ('EG', 'ar', '{"police":"122","ambulance":"123","fire":"180","unified":"122"}'::jsonb, true, false, 365, 18, 'approved'),
  ('JO', 'ar', '{"police":"911","ambulance":"911","fire":"911","unified":"911"}'::jsonb, true, false, 365, 18, 'approved'),
  ('AE', 'ar', '{"police":"999","ambulance":"998","fire":"997","unified":"999"}'::jsonb, true, false, 365, 18, 'approved'),
  ('GB', 'en', '{"police":"999","ambulance":"999","fire":"999","unified":"999"}'::jsonb, true, false, 365, 18, 'approved'),
  ('US', 'en', '{"police":"911","ambulance":"911","fire":"911","unified":"911"}'::jsonb, true, false, 365, 18, 'pending')
ON CONFLICT (country_code) DO NOTHING;
