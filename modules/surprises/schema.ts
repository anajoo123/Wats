import { z } from 'zod';
import { RegionCodeSchema } from '@/modules/auth/schema';

export const CreateSurpriseSchema = z.object({
  circleId: z.string().min(4),
  title: z.string().min(3).max(120),
  description: z.string().max(500).optional(),
  quantityAvailable: z.number().int().min(1).max(500),
  regionCode: RegionCodeSchema,
});

export const ClaimSurpriseSchema = z.object({
  itemId: z.string().min(4),
});
