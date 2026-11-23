-- 0001_schema.sql
-- Privacy-First Mutual Aid Circles Schema (PostgreSQL / Supabase)
-- Rules: UUID PKs, UTC timestamps with trigger, explicit ON DELETE policies,
-- CHECK constraints & enums, hierarchical region_code ONLY (NO lat/lng anywhere).

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Enums
CREATE TYPE need_status AS ENUM (
  'draft',
  'published',
  'matched',
  'accepted',
  'in_progress',
  'completed',
  'cancelled',
  'expired',
  'under_review'
);

CREATE TYPE need_category AS ENUM (
  'groceries',
  'transport',
  'medical_errand',
  'elderly_care',
  'tech_help',
  'childcare_support',
  'home_repair',
  'sos_support'
);

CREATE TYPE urgency_level AS ENUM ('low', 'normal', 'high', 'sos');
CREATE TYPE circle_role AS ENUM ('owner', 'admin', 'coordinator', 'member');
CREATE TYPE match_status AS ENUM (
  'suggested',
  'accepted_by_requester',
  'accepted_by_provider',
  'accepted_both',
  'declined',
  'withdrawn'
);
CREATE TYPE consent_purpose AS ENUM (
  'share_need_in_circle',
  'reveal_contact',
  'publish_impact',
  'checkin'
);
CREATE TYPE consent_status AS ENUM ('granted', 'revoked');
CREATE TYPE report_status AS ENUM ('new', 'reviewing', 'actioned', 'dismissed');
CREATE TYPE legal_review_status AS ENUM ('pending', 'approved', 'restricted');

-- Updated-at trigger function
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = timezone('utc', now());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 1. Global Readiness: country_config
CREATE TABLE country_config (
  country_code CHAR(2) PRIMARY KEY CHECK (country_code ~ '^[A-Z]{2}$'),
  default_locale TEXT NOT NULL CHECK (default_locale IN ('ar', 'en')),
  emergency_numbers JSONB NOT NULL,
  sos_enabled BOOLEAN NOT NULL DEFAULT true,
  financial_features_enabled BOOLEAN NOT NULL DEFAULT false,
  data_retention_days INTEGER NOT NULL DEFAULT 365 CHECK (data_retention_days >= 30),
  min_age INTEGER NOT NULL DEFAULT 18 CHECK (min_age >= 13 AND min_age <= 25),
  legal_review_status legal_review_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

-- 2. Users (Account & Lifecycle)
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE,
  password_hash TEXT,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('member', 'moderator', 'admin', 'partner')),
  country_code CHAR(2) NOT NULL REFERENCES country_config(country_code) ON DELETE RESTRICT,
  timezone TEXT NOT NULL DEFAULT 'UTC',
  age_confirmed_at TIMESTAMPTZ NOT NULL,
  age_confirmed_min INTEGER NOT NULL CHECK (age_confirmed_min >= 13),
  trust_level SMALLINT NOT NULL DEFAULT 1 CHECK (trust_level BETWEEN 1 AND 4),
  deactivated_at TIMESTAMPTZ,
  scheduled_anonymize_at TIMESTAMPTZ,
  anonymized_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);
CREATE INDEX idx_users_country ON users(country_code);
CREATE INDEX idx_users_role ON users(role);

-- 3. Public Profiles (Limited public view; NO private contact info or exact coords)
CREATE TABLE profiles (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL CHECK (char_length(display_name) BETWEEN 2 AND 80),
  avatar_path TEXT,
  region_code TEXT NOT NULL CHECK (region_code ~ '^[A-Z]{2}-[A-Z0-9]{2,6}-[A-Z0-9]{2,8}$'),
  preferred_locale TEXT NOT NULL DEFAULT 'ar' CHECK (preferred_locale IN ('ar', 'en')),
  bio_short TEXT CHECK (bio_short IS NULL OR char_length(bio_short) <= 240),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);
CREATE INDEX idx_profiles_region ON profiles(region_code);

-- 4. Private Contacts (Strictly separated from public profile; gated by dual-consent contact_reveals)
CREATE TABLE private_contacts (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  phone_e164 TEXT,
  preferred_channel TEXT NOT NULL DEFAULT 'in_app' CHECK (preferred_channel IN ('in_app', 'phone', 'whatsapp')),
  emergency_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

-- 5. Circles
CREATE TABLE circles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 2 AND 100),
  description TEXT CHECK (description IS NULL OR char_length(description) <= 500),
  country_code CHAR(2) NOT NULL REFERENCES country_config(country_code) ON DELETE RESTRICT,
  region_code TEXT NOT NULL CHECK (region_code ~ '^[A-Z]{2}-[A-Z0-9]{2,6}-[A-Z0-9]{2,8}$'),
  invite_code TEXT UNIQUE NOT NULL,
  expansion_tier TEXT NOT NULL DEFAULT 'trust' CHECK (expansion_tier IN ('trust', 'neighborhood', 'city', 'country', 'global')),
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);
CREATE INDEX idx_circles_region ON circles(region_code);

