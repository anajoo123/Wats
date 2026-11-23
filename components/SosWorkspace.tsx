'use client';

import { AlertTriangle, PhoneCall, ShieldAlert } from 'lucide-react';
import React, { useState } from 'react';
import type { Messages } from '@/lib/i18n/messages';
import type { CircleDto, CountryConfigDto, SessionUserDto } from './types';

interface Props {
  user: SessionUserDto;
  country: CountryConfigDto | undefined;
  circles: CircleDto[];
  t: Messages;
  safePost: <T = unknown>(
    url: string,
    payload: unknown
  ) => Promise<{ queued: boolean; ok: boolean; status: number; data?: T }>;
  onRefresh: () => Promise<void>;
  onNotify: (msg: string, tone?: 'ok' | 'error') => void;
}

export function SosWorkspace({ user, country, circles, t, safePost, onRefresh, onNotify }: Props) {
  const [ackOfficial, setAckOfficial] = useState(false);
  const [circleId, setCircleId] = useState(circles[0]?.id || '');
  const [sosType, setSosType] = useState<'medical_errand' | 'elderly_care' | 'transport' | 'sos_support'>('sos_support');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [resultCount, setResultCount] = useState<number | null>(null);

  const emergency = country?.emergency_numbers || {
    police: '999',
    ambulance: '997',
    fire: '998',
    unified: '911',
  };

  const handleSubmitSos = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ackOfficial) return;
    const targetCircle = circleId || circles[0]?.id;
    if (!targetCircle) {
      onNotify('Join a circle first', 'error');
      return;
    }

    const res = await safePost<{ notified_authorized_count?: number; error?: string }>('/api/sos', {
      circleId: targetCircle,
      sosType,
      urgency: 'sos',
      title,
      description,
      regionCode: user.region_code,
      acknowledgedOfficialEmergencyScreen: true,
    });

    if (!res.ok) {
      onNotify(
        (t.errors as Record<string, string>)[res.data?.error || ''] || res.data?.error || 'SOS_FAILED',
        'error'
      );
      return;
    }

    setResultCount(res.data?.notified_authorized_count ?? 0);
    setTitle('');
    setDescription('');
    await onRefresh();
    onNotify(t.sos.sendSos, 'ok');
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <ShieldAlert className="h-5 w-5 text-red-600" aria-hidden="true" />
        <h2 className="text-xl font-semibold text-slate-900">{t.sos.title}</h2>
      </div>

      {/* Step 1 Mandatory Official Emergency Screen */}
      <section className="rounded-xl border border-red-200 bg-red-50/70 p-5">
        <div className="flex items-start gap-3">
          <PhoneCall className="mt-0.5 h-5 w-5 shrink-0 text-red-700" aria-hidden="true" />
          <div className="space-y-3">
            <h3 className="text-base font-semibold text-red-900">{t.sos.mandatoryNoticeTitle}</h3>
            <p className="text-sm leading-relaxed text-red-900">{t.sos.mandatoryNoticeBody}</p>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-lg border border-red-200 bg-white p-3">
                <p className="text-xs text-slate-500">{t.sos.unified}</p>
                <p className="font-mono-tabular mt-1 text-lg font-bold text-red-700" dir="ltr">
                  {emergency.unified}
                </p>
              </div>
              <div className="rounded-lg border border-red-200 bg-white p-3">
                <p className="text-xs text-slate-500">{t.sos.ambulance}</p>
                <p className="font-mono-tabular mt-1 text-lg font-bold text-red-700" dir="ltr">
                  {emergency.ambulance}
                </p>
              </div>
              <div className="rounded-lg border border-red-200 bg-white p-3">
                <p className="text-xs text-slate-500">{t.sos.police}</p>
                <p className="font-mono-tabular mt-1 text-lg font-bold text-red-700" dir="ltr">
                  {emergency.police}
                </p>
              </div>
              <div className="rounded-lg border border-red-200 bg-white p-3">
                <p className="text-xs text-slate-500">{t.sos.fire}</p>
                <p className="font-mono-tabular mt-1 text-lg font-bold text-red-700" dir="ltr">
                  {emergency.fire}
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Step 2 Mandatory Acknowledgement + Authorized Circle Alert Form */}
      <form onSubmit={handleSubmitSos} className="rounded-xl border border-slate-200 bg-white p-6 space-y-4">
        <label className="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3.5 text-sm text-slate-800">
          <input
            type="checkbox"
            checked={ackOfficial}
            onChange={(e) => setAckOfficial(e.target.checked)}
            className="mt-1 h-4 w-4 accent-red-600"
          />
          <span>{t.sos.ackCheckbox}</span>
        </label>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-medium text-slate-700">{t.needs.fieldCircle}</label>
            <select
              value={circleId || circles[0]?.id || ''}
              onChange={(e) => setCircleId(e.target.value)}
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
            <label className="block text-xs font-medium text-slate-700">{t.needs.fieldCategory}</label>
            <select
              value={sosType}
              onChange={(e) =>
                setSosType(e.target.value as 'medical_errand' | 'elderly_care' | 'transport' | 'sos_support')
              }
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
            >
              <option value="sos_support">{t.category.sos_support}</option>
              <option value="medical_errand">{t.category.medical_errand}</option>
              <option value="elderly_care">{t.category.elderly_care}</option>
              <option value="transport">{t.category.transport}</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-700">{t.needs.fieldTitle}</label>
          <input
            type="text"
            required
            minLength={4}
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

        <button
          type="submit"
          disabled={!ackOfficial}
          className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <AlertTriangle className="h-4 w-4" aria-hidden="true" />
          <span>{t.sos.sendSos}</span>
        </button>

        {resultCount !== null && (
          <p className="text-xs font-medium text-[#0D6E5B]">
            Notified {resultCount} authorized circle responder(s) (Trust L2+ / Coordinators).
          </p>
        )}
      </form>
    </div>
  );
}
