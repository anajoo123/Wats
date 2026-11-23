import { NextRequest, NextResponse } from 'next/server';
import { handleApiError, requireAuthUserId } from '@/lib/api/http';
import { checkIdempotency, saveIdempotency } from '@/lib/security/idempotency';
import { checkAndConsumeRateLimit, getClientIp } from '@/lib/security/rate-limit';
import { CreateNeedSchema } from '@/modules/needs/schema';
import { createNeedService, listVisibleNeedsService } from '@/modules/needs/service';

export async function GET() {
  try {
    const userId = await requireAuthUserId();
    const needs = listVisibleNeedsService(userId);
    return NextResponse.json({ needs });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await requireAuthUserId();
    const idemKey = req.headers.get('Idempotency-Key');
    const cached = checkIdempotency(userId, '/api/needs', idemKey);
    if (cached.hit && cached.response) return cached.response;

    const rate = checkAndConsumeRateLimit(userId, getClientIp(req.headers), 'create_need');
    if (!rate.allowed) throw new Error('RATE_LIMIT_EXCEEDED');

    const parsed = CreateNeedSchema.parse(await req.json());
    const need = createNeedService(userId, parsed);

    const body = { need, rate_remaining: rate.remaining };
    saveIdempotency(userId, '/api/needs', idemKey, 201, body);
    return NextResponse.json(body, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
