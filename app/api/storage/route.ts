import { NextRequest, NextResponse } from 'next/server';
import { handleApiError, requireAuthUserId } from '@/lib/api/http';
import { savePrivateImage } from '@/lib/security/storage';

export async function POST(req: NextRequest) {
  try {
    const userId = await requireAuthUserId();
    const formData = await req.formData();
    const file = formData.get('file');
    if (!(file instanceof File)) {
      throw new Error('INVALID_FILE');
    }
    const arrayBuffer = await file.arrayBuffer();
    const result = await savePrivateImage(Buffer.from(arrayBuffer), file.type, userId);
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
