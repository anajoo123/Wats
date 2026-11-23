import { NextResponse } from 'next/server';
import { handleApiError, requireAuthUserId } from '@/lib/api/http';
import {
  listImpactThreadService,
  listNotificationsService,
  markNotificationsReadService,
} from '@/modules/impact/service';

export async function GET() {
  try {
    const userId = await requireAuthUserId();
    return NextResponse.json({
      impact_events: listImpactThreadService(userId),
      notifications: listNotificationsService(userId),
    });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST() {
  try {
    const userId = await requireAuthUserId();
    markNotificationsReadService(userId);
    return NextResponse.json({ notifications: listNotificationsService(userId) });
  } catch (err) {
    return handleApiError(err);
  }
}
