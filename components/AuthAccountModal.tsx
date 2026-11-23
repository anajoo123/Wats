'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { UserPlus, X } from 'lucide-react';
import React, { useState } from 'react';
import type { Messages } from '@/lib/i18n/messages';
import type { CountryConfigDto } from './types';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  countries: CountryConfigDto[];
  t: Messages;
  onAuthenticated: () => void;
}

export function AuthAccountModal({ open, onOpenChange, countries, t, onAuthenticated }: Props) {
  const [mode, setMode] = useState<'register' | 'login'>('register');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [countryCode, setCountryCode] = useState(countries[0]?.country_code || 'SA');
  const [regionCode, setRegionCode] = useState('SA-RUH-N01');
  const [phoneE164, setPhoneE164] = useState('');
  const [preferredChannel, setPreferredChannel] = useState<'in_app' | 'phone' | 'whatsapp'>('in_app');
  const [confirmedMinAge, setConfirmedMinAge] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const selectedCountry = countries.find((c) => c.country_code === countryCode) || countries[0];
  const minAge = selectedCountry?.min_age ?? 18;

  const handleCountryChange = (code: string) => {
    setCountryCode(code);
    setRegionCode(`${code}-CAP-C01`);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const payload =
        mode === 'register'
          ? {
              action: 'register',
              email,
              password,
              displayName,
              countryCode,
              regionCode,
              preferredLocale: selectedCountry?.default_locale || 'ar',
              confirmedMinAge,
              phoneE164: phoneE164 || undefined,
              preferredChannel,
            }
          : {
              action: 'login',
              email,
              password,
            };

      const res = await fetch('/api/auth/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'AUTH_FAILED');
      } else {
        onOpenChange(false);
        onAuthenticated();
      }
    } catch {
      setError('NETWORK_ERROR');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs" />
        <Dialog.Content className="fixed start-1/2 top-1/2 z-50 max-h-[90vh] w-[94vw] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-slate-200 bg-white p-6 shadow-xl rtl:translate-x-1/2">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <Dialog.Title className="flex items-center gap-2 text-base font-semibold text-slate-900">
              <UserPlus className="h-4 w-4 text-[#0D6E5B]" aria-hidden="true" />
              <span>{mode === 'register' ? t.auth.registerTitle : t.auth.loginTitle}</span>
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

          <div className="mt-4 flex gap-1 rounded-lg bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => setMode('register')}
              className={`min-h-[40px] flex-1 rounded-md px-3 text-xs font-medium transition-colors ${
                mode === 'register' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
              }`}
            >
              {t.auth.registerTitle}
            </button>
            <button
              type="button"
              onClick={() => setMode('login')}
              className={`min-h-[40px] flex-1 rounded-md px-3 text-xs font-medium transition-colors ${
                mode === 'login' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
              }`}
            >
              {t.auth.loginTitle}
            </button>
          </div>

          <form onSubmit={handleSubmit} className="mt-4 space-y-3">
            <div>
              <label className="block text-xs font-medium text-slate-700">{t.auth.email}</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700">{t.auth.password}</label>
              <input
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
              />
            </div>

            {mode === 'register' && (
              <>
                <div>
                  <label className="block text-xs font-medium text-slate-700">{t.auth.displayName}</label>
                  <input
                    type="text"
                    required
                    minLength={2}
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700">{t.auth.country}</label>
                    <select
                      value={countryCode}
                      onChange={(e) => handleCountryChange(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                    >
                      {countries.map((c) => (
                        <option key={c.country_code} value={c.country_code}>
                          {c.country_code} (min {c.min_age})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700">{t.auth.regionCode}</label>
                    <input
                      type="text"
                      required
                      value={regionCode}
                      onChange={(e) => setRegionCode(e.target.value.toUpperCase())}
                      placeholder="SA-RUH-N01"
                      className="font-mono-tabular mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700">{t.auth.phone}</label>
                    <input
                      type="text"
                      value={phoneE164}
                      onChange={(e) => setPhoneE164(e.target.value)}
                      placeholder="+966 50 ..."
                      className="font-mono-tabular mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700">{t.auth.channel}</label>
                    <select
                      value={preferredChannel}
                      onChange={(e) => setPreferredChannel(e.target.value as 'in_app' | 'phone' | 'whatsapp')}
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                    >
                      <option value="in_app">In-App</option>
                      <option value="phone">Phone</option>
                      <option value="whatsapp">WhatsApp</option>
                    </select>
                  </div>
                </div>

                <label className="flex items-start gap-2.5 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
                  <input
                    type="checkbox"
                    required
                    checked={confirmedMinAge}
                    onChange={(e) => setConfirmedMinAge(e.target.checked)}
                    className="mt-0.5 h-4 w-4 accent-[#0D6E5B]"
                  />
                  <span>{t.auth.ageDeclaration.replace('{minAge}', String(minAge))}</span>
                </label>
              </>
            )}

            {error && (
              <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="min-h-[44px] w-full rounded-lg bg-[#0D6E5B] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#095344] disabled:opacity-50"
            >
              {mode === 'register' ? t.auth.submitRegister : t.auth.submitLogin}
            </button>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
