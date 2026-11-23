'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { Download, Smartphone, X } from 'lucide-react';
import React, { useState } from 'react';
import { usePWAInstall } from '@/hooks/use-pwa-install';
import type { Messages } from '@/lib/i18n/messages';

export function PWAInstallButton({ t }: { t: Messages }) {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) return null;

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={() => void install()}
        className="inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-[#0D6E5B] px-3 py-1.5 text-xs font-medium text-[#0D6E5B] transition-colors hover:bg-[#0D6E5B]/5 whitespace-nowrap shrink-0"
      >
        <Download className="h-4 w-4" aria-hidden="true" />
        <span>{t.pwa.install}</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <Dialog.Root open={showIOSGuide} onOpenChange={setShowIOSGuide}>
        <Dialog.Trigger asChild>
          <button
            type="button"
            className="inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100 whitespace-nowrap shrink-0"
          >
            <Smartphone className="h-4 w-4" aria-hidden="true" />
            <span>{t.pwa.install}</span>
          </button>
        </Dialog.Trigger>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs" />
          <Dialog.Content className="fixed start-1/2 top-1/2 z-50 w-[92vw] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-xl border border-slate-200 bg-white p-6 shadow-xl rtl:translate-x-1/2">
            <div className="flex items-center justify-between">
              <Dialog.Title className="text-base font-semibold text-slate-900">
                {t.pwa.iosGuideTitle}
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
            <Dialog.Description className="mt-3 text-sm leading-relaxed text-slate-600">
              {t.pwa.iosGuideBody}
            </Dialog.Description>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    );
  }

  return null;
}
