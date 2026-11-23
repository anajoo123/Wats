import { z } from 'zod';
import { RegionCodeSchema } from '@/modules/auth/schema';

export const CreateSosSchema = z.object({
  circleId: z.string().min(4),
  sosType: z.enum(['medical_errand', 'elderly_care', 'transport', 'sos_support']),
  urgency: z.enum(['high', 'sos']).default('sos'),
  title: z.string().min(4).max(120),
  description: z.string().min(5).max(1000),
  regionCode: RegionCodeSchema,
  acknowledgedOfficialEmergencyScreen: z
    .boolean()
    .refine((v) => v === true, 'Must acknowledge official emergency numbers screen first'),
});
