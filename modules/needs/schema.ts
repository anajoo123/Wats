import { z } from 'zod';
import { RegionCodeSchema } from '@/modules/auth/schema';

export const NeedCategorySchema = z.enum([
  'groceries',
  'transport',
  'medical_errand',
  'elderly_care',
  'tech_help',
  'childcare_support',
  'home_repair',
  'sos_support',
]);

export const UrgencySchema = z.enum(['low', 'normal', 'high', 'sos']);

export const NeedStatusSchema = z.enum([
  'draft',
  'published',
  'matched',
  'accepted',
  'in_progress',
  'completed',
  'cancelled',
  'expired',
  'under_review',
]);

export const CreateNeedSchema = z.object({
  title: z.string().min(3).max(120),
  description: z.string().min(5).max(1500),
  category: NeedCategorySchema,
  urgency: UrgencySchema.default('normal'),
  circleIds: z.array(z.string().min(4)).min(1, 'Select at least one circle'),
  regionCode: RegionCodeSchema,
  timeWindowStart: z.string().datetime(),
  timeWindowEnd: z.string().datetime(),
  expiresAt: z.string().datetime().optional(),
  isSensitive: z.boolean().optional(),
  attachmentPath: z.string().max(255).nullable().optional(),
  publishImmediately: z.boolean().default(true),
});

export const TransitionNeedSchema = z.object({
  toStatus: NeedStatusSchema,
  reason: z.string().max(300).optional(),
});

export const CreateOfferSchema = z.object({
  circleId: z.string().min(4),
  category: NeedCategorySchema,
  title: z.string().min(3).max(120),
  description: z.string().max(800).optional(),
  regionCode: RegionCodeSchema,
  availableFrom: z.string().datetime(),
  availableUntil: z.string().datetime(),
  capacityTotal: z.number().int().min(1).max(20).default(2),
});

export type NeedCategory = z.infer<typeof NeedCategorySchema>;
export type NeedStatus = z.infer<typeof NeedStatusSchema>;
export type UrgencyLevel = z.infer<typeof UrgencySchema>;

export const SENSITIVE_CATEGORIES = new Set<NeedCategory>([
  'medical_errand',
  'elderly_care',
  'sos_support',
  'childcare_support',
]);
