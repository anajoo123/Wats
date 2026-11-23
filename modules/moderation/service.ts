import { assertAccountActivePolicy, isPlatformAdminPolicy } from '@/modules/auth/policy';
import { getUserByIdRepo } from '@/modules/auth/repo';
import { executeControlledNeedTransitionRepo, getNeedByIdRepo } from '@/modules/needs/repo';
import { assertBreakGlassPolicy, assertModeratorPolicy } from './policy';
import {
  appealReportRepo,
  createBreakGlassRequestRepo,
  createReportRepo,
  getReportByIdRepo,
  listAuditLogsRepo,
  listBreakGlassRequestsRepo,
  listReportsForUserRepo,
  updateReportStatusRepo,
} from './repo';

export function submitReportService(
  reporterId: string,
  input: {
    targetType: 'need' | 'offer' | 'user' | 'circle';
    targetId: string;
    reasonCode: string;
    details?: string;
  }
) {
  const user = getUserByIdRepo(reporterId);
  assertAccountActivePolicy(user);

  const report = createReportRepo({
    reporterId,
    ...input,
  });

  return {
    ...report,
    content_snapshot: JSON.parse(report.content_snapshot),
  };
}

export function listReportsService(userId: string) {
  const user = getUserByIdRepo(userId);
  assertAccountActivePolicy(user);
  const isMod = isPlatformAdminPolicy(user);
  const rows = listReportsForUserRepo(userId, isMod);
  return rows.map((r) => ({
    ...r,
    content_snapshot: JSON.parse(r.content_snapshot),
  }));
}

export function reviewReportService(
  reportId: string,
  moderatorId: string,
  input: {
    status: 'reviewing' | 'actioned' | 'dismissed';
    resolutionNote: string;
    flagNeedUnderReview?: boolean;
  }
) {
  const mod = getUserByIdRepo(moderatorId);
  assertModeratorPolicy(mod);

  const existing = getReportByIdRepo(reportId);
  if (!existing) throw new Error('REPORT_NOT_FOUND');

  const updated = updateReportStatusRepo(reportId, moderatorId, input.status, input.resolutionNote);

  if (input.flagNeedUnderReview && existing.target_type === 'need') {
    const need = getNeedByIdRepo(existing.target_id);
    if (need && !['completed', 'cancelled', 'expired', 'under_review'].includes(need.status)) {
      executeControlledNeedTransitionRepo(
        need.id,
        need.status,
        'under_review',
        moderatorId,
        `report:${reportId}`
      );
    }
  }

  return {
    ...updated,
    content_snapshot: JSON.parse(updated.content_snapshot),
  };
}

export function appealReportService(reportId: string, actorId: string, appealNote: string) {
  const user = getUserByIdRepo(actorId);
  assertAccountActivePolicy(user);

  const report = getReportByIdRepo(reportId);
  if (!report) throw new Error('REPORT_NOT_FOUND');

  // Allow target user or reporter to file an appeal
  const updated = appealReportRepo(reportId, actorId, appealNote);
  return {
    ...updated,
    content_snapshot: JSON.parse(updated.content_snapshot),
  };
}

export function requestBreakGlassService(
  adminId: string,
  input: { targetType: string; targetId: string; reason: string; durationMinutes: number }
) {
  const mod = getUserByIdRepo(adminId);
  assertModeratorPolicy(mod);
  return createBreakGlassRequestRepo({ adminId, ...input });
}

export function inspectPrivateNeedWithBreakGlassService(adminId: string, needId: string) {
  const mod = getUserByIdRepo(adminId);
  assertModeratorPolicy(mod);
  assertBreakGlassPolicy(adminId, needId);

  const need = getNeedByIdRepo(needId);
  if (!need) throw new Error('NEED_NOT_FOUND');
  return need;
}

export function getGovernanceOverviewService(userId: string) {
  const user = getUserByIdRepo(userId);
  assertAccountActivePolicy(user);
  const isMod = isPlatformAdminPolicy(user);

  return {
    is_moderator: isMod,
    reports: listReportsService(userId),
    break_glass_requests: isMod ? listBreakGlassRequestsRepo(userId) : [],
    audit_logs: isMod
      ? listAuditLogsRepo(30).map((a) => ({ ...a, metadata: JSON.parse(a.metadata) }))
      : [],
  };
}
