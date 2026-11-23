import { NextRequest, NextResponse } from 'next/server';
import { handleApiError, requireAuthUserId } from '@/lib/api/http';
import { checkIdempotency, saveIdempotency } from '@/lib/security/idempotency';
import { CreateOfferSchema } from '@/modules/needs/schema';
import { createOfferService, listVisibleOffersService } from '@/modules/needs/service';

export async function GET() {
  try {
    const userId = await requireAuthUserId();
    const offers = listVisibleOffersService(userId);
    return NextResponse.json({ offers });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await requireAuthUserId();
    const idemKey = req.headers.get('Idempotency-Key');
    const cached = checkIdempotency(userId, '/api/offers', idemKey);
    if (cached.hit && cached.response) return cached.response;

    const parsed = CreateOfferSchema.parse(await req.json());
    const offer = createOfferService(userId, parsed);

    const body = { offer };
    saveIdempotency(userId, '/api/offers', idemKey, 201, body);
    return NextResponse.json(body, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
