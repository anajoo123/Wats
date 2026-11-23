'use client';

import * as Switch from '@radix-ui/react-switch';
import { Bell, Download, HeartHandshake, Shield, Trash2 } from 'lucide-react';
import React, { useState } from 'react';
import { formatLocalizedDateTime, type Locale, type Messages } from '@/lib/i18n/messages';
import type { SessionUserDto } from './types';

interface ConsentItem {
  purpose: 'share_need_in_circle' | 'reveal_contact' | 'publish_impact' | 'checkin';
  version: number;
  status: 'granted' | 'revoked';
}

interface ImpactItem {
  id: string;
  category: string;
  approximate_window: string;
  created_at: string;
  circle_name: string;
}

interface NotificationItem {
  id: string;
  type: string;
  title_key: string;
  payload: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
}

interface Props {
  user: SessionUserDto;
  consents: ConsentItem[];
  impactEvents: ImpactItem[];
  notifications: NotificationItem[];
  locale: Locale;
  t: Messages;
  safePost: <T = unknown>(
    url: string,
    payload: unknown
  ) => Promise<{ queued: boolean; ok: boolean; status: number; data?: T }>;
  onRefresh: () => Promise<void>;
  onNotify: (msg: string, tone?: 'ok' | 'error') => void;
}

export function ImpactPrivacyWorkspace({
  user,
  consents,
  impactEvents,
  notifications,
  locale,
  t,
  safePost,
  onRefresh,
  onNotify,
}: Props) {
  const [confirmDelete, setConfirmDelete] = useState('');
  const [immediateAnon, setImmediateAnon] = useState(true);

  const toggleConsent = async (purpose: ConsentItem['purpose'], nextGranted: boolean) => {
    const res = await safePost('/api/privacy', { purpose, granted: nextGranted });
    if (res.ok) {
      await onRefresh();
      onNotify(`${purpose}: ${nextGranted ? 'granted' : 'revoked'}`, 'ok');
    }
  };

  const handleMarkNotificationsRead = async () => {
    await fetch('/api/impact', { method: 'POST' });
    await onRefresh();
  };

  const handleDeleteAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (confirmDelete.trim().toUpperCase() !== 'DELETE') return;
    const res = await fetch('/api/account', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        immediateAnonymize: immediateAnon,
        confirmationText: confirmDelete,
      }),
    });
    if (res.ok) {
      setConfirmDelete('');
      await onRefresh();
      onNotify('Account deactivated & PII scrubbed', 'ok');
    }
  };

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h2 className="text-xl font-semibold text-slate-900">{t.impact.title}</h2>
        <p className="text-sm text-slate-600">{t.impact.privacyNote}</p>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
        {/* Anonymized Impact Thread */}
        <section className="space-y-3 lg:col-span-7">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <HeartHandshake className="h-4 w-4 text-[#0D6E5B]" aria-hidden="true" />
            <span>{t.nav.impact}</span>
          </div>
          <div className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
            {impactEvents.length === 0 ? (
              <p className="p-6 text-sm text-slate-500">
                {locale === 'ar'
                  ? 'لا توجد أحداث أثر منشورة بعد (الافتراضي خاص حتى موافقة جميع الأطراف).'
                  : 'No published impact events yet (private by default until all participants consent).'}
              </p>
            ) : (
              impactEvents.map((ev) => (
                <div key={ev.id} className="p-4">
                  <p className="text-sm font-semibold text-slate-900">
                    {(t.category as Record<string, string>)[ev.category] || ev.category}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {ev.circle_name} · <span className="font-mono-tabular">{ev.approximate_window}</span> ·{' '}
                    <span className="font-mono-tabular">
                      {formatLocalizedDateTime(ev.created_at, locale, user.timezone)}
                    </span>
                  </p>
                </div>
              ))
            )}
          </div>

          {/* Notifications */}
          <div className="pt-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                <Bell className="h-4 w-4 text-[#0D6E5B]" aria-hidden="true" />
                <span>{t.impact.notificationsTitle}</span>
              </div>
              <button
                type="button"
                onClick={() => void handleMarkNotificationsRead()}
                className="min-h-[36px] rounded-lg border border-slate-300 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                {t.impact.markRead}
              </button>
            </div>
            <div className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
              {notifications.length === 0 ? (
                <p className="p-4 text-xs text-slate-500">—</p>
              ) : (
                notifications.map((n) => (
                  <div key={n.id} className="flex items-center justify-between gap-3 p-3.5 text-xs">
                    <div>
                      <p className={n.read_at ? 'text-slate-600' : 'font-semibold text-slate-900'}>
                        {n.type} · {n.title_key}
                      </p>
                      <p className="font-mono-tabular mt-0.5 text-slate-500">
                        {formatLocalizedDateTime(n.created_at, locale, user.timezone)}
                      </p>
                    </div>
                    <span className="text-slate-500">{n.read_at ? 'Read' : 'New'}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>

        {/* Revocable Consents + Export + Account Deletion */}
        <aside className="space-y-6 lg:col-span-5">
          <section className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <Shield className="h-4 w-4 text-[#0D6E5B]" aria-hidden="true" />
              <span>{t.impact.consentsTitle}</span>
            </div>

            <div className="divide-y divide-slate-100">
              {consents.map((c) => {
                const granted = c.status === 'granted';
                return (
                  <div key={c.purpose} className="flex items-center justify-between gap-3 py-3">
                    <div>
                      <p className="text-sm font-medium text-slate-900">{c.purpose}</p>
                      <p className="font-mono-tabular text-xs text-slate-500">
                        v{c.version} · {c.status}
                      </p>
                    </div>
                    <Switch.Root
                      checked={granted}
                      onCheckedChange={(val) => void toggleConsent(c.purpose, val)}
                      aria-label={c.purpose}
                      className="relative h-6 w-11 shrink-0 rounded-full bg-slate-300 transition-colors data-[state=checked]:bg-[#0D6E5B]"
                    >
                      <Switch.Thumb className="block h-5 w-5 translate-x-0.5 rounded-full bg-white shadow-xs transition-transform data-[state=checked]:translate-x-5.5 rtl:-translate-x-0.5 rtl:data-[state=checked]:-translate-x-5.5" />
                    </Switch.Root>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
            <a
              href="/api/account"
              download="awn-my-data-export.json"
              className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50"
            >
              <Download className="h-4 w-4" aria-hidden="true" />
              <span>{t.auth.exportData}</span>
            </a>

            <form onSubmit={handleDeleteAccount} className="border-t border-slate-100 pt-4 space-y-3">
              <div className="flex items-center gap-2 text-xs font-semibold text-red-700">
                <Trash2 className="h-4 w-4" aria-hidden="true" />
                <span>{t.auth.deleteAccount}</span>
              </div>
              <label className="flex items-center gap-2 text-xs text-slate-700">
                <input
                  type="checkbox"
                  checked={immediateAnon}
                  onChange={(e) => setImmediateAnon(e.target.checked)}
                  className="h-4 w-4 accent-red-600"
                />
                <span>{t.auth.deleteImmediate}</span>
              </label>
              <input
                type="text"
                value={confirmDelete}
                onChange={(e) => setConfirmDelete(e.target.value)}
                placeholder={t.auth.confirmDeletePlaceholder}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
              />
              <button
                type="submit"
                disabled={confirmDelete.trim().toUpperCase() !== 'DELETE'}
                className="min-h-[44px] w-full rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-40"
              >
                {t.auth.deleteAccount}
              </button>
            </form>
          </section>
        </aside>
      </div>
    </div>
  );
}
