import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { reportServerError } from '@/lib/monitoring/sentry';
import { getCurrentSession } from '@/lib/security/session';

export async function requireAuthUserId(): Promise<string> {
  const session = await getCurrentSession();
  if (!session?.uid) {
    throw new Error('UNAUTHORIZED');
  }
  return session.uid;
}

const ERROR_STATUS_MAP: Record<string, number> = {
  UNAUTHORIZED: 401,
  INVALID_CREDENTIALS: 401,
  ACCOUNT_DEACTIVATED: 403,
  FORBIDDEN: 403,
  NOT_CIRCLE_MEMBER: 403,
  NOT_CIRCLE_ADMIN: 403,
  MODERATOR_ROLE_REQUIRED: 403,
  BREAK_GLASS_REQUIRED: 403,
  BLOCKED_INTERACTION: 403,
  ONLY_REQUESTER_CAN_PUBLISH: 403,
  ONLY_PROVIDER_CAN_START: 403,
  ONLY_REQUESTER_CAN_COMPLETE: 403,
  ONLY_PROVIDER_CAN_WITHDRAW: 403,
  ONLY_REQUESTER_CAN_CANCEL: 403,
  ONLY_MODERATOR_CAN_REVIEW: 403,
  PARTNER_OR_CITY_TIER_REQUIRED: 403,
  OPEN_REPORTS_BLOCK_EXPANSION: 409,
  NEED_NOT_FOUND: 404,
  MATCH_NOT_FOUND: 404,
  REPORT_NOT_FOUND: 404,
  SURPRISE_NOT_FOUND: 404,
  INVALID_INVITE_CODE: 404,
  EMAIL_ALREADY_EXISTS: 409,
  TERMINAL_STATE_IMMUTABLE: 409,
  DUAL_ACCEPTANCE_REQUIRED: 409,
  OFFER_CAPACITY_EXHAUSTED: 409,
  NEED_NOT_MATCHABLE: 409,
  ITEM_OUT_OF_STOCK: 409,
  ALREADY_CLAIMED: 409,
  PAYLOAD_TOO_LARGE: 413,
  UNSUPPORTED_MEDIA_TYPE: 415,
  RATE_LIMIT_EXCEEDED: 429,
};

export function handleApiError(err: unknown): NextResponse {
  if (err instanceof ZodError) {
    return NextResponse.json(
      { error: 'VALIDATION_ERROR', issues: err.issues.map((i) => ({ path: i.path, message: i.message })) },
      { status: 400 }
    );
  }
  const code = err instanceof Error ? err.message : 'INTERNAL_ERROR';
  const status = ERROR_STATUS_MAP[code] ?? (code.startsWith('INVALID_') ? 400 : 500);
  if (status >= 500) {
    void reportServerError(err, { code, status });
  }
  return NextResponse.json({ error: code }, { status });
}
