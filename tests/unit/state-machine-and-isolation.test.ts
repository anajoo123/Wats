import { beforeAll, describe, expect, it } from 'vitest';

process.env.TEST_DB_MEMORY = '1';

import { getDb } from '@/lib/db/client';
import { checkIdempotency, saveIdempotency } from '@/lib/security/idempotency';
import { getUserByIdRepo } from '@/modules/auth/repo';
import { deactivateAccountService } from '@/modules/auth/service';
import { generateMatchesForNeedService, respondToMatchService } from '@/modules/matching/service';
import {
  inspectPrivateNeedWithBreakGlassService,
  requestBreakGlassService,
} from '@/modules/moderation/service';
import { createNeedService, listVisibleNeedsService, transitionNeedService } from '@/modules/needs/service';
import {
  blockUserService,
  getContactRevealService,
  unblockUserService,
  updateConsentService,
  updateContactRevealConsentService,
} from '@/modules/privacy/service';

const AHMED = '11111111-1111-1111-1111-111111111111';
const SARA = '22222222-2222-2222-2222-222222222222';
const KHALED = '33333333-3333-3333-3333-333333333333';
const NOURA_MOD = '44444444-4444-4444-4444-444444444444';
const NORTH_CIRCLE = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

describe('Mandatory Security, Isolation, State Machine, and Privacy Acceptance Criteria', () => {
  beforeAll(() => {
    getDb();
  });

  it('outsider sees ZERO needs from North Circle', () => {
    const khaledNeeds = listVisibleNeedsService(KHALED);
    const northNeeds = khaledNeeds.filter((n) => n.circle_ids.includes(NORTH_CIRCLE));
    expect(northNeeds.length).toBe(0);
  });

  it('blocks direct SQL status update on needs table via DB trigger', () => {
    const db = getDb();
    expect(() => {
      db.prepare(`UPDATE needs SET status = 'completed' WHERE id = 'need-demo-1'`).run();
    }).toThrow(/Direct status update forbidden/);
  });

  it('completes full Scenario A cycle and enforces requester-only completion + dual contact reveal', () => {
    const now = new Date();
    const end = new Date(now.getTime() + 4 * 3600_000);

    // Enable impact consent for both Ahmed and Sara
    updateConsentService(AHMED, 'publish_impact', true);
    updateConsentService(SARA, 'publish_impact', true);

    const need = createNeedService(AHMED, {
      title: 'Scenario A Groceries Need',
      description: 'Need weekly groceries delivered within North cell',
      category: 'groceries',
      urgency: 'normal',
      circleIds: [NORTH_CIRCLE],
      regionCode: 'SA-RUH-N01',
      timeWindowStart: now.toISOString(),
      timeWindowEnd: end.toISOString(),
      publishImmediately: true,
    });

    expect(need.status).toBe('published');

    // Explainable matching
    const matches = generateMatchesForNeedService(need.id, AHMED);
    expect(matches.length).toBeGreaterThan(0);
    const saraMatch = matches.find((m: any) => m.provider_id === SARA) as any;
    expect(saraMatch).toBeDefined();

    // Dual acceptance required
    const r1 = respondToMatchService(saraMatch.id, AHMED, 'accept');
    expect(r1.need_status).toBe('matched');
    const r2 = respondToMatchService(saraMatch.id, SARA, 'accept');
    expect(r2.need_status).toBe('accepted');

    // Contact hidden before dual reveal consent
    const beforeReveal = getContactRevealService(need.id, AHMED);
    expect(beforeReveal?.contact).toBeNull();

    updateContactRevealConsentService(need.id, AHMED, true);
    const partialReveal = getContactRevealService(need.id, AHMED);
    expect(partialReveal?.contact).toBeNull();

    const dualReveal = updateContactRevealConsentService(need.id, SARA, true);
    expect(dualReveal.reveal.revealed).toBe(true);
    expect(dualReveal.contact?.phone_e164).toBeTruthy();

    // Provider starts in_progress
    const started = transitionNeedService(need.id, 'in_progress', SARA);
    expect(started.status).toBe('in_progress');

    // CRITICAL: Provider CANNOT mark completed
    expect(() => transitionNeedService(need.id, 'completed', SARA)).toThrow(/ONLY_REQUESTER_CAN_COMPLETE/);

    // Requester CAN mark completed
    const completed = transitionNeedService(need.id, 'completed', AHMED);
    expect(completed.status).toBe('completed');
  });

  it('enforces Idempotency-Key deduplication on duplicate POST', () => {
    const key = 'idem-test-key-001';
    expect(checkIdempotency(AHMED, '/api/needs', key).hit).toBe(false);
    saveIdempotency(AHMED, '/api/needs', key, 201, { need: { id: 'n-1' } });
    const second = checkIdempotency(AHMED, '/api/needs', key);
    expect(second.hit).toBe(true);
  });

  it('enforces mutual invisibility when users block each other', () => {
    blockUserService(AHMED, SARA, 'test block');
    const saraVisible = listVisibleNeedsService(SARA);
    expect(saraVisible.some((n) => n.requester_id === AHMED)).toBe(false);
    unblockUserService(AHMED, SARA);
  });

  it('blocks moderator from reading private need without logged Break-Glass request', () => {
    expect(() => inspectPrivateNeedWithBreakGlassService(NOURA_MOD, 'need-demo-1')).toThrow(
      /BREAK_GLASS_REQUIRED/
    );

    requestBreakGlassService(NOURA_MOD, {
      targetType: 'need',
      targetId: 'need-demo-1',
      reason: 'Safety verification ticket #4412',
      durationMinutes: 30,
    });

    const inspected = inspectPrivateNeedWithBreakGlassService(NOURA_MOD, 'need-demo-1');
    expect(inspected.id).toBe('need-demo-1');
  });

  it('scrubs PII on account deletion while keeping anonymized integrity', () => {
    const db = getDb();
    // Create disposable user
    const tempId = '99999999-9999-9999-9999-999999999999';
    const nowIso = new Date().toISOString();
    db.prepare(
      `INSERT INTO users (id, email, role, country_code, age_confirmed_at, age_confirmed_min) VALUES (?, 'temp@awn.community', 'member', 'SA', ?, 18)`
    ).run(tempId, nowIso);
    db.prepare(
      `INSERT INTO profiles (user_id, display_name, region_code, preferred_locale) VALUES (?, 'Temp User', 'SA-RUH-N01', 'ar')`
    ).run(tempId);
    db.prepare(
      `INSERT INTO private_contacts (user_id, phone_e164) VALUES (?, '+966509999999')`
    ).run(tempId);

    const res = deactivateAccountService(tempId, true);
    expect(res.anonymized).toBe(true);

    const scrubbedUser = getUserByIdRepo(tempId);
    expect(scrubbedUser?.email).toBeNull();
    expect(scrubbedUser?.display_name).toBe('Anonymized Member');
    const contact = db
      .prepare('SELECT phone_e164 FROM private_contacts WHERE user_id = ?')
      .get(tempId) as { phone_e164: string | null };
    expect(contact.phone_e164).toBeNull();
  });
});
