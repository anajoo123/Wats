'use client';

import * as Dialog from '@radix-ui/react-dialog';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Flag,
  Lock,
  Phone,
  Plus,
  ShieldCheck,
  Sparkles,
  Upload,
  UserCheck,
  X,
} from 'lucide-react';
import React, { useState } from 'react';
import { formatLocalizedDateTime, formatLocalizedNumber, type Locale, type Messages } from '@/lib/i18n/messages';
import type { CircleDto, NeedDto, OfferDto, SessionUserDto } from './types';

interface ContactRevealState {
  reveal: {
    need_id: string;
    consent_requester: boolean;
    consent_provider: boolean;
    revealed: boolean;
    revealed_at: string | null;
  };
  contact: {
    phone_e164: string | null;
    preferred_channel: string;
    emergency_note: string | null;
    display_name: string;
  } | null;
}

interface Props {
  user: SessionUserDto;
  needs: NeedDto[];
  offers: OfferDto[];
  circles: CircleDto[];
  locale: Locale;
  t: Messages;
  createNeedOpen: boolean;
  setCreateNeedOpen: (v: boolean) => void;
  safePost: <T = unknown>(
    url: string,
    payload: unknown
  ) => Promise<{ queued: boolean; ok: boolean; status: number; data?: T }>;
  onRefresh: () => Promise<void>;
  onNotify: (msg: string, tone?: 'ok' | 'error') => void;
}

