import crypto from 'node:crypto';
import { getDb } from '@/lib/db/client';

export interface UserRecord {
  id: string;
  email: string | null;
  password_hash: string | null;
  role: 'member' | 'moderator' | 'admin' | 'partner';
  country_code: string;
  timezone: string;
  age_confirmed_at: string;
  age_confirmed_min: number;
  trust_level: number;
  deactivated_at: string | null;
  scheduled_anonymize_at: string | null;
  anonymized_at: string | null;
  display_name: string;
  region_code: string;
  preferred_locale: 'ar' | 'en';
  bio_short: string | null;
}

export function getUserByIdRepo(userId: string): UserRecord | null {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT u.*, p.display_name, p.region_code, p.preferred_locale, p.bio_short
       FROM users u
       JOIN profiles p ON p.user_id = u.id
       WHERE u.id = ?`
    )
    .get(userId) as unknown as UserRecord | undefined;
  return row ?? null;
}

export function getUserByEmailRepo(email: string): UserRecord | null {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT u.*, p.display_name, p.region_code, p.preferred_locale, p.bio_short
       FROM users u
       JOIN profiles p ON p.user_id = u.id
       WHERE lower(u.email) = lower(?)`
    )
    .get(email) as unknown as UserRecord | undefined;
  return row ?? null;
}

export function listActiveDirectoryUsersRepo() {
  const db = getDb();
  return db
    .prepare(
      `SELECT u.id, u.role, u.country_code, u.trust_level, p.display_name, p.region_code, p.preferred_locale
       FROM users u
       JOIN profiles p ON p.user_id = u.id
       WHERE u.deactivated_at IS NULL AND u.anonymized_at IS NULL
       ORDER BY u.created_at ASC`
    )
    .all() as Array<{
      id: string;
      role: string;
      country_code: string;
      trust_level: number;
      display_name: string;
      region_code: string;
      preferred_locale: 'ar' | 'en';
    }>;
}

export function createUserWithProfileRepo(input: {
  id: string;
  email: string;
  passwordHash: string;
  displayName: string;
  countryCode: string;
  regionCode: string;
  preferredLocale: 'ar' | 'en';
  timezone: string;
  minAge: number;
  phoneE164?: string;
  preferredChannel: 'in_app' | 'phone' | 'whatsapp';
}): UserRecord {
  const db = getDb();
  const nowIso = new Date().toISOString();

  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare(
      `INSERT INTO users (id, email, password_hash, role, country_code, timezone, age_confirmed_at, age_confirmed_min, trust_level)
       VALUES (?, ?, ?, 'member', ?, ?, ?, ?, 1)`
    ).run(
      input.id,
      input.email.toLowerCase(),
      input.passwordHash,
      input.countryCode,
      input.timezone,
      nowIso,
      input.minAge
    );

    db.prepare(
      `INSERT INTO profiles (user_id, display_name, region_code, preferred_locale, bio_short)
       VALUES (?, ?, ?, ?, NULL)`
    ).run(input.id, input.displayName, input.regionCode, input.preferredLocale);

    db.prepare(
      `INSERT INTO private_contacts (user_id, phone_e164, preferred_channel, emergency_note)
       VALUES (?, ?, ?, NULL)`
    ).run(input.id, input.phoneE164 ?? null, input.preferredChannel);

    // Default privacy-first consents (impact is private by default)
    const insertConsent = db.prepare(
      `INSERT INTO consents (id, user_id, purpose, version, status, granted_at, revoked_at)
       VALUES (?, ?, ?, 1, ?, ?, ?)`
    );
    insertConsent.run(crypto.randomUUID(), input.id, 'share_need_in_circle', 'granted', nowIso, null);
    insertConsent.run(crypto.randomUUID(), input.id, 'reveal_contact', 'revoked', null, nowIso);
    insertConsent.run(crypto.randomUUID(), input.id, 'publish_impact', 'revoked', null, nowIso);
    insertConsent.run(crypto.randomUUID(), input.id, 'checkin', 'granted', nowIso, null);

    db.prepare(
      `INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id, metadata)
       VALUES (?, ?, 'user_registered', 'user', ?, ?)`
    ).run(
      crypto.randomUUID(),
      input.id,
      input.id,
      JSON.stringify({ country_code: input.countryCode, min_age_confirmed: input.minAge })
    );

    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  return getUserByIdRepo(input.id)!;
}

export function getSelfPrivateContactRepo(userId: string) {
  const db = getDb();
  return db
    .prepare('SELECT phone_e164, preferred_channel, emergency_note FROM private_contacts WHERE user_id = ?')
    .get(userId) as
    | { phone_e164: string | null; preferred_channel: string; emergency_note: string | null }
    | undefined;
}

