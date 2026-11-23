import { NextRequest, NextResponse } from 'next/server';
import { handleApiError, requireAuthUserId } from '@/lib/api/http';
import { checkIdempotency, saveIdempotency } from '@/lib/security/idempotency';
import { ClaimSurpriseSchema, CreateSurpriseSchema } from '@/modules/surprises/schema';
import {
  claimSurpriseItemService,
  createSurpriseItemService,
  listVisibleSurprisesService,
} from '@/modules/surprises/service';

export async function GET() {
  try {
    const userId = await requireAuthUserId();
    return NextResponse.json({ surprises: listVisibleSurprisesService(userId) });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await requireAuthUserId();
    const idemKey = req.headers.get('Idempotency-Key');
    const cached = checkIdempotency(userId, '/api/surprises', idemKey);
    if (cached.hit && cached.response) return cached.response;

    const raw = await req.json();
    let body: unknown;
    let status = 200;

    if (raw?.action === 'claim') {
      const parsed = ClaimSurpriseSchema.parse(raw);
      body = { claim: claimSurpriseItemService(userId, parsed.itemId) };
    } else {
      const parsed = CreateSurpriseSchema.parse(raw);
      body = { item: createSurpriseItemService(userId, parsed) };
      status = 201;
    }

    saveIdempotency(userId, '/api/surprises', idemKey, status, body);
    return NextResponse.json(body, { status });
  } catch (err) {
    return handleApiError(err);
  }
}
