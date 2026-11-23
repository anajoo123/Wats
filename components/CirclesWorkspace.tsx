'use client';

import { ArrowUpRight, Ban, Check, Gift, KeyRound, Plus, Users } from 'lucide-react';
import React, { useState } from 'react';
import type { Messages } from '@/lib/i18n/messages';
import type { CircleDto, SessionUserDto } from './types';

interface BlockedRow {
  id: string;
  blocked_id: string;
  reason: string | null;
  display_name: string | null;
}

export interface SurpriseDto {
  id: string;
  circle_id: string;
  circle_name: string;
  expansion_tier: string;
  partner_name: string;
  title: string;
  description: string | null;
  quantity_available: number;
  region_code: string;
  my_claim_status: string | null;
}

interface Props {
  user: SessionUserDto;
  circles: CircleDto[];
  blocks: BlockedRow[];
  surprises: SurpriseDto[];
  t: Messages;
  safePost: <T = unknown>(
    url: string,
    payload: unknown
  ) => Promise<{ queued: boolean; ok: boolean; status: number; data?: T }>;
  onRefresh: () => Promise<void>;
  onNotify: (msg: string, tone?: 'ok' | 'error') => void;
}

export function CirclesWorkspace({
  user,
  circles,
  blocks,
  surprises,
  t,
  safePost,
  onRefresh,
  onNotify,
}: Props) {
  const [inviteCode, setInviteCode] = useState('');
  const [circleName, setCircleName] = useState('');
  const [circleDesc, setCircleDesc] = useState('');

  const translateErr = (code?: string) => {
    if (!code) return 'Request failed';
    return (t.errors as Record<string, string>)[code] || code;
  };

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await safePost<{ error?: string }>('/api/circles/join', { inviteCode });
    if (!res.ok) {
      onNotify(translateErr(res.data?.error), 'error');
      return;
    }
    setInviteCode('');
    await onRefresh();
    onNotify(t.circles.joinBtn, 'ok');
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await safePost<{ error?: string }>('/api/circles', {
      name: circleName,
      description: circleDesc || undefined,
      countryCode: user.country_code,
      regionCode: user.region_code,
    });
    if (!res.ok) {
      onNotify(translateErr(res.data?.error), 'error');
      return;
    }
    setCircleName('');
    setCircleDesc('');
    await onRefresh();
    onNotify(t.circles.createBtn, 'ok');
  };

  const handleExpandTier = async (circleId: string) => {
    const res = await safePost<{ error?: string }>('/api/circles/expand', { circleId });
    if (!res.ok) {
      onNotify(translateErr(res.data?.error), 'error');
      return;
    }
    await onRefresh();
    onNotify(t.extras.expandTier, 'ok');
  };

  const handleClaimSurprise = async (itemId: string) => {
    const res = await safePost<{ error?: string }>('/api/surprises', { action: 'claim', itemId });
    if (!res.ok) {
      onNotify(translateErr(res.data?.error), 'error');
      return;
    }
    await onRefresh();
    onNotify(t.extras.claimed, 'ok');
  };

  const handleBlock = async (blockedUserId: string) => {
    const res = await safePost<{ error?: string }>('/api/privacy', {
      action: 'block',
      blockedUserId,
      reason: 'User initiated mutual block',
    });
    if (!res.ok) {
      onNotify(translateErr(res.data?.error), 'error');
      return;
    }
    await onRefresh();
    onNotify(t.circles.blockMember, 'ok');
  };

  const handleUnblock = async (blockedUserId: string) => {
    const res = await fetch(`/api/privacy?blockedUserId=${encodeURIComponent(blockedUserId)}`, {
      method: 'DELETE',
    });
    if (res.ok) {
      await onRefresh();
      onNotify(t.circles.unblockMember, 'ok');
    }
  };

  return (
    <div className="space-y-8">
      <h2 className="text-xl font-semibold text-slate-900">{t.circles.title}</h2>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <form onSubmit={handleJoin} className="rounded-xl border border-slate-200 bg-white p-5 space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <KeyRound className="h-4 w-4 text-[#0D6E5B]" aria-hidden="true" />
            <span>{t.circles.joinTitle}</span>
          </div>
          <input
            type="text"
            required
            value={inviteCode}
            onChange={(e) => setInviteCode(e.target.value)}
            placeholder="NORTH-2026 / SOUTH-2026"
            className="font-mono-tabular w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
          />
          <button
            type="submit"
            className="min-h-[44px] w-full rounded-lg bg-[#0D6E5B] px-4 py-2 text-sm font-medium text-white hover:bg-[#095344]"
          >
            {t.circles.joinBtn}
          </button>
        </form>

        <form onSubmit={handleCreate} className="rounded-xl border border-slate-200 bg-white p-5 space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <Plus className="h-4 w-4 text-[#0D6E5B]" aria-hidden="true" />
            <span>{t.circles.createTitle}</span>
          </div>
          <input
            type="text"
            required
            minLength={2}
            value={circleName}
            onChange={(e) => setCircleName(e.target.value)}
            placeholder={t.circles.createTitle}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
          />
          <input
            type="text"
            value={circleDesc}
            onChange={(e) => setCircleDesc(e.target.value)}
            placeholder={t.needs.fieldDesc}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
          />
          <button
            type="submit"
            className="min-h-[44px] w-full rounded-lg border border-slate-300 bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            {t.circles.createBtn}
          </button>
        </form>
      </div>

      {/* Circles Membership List */}
      <div className="space-y-4">
        {circles.map((circle) => (
          <section key={circle.id} className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-base font-semibold text-slate-900">{circle.name}</h3>
                <p className="mt-1 text-xs text-slate-500">
                  <span className="font-mono-tabular">{circle.region_code}</span> ·{' '}
                  <span className="font-mono-tabular">{circle.invite_code}</span> ·{' '}
                  {circle.member_count} {t.circles.membersCount} ·{' '}
                  {t.extras.tierLabel}: <span className="font-semibold text-slate-800">{circle.expansion_tier}</span>
                </p>
              </div>
              <div className="flex items-center gap-3">
                {['owner', 'admin'].includes(circle.member_role) && circle.expansion_tier !== 'global' && (
                  <button
                    type="button"
                    onClick={() => void handleExpandTier(circle.id)}
                    className="inline-flex min-h-[36px] items-center gap-1 rounded-lg border border-slate-300 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>{t.extras.expandTier}</span>
                  </button>
                )}
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#0D6E5B]">
                  <Users className="h-4 w-4" aria-hidden="true" />
                  {circle.member_role}
                </span>
              </div>
            </div>
            {circle.description && <p className="mt-2 text-sm text-slate-600">{circle.description}</p>}

            <div className="mt-4 divide-y divide-slate-100 border-t border-slate-100">
              {circle.members.map((m) => (
                <div key={m.user_id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                  <div className="text-sm text-slate-800">
                    <span className="font-medium">{m.display_name}</span>
                    <span className="ms-2 text-xs text-slate-500">
                      {m.role} · Trust L{m.trust_level} · <span className="font-mono-tabular">{m.region_code}</span>
                    </span>
                  </div>
                  {m.user_id !== user.id && (
                    <button
                      type="button"
                      onClick={() => void handleBlock(m.user_id)}
                      className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-red-200 px-3 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
                    >
                      <Ban className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>{t.circles.blockMember}</span>
                    </button>
                  )}
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>

      {/* In-Kind Community Surprises (City Tier, Zero Money) */}
      {surprises.length > 0 && (
        <section className="rounded-xl border border-slate-200 bg-white p-5 space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <Gift className="h-4 w-4 text-[#0D6E5B]" aria-hidden="true" />
            <span>{t.extras.surprisesTitle}</span>
          </div>
          <div className="divide-y divide-slate-100">
            {surprises.map((s) => (
              <div key={s.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900">{s.title}</p>
                  <p className="text-xs text-slate-500">
                    {s.circle_name} · {s.partner_name} · <span className="font-mono-tabular">{s.quantity_available}</span>
                  </p>
                </div>
                {s.my_claim_status ? (
                  <span className="text-xs font-medium text-[#0D6E5B]">{t.extras.claimed}</span>
                ) : (
                  <button
                    type="button"
                    disabled={s.quantity_available <= 0}
                    onClick={() => void handleClaimSurprise(s.id)}
                    className="min-h-[36px] rounded-lg bg-[#0D6E5B] px-3 py-1 text-xs font-medium text-white hover:bg-[#095344] disabled:opacity-40"
                  >
                    {t.extras.claimItem}
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Mutual Blocks */}
      {blocks.length > 0 && (
        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <h3 className="text-sm font-semibold text-slate-900">{t.circles.blockedTitle}</h3>
          <div className="mt-3 divide-y divide-slate-100">
            {blocks.map((b) => (
              <div key={b.id} className="flex items-center justify-between py-2.5 text-sm">
                <span className="text-slate-700">{b.display_name || b.blocked_id}</span>
                <button
                  type="button"
                  onClick={() => void handleUnblock(b.blocked_id)}
                  className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  <Check className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>{t.circles.unblockMember}</span>
                </button>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
