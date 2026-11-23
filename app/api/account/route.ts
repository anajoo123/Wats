import { NextRequest, NextResponse } from 'next/server';
import { handleApiError, requireAuthUserId } from '@/lib/api/http';
import { SESSION_COOKIE_NAME } from '@/lib/security/session';
import { DeleteAccountSchema, UpdateProfileSchema } from '@/modules/auth/schema';
import {
  deactivateAccountService,
  exportMyDataService,
  updateProfileService,
} from '@/modules/auth/service';

export async function PATCH(req: NextRequest) {
  try {
    const userId = await requireAuthUserId();
    const parsed = UpdateProfileSchema.parse(await req.json());
    const user = updateProfileService(userId, parsed);
    return NextResponse.json({ user });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function GET() {
  try {
    const userId = await requireAuthUserId();
    const data = exportMyDataService(userId);
    return new NextResponse(JSON.stringify(data, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': 'attachment; filename="awn-my-data-export.json"',
      },
    });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await requireAuthUserId();
    const parsed = DeleteAccountSchema.parse(await req.json());
    const result = deactivateAccountService(userId, parsed.immediateAnonymize);
    const res = NextResponse.json({ result });
    res.cookies.delete(SESSION_COOKIE_NAME);
    return res;
  } catch (err) {
    return handleApiError(err);
  }
}
