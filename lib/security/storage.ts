import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { stripImageMetadata } from './exif';

const MAX_UPLOAD_BYTES = 2 * 1024 * 1024; // 2 MB strict limit
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png']);

function getUploadDir(): string {
  const base = process.env.DATA_DIR || '.data';
  const dir = path.resolve(process.cwd(), base, 'uploads');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function getSigningKey(): string {
  const secret = process.env.SESSION_SECRET || process.cwd();
  return crypto.createHash('sha256').update(`awn-storage:${secret}`).digest('hex');
}

export async function savePrivateImage(
  fileBuffer: Buffer,
  mimeType: string,
  ownerId: string
): Promise<{ storageKey: string; strippedSegments: number; bytes: number }> {
  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    throw new Error('UNSUPPORTED_MEDIA_TYPE');
  }
  if (fileBuffer.length > MAX_UPLOAD_BYTES) {
    throw new Error('PAYLOAD_TOO_LARGE');
  }

  const { clean, strippedSegments } = stripImageMetadata(fileBuffer, mimeType);
  const ext = mimeType === 'image/png' ? 'png' : 'jpg';
  const fileId = crypto.randomUUID();
  const storageKey = `${ownerId}_${fileId}.${ext}`;
  const fullPath = path.join(getUploadDir(), storageKey);
  fs.writeFileSync(fullPath, clean);

  return { storageKey, strippedSegments, bytes: clean.length };
}

export function readPrivateImage(storageKey: string): { buffer: Buffer; mimeType: string } | null {
  if (!/^[a-zA-Z0-9_-]+\.(jpg|png)$/.test(storageKey)) return null;
  const fullPath = path.join(getUploadDir(), storageKey);
  if (!fs.existsSync(fullPath)) return null;
  const buffer = fs.readFileSync(fullPath);
  const mimeType = storageKey.endsWith('.png') ? 'image/png' : 'image/jpeg';
  return { buffer, mimeType };
}

export function createSignedMediaToken(storageKey: string, viewerId: string, ttlSeconds = 300): string {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const payload = Buffer.from(JSON.stringify({ k: storageKey, u: viewerId, exp }), 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', getSigningKey()).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

export function verifySignedMediaToken(token: string, viewerId: string): string | null {
  if (!token || !token.includes('.')) return null;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  const expected = crypto.createHmac('sha256', getSigningKey()).update(payload).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      k: string;
      u: string;
      exp: number;
    };
    if (data.u !== viewerId || data.exp < Math.floor(Date.now() / 1000)) return null;
    return data.k;
  } catch {
    return null;
  }
}
