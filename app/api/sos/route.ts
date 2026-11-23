import { NextRequest, NextResponse } from 'next/server';
import { handleApiError, requireAuthUserId } from '@/lib/api/http';
import { checkIdempotency, saveIdempotency } from '@/lib/security/idempotency';
import { checkAndConsumeRateLimit, getClientIp } from '@/lib/security/rate-limit';
import { CreateSosSchema } from '@/modules/sos/schema';
import { triggerSosService } from '@/modules/sos/service';

export async function POST(req: NextRequest) {
  try {
    const userId = await requireAuthUserId();
    const idemKey = req.headers.get('Idempotency-Key');
    const cached = checkIdempotency(userId, '/api/sos', idemKey);
    if (cached.hit && cached.response) return cached.response;

    const rate = checkAndConsumeRateLimit(userId, getClientIp(req.headers), 'create_sos');
    if (!rate.allowed) throw new Error('RATE_LIMIT_EXCEEDED');

    const parsed = CreateSosSchema.parse(await req.json());
    const result = triggerSosService(userId, parsed);

    const body = { ...result, rate_remaining: rate.remaining };
    saveIdempotency(userId, '/api/sos', idemKey, 201, body);
    return NextResponse.json(body, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
