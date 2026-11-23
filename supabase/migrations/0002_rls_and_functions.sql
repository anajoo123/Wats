-- 0002_rls_and_functions.sql
-- Helper functions, strict Deny-By-Default RLS on EVERY table,
-- controlled state machine transition_need(), and immutable audit logs.

-- ============================================================
-- 1. RLS Helper Functions
-- ============================================================

CREATE OR REPLACE FUNCTION is_circle_member(p_uid UUID, p_cid UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM circle_members cm
    WHERE cm.circle_id = p_cid
      AND cm.user_id = p_uid
      AND cm.status = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION is_circle_admin(p_uid UUID, p_cid UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM circle_members cm
    WHERE cm.circle_id = p_cid
      AND cm.user_id = p_uid
      AND cm.status = 'active'
      AND cm.role IN ('owner', 'admin', 'coordinator')
  );
$$;

CREATE OR REPLACE FUNCTION is_platform_admin(p_uid UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM users u
    WHERE u.id = p_uid
      AND u.role IN ('moderator', 'admin')
      AND u.deactivated_at IS NULL
  );
$$;

CREATE OR REPLACE FUNCTION is_blocked_between(p_uid_a UUID, p_uid_b UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM blocks b
    WHERE (b.blocker_id = p_uid_a AND b.blocked_id = p_uid_b)
       OR (b.blocker_id = p_uid_b AND b.blocked_id = p_uid_a)
  );
$$;

CREATE OR REPLACE FUNCTION has_valid_break_glass(p_admin_id UUID, p_target_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM admin_access_requests r
    WHERE r.admin_id = p_admin_id
      AND r.target_id = p_target_id
      AND r.expires_at > timezone('utc', now())
  );
$$;

-- Immutable Audit Logger
CREATE OR REPLACE FUNCTION write_audit_log(
  p_actor_id UUID,
  p_action TEXT,
  p_entity_type TEXT,
  p_entity_id TEXT,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, metadata)
  VALUES (p_actor_id, p_action, p_entity_type, p_entity_id, COALESCE(p_metadata, '{}'::jsonb));
END;
$$;

-- ============================================================
-- 2. Need State Machine Trigger + transition_need()
-- ============================================================

CREATE OR REPLACE FUNCTION block_direct_need_status_update()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF current_setting('app.allow_need_status_transition', true) IS DISTINCT FROM 'on' THEN
      RAISE EXCEPTION 'Direct status update forbidden. Use transition_need().';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_block_direct_need_status
BEFORE UPDATE ON needs
FOR EACH ROW
EXECUTE FUNCTION block_direct_need_status_update();

CREATE OR REPLACE FUNCTION transition_need(
  p_need_id UUID,
  p_to_status need_status,
  p_actor_id UUID,
  p_reason TEXT DEFAULT NULL
)
RETURNS need_status
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_need needs%ROWTYPE;
  v_is_provider BOOLEAN := false;
  v_is_mod BOOLEAN := false;
  v_both_accepted BOOLEAN := false;
BEGIN
  SELECT * INTO v_need FROM needs WHERE id = p_need_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Need not found';
  END IF;

  -- Terminal states cannot be modified
  IF v_need.status IN ('completed', 'cancelled', 'expired') THEN
    RAISE EXCEPTION 'Terminal state (%) cannot be modified', v_need.status;
  END IF;

  v_is_mod := is_platform_admin(p_actor_id);

  SELECT EXISTS (
    SELECT 1 FROM assistance_matches m
    WHERE m.need_id = p_need_id
      AND m.provider_id = p_actor_id
      AND m.status IN ('suggested', 'accepted_by_requester', 'accepted_by_provider', 'accepted_both')
  ) INTO v_is_provider;

  -- Validate transitions & actor authority
  IF p_to_status = 'published' AND v_need.status = 'draft' THEN
    IF p_actor_id <> v_need.requester_id THEN
      RAISE EXCEPTION 'Only requester can publish';
    END IF;
  ELSIF p_to_status = 'matched' AND v_need.status = 'published' THEN
    -- System or authorized circle match proposal
    NULL;
  ELSIF p_to_status = 'accepted' AND v_need.status = 'matched' THEN
    SELECT EXISTS (
      SELECT 1 FROM assistance_matches m
      WHERE m.need_id = p_need_id AND m.status = 'accepted_both'
    ) INTO v_both_accepted;
    IF NOT v_both_accepted THEN
      RAISE EXCEPTION 'Both parties must accept before transitioning to accepted';
    END IF;
  ELSIF p_to_status = 'in_progress' AND v_need.status = 'accepted' THEN
    IF NOT v_is_provider THEN
      RAISE EXCEPTION 'Only assigned provider can start assistance';
    END IF;
  ELSIF p_to_status = 'completed' AND v_need.status = 'in_progress' THEN
    -- CRITICAL RULE: Requester ONLY can mark completed
    IF p_actor_id <> v_need.requester_id THEN
      RAISE EXCEPTION 'Only the requester can mark a need completed';
    END IF;
  ELSIF p_to_status = 'published' AND v_need.status IN ('matched', 'accepted', 'in_progress') THEN
    -- Provider withdrawal resets to published
    IF NOT v_is_provider THEN
      RAISE EXCEPTION 'Only assigned provider withdrawal can revert to published';
    END IF;
  ELSIF p_to_status = 'cancelled' THEN
    IF p_actor_id <> v_need.requester_id THEN
      RAISE EXCEPTION 'Only requester can cancel';
    END IF;
  ELSIF p_to_status = 'under_review' THEN
    IF NOT v_is_mod THEN
      RAISE EXCEPTION 'Only moderator or automated threshold can flag under_review';
    END IF;
  ELSIF p_to_status = 'expired' AND v_need.status = 'published' THEN
    NULL;
  ELSE
    RAISE EXCEPTION 'Invalid transition from % to %', v_need.status, p_to_status;
  END IF;

  PERFORM set_config('app.allow_need_status_transition', 'on', true);
  UPDATE needs SET status = p_to_status WHERE id = p_need_id;
  PERFORM set_config('app.allow_need_status_transition', 'off', true);

  PERFORM write_audit_log(
    p_actor_id,
    'need_transition',
    'need',
    p_need_id::text,
    jsonb_build_object('from', v_need.status, 'to', p_to_status, 'reason', p_reason)
  );

  RETURN p_to_status;
END;
$$;

-- ============================================================
-- 3. Enable Deny-By-Default RLS on EVERY Table
-- ============================================================

ALTER TABLE country_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE private_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE circles ENABLE ROW LEVEL SECURITY;
ALTER TABLE circle_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE needs ENABLE ROW LEVEL SECURITY;
ALTER TABLE need_circles ENABLE ROW LEVEL SECURITY;
ALTER TABLE offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE assistance_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE assistance_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_reveals ENABLE ROW LEVEL SECURITY;
ALTER TABLE consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE impact_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE surprise_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE surprise_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_access_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE idempotency_keys ENABLE ROW LEVEL SECURITY;

-- Force RLS even for table owners when using non-bypass roles
ALTER TABLE needs FORCE ROW LEVEL SECURITY;
ALTER TABLE private_contacts FORCE ROW LEVEL SECURITY;
ALTER TABLE audit_logs FORCE ROW LEVEL SECURITY;

-- ============================================================
-- 4. RLS Policies
-- ============================================================

-- country_config: readable by authenticated users; managed by platform admins
CREATE POLICY country_config_read ON country_config
  FOR SELECT TO authenticated USING (true);

-- users: self read, or platform admin
CREATE POLICY users_self_read ON users
  FOR SELECT TO authenticated
  USING (id = auth.uid() OR is_platform_admin(auth.uid()));

-- profiles: limited view for non-blocked users; owner updates self
CREATE POLICY profiles_read ON profiles
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR NOT is_blocked_between(auth.uid(), user_id)
  );

