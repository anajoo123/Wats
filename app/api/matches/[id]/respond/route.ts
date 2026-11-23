import { NextRequest, NextResponse } from 'next/server';
import { handleApiError, requireAuthUserId } from '@/lib/api/http';
import { checkIdempotency, saveIdempotency } from '@/lib/security/idempotency';
import { MatchDecisionSchema } from '@/modules/matching/schema';
import { respondToMatchService } from '@/modules/matching/service';

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const userId = await requireAuthUserId();
    const { id } = await context.params;
    const routeKey = `/api/matches/${id}/respond`;
    const idemKey = req.headers.get('Idempotency-Key');
    const cached = checkIdempotency(userId, routeKey, idemKey);
    if (cached.hit && cached.response) return cached.response;

    const parsed = MatchDecisionSchema.parse(await req.json());
    const result = respondToMatchService(id, userId, parsed.decision);

    const body = { result };
    saveIdempotency(userId, routeKey, idemKey, 200, body);
    return NextResponse.json(body);
  } catch (err) {
    return handleApiError(err);
  }
}
