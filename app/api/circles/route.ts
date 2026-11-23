import { NextRequest, NextResponse } from 'next/server';
import { handleApiError, requireAuthUserId } from '@/lib/api/http';
import { checkIdempotency, saveIdempotency } from '@/lib/security/idempotency';
import { CreateCircleSchema } from '@/modules/circles/schema';
import { createCircleService, listMyCirclesService } from '@/modules/circles/service';

export async function GET() {
  try {
    const userId = await requireAuthUserId();
    const circles = listMyCirclesService(userId);
    return NextResponse.json({ circles });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await requireAuthUserId();
    const idemKey = req.headers.get('Idempotency-Key');
    const cached = checkIdempotency(userId, '/api/circles', idemKey);
    if (cached.hit && cached.response) return cached.response;

    const parsed = CreateCircleSchema.parse(await req.json());
    const circle = createCircleService({ ...parsed, createdBy: userId });

    const body = { circle };
    saveIdempotency(userId, '/api/circles', idemKey, 201, body);
    return NextResponse.json(body, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
