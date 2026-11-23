import { NextRequest, NextResponse } from 'next/server';
import { handleApiError, requireAuthUserId } from '@/lib/api/http';
import { checkIdempotency, saveIdempotency } from '@/lib/security/idempotency';
import { ContactRevealConsentSchema } from '@/modules/privacy/schema';
import {
  getContactRevealService,
  updateContactRevealConsentService,
} from '@/modules/privacy/service';

export async function GET(req: NextRequest) {
  try {
    const userId = await requireAuthUserId();
    const needId = req.nextUrl.searchParams.get('needId');
    if (!needId) throw new Error('INVALID_NEED_ID');
    const data = getContactRevealService(needId, userId);
    return NextResponse.json({ data });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await requireAuthUserId();
    const idemKey = req.headers.get('Idempotency-Key');
    const cached = checkIdempotency(userId, '/api/privacy/contact-reveal', idemKey);
    if (cached.hit && cached.response) return cached.response;

    const parsed = ContactRevealConsentSchema.parse(await req.json());
    const data = updateContactRevealConsentService(parsed.needId, userId, parsed.grant);

    const body = { data };
    saveIdempotency(userId, '/api/privacy/contact-reveal', idemKey, 200, body);
    return NextResponse.json(body);
  } catch (err) {
    return handleApiError(err);
  }
}
