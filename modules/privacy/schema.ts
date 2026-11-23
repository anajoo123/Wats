import { z } from 'zod';

export const ConsentPurposeSchema = z.enum([
  'share_need_in_circle',
  'reveal_contact',
  'publish_impact',
  'checkin',
]);

export const UpdateConsentSchema = z.object({
  purpose: ConsentPurposeSchema,
  granted: z.boolean(),
});

export const BlockUserSchema = z.object({
  blockedUserId: z.string().min(4),
  reason: z.string().max(200).optional(),
});

export const ContactRevealConsentSchema = z.object({
  needId: z.string().min(4),
  grant: z.boolean(),
});

export type ConsentPurpose = z.infer<typeof ConsentPurposeSchema>;
