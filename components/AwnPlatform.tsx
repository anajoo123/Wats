'use client';

import {
  AlertTriangle,
  Globe,
  HeartHandshake,
  ListChecks,
  Plus,
  RefreshCw,
  ShieldCheck,
  UserPlus,
  Users,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { motion } from 'motion/react';
import React, { useCallback, useEffect, useState } from 'react';
import { useOfflineQueue } from '@/hooks/use-offline-queue';
import { MESSAGES_BY_LOCALE, type Locale } from '@/lib/i18n/messages';
import { AuthAccountModal } from './AuthAccountModal';
import { CirclesWorkspace } from './CirclesWorkspace';
import { GovernanceWorkspace } from './GovernanceWorkspace';
import { ImpactPrivacyWorkspace } from './ImpactPrivacyWorkspace';
import { NeedsWorkspace } from './NeedsWorkspace';
import { PWAInstallButton } from './PWAInstallButton';
import { SosWorkspace } from './SosWorkspace';
import type {
  CircleDto,
  CountryConfigDto,
  NeedDto,
  OfferDto,
  SessionUserDto,
  SwitchableUserDto,
} from './types';

type ActiveTab = 'needs' | 'circles' | 'sos' | 'impact' | 'governance';

interface InitialPayload {
  user: SessionUserDto | null;
  switchable_users: SwitchableUserDto[];
  countries: CountryConfigDto[];
}

export function AwnPlatform({ initial }: { initial: InitialPayload }) {
  const [locale, setLocale] = useState<Locale>(initial.user?.preferred_locale || 'ar');
  const [activeTab, setActiveTab] = useState<ActiveTab>('needs');
  const [user, setUser] = useState<SessionUserDto | null>(initial.user);
  const [switchableUsers, setSwitchableUsers] = useState<SwitchableUserDto[]>(initial.switchable_users);
  const [countries, setCountries] = useState<CountryConfigDto[]>(initial.countries);

  const [needs, setNeeds] = useState<NeedDto[]>([]);
  const [offers, setOffers] = useState<OfferDto[]>([]);
  const [circles, setCircles] = useState<CircleDto[]>([]);
  const [consents, setConsents] = useState<
    Array<{ purpose: 'share_need_in_circle' | 'reveal_contact' | 'publish_impact' | 'checkin'; version: number; status: 'granted' | 'revoked' }>
  >([]);
  const [blocks, setBlocks] = useState<
    Array<{ id: string; blocked_id: string; reason: string | null; display_name: string | null }>
  >([]);
  const [impactEvents, setImpactEvents] = useState<
    Array<{ id: string; category: string; approximate_window: string; created_at: string; circle_name: string }>
  >([]);
  const [notifications, setNotifications] = useState<
    Array<{ id: string; type: string; title_key: string; payload: Record<string, unknown>; read_at: string | null; created_at: string }>
  >([]);
  const [governance, setGovernance] = useState<{
    is_moderator: boolean;
    reports: Array<{
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
    }>;
    break_glass_requests: Array<{
      id: string;
      target_type: string;
      target_id: string;
      reason: string;
      expires_at: string;
    }>;
    audit_logs: Array<{
      id: string;
      actor_id: string | null;
      action: string;
      entity_type: string;
      entity_id: string;
      metadata: Record<string, unknown>;
      created_at: string;
    }>;
  }>({ is_moderator: false, reports: [], break_glass_requests: [], audit_logs: [] });

  const [createNeedOpen, setCreateNeedOpen] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [toast, setToast] = useState<{ msg: string; tone: 'ok' | 'error' } | null>(null);
  const [loadingData, setLoadingData] = useState(true);

  const t = MESSAGES_BY_LOCALE[locale];

  const notify = useCallback((msg: string, tone: 'ok' | 'error' = 'ok') => {
    setToast({ msg, tone });
    setTimeout(() => {
      setToast((curr) => (curr?.msg === msg ? null : curr));
    }, 4500);
  }, []);

  const loadWorkspaceData = useCallback(async () => {
    setLoadingData(true);
    try {
      const sessionRes = await fetch('/api/auth/session');
      if (sessionRes.ok) {
        const sData = await sessionRes.json();
        setUser(sData.user);
        setSwitchableUsers(sData.switchable_users || []);
        setCountries(sData.countries || []);

        if (!sData.user) {
          setNeeds([]);
          setOffers([]);
          setCircles([]);
          setLoadingData(false);
          return;
        }
      }

      const [needsRes, offersRes, circlesRes, privacyRes, impactRes, govRes] = await Promise.all([
        fetch('/api/needs'),
        fetch('/api/offers'),
        fetch('/api/circles'),
        fetch('/api/privacy'),
        fetch('/api/impact'),
        fetch('/api/moderation'),
      ]);

      if (needsRes.ok) setNeeds((await needsRes.json()).needs || []);
      if (offersRes.ok) setOffers((await offersRes.json()).offers || []);
      if (circlesRes.ok) setCircles((await circlesRes.json()).circles || []);
      if (privacyRes.ok) {
        const p = await privacyRes.json();
        setConsents(p.consents || []);
        setBlocks(p.blocks || []);
      }
      if (impactRes.ok) {
        const imp = await impactRes.json();
        setImpactEvents(imp.impact_events || []);
        setNotifications(imp.notifications || []);
      }
      if (govRes.ok) {
        setGovernance(await govRes.json());
      }
    } finally {
      setLoadingData(false);
    }
  }, []);

  const {
    effectiveOnline,
    simulatedOffline,
    setSimulatedOffline,
    queuedCount,
    safePost,
    replayQueue,
  } = useOfflineQueue(() => {
    void loadWorkspaceData();
  });

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadWorkspaceData();
    }, 0);
    return () => clearTimeout(timer);
  }, [loadWorkspaceData]);

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = locale === 'ar' ? 'rtl' : 'ltr';
  }, [locale]);

  const handleSwitchUser = async (userId: string) => {
    const res = await fetch('/api/auth/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'switch', userId }),
    });
    if (res.ok) {
      await loadWorkspaceData();
    }
  };

  const navItems: Array<{ id: ActiveTab; label: string; icon: React.ComponentType<{ className?: string }> }> = [
    { id: 'needs', label: t.nav.needs, icon: ListChecks },
    { id: 'circles', label: t.nav.circles, icon: Users },
    { id: 'sos', label: t.nav.sos, icon: AlertTriangle },
    { id: 'impact', label: t.nav.impact, icon: HeartHandshake },
    { id: 'governance', label: t.nav.governance, icon: ShieldCheck },
  ];

  const activeCountry = countries.find((c) => c.country_code === (user?.country_code || 'SA'));

  return (
    <div className="min-h-screen pb-20 md:pb-12">
      {/* Top Bar Contract: Single Row, Exact 3 Zones separated by gap-8 */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur-sm">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-8 px-4 sm:px-6">
          {/* Zone 1: Brand wordmark only */}
          <button
            type="button"
            onClick={() => setActiveTab('needs')}
            className="text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
          >
            {t.brand.name}
          </button>

          {/* Zone 2: 5 clean single-line text nav links */}
          <nav className="hidden md:flex items-center gap-6" aria-label="Primary">
            {navItems.map((item) => {
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  className={`min-h-[40px] border-b-2 px-1 text-sm font-medium transition-colors whitespace-nowrap shrink-0 ${
                    active
                      ? 'border-[#0D6E5B] text-[#0D6E5B]'
                      : 'border-transparent text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>

          {/* Zone 3: 1 primary CTA button */}
          <div className="shrink-0">
            <button
              type="button"
              onClick={() => {
                setActiveTab('needs');
                setCreateNeedOpen(true);
              }}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-[#0D6E5B] px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-[#095344] whitespace-nowrap shrink-0"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              <span>{t.nav.newNeed}</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Container */}
      <main className="mx-auto max-w-7xl px-4 pt-6 sm:px-6 space-y-6">
        {/* Hero Banner */}
        <section className="rounded-xl border border-slate-200 bg-white p-6 sm:p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-2xl space-y-2">
              <p className="text-xs font-medium text-[#0D6E5B]">{t.brand.subtitle}</p>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl [text-wrap:balance]">
                {t.hero.headline}
              </h1>
              <p className="text-sm leading-relaxed text-slate-600">{t.hero.subhead}</p>
            </div>
            <div className="flex flex-wrap items-center gap-3 shrink-0">
              <button
                type="button"
                onClick={() => {
                  setActiveTab('needs');
                  setCreateNeedOpen(true);
                }}
                className="min-h-[44px] rounded-lg bg-[#0D6E5B] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#095344] whitespace-nowrap"
              >
                {t.hero.ctaPrimary}
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('sos')}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-red-300 bg-red-50 px-4 py-2.5 text-sm font-medium text-red-800 hover:bg-red-100 whitespace-nowrap"
              >
                <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                <span>{t.hero.ctaSos}</span>
              </button>
            </div>
          </div>
        </section>

        {/* Workspace Toolbar (Session Switcher, Auth, Locale RTL/LTR, PWA Install, Offline Queue) */}
        <section
          aria-label="Workspace controls"
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3"
        >
          <div className="flex flex-wrap items-center gap-3">
            <label className="text-xs font-medium text-slate-600" htmlFor="session-switcher">
              {t.auth.switchAccount}:
            </label>
            <select
              id="session-switcher"
              value={user?.id || ''}
              onChange={(e) => void handleSwitchUser(e.target.value)}
              className="min-h-[40px] rounded-lg border border-slate-300 bg-white px-3 text-xs font-medium text-slate-900"
            >
              {!user && <option value="">— Signed Out —</option>}
              {switchableUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.display_name} ({u.role} · L{u.trust_level} · {u.region_code})
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => setAuthModalOpen(true)}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
            >
              <UserPlus className="h-4 w-4" aria-hidden="true" />
              <span>{t.auth.registerTitle}</span>
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setSimulatedOffline((v) => !v)}
              className={`inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                effectiveOnline
                  ? 'border-slate-300 text-slate-700 hover:bg-slate-50'
                  : 'border-amber-400 bg-amber-50 text-amber-900'
              }`}
            >
              {effectiveOnline ? <Wifi className="h-4 w-4" aria-hidden="true" /> : <WifiOff className="h-4 w-4" aria-hidden="true" />}
              <span>{effectiveOnline ? t.pwa.simulateOffline : t.pwa.backOnline}</span>
            </button>

            {queuedCount > 0 && (
              <button
                type="button"
                onClick={() => void replayQueue()}
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700 whitespace-nowrap"
              >
                <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{t.pwa.queuedCount.replace('{count}', String(queuedCount))}</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setLocale((prev) => (prev === 'ar' ? 'en' : 'ar'))}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
            >
              <Globe className="h-4 w-4" aria-hidden="true" />
              <span>{locale === 'ar' ? 'English (LTR)' : 'العربية (RTL)'}</span>
            </button>

            <PWAInstallButton t={t} />
          </div>
        </section>

        {/* Offline Banner */}
        {!effectiveOnline && (
          <div
            role="status"
            className="flex items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-xs font-medium text-amber-900"
          >
            <span>{t.pwa.offlineBanner}</span>
            {queuedCount > 0 && (
              <span className="font-mono-tabular">
                {t.pwa.queuedCount.replace('{count}', String(queuedCount))}
              </span>
            )}
          </div>
        )}

        {/* Toast Feedback */}
        {toast && (
          <div
            role="alert"
            className={`rounded-xl border px-4 py-3 text-sm font-medium ${
              toast.tone === 'error'
                ? 'border-red-300 bg-red-50 text-red-900'
                : 'border-emerald-300 bg-emerald-50 text-emerald-900'
            }`}
          >
            {toast.msg}
          </div>
        )}

        {/* Active View Content */}
        {!user ? (
          <div className="rounded-xl border border-slate-200 bg-white p-8 text-center space-y-3">
            <p className="text-base font-semibold text-slate-900">{t.errors.UNAUTHORIZED}</p>
            <button
              type="button"
              onClick={() => setAuthModalOpen(true)}
              className="min-h-[44px] rounded-lg bg-[#0D6E5B] px-5 py-2 text-sm font-medium text-white hover:bg-[#095344]"
            >
              {t.auth.loginTitle}
            </button>
          </div>
        ) : loadingData && needs.length === 0 && circles.length === 0 ? (
          <div className="space-y-4">
            <div className="h-32 animate-pulse rounded-xl border border-slate-200 bg-white" />
            <div className="h-32 animate-pulse rounded-xl border border-slate-200 bg-white" />
          </div>
        ) : (
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
          >
            {activeTab === 'needs' && (
              <NeedsWorkspace
                user={user}
                needs={needs}
                offers={offers}
                circles={circles}
                locale={locale}
                t={t}
                createNeedOpen={createNeedOpen}
                setCreateNeedOpen={setCreateNeedOpen}
                safePost={safePost}
                onRefresh={loadWorkspaceData}
                onNotify={notify}
              />
            )}

            {activeTab === 'circles' && (
              <CirclesWorkspace
                user={user}
                circles={circles}
                blocks={blocks}
                t={t}
                safePost={safePost}
                onRefresh={loadWorkspaceData}
                onNotify={notify}
              />
            )}

            {activeTab === 'sos' && (
              <SosWorkspace
                user={user}
                country={activeCountry}
                circles={circles}
                t={t}
                safePost={safePost}
                onRefresh={loadWorkspaceData}
                onNotify={notify}
              />
            )}

            {activeTab === 'impact' && (
              <ImpactPrivacyWorkspace
                user={user}
                consents={consents}
                impactEvents={impactEvents}
                notifications={notifications}
                locale={locale}
                t={t}
                safePost={safePost}
                onRefresh={loadWorkspaceData}
                onNotify={notify}
              />
            )}

            {activeTab === 'governance' && (
              <GovernanceWorkspace
                user={user}
                isModerator={governance.is_moderator}
                reports={governance.reports}
                breakGlassRequests={governance.break_glass_requests}
                auditLogs={governance.audit_logs}
                locale={locale}
                t={t}
                safePost={safePost}
                onRefresh={loadWorkspaceData}
                onNotify={notify}
              />
            )}
          </motion.div>
        )}
      </main>

      {/* Mobile Bottom Thumb-Zone Navigation (56px height, keeping total sticky <= 13% of mobile viewport) */}
      <nav
        aria-label="Mobile Navigation"
        className="fixed bottom-0 inset-x-0 z-40 grid h-14 grid-cols-5 border-t border-slate-200 bg-white/95 backdrop-blur-md md:hidden"
      >
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveTab(item.id)}
              className={`flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium ${
                active ? 'text-[#0D6E5B]' : 'text-slate-600'
              }`}
            >
              <Icon className="h-5 w-5" aria-hidden="true" />
              <span className="truncate max-w-[64px]">{item.label}</span>
            </button>
          );
        })}
      </nav>

      <AuthAccountModal
        open={authModalOpen}
        onOpenChange={setAuthModalOpen}
        countries={countries}
        t={t}
        onAuthenticated={() => void loadWorkspaceData()}
      />
    </div>
  );
}
