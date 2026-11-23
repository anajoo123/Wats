import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { handleApiError, requireAuthUserId } from '@/lib/api/http';
import { checkIdempotency, saveIdempotency } from '@/lib/security/idempotency';
import { expandCircleTierService } from '@/modules/circles/service';

const ExpandSchema = z.object({
  circleId: z.string().min(4),
});

export async function POST(req: NextRequest) {
  try {
    const userId = await requireAuthUserId();
    const idemKey = req.headers.get('Idempotency-Key');
    const cached = checkIdempotency(userId, '/api/circles/expand', idemKey);
    if (cached.hit && cached.response) return cached.response;

    const parsed = ExpandSchema.parse(await req.json());
    const result = expandCircleTierService(userId, parsed.circleId);

    const body = { result };
    saveIdempotency(userId, '/api/circles/expand', idemKey, 200, body);
    return NextResponse.json(body);
  } catch (err) {
    return handleApiError(err);
  }
}
