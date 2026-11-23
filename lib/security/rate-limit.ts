import { getDb } from '@/lib/db/client';

export type RateLimitedAction = 'create_need' | 'create_report' | 'join_circle' | 'create_sos';

const ACTION_DAILY_LIMITS: Record<RateLimitedAction, number> = {
  create_need: 5,
  create_report: 20,
  join_circle: 30,
  create_sos: 3,
};

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  limit: number;
}

export function checkAndConsumeRateLimit(
  userId: string,
  ipAddress: string,
  action: RateLimitedAction
): RateLimitResult {
  const db = getDb();
  const limit = ACTION_DAILY_LIMITS[action];
  const dayBucket = new Date().toISOString().slice(0, 10); // UTC YYYY-MM-DD
  const userKey = `u:${userId}:${action}:${dayBucket}`;
  const ipKey = `ip:${ipAddress}:${action}:${dayBucket}`;

  const getCount = (key: string): number => {
    const row = db
      .prepare('SELECT count FROM rate_limits WHERE bucket_key = ?')
      .get(key) as { count: number } | undefined;
    return row ? row.count : 0;
  };

  const userCount = getCount(userKey);
  const ipCount = getCount(ipKey);
  const currentMax = Math.max(userCount, ipCount);

  if (currentMax >= limit) {
    return { allowed: false, remaining: 0, limit };
  }

  const upsert = db.prepare(
    `INSERT INTO rate_limits (bucket_key, count, updated_at)
     VALUES (?, 1, ?)
     ON CONFLICT(bucket_key) DO UPDATE SET count = count + 1, updated_at = excluded.updated_at`
  );
  const nowIso = new Date().toISOString();
  upsert.run(userKey, nowIso);
  upsert.run(ipKey, nowIso);

  return { allowed: true, remaining: Math.max(0, limit - (currentMax + 1)), limit };
}

export function getClientIp(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return headers.get('x-real-ip') || '127.0.0.1';
}
