import { z } from 'zod';

export const CreateReportSchema = z.object({
  targetType: z.enum(['need', 'offer', 'user', 'circle']),
  targetId: z.string().min(4),
  reasonCode: z.enum(['safety_concern', 'harassment', 'financial_solicitation', 'spam_abuse', 'privacy_violation']),
  details: z.string().max(1000).optional(),
});

export const UpdateReportStatusSchema = z.object({
  status: z.enum(['reviewing', 'actioned', 'dismissed']),
  resolutionNote: z.string().min(3).max(500),
  flagNeedUnderReview: z.boolean().optional(),
});

export const AppealReportSchema = z.object({
  appealNote: z.string().min(5).max(800),
});

export const BreakGlassRequestSchema = z.object({
  targetType: z.enum(['need', 'user', 'circle']),
  targetId: z.string().min(4),
  reason: z.string().min(10, 'Reason must be at least 10 characters').max(400),
  durationMinutes: z.number().int().min(5).max(120).default(30),
});
