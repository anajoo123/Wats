import { z } from 'zod';

export const CountryCodeSchema = z.string().regex(/^[A-Z]{2}$/, 'Invalid ISO country code');

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
