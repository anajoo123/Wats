'use client';

import { useCallback, useEffect, useState } from 'react';

export interface QueuedMutation {
  id: string;
  url: string;
  method: 'POST';
  body: string;
  idempotencyKey: string;
  createdAt: string;
}

const STORAGE_KEY = 'awn_offline_mutation_queue_v1';

function readQueue(): QueuedMutation[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as QueuedMutation[]) : [];
  } catch {
    return [];
  }
}

function writeQueue(items: QueuedMutation[]): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

export function useOfflineQueue(onReplayed?: () => void) {
  const [isOnline, setIsOnline] = useState(true);
  const [simulatedOffline, setSimulatedOffline] = useState(false);
  const [queue, setQueue] = useState<QueuedMutation[]>([]);

  const replayQueue = useCallback(async () => {
    const current = readQueue();
    if (current.length === 0) return { replayed: 0 };

    const remaining: QueuedMutation[] = [];
    let replayed = 0;

    for (const item of current) {
      try {
        const res = await fetch(item.url, {
          method: item.method,
          headers: {
            'Content-Type': 'application/json',
            'Idempotency-Key': item.idempotencyKey,
          },
          body: item.body,
        });
        if (res.ok || res.status < 500) {
          replayed += 1;
        } else {
          remaining.push(item);
        }
      } catch {
        remaining.push(item);
      }
    }

    writeQueue(remaining);
    setQueue(remaining);
    if (replayed > 0 && onReplayed) {
      onReplayed();
    }
    return { replayed };
  }, [onReplayed]);

  useEffect(() => {
    queueMicrotask(() => {
      setIsOnline(navigator.onLine);
      setQueue(readQueue());
    });

    const handleOnline = () => {
      setIsOnline(true);
      if (!simulatedOffline) {
        void replayQueue();
      }
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [replayQueue, simulatedOffline]);

  const effectiveOnline = isOnline && !simulatedOffline;

  const safePost = useCallback(
    async <T = unknown>(
      url: string,
      payload: unknown,
      existingKey?: string
    ): Promise<{ queued: boolean; ok: boolean; status: number; data?: T }> => {
      const idempotencyKey = existingKey || crypto.randomUUID();
      const body = JSON.stringify(payload);

      if (!effectiveOnline) {
        const nextItem: QueuedMutation = {
          id: idempotencyKey,
          url,
          method: 'POST',
          body,
          idempotencyKey,
          createdAt: new Date().toISOString(),
        };
        const updated = [...readQueue(), nextItem];
        writeQueue(updated);
        setQueue(updated);
        return { queued: true, ok: true, status: 202 };
      }

      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Idempotency-Key': idempotencyKey,
          },
          body,
        });
        const data = (await res.json().catch(() => ({}))) as T;
        return { queued: false, ok: res.ok, status: res.status, data };
      } catch {
        const nextItem: QueuedMutation = {
          id: idempotencyKey,
          url,
          method: 'POST',
          body,
          idempotencyKey,
          createdAt: new Date().toISOString(),
        };
        const updated = [...readQueue(), nextItem];
        writeQueue(updated);
        setQueue(updated);
        return { queued: true, ok: true, status: 202 };
      }
    },
    [effectiveOnline]
  );

  const toggleSimulatedOffline = useCallback(
    (updater: (prev: boolean) => boolean) => {
      setSimulatedOffline((prev) => {
        const next = updater(prev);
        if (!next && navigator.onLine) {
          queueMicrotask(() => {
            void replayQueue();
          });
        }
        return next;
      });
    },
    [replayQueue]
  );

  return {
    effectiveOnline,
    simulatedOffline,
    setSimulatedOffline: toggleSimulatedOffline,
    queuedCount: queue.length,
    safePost,
    replayQueue,
  };
}