-- 6. Circle Members
CREATE TABLE circle_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  circle_id UUID NOT NULL REFERENCES circles(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role circle_role NOT NULL DEFAULT 'member',
  approved_sensitive BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('pending', 'active', 'removed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  UNIQUE(circle_id, user_id)
);
CREATE INDEX idx_circle_members_user ON circle_members(user_id, status);
CREATE INDEX idx_circle_members_circle ON circle_members(circle_id, status);

-- 7. Needs
CREATE TABLE needs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 3 AND 120),
  description TEXT NOT NULL CHECK (char_length(description) BETWEEN 5 AND 1500),
  category need_category NOT NULL,
  urgency urgency_level NOT NULL DEFAULT 'normal',
  status need_status NOT NULL DEFAULT 'draft',
  is_sensitive BOOLEAN NOT NULL DEFAULT false,
  region_code TEXT NOT NULL CHECK (region_code ~ '^[A-Z]{2}-[A-Z0-9]{2,6}-[A-Z0-9]{2,8}$'),
  time_window_start TIMESTAMPTZ NOT NULL,
  time_window_end TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  attachment_path TEXT,
  is_sos BOOLEAN NOT NULL DEFAULT false,
  sos_official_ack_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  CHECK (time_window_end >= time_window_start)
);
CREATE INDEX idx_needs_status ON needs(status);
CREATE INDEX idx_needs_requester ON needs(requester_id);
CREATE INDEX idx_needs_region ON needs(region_code);
CREATE INDEX idx_needs_category ON needs(category);
CREATE INDEX idx_needs_expires_at ON needs(expires_at);

-- 8. Need Circles (Controls visibility scope)
CREATE TABLE need_circles (
  need_id UUID NOT NULL REFERENCES needs(id) ON DELETE CASCADE,
  circle_id UUID NOT NULL REFERENCES circles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  PRIMARY KEY (need_id, circle_id)
);
CREATE INDEX idx_need_circles_circle ON need_circles(circle_id);

-- 9. Offers
CREATE TABLE offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  circle_id UUID NOT NULL REFERENCES circles(id) ON DELETE CASCADE,
  category need_category NOT NULL,
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 3 AND 120),
  description TEXT CHECK (description IS NULL OR char_length(description) <= 800),
  region_code TEXT NOT NULL CHECK (region_code ~ '^[A-Z]{2}-[A-Z0-9]{2,6}-[A-Z0-9]{2,8}$'),
  available_from TIMESTAMPTZ NOT NULL,
  available_until TIMESTAMPTZ NOT NULL,
  capacity_total SMALLINT NOT NULL DEFAULT 2 CHECK (capacity_total BETWEEN 1 AND 20),
  capacity_remaining SMALLINT NOT NULL DEFAULT 2 CHECK (capacity_remaining >= 0 AND capacity_remaining <= capacity_total),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  CHECK (available_until >= available_from)
);
CREATE INDEX idx_offers_provider ON offers(provider_id);
CREATE INDEX idx_offers_circle_cat ON offers(circle_id, category, is_active);

-- 10. Assistance Matches (Explainable suggestions; NO auto-assignment)
CREATE TABLE assistance_matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  need_id UUID NOT NULL REFERENCES needs(id) ON DELETE CASCADE,
  offer_id UUID NOT NULL REFERENCES offers(id) ON DELETE CASCADE,
  provider_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  score SMALLINT NOT NULL CHECK (score BETWEEN 0 AND 100),
  explanation JSONB NOT NULL,
  status match_status NOT NULL DEFAULT 'suggested',
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  UNIQUE(need_id, offer_id)
);
CREATE INDEX idx_matches_need ON assistance_matches(need_id, status);
CREATE INDEX idx_matches_provider ON assistance_matches(provider_id, status);

-- 11. Assistance Sessions
CREATE TABLE assistance_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  need_id UUID NOT NULL UNIQUE REFERENCES needs(id) ON DELETE CASCADE,
  match_id UUID NOT NULL REFERENCES assistance_matches(id) ON DELETE RESTRICT,
  requester_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  checkin_status TEXT NOT NULL DEFAULT 'pending' CHECK (checkin_status IN ('pending', 'safe', 'needs_followup')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);
CREATE INDEX idx_sessions_provider ON assistance_sessions(provider_id);

