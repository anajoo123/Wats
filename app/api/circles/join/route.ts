import { NextRequest, NextResponse } from 'next/server';
import { handleApiError, requireAuthUserId } from '@/lib/api/http';
import { checkIdempotency, saveIdempotency } from '@/lib/security/idempotency';
import { checkAndConsumeRateLimit, getClientIp } from '@/lib/security/rate-limit';
import { JoinCircleSchema } from '@/modules/circles/schema';
import { joinCircleByInviteService } from '@/modules/circles/service';

export async function POST(req: NextRequest) {
  try {
    const userId = await requireAuthUserId();
    const idemKey = req.headers.get('Idempotency-Key');
    const cached = checkIdempotency(userId, '/api/circles/join', idemKey);
    if (cached.hit && cached.response) return cached.response;

    const rate = checkAndConsumeRateLimit(userId, getClientIp(req.headers), 'join_circle');
    if (!rate.allowed) throw new Error('RATE_LIMIT_EXCEEDED');

    const parsed = JoinCircleSchema.parse(await req.json());
    const circle = joinCircleByInviteService(userId, parsed.inviteCode);

    const body = { circle, rate_remaining: rate.remaining };
    saveIdempotency(userId, '/api/circles/join', idemKey, 200, body);
    return NextResponse.json(body, { status: 200 });
  } catch (err) {
    return handleApiError(err);
  }
}
