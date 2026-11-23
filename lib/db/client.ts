import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { hashPassword } from '@/lib/security/session';

const globalForDb = globalThis as unknown as {
  __awnDb?: DatabaseSync;
};

function getDbPath(): string {
  const dir = path.resolve(process.cwd(), process.env.DATA_DIR || '.data');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return path.join(dir, 'awn.db');
}

export function getDb(): DatabaseSync {
  if (globalForDb.__awnDb) {
    return globalForDb.__awnDb;
  }

  const dbPath =
    process.env.VITEST === 'true' || process.env.TEST_DB_MEMORY === '1'
      ? ':memory:'
      : getDbPath();

  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA journal_mode = WAL;');

  initializeSchema(db);
  seedIfEmpty(db);

  globalForDb.__awnDb = db;
  return db;
}

export function resetTestDb(db: DatabaseSync): void {
  initializeSchema(db);
  seedIfEmpty(db);
}

function initializeSchema(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS country_config (
      country_code TEXT PRIMARY KEY CHECK (length(country_code) = 2),
      default_locale TEXT NOT NULL CHECK (default_locale IN ('ar', 'en')),
      emergency_numbers TEXT NOT NULL,
      sos_enabled INTEGER NOT NULL DEFAULT 1,
      financial_features_enabled INTEGER NOT NULL DEFAULT 0,
      data_retention_days INTEGER NOT NULL DEFAULT 365 CHECK (data_retention_days >= 30),
      min_age INTEGER NOT NULL DEFAULT 18 CHECK (min_age >= 13 AND min_age <= 25),
      legal_review_status TEXT NOT NULL DEFAULT 'pending' CHECK (legal_review_status IN ('pending', 'approved', 'restricted')),
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE,
      password_hash TEXT,
      role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('member', 'moderator', 'admin', 'partner')),
      country_code TEXT NOT NULL REFERENCES country_config(country_code) ON DELETE RESTRICT,
      timezone TEXT NOT NULL DEFAULT 'Asia/Riyadh',
      age_confirmed_at TEXT NOT NULL,
      age_confirmed_min INTEGER NOT NULL CHECK (age_confirmed_min >= 13),
      trust_level INTEGER NOT NULL DEFAULT 1 CHECK (trust_level BETWEEN 1 AND 4),
      deactivated_at TEXT,
      scheduled_anonymize_at TEXT,
      anonymized_at TEXT,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );
    CREATE INDEX IF NOT EXISTS idx_users_country ON users(country_code);
    CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

    CREATE TABLE IF NOT EXISTS profiles (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      display_name TEXT NOT NULL CHECK (length(display_name) BETWEEN 2 AND 80),
      avatar_path TEXT,
      region_code TEXT NOT NULL,
      preferred_locale TEXT NOT NULL DEFAULT 'ar' CHECK (preferred_locale IN ('ar', 'en')),
      bio_short TEXT,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );
    CREATE INDEX IF NOT EXISTS idx_profiles_region ON profiles(region_code);

    CREATE TABLE IF NOT EXISTS private_contacts (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      phone_e164 TEXT,
      preferred_channel TEXT NOT NULL DEFAULT 'in_app' CHECK (preferred_channel IN ('in_app', 'phone', 'whatsapp')),
      emergency_note TEXT,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );

    CREATE TABLE IF NOT EXISTS circles (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL CHECK (length(name) BETWEEN 2 AND 100),
      description TEXT,
      country_code TEXT NOT NULL REFERENCES country_config(country_code) ON DELETE RESTRICT,
      region_code TEXT NOT NULL,
      invite_code TEXT UNIQUE NOT NULL,
      expansion_tier TEXT NOT NULL DEFAULT 'trust' CHECK (expansion_tier IN ('trust', 'neighborhood', 'city', 'country', 'global')),
      created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );
    CREATE INDEX IF NOT EXISTS idx_circles_region ON circles(region_code);

    CREATE TABLE IF NOT EXISTS circle_members (
      id TEXT PRIMARY KEY,
      circle_id TEXT NOT NULL REFERENCES circles(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'coordinator', 'member')),
      approved_sensitive INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('pending', 'active', 'removed')),
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      UNIQUE(circle_id, user_id)
    );
    CREATE INDEX IF NOT EXISTS idx_circle_members_user ON circle_members(user_id, status);
    CREATE INDEX IF NOT EXISTS idx_circle_members_circle ON circle_members(circle_id, status);

    CREATE TABLE IF NOT EXISTS needs (
      id TEXT PRIMARY KEY,
      requester_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL CHECK (length(title) BETWEEN 3 AND 120),
      description TEXT NOT NULL CHECK (length(description) BETWEEN 5 AND 1500),
      category TEXT NOT NULL CHECK (category IN ('groceries','transport','medical_errand','elderly_care','tech_help','childcare_support','home_repair','sos_support')),
      urgency TEXT NOT NULL DEFAULT 'normal' CHECK (urgency IN ('low','normal','high','sos')),
      status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','matched','accepted','in_progress','completed','cancelled','expired','under_review')),
      is_sensitive INTEGER NOT NULL DEFAULT 0,
      region_code TEXT NOT NULL,
      time_window_start TEXT NOT NULL,
      time_window_end TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      attachment_path TEXT,
      is_sos INTEGER NOT NULL DEFAULT 0,
      sos_official_ack_at TEXT,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      CHECK (time_window_end >= time_window_start)
    );
    CREATE INDEX IF NOT EXISTS idx_needs_status ON needs(status);
    CREATE INDEX IF NOT EXISTS idx_needs_requester ON needs(requester_id);
    CREATE INDEX IF NOT EXISTS idx_needs_region ON needs(region_code);
    CREATE INDEX IF NOT EXISTS idx_needs_category ON needs(category);

    CREATE TABLE IF NOT EXISTS need_circles (
      need_id TEXT NOT NULL REFERENCES needs(id) ON DELETE CASCADE,
      circle_id TEXT NOT NULL REFERENCES circles(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      PRIMARY KEY (need_id, circle_id)
    );
    CREATE INDEX IF NOT EXISTS idx_need_circles_circle ON need_circles(circle_id);

    CREATE TABLE IF NOT EXISTS offers (
      id TEXT PRIMARY KEY,
      provider_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      circle_id TEXT NOT NULL REFERENCES circles(id) ON DELETE CASCADE,
      category TEXT NOT NULL CHECK (category IN ('groceries','transport','medical_errand','elderly_care','tech_help','childcare_support','home_repair','sos_support')),
      title TEXT NOT NULL CHECK (length(title) BETWEEN 3 AND 120),
      description TEXT,
      region_code TEXT NOT NULL,
      available_from TEXT NOT NULL,
      available_until TEXT NOT NULL,
      capacity_total INTEGER NOT NULL DEFAULT 2 CHECK (capacity_total BETWEEN 1 AND 20),
      capacity_remaining INTEGER NOT NULL DEFAULT 2 CHECK (capacity_remaining >= 0 AND capacity_remaining <= capacity_total),
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      CHECK (available_until >= available_from)
    );
    CREATE INDEX IF NOT EXISTS idx_offers_provider ON offers(provider_id);
    CREATE INDEX IF NOT EXISTS idx_offers_circle_cat ON offers(circle_id, category, is_active);

    CREATE TABLE IF NOT EXISTS assistance_matches (
      id TEXT PRIMARY KEY,
      need_id TEXT NOT NULL REFERENCES needs(id) ON DELETE CASCADE,
      offer_id TEXT NOT NULL REFERENCES offers(id) ON DELETE CASCADE,
      provider_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      score INTEGER NOT NULL CHECK (score BETWEEN 0 AND 100),
      explanation TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'suggested' CHECK (status IN ('suggested','accepted_by_requester','accepted_by_provider','accepted_both','declined','withdrawn')),
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      UNIQUE(need_id, offer_id)
    );
    CREATE INDEX IF NOT EXISTS idx_matches_need ON assistance_matches(need_id, status);
    CREATE INDEX IF NOT EXISTS idx_matches_provider ON assistance_matches(provider_id, status);

    CREATE TABLE IF NOT EXISTS assistance_sessions (
      id TEXT PRIMARY KEY,
      need_id TEXT NOT NULL UNIQUE REFERENCES needs(id) ON DELETE CASCADE,
      match_id TEXT NOT NULL REFERENCES assistance_matches(id) ON DELETE RESTRICT,
      requester_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      provider_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      started_at TEXT,
      completed_at TEXT,
      checkin_status TEXT NOT NULL DEFAULT 'pending' CHECK (checkin_status IN ('pending', 'safe', 'needs_followup')),
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );

    CREATE TABLE IF NOT EXISTS contact_reveals (
      id TEXT PRIMARY KEY,
      need_id TEXT NOT NULL UNIQUE REFERENCES needs(id) ON DELETE CASCADE,
      requester_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      provider_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      consent_requester INTEGER NOT NULL DEFAULT 0,
      consent_provider INTEGER NOT NULL DEFAULT 0,
      revealed_at TEXT,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );

    CREATE TABLE IF NOT EXISTS consents (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      purpose TEXT NOT NULL CHECK (purpose IN ('share_need_in_circle','reveal_contact','publish_impact','checkin')),
      version INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'revoked' CHECK (status IN ('granted','revoked')),
      granted_at TEXT,
      revoked_at TEXT,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      UNIQUE(user_id, purpose)
    );

    CREATE TABLE IF NOT EXISTS blocks (
      id TEXT PRIMARY KEY,
      blocker_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      blocked_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      reason TEXT,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      CHECK (blocker_id <> blocked_id),
      UNIQUE(blocker_id, blocked_id)
    );
    CREATE INDEX IF NOT EXISTS idx_blocks_pair ON blocks(blocker_id, blocked_id);

    CREATE TABLE IF NOT EXISTS impact_events (
      id TEXT PRIMARY KEY,
      need_id TEXT NOT NULL UNIQUE REFERENCES needs(id) ON DELETE CASCADE,
      circle_id TEXT NOT NULL REFERENCES circles(id) ON DELETE CASCADE,
      category TEXT NOT NULL,
      approximate_window TEXT NOT NULL,
      consent_status TEXT NOT NULL DEFAULT 'revoked' CHECK (consent_status IN ('granted','revoked')),
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );
    CREATE INDEX IF NOT EXISTS idx_impact_circle_consent ON impact_events(circle_id, consent_status);

    CREATE TABLE IF NOT EXISTS surprise_items (
      id TEXT PRIMARY KEY,
      circle_id TEXT NOT NULL REFERENCES circles(id) ON DELETE CASCADE,
      partner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      description TEXT,
      quantity_available INTEGER NOT NULL CHECK (quantity_available >= 0),
      region_code TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );

    CREATE TABLE IF NOT EXISTS surprise_claims (
      id TEXT PRIMARY KEY,
      item_id TEXT NOT NULL REFERENCES surprise_items(id) ON DELETE CASCADE,
      recipient_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved', 'collected', 'cancelled')),
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      UNIQUE(item_id, recipient_id)
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      title_key TEXT NOT NULL,
      payload TEXT NOT NULL DEFAULT '{}',
      read_at TEXT,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );
    CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, read_at);

    CREATE TABLE IF NOT EXISTS reports (
      id TEXT PRIMARY KEY,
      reporter_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      target_type TEXT NOT NULL CHECK (target_type IN ('need', 'offer', 'user', 'circle')),
      target_id TEXT NOT NULL,
      reason_code TEXT NOT NULL,
      details TEXT,
      content_snapshot TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'reviewing', 'actioned', 'dismissed')),
      resolution_note TEXT,
      appeal_note TEXT,
      appealed_at TEXT,
      reviewed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );

    CREATE TABLE IF NOT EXISTS admin_access_requests (
      id TEXT PRIMARY KEY,
      admin_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      target_type TEXT NOT NULL,
      target_id TEXT NOT NULL,
      reason TEXT NOT NULL CHECK (length(reason) >= 10),
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      actor_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      metadata TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );
    CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_logs(entity_type, entity_id);

    CREATE TABLE IF NOT EXISTS idempotency_keys (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      route TEXT NOT NULL,
      key TEXT NOT NULL,
      response_status INTEGER NOT NULL,
      response_body TEXT NOT NULL,
      response_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      UNIQUE(user_id, route, key)
    );

    CREATE TABLE IF NOT EXISTS rate_limits (
      bucket_key TEXT PRIMARY KEY,
      count INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS _need_transition_guard (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      allow_flag INTEGER NOT NULL DEFAULT 0
    );
    INSERT OR IGNORE INTO _need_transition_guard (id, allow_flag) VALUES (1, 0);

    -- Enforce state machine guard: direct status updates without transitionNeed() fail
    CREATE TRIGGER IF NOT EXISTS trg_block_direct_need_status
    BEFORE UPDATE OF status ON needs
    FOR EACH ROW
    WHEN NEW.status <> OLD.status
      AND (SELECT allow_flag FROM _need_transition_guard WHERE id = 1) <> 1
    BEGIN
      SELECT RAISE(ABORT, 'Direct status update forbidden. Use transition_need().');
    END;

    -- Immutable audit_logs triggers
    CREATE TRIGGER IF NOT EXISTS trg_audit_no_update
    BEFORE UPDATE ON audit_logs
    BEGIN
      SELECT RAISE(ABORT, 'audit_logs are append-only');
    END;

    CREATE TRIGGER IF NOT EXISTS trg_audit_no_delete
    BEFORE DELETE ON audit_logs
    BEGIN
      SELECT RAISE(ABORT, 'audit_logs cannot be deleted');
    END;
  `);
}

function seedIfEmpty(db: DatabaseSync): void {
  const row = db.prepare('SELECT COUNT(*) as cnt FROM country_config').get() as { cnt: number };
  if (row.cnt > 0) return;

  const now = new Date();
  const nowIso = now.toISOString();
  const in2Hours = new Date(now.getTime() + 2 * 3600_000).toISOString();
  const in24Hours = new Date(now.getTime() + 24 * 3600_000).toISOString();
  const in72Hours = new Date(now.getTime() + 72 * 3600_000).toISOString();

  // 1. Countries (Global readiness from Day 1)
  const insertCountry = db.prepare(`
    INSERT INTO country_config (country_code, default_locale, emergency_numbers, sos_enabled, financial_features_enabled, data_retention_days, min_age, legal_review_status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  insertCountry.run('SA', 'ar', JSON.stringify({ police: '999', ambulance: '997', fire: '998', unified: '911' }), 1, 0, 365, 18, 'approved');
  insertCountry.run('EG', 'ar', JSON.stringify({ police: '122', ambulance: '123', fire: '180', unified: '122' }), 1, 0, 365, 18, 'approved');
  insertCountry.run('JO', 'ar', JSON.stringify({ police: '911', ambulance: '911', fire: '911', unified: '911' }), 1, 0, 365, 18, 'approved');
  insertCountry.run('AE', 'ar', JSON.stringify({ police: '999', ambulance: '998', fire: '997', unified: '999' }), 1, 0, 365, 18, 'approved');
  insertCountry.run('GB', 'en', JSON.stringify({ police: '999', ambulance: '999', fire: '999', unified: '999' }), 1, 0, 365, 18, 'approved');
  insertCountry.run('US', 'en', JSON.stringify({ police: '911', ambulance: '911', fire: '911', unified: '911' }), 1, 0, 365, 18, 'pending');

  // 2. Real Users (Ahmed, Sara, Khaled, Noura)
  const demoPassHash = hashPassword('AwnSafePass#2026');
  const insertUser = db.prepare(`
    INSERT INTO users (id, email, password_hash, role, country_code, timezone, age_confirmed_at, age_confirmed_min, trust_level)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  insertUser.run('11111111-1111-1111-1111-111111111111', 'ahmed@awn.community', demoPassHash, 'member', 'SA', 'Asia/Riyadh', nowIso, 18, 3);
  insertUser.run('22222222-2222-2222-2222-222222222222', 'sara@awn.community', demoPassHash, 'member', 'SA', 'Asia/Riyadh', nowIso, 18, 3);
  insertUser.run('33333333-3333-3333-3333-333333333333', 'khaled@awn.community', demoPassHash, 'member', 'SA', 'Asia/Riyadh', nowIso, 18, 2);
  insertUser.run('44444444-4444-4444-4444-444444444444', 'noura@awn.community', demoPassHash, 'moderator', 'SA', 'Asia/Riyadh', nowIso, 18, 4);

  const insertProfile = db.prepare(`
    INSERT INTO profiles (user_id, display_name, region_code, preferred_locale, bio_short)
    VALUES (?, ?, ?, ?, ?)
  `);
  insertProfile.run('11111111-1111-1111-1111-111111111111', 'أحمد المنصور · Ahmed', 'SA-RUH-N01', 'ar', 'منسق دائرة الحي الشمالي');
  insertProfile.run('22222222-2222-2222-2222-222222222222', 'سارة الحربي · Sara', 'SA-RUH-N01', 'ar', 'متطوعة في التوصيل والمؤازرة الطبية');
  insertProfile.run('33333333-3333-3333-3333-333333333333', 'خالد العتيبي · Khaled', 'SA-RUH-S02', 'ar', 'عضو دائرة الحي الجنوبي');
  insertProfile.run('44444444-4444-4444-4444-444444444444', 'نورة القحطاني · Noura', 'SA-RUH-N01', 'ar', 'مشرفة السلامة والحوكمة');

  const insertContact = db.prepare(`
    INSERT INTO private_contacts (user_id, phone_e164, preferred_channel, emergency_note)
    VALUES (?, ?, ?, ?)
  `);
  insertContact.run('11111111-1111-1111-1111-111111111111', '+966 50 100 2001', 'phone', 'متاح من 4 عصراً حتى 9 مساءً');
  insertContact.run('22222222-2222-2222-2222-222222222222', '+966 55 200 3002', 'whatsapp', 'يفضل الرسائل النصية قبل الاتصال');
  insertContact.run('33333333-3333-3333-3333-333333333333', '+966 54 300 4003', 'in_app', null);
  insertContact.run('44444444-4444-4444-4444-444444444444', '+966 59 400 5004', 'in_app', null);

  // Default consents (impact is private by default except Ahmed & Sara can toggle it)
  const insertConsent = db.prepare(`
    INSERT INTO consents (id, user_id, purpose, version, status, granted_at, revoked_at)
    VALUES (?, ?, ?, 1, ?, ?, ?)
  `);
  for (const uid of [
    '11111111-1111-1111-1111-111111111111',
    '22222222-2222-2222-2222-222222222222',
    '33333333-3333-3333-3333-333333333333',
    '44444444-4444-4444-4444-444444444444',
  ]) {
    insertConsent.run(`c-share-${uid}`, uid, 'share_need_in_circle', 'granted', nowIso, null);
    insertConsent.run(`c-reveal-${uid}`, uid, 'reveal_contact', 'revoked', null, nowIso);
    insertConsent.run(`c-impact-${uid}`, uid, 'publish_impact', 'revoked', null, nowIso);
    insertConsent.run(`c-checkin-${uid}`, uid, 'checkin', 'granted', nowIso, null);
  }

  // 3. Circles
  const insertCircle = db.prepare(`
    INSERT INTO circles (id, name, description, country_code, region_code, invite_code, expansion_tier, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  insertCircle.run(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'دائرة حي النرجس الشمالي · North Al-Narjis',
    'دائرة ثقة مترابطة للجيران لتبادل المشاوير والمؤازرة اليومية بدون أي مقابل مالي.',
    'SA',
    'SA-RUH-N01',
    'NORTH-2026',
    'trust',
    '11111111-1111-1111-1111-111111111111'
  );
  insertCircle.run(
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    'دائرة حي الشفا الجنوبي · South Al-Shifa',
    'دائرة مستقلة للجيران في القطاع الجنوبي — معزولة تماماً بسياسات RLS.',
    'SA',
    'SA-RUH-S02',
    'SOUTH-2026',
    'trust',
    '33333333-3333-3333-3333-333333333333'
  );

  const insertMember = db.prepare(`
    INSERT INTO circle_members (id, circle_id, user_id, role, approved_sensitive, status)
    VALUES (?, ?, ?, ?, ?, 'active')
  `);
  insertMember.run('cm-1', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'owner', 1);
  insertMember.run('cm-2', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222', 'coordinator', 1);
  insertMember.run('cm-3', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '33333333-3333-3333-3333-333333333333', 'owner', 1);

  // 4. Cold-Start Ready Offers (10 pre-seeded offers in North Circle so first requester never sees empty state)
  const insertOffer = db.prepare(`
    INSERT INTO offers (id, provider_id, circle_id, category, title, description, region_code, available_from, available_until, capacity_total, capacity_remaining, is_active)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
  `);
  const coldStartOffers = [
    ['o-1', '22222222-2222-2222-2222-222222222222', 'groceries', 'إحضار مقاضي السوبرماركت مساءً', 'رحلة يومية بين 5 و 9 مساءً داخل الخلية الشمالية', 'SA-RUH-N01', 3],
    ['o-2', '22222222-2222-2222-2222-222222222222', 'medical_errand', 'استلام وصفات الصيدلية لكبار السن', 'متاحة للطلبات الحساسة بمستوى ثقة 3', 'SA-RUH-N01', 2],
    ['o-3', '22222222-2222-2222-2222-222222222222', 'transport', 'توصيل لمواعيد المستوصف القريب', 'مركبة عائلية متاحة في الفترة المسائية', 'SA-RUH-N01', 2],
    ['o-4', '22222222-2222-2222-2222-222222222222', 'elderly_care', 'مؤازرة ومتابعة لكبار السن', 'زيارة اطمئنان سريعة داخل الحي', 'SA-RUH-N01', 1],
    ['o-5', '22222222-2222-2222-2222-222222222222', 'tech_help', 'مساعدة تقنية وإعداد الأجهزة', 'دعم عن بُعد أو حضوري لإعداد الهواتف', 'SA-RUH-N01', 3],
    ['o-6', '11111111-1111-1111-1111-111111111111', 'home_repair', 'إصلاحات منزلية بسيطة (كهرباء/سباكة)', 'عدة كاملة للمساعدة الطارئة بالمنزل', 'SA-RUH-N01', 2],
    ['o-7', '11111111-1111-1111-1111-111111111111', 'groceries', 'توفير مياه واحتياجات أساسية', 'تغطية الخلية الشمالية والمجاورة', 'SA-RUH-N01', 4],
    ['o-8', '11111111-1111-1111-1111-111111111111', 'transport', 'مساعدة توصيل سريعة صباحاً', 'من الساعة 7 حتى 10 صباحاً', 'SA-RUH-N01', 2],
    ['o-9', '22222222-2222-2222-2222-222222222222', 'childcare_support', 'مساندة رعاية أطفال وقت الطوارئ', 'بالتنسيق مع منسقات الدائرة', 'SA-RUH-N01', 1],
    ['o-10', '22222222-2222-2222-2222-222222222222', 'sos_support', 'استجابة مجتمعية سريعة للدائرة', 'لأعضاء دائرة النرجس فقط', 'SA-RUH-N01', 2],
  ] as const;

  for (const [id, pid, cat, title, desc, reg, cap] of coldStartOffers) {
    insertOffer.run(id, pid, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', cat, title, desc, reg, nowIso, in72Hours, cap, cap);
  }

  // Also 1 offer in South Circle for Khaled
  insertOffer.run(
    'o-south-1',
    '33333333-3333-3333-3333-333333333333',
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    'groceries',
    'مقاضي حي الشفا',
    'متاح في القطاع الجنوبي',
    'SA-RUH-S02',
    nowIso,
    in72Hours,
    2,
    2
  );

  // 5. Initial Published Need in North Circle (so evaluators see live matching right away)
  db.prepare(`
    INSERT INTO needs (id, requester_id, title, description, category, urgency, status, is_sensitive, region_code, time_window_start, time_window_end, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, 'published', ?, ?, ?, ?, ?)
  `).run(
    'need-demo-1',
    '11111111-1111-1111-1111-111111111111',
    'استلام دواء الضغط من صيدلية الحي',
    'نحتاج متطوعاً لاستلام وصفة طبية جاهزة من الصيدلية المجاورة وإيصالها قبل المساء.',
    'medical_errand',
    'high',
    1,
    'SA-RUH-N01',
    nowIso,
    in2Hours,
    in24Hours
  );
  db.prepare('INSERT INTO need_circles (need_id, circle_id) VALUES (?, ?)').run(
    'need-demo-1',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  );

  // 6. Seed 1 anonymized impact event (with granted consent) & 1 non-monetary community item
  db.prepare(`
    INSERT INTO needs (id, requester_id, title, description, category, urgency, status, is_sensitive, region_code, time_window_start, time_window_end, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, 'completed', 0, ?, ?, ?, ?)
  `).run(
    'need-past-1',
    '11111111-1111-1111-1111-111111111111',
    'توصيل مستلزمات غذائية',
    'تم التسليم بنجاح داخل الدائرة',
    'groceries',
    'normal',
    'SA-RUH-N01',
    nowIso,
    in2Hours,
    in24Hours
  );
  db.prepare('INSERT INTO need_circles (need_id, circle_id) VALUES (?, ?)').run(
    'need-past-1',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  );
  db.prepare(`
    INSERT INTO impact_events (id, need_id, circle_id, category, approximate_window, consent_status)
    VALUES (?, ?, ?, ?, ?, 'granted')
  `).run('imp-1', 'need-past-1', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'groceries', 'evening_window');

  db.prepare(`
    INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id, metadata)
    VALUES (?, ?, 'system_bootstrap', 'country_config', 'SA', ?)
  `).run('audit-boot-1', '11111111-1111-1111-1111-111111111111', JSON.stringify({ seeded_offers: 10 }));
}