-- 12. Contact Reveals (Dual consent gate)
CREATE TABLE contact_reveals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  need_id UUID NOT NULL UNIQUE REFERENCES needs(id) ON DELETE CASCADE,
  requester_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  consent_requester BOOLEAN NOT NULL DEFAULT false,
  consent_provider BOOLEAN NOT NULL DEFAULT false,
  revealed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

-- 13. Consents (Versioned, revocable; default private)
CREATE TABLE consents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose consent_purpose NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  status consent_status NOT NULL DEFAULT 'revoked',
  granted_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  UNIQUE(user_id, purpose)
);

-- 14. Blocks (Mutual complete invisibility)
CREATE TABLE blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  blocker_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  CHECK (blocker_id <> blocked_id),
  UNIQUE(blocker_id, blocked_id)
);
CREATE INDEX idx_blocks_pair ON blocks(blocker_id, blocked_id);

-- 15. Impact Events (Strictly anonymized: category + approximate time ONLY, no names/coords)
CREATE TABLE impact_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  need_id UUID NOT NULL UNIQUE REFERENCES needs(id) ON DELETE CASCADE,
  circle_id UUID NOT NULL REFERENCES circles(id) ON DELETE CASCADE,
  category need_category NOT NULL,
  approximate_window TEXT NOT NULL,
  consent_status consent_status NOT NULL DEFAULT 'revoked',
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);
CREATE INDEX idx_impact_circle_consent ON impact_events(circle_id, consent_status);

-- 16. Surprise Items & Claims (City tier partner items, zero money)
CREATE TABLE surprise_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  circle_id UUID NOT NULL REFERENCES circles(id) ON DELETE CASCADE,
  partner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 3 AND 120),
  description TEXT,
  quantity_available INTEGER NOT NULL CHECK (quantity_available >= 0),
  region_code TEXT NOT NULL CHECK (region_code ~ '^[A-Z]{2}-[A-Z0-9]{2,6}-[A-Z0-9]{2,8}$'),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE TABLE surprise_claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID NOT NULL REFERENCES surprise_items(id) ON DELETE CASCADE,
  recipient_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved', 'collected', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  UNIQUE(item_id, recipient_id)
);

-- 17. Notifications
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title_key TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);
CREATE INDEX idx_notifications_user ON notifications(user_id, read_at);

-- 18. Reports (Snapshot-scoped moderation + appeal)
CREATE TABLE reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL CHECK (target_type IN ('need', 'offer', 'user', 'circle')),
  target_id UUID NOT NULL,
  reason_code TEXT NOT NULL,
  details TEXT CHECK (details IS NULL OR char_length(details) <= 1000),
  content_snapshot JSONB NOT NULL,
  status report_status NOT NULL DEFAULT 'new',
  resolution_note TEXT,
  appeal_note TEXT,
  appealed_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);
CREATE INDEX idx_reports_status ON reports(status);

-- 19. Admin Access Requests (Break-glass)
CREATE TABLE admin_access_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL,
  target_id UUID NOT NULL,
  reason TEXT NOT NULL CHECK (char_length(reason) >= 10),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);
CREATE INDEX idx_break_glass_admin_target ON admin_access_requests(admin_id, target_id, expires_at);

-- 20. Audit Logs (Append-only via SECURITY DEFINER)
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);
CREATE INDEX idx_audit_entity ON audit_logs(entity_type, entity_id);

-- 21. Idempotency Keys
CREATE TABLE idempotency_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  route TEXT NOT NULL,
  key TEXT NOT NULL,
  response_status INTEGER NOT NULL,
  response_body JSONB NOT NULL,
  response_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  UNIQUE(user_id, route, key)
);

-- Attach updated_at triggers
CREATE TRIGGER trg_country_updated_at BEFORE UPDATE ON country_config FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_profiles_updated_at BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_private_contacts_updated_at BEFORE UPDATE ON private_contacts FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_circles_updated_at BEFORE UPDATE ON circles FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_circle_members_updated_at BEFORE UPDATE ON circle_members FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_needs_updated_at BEFORE UPDATE ON needs FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_offers_updated_at BEFORE UPDATE ON offers FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_matches_updated_at BEFORE UPDATE ON assistance_matches FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_sessions_updated_at BEFORE UPDATE ON assistance_sessions FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_reveals_updated_at BEFORE UPDATE ON contact_reveals FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_consents_updated_at BEFORE UPDATE ON consents FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_impact_updated_at BEFORE UPDATE ON impact_events FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_reports_updated_at BEFORE UPDATE ON reports FOR EACH ROW EXECUTE FUNCTION set_updated_at();
