import { z } from 'zod';
import { RegionCodeSchema } from '@/modules/auth/schema';

export const CreateCircleSchema = z.object({
  name: z.string().min(2).max(100),
  description: z.string().max(500).optional(),
  countryCode: z.string().regex(/^[A-Z]{2}$/),
  regionCode: RegionCodeSchema,
});

export const JoinCircleSchema = z.object({
  inviteCode: z.string().min(4).max(32),
});
