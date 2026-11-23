import crypto from 'node:crypto';
import { getDb } from '@/lib/db/client';

export interface ReportRecord {
  id: string;
  reporter_id: string;
  target_type: 'need' | 'offer' | 'user' | 'circle';
  target_id: string;
  reason_code: string;
  details: string | null;
  content_snapshot: string;
  status: 'new' | 'reviewing' | 'actioned' | 'dismissed';
  resolution_note: string | null;
  appeal_note: string | null;
  appealed_at: string | null;
  reviewed_by: string | null;
  created_at: string;
}

export function captureTargetSnapshotRepo(targetType: string, targetId: string): Record<string, unknown> {
  const db = getDb();
  if (targetType === 'need') {
    const row = db
      .prepare('SELECT id, title, description, category, urgency, status, region_code, created_at FROM needs WHERE id = ?')
      .get(targetId) as Record<string, unknown> | undefined;
    return row || { id: targetId, missing: true };
  }
  if (targetType === 'offer') {
    const row = db
      .prepare('SELECT id, title, description, category, region_code, created_at FROM offers WHERE id = ?')
      .get(targetId) as Record<string, unknown> | undefined;
    return row || { id: targetId, missing: true };
  }
  if (targetType === 'user') {
    const row = db
      .prepare('SELECT user_id, display_name, region_code FROM profiles WHERE user_id = ?')
      .get(targetId) as Record<string, unknown> | undefined;
    return row || { id: targetId, missing: true };
  }
  const row = db
    .prepare('SELECT id, name, region_code FROM circles WHERE id = ?')
    .get(targetId) as Record<string, unknown> | undefined;
  return row || { id: targetId, missing: true };
}

export function createReportRepo(input: {
  reporterId: string;
  targetType: 'need' | 'offer' | 'user' | 'circle';
  targetId: string;
  reasonCode: string;
  details?: string;
}): ReportRecord {
  const db = getDb();
  const id = crypto.randomUUID();
  const snapshot = captureTargetSnapshotRepo(input.targetType, input.targetId);

  db.prepare(
    `INSERT INTO reports (id, reporter_id, target_type, target_id, reason_code, details, content_snapshot, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'new')`
  ).run(
    id,
    input.reporterId,
    input.targetType,
    input.targetId,
    input.reasonCode,
    input.details ?? null,
    JSON.stringify(snapshot)
  );

  db.prepare(
    `INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id, metadata)
     VALUES (?, ?, 'report_submitted', 'report', ?, ?)`
  ).run(
    crypto.randomUUID(),
    input.reporterId,
    id,
    JSON.stringify({ target_type: input.targetType, target_id: input.targetId, reason_code: input.reasonCode })
  );

  return db.prepare('SELECT * FROM reports WHERE id = ?').get(id) as unknown as ReportRecord;
}

export function listReportsForUserRepo(userId: string, isModerator: boolean): ReportRecord[] {
  const db = getDb();
  if (isModerator) {
    return db.prepare('SELECT * FROM reports ORDER BY created_at DESC').all() as unknown as ReportRecord[];
  }
  return db
    .prepare('SELECT * FROM reports WHERE reporter_id = ? ORDER BY created_at DESC')
    .all(userId) as unknown as ReportRecord[];
}

export function getReportByIdRepo(reportId: string): ReportRecord | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM reports WHERE id = ?').get(reportId) as unknown as ReportRecord | undefined;
  return row ?? null;
}

export function updateReportStatusRepo(
  reportId: string,
  reviewerId: string,
  status: 'reviewing' | 'actioned' | 'dismissed',
  resolutionNote: string
): ReportRecord {
  const db = getDb();
  const nowIso = new Date().toISOString();
  db.prepare(
    `UPDATE reports
     SET status = ?, resolution_note = ?, reviewed_by = ?, updated_at = ?
     WHERE id = ?`
  ).run(status, resolutionNote, reviewerId, nowIso, reportId);

  db.prepare(
    `INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id, metadata)
     VALUES (?, ?, 'report_reviewed', 'report', ?, ?)`
  ).run(crypto.randomUUID(), reviewerId, reportId, JSON.stringify({ status }));

  return getReportByIdRepo(reportId)!;
}

export function appealReportRepo(reportId: string, actorId: string, appealNote: string): ReportRecord {
  const db = getDb();
  const nowIso = new Date().toISOString();
  db.prepare(
    `UPDATE reports
     SET appeal_note = ?, appealed_at = ?, status = 'reviewing', updated_at = ?
     WHERE id = ?`
  ).run(appealNote, nowIso, nowIso, reportId);

  db.prepare(
    `INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id, metadata)
     VALUES (?, ?, 'report_appealed', 'report', ?, '{}')`
  ).run(crypto.randomUUID(), actorId, reportId);

  return getReportByIdRepo(reportId)!;
}

export function createBreakGlassRequestRepo(input: {
  adminId: string;
  targetType: string;
  targetId: string;
  reason: string;
  durationMinutes: number;
}) {
  const db = getDb();
  const id = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + input.durationMinutes * 60_000).toISOString();

  db.prepare(
    `INSERT INTO admin_access_requests (id, admin_id, target_type, target_id, reason, expires_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(id, input.adminId, input.targetType, input.targetId, input.reason, expiresAt);

  db.prepare(
    `INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id, metadata)
     VALUES (?, ?, 'break_glass_granted', ?, ?, ?)`
  ).run(
    crypto.randomUUID(),
    input.adminId,
    input.targetType,
    input.targetId,
    JSON.stringify({ reason: input.reason, expires_at: expiresAt })
  );

  return db.prepare('SELECT * FROM admin_access_requests WHERE id = ?').get(id);
}

export function hasActiveBreakGlassRepo(adminId: string, targetId: string): boolean {
  const db = getDb();
  const nowIso = new Date().toISOString();
  const row = db
    .prepare(
      `SELECT 1 as hit FROM admin_access_requests
       WHERE admin_id = ? AND target_id = ? AND expires_at > ?
       LIMIT 1`
    )
    .get(adminId, targetId, nowIso) as { hit: number } | undefined;
  return Boolean(row?.hit);
}

export function listBreakGlassRequestsRepo(adminId: string) {
  const db = getDb();
  return db
    .prepare('SELECT * FROM admin_access_requests WHERE admin_id = ? ORDER BY created_at DESC LIMIT 25')
    .all(adminId);
}

export function listAuditLogsRepo(limit = 40) {
  const db = getDb();
  return db
    .prepare('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT ?')
    .all(limit) as Array<{
      id: string;
      actor_id: string | null;
      action: string;
      entity_type: string;
      entity_id: string;
      metadata: string;
      created_at: string;
    }>;
}
