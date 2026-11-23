'use client';

import { FileSearch, Key, ShieldCheck } from 'lucide-react';
import React, { useState } from 'react';
import { formatLocalizedDateTime, type Locale, type Messages } from '@/lib/i18n/messages';
import type { SessionUserDto } from './types';

interface ReportDto {
  id: string;
  target_type: string;
  target_id: string;
  reason_code: string;
  details: string | null;
  content_snapshot: Record<string, unknown>;
  status: 'new' | 'reviewing' | 'actioned' | 'dismissed';
  resolution_note: string | null;
  appeal_note: string | null;
  created_at: string;
}

interface BreakGlassDto {
  id: string;
  target_type: string;
  target_id: string;
  reason: string;
  expires_at: string;
}

interface AuditDto {
  id: string;
  actor_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

interface Props {
  user: SessionUserDto;
  isModerator: boolean;
  reports: ReportDto[];
  breakGlassRequests: BreakGlassDto[];
  auditLogs: AuditDto[];
  locale: Locale;
  t: Messages;
  safePost: <T = unknown>(
    url: string,
    payload: unknown
  ) => Promise<{ queued: boolean; ok: boolean; status: number; data?: T }>;
  onRefresh: () => Promise<void>;
  onNotify: (msg: string, tone?: 'ok' | 'error') => void;
}

export function GovernanceWorkspace({
  user,
  isModerator,
  reports,
  breakGlassRequests,
  auditLogs,
  locale,
  t,
  safePost,
  onRefresh,
  onNotify,
}: Props) {
  const [inspectNeedId, setInspectNeedId] = useState('need-demo-1');
  const [breakGlassReason, setBreakGlassReason] = useState('');
  const [inspectedNeed, setInspectedNeed] = useState<Record<string, unknown> | null>(null);
  const [appealNotes, setAppealNotes] = useState<Record<string, string>>({});

  const handleReview = async (reportId: string, status: 'actioned' | 'dismissed') => {
    const res = await safePost<{ error?: string }>('/api/moderation', {
      action: 'review',
      reportId,
      status,
      resolutionNote: status === 'actioned' ? 'Reviewed and actioned by moderator' : 'Dismissed after snapshot review',
      flagNeedUnderReview: status === 'actioned',
    });
    if (!res.ok) {
      onNotify(res.data?.error || 'REVIEW_FAILED', 'error');
      return;
    }
    await onRefresh();
  };

  const handleAppeal = async (reportId: string) => {
    const note = appealNotes[reportId];
    if (!note || note.trim().length < 5) return;
    const res = await safePost<{ error?: string }>('/api/moderation', {
      action: 'appeal',
      reportId,
      appealNote: note,
    });
    if (!res.ok) {
      onNotify(res.data?.error || 'APPEAL_FAILED', 'error');
      return;
    }
    await onRefresh();
  };

  const handleBreakGlass = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await safePost<{ error?: string }>('/api/moderation', {
      action: 'break_glass',
      targetType: 'need',
      targetId: inspectNeedId,
      reason: breakGlassReason,
      durationMinutes: 30,
    });
    if (!res.ok) {
      onNotify(res.data?.error || 'BREAK_GLASS_FAILED', 'error');
      return;
    }
    setBreakGlassReason('');
    await onRefresh();
    onNotify('Break-Glass access logged to audit_logs', 'ok');
  };

