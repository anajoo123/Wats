import { NextResponse } from 'next/server';
import { listCountriesService } from '@/modules/countries/service';

export async function GET() {
  return NextResponse.json({ countries: listCountriesService() });
}
