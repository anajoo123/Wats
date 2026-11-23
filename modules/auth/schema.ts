import { z } from 'zod';

export const RegionCodeSchema = z
  .string()
  .regex(/^[A-Z]{2}-[A-Z0-9]{2,6}-[A-Z0-9]{2,8}$/, 'Region code must be Country-Region-Cell (e.g. SA-RUH-N01)');

export const RegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  displayName: z.string().min(2).max(80),
  countryCode: z.string().regex(/^[A-Z]{2}$/),
  regionCode: RegionCodeSchema,
  preferredLocale: z.enum(['ar', 'en']).default('ar'),
  timezone: z.string().min(2).max(60).default('Asia/Riyadh'),
  confirmedMinAge: z.boolean().refine((v) => v === true, 'Age confirmation required'),
  phoneE164: z.string().max(30).optional(),
  preferredChannel: z.enum(['in_app', 'phone', 'whatsapp']).default('in_app'),
});

export const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const SwitchUserSchema = z.object({
  userId: z.string().min(4),
});

export const UpdateProfileSchema = z.object({
  displayName: z.string().min(2).max(80).optional(),
  regionCode: RegionCodeSchema.optional(),
  preferredLocale: z.enum(['ar', 'en']).optional(),
  bioShort: z.string().max(240).optional(),
  phoneE164: z.string().max(30).nullable().optional(),
  preferredChannel: z.enum(['in_app', 'phone', 'whatsapp']).optional(),
  emergencyNote: z.string().max(200).nullable().optional(),
});

export const DeleteAccountSchema = z.object({
  immediateAnonymize: z.boolean().default(false),
  confirmationText: z.string().min(3),
});
