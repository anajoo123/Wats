import { NextRequest, NextResponse } from 'next/server';
import { handleApiError, requireAuthUserId } from '@/lib/api/http';
import { checkIdempotency, saveIdempotency } from '@/lib/security/idempotency';
import { TransitionNeedSchema } from '@/modules/needs/schema';
import { transitionNeedService } from '@/modules/needs/service';

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const userId = await requireAuthUserId();
    const { id } = await context.params;
    const routeKey = `/api/needs/${id}/transition`;
    const idemKey = req.headers.get('Idempotency-Key');
    const cached = checkIdempotency(userId, routeKey, idemKey);
    if (cached.hit && cached.response) return cached.response;

    const parsed = TransitionNeedSchema.parse(await req.json());
    const need = transitionNeedService(id, parsed.toStatus, userId, parsed.reason);

    const body = { need };
    saveIdempotency(userId, routeKey, idemKey, 200, body);
    return NextResponse.json(body);
  } catch (err) {
    return handleApiError(err);
  }
}
