import { NextRequest, NextResponse } from 'next/server';
import { handleApiError, requireAuthUserId } from '@/lib/api/http';
import { checkIdempotency, saveIdempotency } from '@/lib/security/idempotency';
import { BlockUserSchema, UpdateConsentSchema } from '@/modules/privacy/schema';
import {
  blockUserService,
  getPrivacyStateService,
  unblockUserService,
  updateConsentService,
} from '@/modules/privacy/service';

export async function GET() {
  try {
    const userId = await requireAuthUserId();
    return NextResponse.json(getPrivacyStateService(userId));
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await requireAuthUserId();
    const idemKey = req.headers.get('Idempotency-Key');
    const cached = checkIdempotency(userId, '/api/privacy', idemKey);
    if (cached.hit && cached.response) return cached.response;

    const raw = await req.json();
    let body: unknown;
    if (raw?.action === 'block') {
      const parsed = BlockUserSchema.parse(raw);
      body = { blocks: blockUserService(userId, parsed.blockedUserId, parsed.reason) };
    } else {
      const parsed = UpdateConsentSchema.parse(raw);
      body = { consents: updateConsentService(userId, parsed.purpose, parsed.granted) };
    }

    saveIdempotency(userId, '/api/privacy', idemKey, 200, body);
    return NextResponse.json(body);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const userId = await requireAuthUserId();
    const blockedUserId = req.nextUrl.searchParams.get('blockedUserId');
    if (!blockedUserId) throw new Error('INVALID_USER_ID');
    return NextResponse.json({ blocks: unblockUserService(userId, blockedUserId) });
  } catch (err) {
    return handleApiError(err);
  }
}