export function updateProfileAndContactRepo(
  userId: string,
  updates: {
    displayName?: string;
    regionCode?: string;
    preferredLocale?: 'ar' | 'en';
    bioShort?: string;
    phoneE164?: string | null;
    preferredChannel?: 'in_app' | 'phone' | 'whatsapp';
    emergencyNote?: string | null;
  }
) {
  const db = getDb();
  const nowIso = new Date().toISOString();
  db.exec('BEGIN IMMEDIATE');
  try {
    if (
      updates.displayName !== undefined ||
      updates.regionCode !== undefined ||
      updates.preferredLocale !== undefined ||
      updates.bioShort !== undefined
    ) {
      db.prepare(
        `UPDATE profiles
         SET display_name = COALESCE(?, display_name),
             region_code = COALESCE(?, region_code),
             preferred_locale = COALESCE(?, preferred_locale),
             bio_short = COALESCE(?, bio_short),
             updated_at = ?
         WHERE user_id = ?`
      ).run(
        updates.displayName ?? null,
        updates.regionCode ?? null,
        updates.preferredLocale ?? null,
        updates.bioShort ?? null,
        nowIso,
        userId
      );
    }

    if (
      updates.phoneE164 !== undefined ||
      updates.preferredChannel !== undefined ||
      updates.emergencyNote !== undefined
    ) {
      db.prepare(
        `UPDATE private_contacts
         SET phone_e164 = CASE WHEN ? THEN ? ELSE phone_e164 END,
             preferred_channel = COALESCE(?, preferred_channel),
             emergency_note = CASE WHEN ? THEN ? ELSE emergency_note END,
             updated_at = ?
         WHERE user_id = ?`
      ).run(
        updates.phoneE164 !== undefined ? 1 : 0,
        updates.phoneE164 ?? null,
        updates.preferredChannel ?? null,
        updates.emergencyNote !== undefined ? 1 : 0,
        updates.emergencyNote ?? null,
        nowIso,
        userId
      );
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

export function exportUserDataRepo(userId: string) {
  const db = getDb();
  const user = db
    .prepare('SELECT id, email, role, country_code, timezone, age_confirmed_at, trust_level, created_at FROM users WHERE id = ?')
    .get(userId);
  const profile = db.prepare('SELECT * FROM profiles WHERE user_id = ?').get(userId);
  const privateContact = db.prepare('SELECT * FROM private_contacts WHERE user_id = ?').get(userId);
  const consents = db.prepare('SELECT * FROM consents WHERE user_id = ?').all(userId);
  const memberships = db.prepare('SELECT * FROM circle_members WHERE user_id = ?').all(userId);
  const needs = db.prepare('SELECT * FROM needs WHERE requester_id = ?').all(userId);
  const offers = db.prepare('SELECT * FROM offers WHERE provider_id = ?').all(userId);
  const notifications = db.prepare('SELECT * FROM notifications WHERE user_id = ?').all(userId);

  return {
    exported_at: new Date().toISOString(),
    user,
    profile,
    private_contact: privateContact,
    consents,
    circle_memberships: memberships,
    needs,
    offers,
    notifications,
  };
}

export function deactivateAndAnonymizeUserRepo(userId: string, immediateAnonymize: boolean) {
  const db = getDb();
  const now = new Date();
  const nowIso = now.toISOString();
  const scheduleIso = new Date(now.getTime() + 30 * 24 * 3600_000).toISOString();

  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare(
      `UPDATE users
       SET deactivated_at = ?,
           scheduled_anonymize_at = ?,
           updated_at = ?
       WHERE id = ?`
    ).run(nowIso, scheduleIso, nowIso, userId);

    if (immediateAnonymize) {
      // Scrub ALL PII while preserving anonymized aggregate rows for statistical integrity
      db.prepare(
        `UPDATE users
         SET email = NULL,
             password_hash = NULL,
             anonymized_at = ?,
             updated_at = ?
         WHERE id = ?`
      ).run(nowIso, nowIso, userId);

      db.prepare(
        `UPDATE profiles
         SET display_name = 'Anonymized Member',
             avatar_path = NULL,
             bio_short = NULL,
             updated_at = ?
         WHERE user_id = ?`
      ).run(nowIso, userId);

      db.prepare(
        `UPDATE private_contacts
         SET phone_e164 = NULL,
             emergency_note = NULL,
             updated_at = ?
         WHERE user_id = ?`
      ).run(nowIso, userId);

      db.prepare('UPDATE offers SET is_active = 0, updated_at = ? WHERE provider_id = ?').run(
        nowIso,
        userId
      );
    }

    db.prepare(
      `INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id, metadata)
       VALUES (?, NULL, 'account_deactivated', 'user', ?, ?)`
    ).run(
      crypto.randomUUID(),
      userId,
      JSON.stringify({ immediate_anonymize: immediateAnonymize, scheduled_anonymize_at: scheduleIso })
    );

    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  return { deactivated_at: nowIso, scheduled_anonymize_at: scheduleIso, anonymized: immediateAnonymize };
}