CREATE POLICY profiles_owner_update ON profiles
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- private_contacts: owner OR dual-consent active reveal (and not blocked)
CREATE POLICY private_contacts_read ON private_contacts
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM contact_reveals cr
      WHERE cr.consent_requester = true
        AND cr.consent_provider = true
        AND cr.revealed_at IS NOT NULL
        AND NOT is_blocked_between(auth.uid(), user_id)
        AND (
          (cr.requester_id = auth.uid() AND cr.provider_id = private_contacts.user_id)
          OR (cr.provider_id = auth.uid() AND cr.requester_id = private_contacts.user_id)
        )
    )
  );

CREATE POLICY private_contacts_owner_write ON private_contacts
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- circles & circle_members
CREATE POLICY circles_member_read ON circles
  FOR SELECT TO authenticated
  USING (is_circle_member(auth.uid(), id) OR created_by = auth.uid());

CREATE POLICY circle_members_read ON circle_members
  FOR SELECT TO authenticated
  USING (is_circle_member(auth.uid(), circle_id));

-- needs: owner, OR active member of linked need_circle without mutual block,
-- OR platform admin ONLY with valid non-expired break-glass request
CREATE POLICY needs_read ON needs
  FOR SELECT TO authenticated
  USING (
    requester_id = auth.uid()
    OR (
      NOT is_blocked_between(auth.uid(), requester_id)
      AND status <> 'draft'
      AND EXISTS (
        SELECT 1 FROM need_circles nc
        WHERE nc.need_id = needs.id
          AND is_circle_member(auth.uid(), nc.circle_id)
      )
    )
    OR (
      is_platform_admin(auth.uid())
      AND has_valid_break_glass(auth.uid(), needs.id)
    )
  );

