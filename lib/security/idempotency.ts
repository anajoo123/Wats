import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';

export interface IdempotencyCheckResult {
  hit: boolean;
  response?: NextResponse;
}

export function checkIdempotency(userId: string, route: string, key: string | null): IdempotencyCheckResult {
  if (!key) return { hit: false };
  const db = getDb();
  const row = db
    .prepare(
      `SELECT response_status, response_body, response_hash
       FROM idempotency_keys
       WHERE user_id = ? AND route = ? AND key = ?`
    )
    .get(userId, route, key) as
    | { response_status: number; response_body: string; response_hash: string }
    | undefined;

  if (!row) return { hit: false };

  return {
    hit: true,
    response: NextResponse.json(JSON.parse(row.response_body), {
      status: row.response_status,
      headers: {
        'X-Idempotency-Replayed': 'true',
        'X-Response-Hash': row.response_hash,
      },
    }),
  };
}

export function saveIdempotency(
  userId: string,
  route: string,
  key: string | null,
  status: number,
  body: unknown
): void {
  if (!key) return;
  const db = getDb();
  const serialized = JSON.stringify(body);
  const hash = crypto.createHash('sha256').update(serialized).digest('hex');

  db.prepare(
    `INSERT OR IGNORE INTO idempotency_keys (id, user_id, route, key, response_status, response_body, response_hash)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(crypto.randomUUID(), userId, route, key, status, serialized, hash);
}
