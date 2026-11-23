import { NextRequest, NextResponse } from 'next/server';
import { handleApiError, requireAuthUserId } from '@/lib/api/http';
import { UpsertCountryConfigSchema } from '@/modules/countries/schema';
import { listCountriesService, upsertCountryConfigService } from '@/modules/countries/service';

export async function GET() {
  return NextResponse.json({ countries: listCountriesService() });
}

export async function POST(req: NextRequest) {
  try {
    const userId = await requireAuthUserId();
    const parsed = UpsertCountryConfigSchema.parse(await req.json());
    const country = upsertCountryConfigService(userId, parsed);
    return NextResponse.json({ country });
  } catch (err) {
    return handleApiError(err);
  }
}