export function NeedsWorkspace({
  user,
  needs,
  offers,
  circles,
  locale,
  t,
  createNeedOpen,
  setCreateNeedOpen,
  safePost,
  onRefresh,
  onNotify,
}: Props) {
  const [filter, setFilter] = useState<'all' | 'mine' | 'active'>('all');
  const [offerModalOpen, setOfferModalOpen] = useState(false);
  const [reportTargetNeed, setReportTargetNeed] = useState<NeedDto | null>(null);
  const [contactReveals, setContactReveals] = useState<Record<string, ContactRevealState | null>>({});

  // Create Need Form
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('groceries');
  const [urgency, setUrgency] = useState('normal');
  const [selectedCircleId, setSelectedCircleId] = useState(circles[0]?.id || '');
  const [hoursWindow, setHoursWindow] = useState(6);
  const [publishNow, setPublishNow] = useState(true);
  const [attachmentPath, setAttachmentPath] = useState<string | null>(null);
  const [exifStrippedInfo, setExifStrippedInfo] = useState<number | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Create Offer Form
  const [offerTitle, setOfferTitle] = useState('');
  const [offerDesc, setOfferDesc] = useState('');
  const [offerCat, setOfferCat] = useState('groceries');
  const [offerCircleId, setOfferCircleId] = useState(circles[0]?.id || '');
  const [offerCap, setOfferCap] = useState(2);

  // Report Form
  const [reportReason, setReportReason] = useState('safety_concern');
  const [reportDetails, setReportDetails] = useState('');

  const filteredNeeds = needs.filter((n) => {
    if (filter === 'mine') return n.requester_id === user.id;
    if (filter === 'active') return !['completed', 'cancelled', 'expired'].includes(n.status);
    return true;
  });

  const translateErr = (code?: string) => {
    if (!code) return 'Request failed';
    return (t.errors as Record<string, string>)[code] || code;
  };

  const handleImageUpload = async (file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch('/api/storage', { method: 'POST', body: fd });
    const data = await res.json();
    if (!res.ok) {
      onNotify(translateErr(data.error), 'error');
      return;
    }
    setAttachmentPath(data.storageKey);
    setExifStrippedInfo(data.strippedSegments);
  };

  const handleCreateNeed = async (e: React.FormEvent) => {
    e.preventDefault();
    const circleId = selectedCircleId || circles[0]?.id;
    if (!circleId) {
      onNotify('Join or create a circle first', 'error');
      return;
    }
    const now = new Date();
    const end = new Date(now.getTime() + hoursWindow * 3600_000);
    const res = await safePost<{ error?: string }>('/api/needs', {
      title,
      description,
      category,
      urgency,
      circleIds: [circleId],
      regionCode: user.region_code,
      timeWindowStart: now.toISOString(),
      timeWindowEnd: end.toISOString(),
      attachmentPath,
      publishImmediately: publishNow,
    });

    if (res.queued) {
      onNotify(t.pwa.offlineBanner, 'ok');
      setCreateNeedOpen(false);
      setTitle('');
      setDescription('');
      return;
    }
    if (!res.ok) {
      onNotify(translateErr(res.data?.error), 'error');
      return;
    }
    setCreateNeedOpen(false);
    setTitle('');
    setDescription('');
    setAttachmentPath(null);
    setExifStrippedInfo(null);
    await onRefresh();
    onNotify(t.needs.submitNeed, 'ok');
  };

  const handleCreateOffer = async (e: React.FormEvent) => {
    e.preventDefault();
    const circleId = offerCircleId || circles[0]?.id;
    if (!circleId) return;
    const now = new Date();
    const until = new Date(now.getTime() + 72 * 3600_000);
    const res = await safePost<{ error?: string }>('/api/offers', {
      circleId,
      category: offerCat,
      title: offerTitle,
      description: offerDesc || undefined,
      regionCode: user.region_code,
      availableFrom: now.toISOString(),
      availableUntil: until.toISOString(),
      capacityTotal: offerCap,
    });
    if (!res.ok) {
      onNotify(translateErr(res.data?.error), 'error');
      return;
    }
    setOfferModalOpen(false);
    setOfferTitle('');
    setOfferDesc('');
    await onRefresh();
  };

  const handleRunMatch = async (needId: string) => {
    setBusyId(needId);
    const res = await safePost<{ error?: string; matches?: unknown[] }>(`/api/needs/${needId}/match`, {});
    setBusyId(null);
    if (!res.ok) {
      onNotify(translateErr(res.data?.error), 'error');
      return;
    }
    await onRefresh();
  };

  const handleMatchDecision = async (matchId: string, decision: 'accept' | 'decline') => {
    setBusyId(matchId);
    const res = await safePost<{ error?: string }>(`/api/matches/${matchId}/respond`, { decision });
    setBusyId(null);
    if (!res.ok) {
      onNotify(translateErr(res.data?.error), 'error');
      return;
    }
    await onRefresh();
  };

  const handleTransition = async (needId: string, toStatus: string, reason?: string) => {
    setBusyId(needId);
    const res = await safePost<{ error?: string }>(`/api/needs/${needId}/transition`, {
      toStatus,
      reason,
    });
    setBusyId(null);
    if (!res.ok) {
      onNotify(translateErr(res.data?.error), 'error');
      return;
    }
    await onRefresh();
  };

  const loadContactReveal = async (needId: string) => {
    const res = await fetch(`/api/privacy/contact-reveal?needId=${encodeURIComponent(needId)}`);
    if (res.ok) {
      const json = await res.json();
      setContactReveals((prev) => ({ ...prev, [needId]: json.data }));
    }
  };

  const toggleContactReveal = async (needId: string, grant: boolean) => {
    const res = await safePost<{ data?: ContactRevealState; error?: string }>(
      '/api/privacy/contact-reveal',
      { needId, grant }
    );
    if (!res.ok) {
      onNotify(translateErr(res.data?.error), 'error');
      return;
    }
    if (res.data?.data) {
      setContactReveals((prev) => ({ ...prev, [needId]: res.data!.data! }));
    }
  };

  const handleSubmitReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reportTargetNeed) return;
    const res = await safePost<{ error?: string }>('/api/moderation', {
      action: 'report',
      targetType: 'need',
      targetId: reportTargetNeed.id,
      reasonCode: reportReason,
      details: reportDetails || undefined,
    });
    if (!res.ok) {
      onNotify(translateErr(res.data?.error), 'error');
      return;
    }
    setReportTargetNeed(null);
    setReportDetails('');
    onNotify(t.needs.reportNeed, 'ok');
  };

  return (
    <div className="space-y-8">
      {/* Segmented Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <h2 className="text-xl font-semibold text-slate-900">{t.needs.title}</h2>
        <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1" role="tablist">
          {(['all', 'mine', 'active'] as const).map((key) => {
            const label =
              key === 'all' ? t.needs.filterAll : key === 'mine' ? t.needs.filterMine : t.needs.filterActive;
            return (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={filter === key}
                onClick={() => setFilter(key)}
                className={`min-h-[40px] rounded-md px-3.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  filter === key ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Split: Needs Feed + Ready Offers */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
        <div className="space-y-4 lg:col-span-8">
          {filteredNeeds.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-white p-8 text-center">
              <p className="text-base font-semibold text-slate-900">{t.needs.emptyTitle}</p>
              <p className="mt-1 text-sm text-slate-600">{t.needs.emptyHint}</p>
              <button
                type="button"
                onClick={() => setCreateNeedOpen(true)}
                className="mt-4 inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-[#0D6E5B] px-4 py-2 text-sm font-medium text-white hover:bg-[#095344]"
              >
                <Plus className="h-4 w-4" />
                <span>{t.nav.newNeed}</span>
              </button>
            </div>
          ) : (
            filteredNeeds.map((need) => {
              const statusLabel = (t.status as Record<string, string>)[need.status] || need.status;
              const categoryLabel = (t.category as Record<string, string>)[need.category] || need.category;
              const urgencyLabel = (t.urgency as Record<string, string>)[need.urgency] || need.urgency;
              const isRequester = need.requester_id === user.id;
              const activeMatch = need.matches.find((m) => m.status !== 'declined' && m.status !== 'withdrawn');
              const isAssignedProvider = activeMatch?.provider_id === user.id;
              const revealState = contactReveals[need.id];
              const terminal = ['completed', 'cancelled', 'expired'].includes(need.status);

              return (
                <article
                  key={need.id}
                  className="rounded-xl border border-slate-200 bg-white p-5 transition-colors"
                >
                  {/* Unboxed zero-pill metadata row */}
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-slate-700">{categoryLabel}</span>
                      <span aria-hidden="true">·</span>
                      <span
                        className={`inline-flex items-center gap-1 font-semibold ${
                          need.is_sos || need.urgency === 'sos'
                            ? 'text-red-700'
                            : need.status === 'completed'
                              ? 'text-[#0D6E5B]'
                              : 'text-slate-800'
                        }`}
                      >
                        {need.is_sos ? (
                          <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                        ) : (
                          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                        )}
                        {statusLabel}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>{urgencyLabel}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono-tabular">{need.region_code}</span>
                    </div>
                    <span className="font-mono-tabular">
                      {formatLocalizedDateTime(need.time_window_end, locale, user.timezone)}
                    </span>
                  </div>

                  <h3 className="mt-2.5 text-lg font-semibold text-slate-900">{need.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-slate-700">{need.description}</p>

                  <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <span>{need.requester_name}</span>
                    {need.is_sensitive && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="inline-flex items-center gap-1 text-amber-800">
                          <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>Trust L2+</span>
                        </span>
                      </>
                    )}
                  </div>

                  {need.signed_attachment_url && (
                    <div className="mt-3">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={need.signed_attachment_url}
                        alt={need.title}
                        referrerPolicy="no-referrer"
                        className="max-h-48 rounded-lg border border-slate-200 object-cover"
                      />
                    </div>
                  )}

                  {/* Explainable Matches Section */}
                  {need.matches.length > 0 && (
                    <div className="mt-4 border-t border-slate-100 pt-4 space-y-3">
                      <p className="text-xs font-medium text-slate-500">{t.matching.noBiasNote}</p>
                      {need.matches.map((m) => {
                        const myParty =
                          user.id === need.requester_id
                            ? 'requester'
                            : user.id === m.provider_id
                              ? 'provider'
                              : null;

                        const matchStatusText =
                          m.status === 'accepted_both'
                            ? t.matching.statusAcceptedBoth
                            : m.status === 'accepted_by_requester'
                              ? t.matching.statusAcceptedReq
                              : m.status === 'accepted_by_provider'
                                ? t.matching.statusAcceptedProv
                                : t.matching.statusSuggested;

                        return (
                          <div
                            key={m.id}
                            className="flex flex-col gap-3 rounded-lg bg-slate-50 p-3.5 sm:flex-row sm:items-center sm:justify-between"
                          >
                            <div className="space-y-1">
                              <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-900">
                                <span>{m.provider_name}</span>
                                <span aria-hidden="true">·</span>
                                <span className="font-mono-tabular text-[#0D6E5B]">
                                  {t.matching.scoreLabel}: {formatLocalizedNumber(m.score, locale)}/100
                                </span>
                                <span aria-hidden="true">·</span>
                                <span className="text-xs font-medium text-slate-600">{matchStatusText}</span>
                              </div>
                              <div className="font-mono-tabular flex flex-wrap items-center gap-3 text-xs text-slate-600">
                                <span>
                                  {t.matching.skill}: {m.explanation.skill_score}/40
                                </span>
                                <span>
                                  {t.matching.region}: {m.explanation.region_score}/25
                                </span>
                                <span>
                                  {t.matching.availability}: {m.explanation.availability_score}/20
                                </span>
                                <span>
                                  {t.matching.load}: {m.explanation.load_balance_score}/15
                                </span>
                              </div>
                            </div>

                            {myParty && m.status !== 'accepted_both' && m.status !== 'declined' && m.status !== 'withdrawn' && (
                              <div className="flex items-center gap-2 shrink-0">
                                <button
                                  type="button"
                                  disabled={busyId === m.id}
                                  onClick={() => void handleMatchDecision(m.id, 'accept')}
                                  className="min-h-[40px] rounded-lg bg-[#0D6E5B] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#095344] whitespace-nowrap"
                                >
                                  {t.needs.acceptMatch}
                                </button>
                                <button
                                  type="button"
                                  disabled={busyId === m.id}
                                  onClick={() => void handleMatchDecision(m.id, 'decline')}
                                  className="min-h-[40px] rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 whitespace-nowrap"
                                >
                                  {t.needs.declineMatch}
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Dual-Consent Contact Reveal Gate */}
                  {(need.status === 'accepted' || need.status === 'in_progress') &&
                    (isRequester || isAssignedProvider) && (
                      <div className="mt-4 border-t border-slate-100 pt-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2 text-xs font-semibold text-slate-800">
                            <Lock className="h-3.5 w-3.5 text-[#0D6E5B]" aria-hidden="true" />
                            <span>{t.contact.title}</span>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            {!revealState && (
                              <button
                                type="button"
                                onClick={() => void loadContactReveal(need.id)}
                                className="min-h-[36px] rounded-lg border border-slate-300 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                              >
                                {t.contact.title}
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => void toggleContactReveal(need.id, true)}
                              className="min-h-[36px] rounded-lg bg-slate-900 px-3 py-1 text-xs font-medium text-white hover:bg-slate-800"
                            >
                              {t.contact.grantMyConsent}
                            </button>
                            <button
                              type="button"
                              onClick={() => void toggleContactReveal(need.id, false)}
                              className="min-h-[36px] rounded-lg border border-slate-300 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                            >
                              {t.contact.revokeMyConsent}
                            </button>
                          </div>
                        </div>

                        {revealState && (
                          <div className="mt-2 rounded-lg bg-slate-50 p-3 text-xs text-slate-700">
                            {revealState.reveal.revealed && revealState.contact ? (
                              <div className="flex flex-wrap items-center gap-2 font-medium text-[#0D6E5B]">
                                <Phone className="h-4 w-4" aria-hidden="true" />
                                <span>{t.contact.revealed}</span>
                                <span>{revealState.contact.display_name}</span>
                                <span aria-hidden="true">·</span>
                                <span className="font-mono-tabular" dir="ltr">
                                  {revealState.contact.phone_e164 || revealState.contact.preferred_channel}
                                </span>
                                {revealState.contact.emergency_note && (
                                  <span className="text-slate-600">({revealState.contact.emergency_note})</span>
                                )}
                              </div>
                            ) : revealState.reveal.consent_requester || revealState.reveal.consent_provider ? (
                              <p>{t.contact.waitingOther}</p>
                            ) : (
                              <p>{t.contact.locked}</p>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                  {/* State-Machine Action Bar */}
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
                    <div className="flex flex-wrap items-center gap-2">
                      {need.status === 'draft' && isRequester && (
                        <button
                          type="button"
                          disabled={busyId === need.id}
                          onClick={() => void handleTransition(need.id, 'published')}
                          className="min-h-[40px] rounded-lg bg-[#0D6E5B] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#095344]"
                        >
                          {t.needs.publishNow}
                        </button>
                      )}

                      {(need.status === 'published' || need.status === 'matched') && !terminal && (
                        <button
                          type="button"
                          disabled={busyId === need.id}
                          onClick={() => void handleRunMatch(need.id)}
                          className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-[#0D6E5B] px-3 py-1.5 text-xs font-medium text-[#0D6E5B] hover:bg-[#0D6E5B]/5"
                        >
                          <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>{t.needs.runMatch}</span>
                        </button>
                      )}

                      {need.status === 'accepted' && isAssignedProvider && (
                        <button
                          type="button"
                          disabled={busyId === need.id}
                          onClick={() => void handleTransition(need.id, 'in_progress')}
                          className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-[#0D6E5B] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#095344]"
                        >
                          <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>{t.needs.startAssist}</span>
                        </button>
                      )}

                      {need.status === 'in_progress' && isRequester && (
                        <button
                          type="button"
                          disabled={busyId === need.id}
                          onClick={() => void handleTransition(need.id, 'completed')}
                          className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-[#0D6E5B] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#095344]"
                        >
                          <UserCheck className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>{t.needs.completeAssist}</span>
                        </button>
                      )}

                      {['matched', 'accepted', 'in_progress'].includes(need.status) && isAssignedProvider && (
                        <button
                          type="button"
                          disabled={busyId === need.id}
                          onClick={() => void handleTransition(need.id, 'published', 'provider_withdrew')}
                          className="min-h-[40px] rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-900 hover:bg-amber-100"
                        >
                          {t.needs.withdrawAssist}
                        </button>
                      )}

                      {!terminal && isRequester && (
                        <button
                          type="button"
                          disabled={busyId === need.id}
                          onClick={() => void handleTransition(need.id, 'cancelled')}
                          className="min-h-[40px] rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
                        >
                          {t.needs.cancelNeed}
                        </button>
                      )}
                    </div>

                    {!isRequester && (
                      <button
                        type="button"
                        onClick={() => setReportTargetNeed(need)}
                        className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                      >
                        <Flag className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>{t.needs.reportNeed}</span>
                      </button>
                    )}
                  </div>
                </article>
              );
            })
          )}
        </div>

        {/* Ready Cold-Start Offers Column */}
        <aside className="space-y-4 lg:col-span-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-slate-900">{t.needs.offersHeading}</h3>
            <button
              type="button"
              onClick={() => setOfferModalOpen(true)}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-50 whitespace-nowrap"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{t.needs.addOffer}</span>
            </button>
          </div>

          <div className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
            {offers.map((offer) => (
              <div key={offer.id} className="p-4">
                <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
                  <span>{(t.category as Record<string, string>)[offer.category] || offer.category}</span>
                  <span className="font-mono-tabular">
                    {t.needs.capacityLabel}: {offer.capacity_remaining}/{offer.capacity_total}
                  </span>
                </div>
                <p className="mt-1 text-sm font-semibold text-slate-900">{offer.title}</p>
                <p className="mt-1 text-xs text-slate-600">
                  {offer.provider_name} · <span className="font-mono-tabular">{offer.region_code}</span>
                </p>
              </div>
            ))}
          </div>
        </aside>
      </div>

      {/* Create Need Modal */}
      <Dialog.Root open={createNeedOpen} onOpenChange={setCreateNeedOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs" />
          <Dialog.Content className="fixed start-1/2 top-1/2 z-50 max-h-[90vh] w-[94vw] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-slate-200 bg-white p-6 shadow-xl rtl:translate-x-1/2">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <Dialog.Title className="text-base font-semibold text-slate-900">
                {t.needs.createTitle}
              </Dialog.Title>
              <Dialog.Close asChild>
                <button
                  type="button"
                  aria-label="Close"
                  className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
                >
                  <X className="h-4 w-4" />
                </button>
              </Dialog.Close>
            </div>

            <form onSubmit={handleCreateNeed} className="mt-4 space-y-3.5">
              <div>
                <label className="block text-xs font-medium text-slate-700">{t.needs.fieldTitle}</label>
                <input
                  type="text"
                  required
                  minLength={3}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700">{t.needs.fieldDesc}</label>
                <textarea
                  required
                  minLength={5}
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700">{t.needs.fieldCategory}</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                  >
                    {Object.entries(t.category).map(([k, label]) => (
                      <option key={k} value={k}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700">{t.needs.fieldUrgency}</label>
                  <select
                    value={urgency}
                    onChange={(e) => setUrgency(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                  >
                    {(['low', 'normal', 'high'] as const).map((u) => (
                      <option key={u} value={u}>
                        {(t.urgency as Record<string, string>)[u]}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700">{t.needs.fieldCircle}</label>
                  <select
                    value={selectedCircleId || circles[0]?.id || ''}
                    onChange={(e) => setSelectedCircleId(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                  >
                    {circles.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700">{t.needs.fieldHours}</label>
                  <input
                    type="number"
                    min={1}
                    max={72}
                    value={hoursWindow}
                    onChange={(e) => setHoursWindow(Number(e.target.value))}
                    className="font-mono-tabular mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700">{t.needs.fieldImage}</label>
                <label className="mt-1 flex min-h-[44px] cursor-pointer items-center gap-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-600 hover:bg-slate-100">
                  <Upload className="h-4 w-4 text-slate-500" aria-hidden="true" />
                  <span>{attachmentPath ? `${attachmentPath} (EXIF stripped: ${exifStrippedInfo ?? 0})` : 'JPEG / PNG (max 2MB)'}</span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png"
                    className="sr-only"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void handleImageUpload(f);
                    }}
                  />
                </label>
              </div>

              <label className="flex items-center gap-2 text-xs text-slate-700">
                <input
                  type="checkbox"
                  checked={publishNow}
                  onChange={(e) => setPublishNow(e.target.checked)}
                  className="h-4 w-4 accent-[#0D6E5B]"
                />
                <span>{t.needs.publishNow}</span>
              </label>

              <button
                type="submit"
                className="min-h-[44px] w-full rounded-lg bg-[#0D6E5B] px-4 py-2 text-sm font-medium text-white hover:bg-[#095344]"
              >
                {t.needs.submitNeed}
              </button>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Create Offer Modal */}
      <Dialog.Root open={offerModalOpen} onOpenChange={setOfferModalOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs" />
          <Dialog.Content className="fixed start-1/2 top-1/2 z-50 w-[94vw] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-slate-200 bg-white p-6 shadow-xl rtl:translate-x-1/2">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <Dialog.Title className="text-base font-semibold text-slate-900">{t.needs.addOffer}</Dialog.Title>
              <Dialog.Close asChild>
                <button
                  type="button"
                  aria-label="Close"
                  className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
                >
                  <X className="h-4 w-4" />
                </button>
              </Dialog.Close>
            </div>
            <form onSubmit={handleCreateOffer} className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-700">{t.needs.fieldTitle}</label>
                <input
                  type="text"
                  required
                  minLength={3}
                  value={offerTitle}
                  onChange={(e) => setOfferTitle(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700">{t.needs.fieldCategory}</label>
                  <select
                    value={offerCat}
                    onChange={(e) => setOfferCat(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                  >
                    {Object.entries(t.category).map(([k, label]) => (
                      <option key={k} value={k}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700">{t.needs.capacityLabel}</label>
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={offerCap}
                    onChange={(e) => setOfferCap(Number(e.target.value))}
                    className="font-mono-tabular mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700">{t.needs.fieldCircle}</label>
                <select
                  value={offerCircleId || circles[0]?.id || ''}
                  onChange={(e) => setOfferCircleId(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                >
                  {circles.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="submit"
                className="min-h-[44px] w-full rounded-lg bg-[#0D6E5B] px-4 py-2 text-sm font-medium text-white hover:bg-[#095344]"
              >
                {t.needs.addOffer}
              </button>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Report Need Modal */}
      <Dialog.Root open={Boolean(reportTargetNeed)} onOpenChange={(o) => !o && setReportTargetNeed(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs" />
          <Dialog.Content className="fixed start-1/2 top-1/2 z-50 w-[94vw] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-slate-200 bg-white p-6 shadow-xl rtl:translate-x-1/2">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <Dialog.Title className="text-base font-semibold text-slate-900">{t.needs.reportNeed}</Dialog.Title>
              <Dialog.Close asChild>
                <button
                  type="button"
                  aria-label="Close"
                  className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
                >
                  <X className="h-4 w-4" />
                </button>
              </Dialog.Close>
            </div>
            <form onSubmit={handleSubmitReport} className="mt-4 space-y-3">
              <select
                value={reportReason}
                onChange={(e) => setReportReason(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
              >
                <option value="safety_concern">Safety Concern</option>
                <option value="financial_solicitation">Financial Solicitation (Prohibited in MVP)</option>
                <option value="privacy_violation">Privacy Violation</option>
                <option value="harassment">Harassment</option>
              </select>
              <textarea
                rows={3}
                value={reportDetails}
                onChange={(e) => setReportDetails(e.target.value)}
                placeholder={t.needs.fieldDesc}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
              />
              <button
                type="submit"
                className="min-h-[44px] w-full rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
              >
                {t.needs.reportNeed}
              </button>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
