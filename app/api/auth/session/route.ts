import { NextRequest, NextResponse } from 'next/server';
import { handleApiError } from '@/lib/api/http';
import { getCurrentSession, SESSION_COOKIE_NAME, signSessionToken } from '@/lib/security/session';
import { LoginSchema, RegisterSchema, SwitchUserSchema } from '@/modules/auth/schema';
import {
  getActiveSessionUserService,
  listSwitchableUsersService,
  loginUserService,
  registerUserService,
} from '@/modules/auth/service';
import { listCountriesService } from '@/modules/countries/service';

const DEFAULT_DEMO_USER_ID = '11111111-1111-1111-1111-111111111111';

export async function GET() {
  try {
    const session = await getCurrentSession();
    const activeId = session?.uid || DEFAULT_DEMO_USER_ID;

    let currentUser = null;
    try {
      currentUser = getActiveSessionUserService(activeId);
    } catch {
      currentUser = null;
    }

    const res = NextResponse.json({
      user: currentUser,
      switchable_users: listSwitchableUsersService(),
      countries: listCountriesService(),
    });

    // If no session cookie yet and default active user exists, set a valid signed HttpOnly cookie
    if (!session && currentUser) {
      const token = signSessionToken(currentUser.id, currentUser.role);
      res.cookies.set(SESSION_COOKIE_NAME, token, {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 60 * 24 * 7,
      });
    }

    return res;
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const action = body?.action as string | undefined;

    let user;
    if (action === 'register') {
      const parsed = RegisterSchema.parse(body);
      user = registerUserService(parsed);
    } else if (action === 'switch') {
      const parsed = SwitchUserSchema.parse(body);
      user = getActiveSessionUserService(parsed.userId);
    } else {
      const parsed = LoginSchema.parse(body);
      user = loginUserService(parsed.email, parsed.password);
    }

    const token = signSessionToken(user.id, user.role);
    const res = NextResponse.json({ user }, { status: action === 'register' ? 201 : 200 });
    res.cookies.set(SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 7,
    });
    return res;
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(SESSION_COOKIE_NAME);
  return res;
}
