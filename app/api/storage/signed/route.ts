import { NextRequest, NextResponse } from 'next/server';
import { handleApiError, requireAuthUserId } from '@/lib/api/http';
import { readPrivateImage, verifySignedMediaToken } from '@/lib/security/storage';

export async function GET(req: NextRequest) {
  try {
    const userId = await requireAuthUserId();
    const token = req.nextUrl.searchParams.get('token') || '';
    const storageKey = verifySignedMediaToken(token, userId);
    if (!storageKey) {
      return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
    }
    const file = readPrivateImage(storageKey);
    if (!file) {
      return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
    }
    return new NextResponse(new Uint8Array(file.buffer), {
      status: 200,
      headers: {
        'Content-Type': file.mimeType,
        'Cache-Control': 'private, max-age=300',
      },
    });
  } catch (err) {
    return handleApiError(err);
  }
}