CREATE POLICY needs_owner_insert ON needs
  FOR INSERT TO authenticated
  WITH CHECK (requester_id = auth.uid() AND status = 'draft');

CREATE POLICY needs_owner_update ON needs
  FOR UPDATE TO authenticated
  USING (requester_id = auth.uid() AND status NOT IN ('completed', 'cancelled', 'expired'))
  WITH CHECK (requester_id = auth.uid());

-- need_circles
CREATE POLICY need_circles_read ON need_circles
  FOR SELECT TO authenticated
  USING (is_circle_member(auth.uid(), circle_id));

-- offers
CREATE POLICY offers_read ON offers
  FOR SELECT TO authenticated
  USING (
    provider_id = auth.uid()
    OR (is_circle_member(auth.uid(), circle_id) AND NOT is_blocked_between(auth.uid(), provider_id))
  );

-- assistance_matches
CREATE POLICY matches_party_read ON assistance_matches
  FOR SELECT TO authenticated
  USING (
    provider_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM needs n WHERE n.id = need_id AND n.requester_id = auth.uid()
    )
  );

-- contact_reveals
CREATE POLICY contact_reveals_party_read ON contact_reveals
  FOR SELECT TO authenticated
  USING (requester_id = auth.uid() OR provider_id = auth.uid());

-- consents
CREATE POLICY consents_self_all ON consents
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- blocks
CREATE POLICY blocks_self_all ON blocks
  FOR ALL TO authenticated
  USING (blocker_id = auth.uid())
  WITH CHECK (blocker_id = auth.uid());

-- impact_events: only granted consent AND circle membership
CREATE POLICY impact_read ON impact_events
  FOR SELECT TO authenticated
  USING (
    consent_status = 'granted'
    AND is_circle_member(auth.uid(), circle_id)
  );

-- notifications: self only
CREATE POLICY notifications_self_read ON notifications
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- reports: reporter OR platform admin (snapshot only)
CREATE POLICY reports_read ON reports
  FOR SELECT TO authenticated
  USING (reporter_id = auth.uid() OR is_platform_admin(auth.uid()));

-- admin_access_requests: platform admin creates & reads own break-glass logs
CREATE POLICY break_glass_admin_read ON admin_access_requests
  FOR SELECT TO authenticated
  USING (admin_id = auth.uid() OR is_platform_admin(auth.uid()));

-- audit_logs: readable by platform admin; NO direct INSERT/UPDATE/DELETE by anyone
CREATE POLICY audit_logs_admin_read ON audit_logs
  FOR SELECT TO authenticated
  USING (is_platform_admin(auth.uid()));

-- idempotency_keys: self only
CREATE POLICY idempotency_self ON idempotency_keys
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
