import { describe, expect, it } from 'vitest';
import { stripImageMetadata } from '@/lib/security/exif';
import { evaluatePureMatch } from '@/modules/matching/service';

describe('Explainable Matching Fairness & Hard Filters', () => {
  const baseInput = {
    needCategory: 'medical_errand' as const,
    needIsSensitive: true,
    needRegionCode: 'SA-RUH-N01',
    needWindowStart: '2026-11-23T10:00:00.000Z',
    needWindowEnd: '2026-11-23T14:00:00.000Z',
    offerCategory: 'medical_errand' as const,
    offerRegionCode: 'SA-RUH-N01',
    offerAvailableFrom: '2026-11-23T09:00:00.000Z',
    offerAvailableUntil: '2026-11-23T15:00:00.000Z',
    offerCapacityRemaining: 2,
    providerTrustLevel: 2,
    providerApprovedSensitive: false,
    providerOpenTasksCount: 0,
  };

  it('produces identical scores regardless of wealth, donations, or past aid counts', () => {
    const lowStats = evaluatePureMatch({
      ...baseInput,
      donations: 0,
      wealthTier: 1,
      pastAidCount: 0,
    });
    const highStats = evaluatePureMatch({
      ...baseInput,
      donations: 999999,
      wealthTier: 10,
      pastAidCount: 500,
    });

    expect(lowStats.eligible).toBe(true);
    expect(highStats.eligible).toBe(true);
    expect(lowStats.explanation?.total_score).toBe(100);
    expect(highStats.explanation?.total_score).toBe(lowStats.explanation?.total_score);
    expect(lowStats.explanation?.factors_excluded).toEqual(['wealth', 'donations', 'past_aid_count']);
  });

  it('rejects trust level 1 provider without circle admin approval on sensitive categories', () => {
    const res = evaluatePureMatch({
      ...baseInput,
      providerTrustLevel: 1,
      providerApprovedSensitive: false,
    });
    expect(res.eligible).toBe(false);
    expect(res.explanation).toBeNull();
  });

  it('reduces load_balance_score when provider has open active tasks', () => {
    const busy = evaluatePureMatch({
      ...baseInput,
      providerOpenTasksCount: 2,
    });
    expect(busy.eligible).toBe(true);
    expect(busy.explanation?.load_balance_score).toBe(5);
    expect(busy.explanation?.total_score).toBe(90);
  });
});

describe('Binary EXIF & GPS Stripper', () => {
  it('strips APP1 EXIF/GPS segment from JPEG buffer before storage', () => {
    const soi = Buffer.from([0xff, 0xd8]);
    const exifPayload = Buffer.from('Exif\0\0GPS_LAT_24.7136_LNG_46.6753', 'ascii');
    const app1Header = Buffer.alloc(4);
    app1Header.writeUInt16BE(0xffe1, 0);
    app1Header.writeUInt16BE(exifPayload.length + 2, 2);
    const sosAndImage = Buffer.from([0xff, 0xda, 0x00, 0x08, 0x01, 0x02, 0x03, 0xff, 0xd9]);

    const dirtyJpeg = Buffer.concat([soi, app1Header, exifPayload, sosAndImage]);
    const { clean, strippedSegments } = stripImageMetadata(dirtyJpeg, 'image/jpeg');

    expect(strippedSegments).toBe(1);
    expect(clean.toString('ascii')).not.toContain('GPS_LAT');
    expect(clean[0]).toBe(0xff);
    expect(clean[1]).toBe(0xd8);
  });
});