  const handleInspectPrivateNeed = async () => {
    const res = await fetch(`/api/moderation?inspectNeedId=${encodeURIComponent(inspectNeedId)}`);
    const data = await res.json();
    if (!res.ok) {
      setInspectedNeed(null);
      onNotify((t.errors as Record<string, string>)[data.error] || data.error, 'error');
      return;
    }
    setInspectedNeed(data.need);
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-5 w-5 text-[#0D6E5B]" aria-hidden="true" />
        <h2 className="text-xl font-semibold text-slate-900">{t.governance.title}</h2>
      </div>

      {/* Reports Queue */}
      <section className="space-y-3">
        <h3 className="text-base font-semibold text-slate-900">{t.governance.reportsQueue}</h3>
        <div className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
          {reports.length === 0 ? (
            <p className="p-6 text-sm text-slate-500">
              {locale === 'ar' ? 'لا توجد بلاغات في الطابور.' : 'No reports in queue.'}
            </p>
          ) : (
            reports.map((r) => (
              <div key={r.id} className="p-4 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                  <span>
                    <strong className="text-slate-900">{r.target_type}</strong> · {r.reason_code} ·{' '}
                    <span className="font-mono-tabular">{r.status}</span>
                  </span>
                  <span className="font-mono-tabular">
                    {formatLocalizedDateTime(r.created_at, locale, user.timezone)}
                  </span>
                </div>
                {r.details && <p className="text-sm text-slate-700">{r.details}</p>}
                <pre className="font-mono-tabular overflow-x-auto rounded-lg bg-slate-50 p-3 text-xs text-slate-700">
                  {JSON.stringify(r.content_snapshot, null, 2)}
                </pre>

                <div className="flex flex-wrap items-center gap-2">
                  {isModerator && (
                    <>
                      <button
                        type="button"
                        onClick={() => void handleReview(r.id, 'actioned')}
                        className="min-h-[36px] rounded-lg bg-red-600 px-3 py-1 text-xs font-medium text-white hover:bg-red-700"
                      >
                        {t.governance.reviewAction}
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleReview(r.id, 'dismissed')}
                        className="min-h-[36px] rounded-lg border border-slate-300 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                      >
                        {t.governance.dismissAction}
                      </button>
                    </>
                  )}
                  <div className="flex flex-1 items-center gap-2 min-w-[220px]">
                    <input
                      type="text"
                      value={appealNotes[r.id] || ''}
                      onChange={(e) => setAppealNotes((prev) => ({ ...prev, [r.id]: e.target.value }))}
                      placeholder={t.governance.appealBtn}
                      className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs text-slate-900"
                    />
                    <button
                      type="button"
                      onClick={() => void handleAppeal(r.id)}
                      className="min-h-[36px] shrink-0 rounded-lg border border-slate-300 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                    >
                      {t.governance.appealBtn}
                    </button>
                  </div>
                </div>
                {r.appeal_note && (
                  <p className="text-xs text-amber-800">Appeal: {r.appeal_note}</p>
                )}
              </div>
            ))
          )}
        </div>
      </section>

      {/* Break-Glass Access & Inspection */}
      {isModerator && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <form onSubmit={handleBreakGlass} className="rounded-xl border border-slate-200 bg-white p-5 space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <Key className="h-4 w-4 text-[#0D6E5B]" aria-hidden="true" />
              <span>{t.governance.breakGlassTitle}</span>
            </div>
            <p className="text-xs leading-relaxed text-slate-600">{t.governance.breakGlassDesc}</p>
            <div>
              <label className="block text-xs font-medium text-slate-700">{t.governance.inspectNeedId}</label>
              <input
                type="text"
                required
                value={inspectNeedId}
                onChange={(e) => setInspectNeedId(e.target.value)}
                className="font-mono-tabular mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700">{t.governance.breakGlassReason}</label>
              <input
                type="text"
                required
                minLength={10}
                value={breakGlassReason}
                onChange={(e) => setBreakGlassReason(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="submit"
                className="min-h-[40px] rounded-lg bg-[#0D6E5B] px-4 py-2 text-xs font-medium text-white hover:bg-[#095344]"
              >
                {t.governance.requestBreakGlass}
              </button>
              <button
                type="button"
                onClick={() => void handleInspectPrivateNeed()}
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-slate-300 px-4 py-2 text-xs font-medium text-slate-800 hover:bg-slate-50"
              >
                <FileSearch className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{t.governance.inspectPrivateNeed}</span>
              </button>
            </div>
            {inspectedNeed && (
              <pre className="font-mono-tabular overflow-x-auto rounded-lg bg-slate-50 p-3 text-xs text-slate-800">
                {JSON.stringify(inspectedNeed, null, 2)}
              </pre>
            )}
            {breakGlassRequests.length > 0 && (
              <div className="border-t border-slate-100 pt-2 text-xs text-slate-500">
                Active grants: {breakGlassRequests.length}
              </div>
            )}
          </form>

          {/* Immutable Audit Log */}
          <section className="rounded-xl border border-slate-200 bg-white p-5 space-y-3">
            <h3 className="text-sm font-semibold text-slate-900">{t.governance.auditLogTitle}</h3>
            <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
              {auditLogs.map((log) => (
                <div key={log.id} className="py-2 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono-tabular font-semibold text-slate-900">{log.action}</span>
                    <span className="font-mono-tabular text-slate-500">
                      {formatLocalizedDateTime(log.created_at, locale, user.timezone)}
                    </span>
                  </div>
                  <p className="font-mono-tabular text-slate-600">
                    {log.entity_type}:{log.entity_id}
                  </p>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
