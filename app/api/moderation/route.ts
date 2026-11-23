import { NextRequest, NextResponse } from 'next/server';
import { handleApiError, requireAuthUserId } from '@/lib/api/http';
import { checkIdempotency, saveIdempotency } from '@/lib/security/idempotency';
import { checkAndConsumeRateLimit, getClientIp } from '@/lib/security/rate-limit';
import {
  AppealReportSchema,
  BreakGlassRequestSchema,
  CreateReportSchema,
  UpdateReportStatusSchema,
} from '@/modules/moderation/schema';
import {
  appealReportService,
  getGovernanceOverviewService,
  inspectPrivateNeedWithBreakGlassService,
  requestBreakGlassService,
  reviewReportService,
  submitReportService,
} from '@/modules/moderation/service';

export async function GET(req: NextRequest) {
  try {
    const userId = await requireAuthUserId();
    const inspectNeedId = req.nextUrl.searchParams.get('inspectNeedId');
    if (inspectNeedId) {
      const need = inspectPrivateNeedWithBreakGlassService(userId, inspectNeedId);
      return NextResponse.json({ need });
    }
    return NextResponse.json(getGovernanceOverviewService(userId));
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await requireAuthUserId();
    const idemKey = req.headers.get('Idempotency-Key');
    const cached = checkIdempotency(userId, '/api/moderation', idemKey);
    if (cached.hit && cached.response) return cached.response;

    const raw = await req.json();
    const action = raw?.action as string | undefined;
    let body: unknown;
    let status = 200;

    if (action === 'report') {
      const rate = checkAndConsumeRateLimit(userId, getClientIp(req.headers), 'create_report');
      if (!rate.allowed) throw new Error('RATE_LIMIT_EXCEEDED');
      const parsed = CreateReportSchema.parse(raw);
      body = { report: submitReportService(userId, parsed), rate_remaining: rate.remaining };
      status = 201;
    } else if (action === 'review') {
      const reportId = String(raw?.reportId || '');
      const parsed = UpdateReportStatusSchema.parse(raw);
      body = { report: reviewReportService(reportId, userId, parsed) };
    } else if (action === 'appeal') {
      const reportId = String(raw?.reportId || '');
      const parsed = AppealReportSchema.parse(raw);
      body = { report: appealReportService(reportId, userId, parsed.appealNote) };
    } else if (action === 'break_glass') {
      const parsed = BreakGlassRequestSchema.parse(raw);
      body = { break_glass: requestBreakGlassService(userId, parsed) };
      status = 201;
    } else {
      throw new Error('INVALID_ACTION');
    }

    saveIdempotency(userId, '/api/moderation', idemKey, status, body);
    return NextResponse.json(body, { status });
  } catch (err) {
    return handleApiError(err);
  }
}
