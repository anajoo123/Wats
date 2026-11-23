import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { handleApiError, requireAuthUserId } from '@/lib/api/http';
import { checkIdempotency, saveIdempotency } from '@/lib/security/idempotency';
import { recordSessionCheckinService } from '@/modules/needs/service';

const CheckinSchema = z.object({
  status: z.enum(['safe', 'needs_followup']),
});

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const userId = await requireAuthUserId();
    const { id } = await context.params;
    const routeKey = `/api/needs/${id}/checkin`;
    const idemKey = req.headers.get('Idempotency-Key');
    const cached = checkIdempotency(userId, routeKey, idemKey);
    if (cached.hit && cached.response) return cached.response;

    const parsed = CheckinSchema.parse(await req.json());
    const result = recordSessionCheckinService(id, userId, parsed.status);

    const body = { result };
    saveIdempotency(userId, routeKey, idemKey, 200, body);
    return NextResponse.json(body);
  } catch (err) {
    return handleApiError(err);
  }
}
