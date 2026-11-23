import { z } from 'zod';

export const CountryCodeSchema = z.string().regex(/^[A-Z]{2}$/, 'Invalid ISO country code');

export const UpsertCountryConfigSchema = z.object({
  countryCode: CountryCodeSchema,
  defaultLocale: z.enum(['ar', 'en']).optional(),
  sosEnabled: z.boolean().optional(),
  legalReviewStatus: z.enum(['pending', 'approved', 'restricted']).optional(),
  minAge: z.number().int().min(13).max(25).optional(),
  dataRetentionDays: z.number().int().min(30).max(3650).optional(),
  emergencyNumbers: z
    .object({
      police: z.string().min(2),
      ambulance: z.string().min(2),
      fire: z.string().min(2),
      unified: z.string().min(2),
    })
    .optional(),
});

export interface CountryConfig {
  country_code: string;
  default_locale: 'ar' | 'en';
  emergency_numbers: {
    police: string;
    ambulance: string;
    fire: string;
    unified: string;
  };
  sos_enabled: boolean;
  financial_features_enabled: boolean;
  data_retention_days: number;
  min_age: number;
  legal_review_status: 'pending' | 'approved' | 'restricted';
}
