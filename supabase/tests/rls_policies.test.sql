-- supabase/tests/rls_policies.test.sql
-- pgTAP verification suite proving allowed & denied access under RLS

BEGIN;
SELECT plan(10);

-- Setup test users in authenticated role simulation
SET LOCAL ROLE postgres;

INSERT INTO users (id, email, role, country_code, age_confirmed_at, age_confirmed_min, trust_level)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'requester@test.local', 'member', 'SA', now(), 18, 2),
  ('22222222-2222-2222-2222-222222222222', 'provider@test.local', 'member', 'SA', now(), 18, 3),
  ('33333333-3333-3333-3333-333333333333', 'outsider@test.local', 'member', 'SA', now(), 18, 2),
  ('44444444-4444-4444-4444-444444444444', 'mod@test.local', 'moderator', 'SA', now(), 18, 4)
ON CONFLICT DO NOTHING;

INSERT INTO private_contacts (user_id, phone_e164, preferred_channel)
VALUES ('11111111-1111-1111-1111-111111111111', '+966500000001', 'phone')
ON CONFLICT DO NOTHING;

INSERT INTO circles (id, name, country_code, region_code, invite_code, created_by)
VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Test Circle', 'SA', 'SA-RUH-N01', 'TEST01', '11111111-1111-1111-1111-111111111111')
ON CONFLICT DO NOTHING;

INSERT INTO circle_members (circle_id, user_id, role, status)
VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'owner', 'active'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222', 'member', 'active')
ON CONFLICT DO NOTHING;

INSERT INTO needs (id, requester_id, title, description, category, urgency, status, region_code, time_window_start, time_window_end, expires_at)
VALUES (
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  '11111111-1111-1111-1111-111111111111',
  'Need Groceries',
  'Weekly grocery support needed',
  'groceries',
  'normal',
  'draft',
  'SA-RUH-N01',
  now(),
  now() + interval '4 hours',
  now() + interval '2 days'
)
ON CONFLICT DO NOTHING;

INSERT INTO need_circles (need_id, circle_id)
VALUES ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')
ON CONFLICT DO NOTHING;

SELECT transition_need('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'published', '11111111-1111-1111-1111-111111111111');

-- 1. Outsider sees 0 needs
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', true);
SELECT is((SELECT count(*)::int FROM needs WHERE id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'), 0, 'Outsider cannot read circle need');

-- 2. Outsider sees 0 private_contacts
SELECT is((SELECT count(*)::int FROM private_contacts), 0, 'Outsider sees 0 private_contacts');

-- 3. Circle member sees published need
SELECT set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
SELECT is((SELECT count(*)::int FROM needs WHERE id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'), 1, 'Circle member reads published need');

-- 4. Direct status update is blocked by trigger
SELECT throws_ok(
  $$UPDATE needs SET status = 'completed' WHERE id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'$$,
  'Direct status update forbidden. Use transition_need().',
  'Direct status column update is forbidden'
);

-- 5. Moderator cannot read private need without break-glass
SELECT set_config('request.jwt.claim.sub', '44444444-4444-4444-4444-444444444444', true);
SELECT is((SELECT count(*)::int FROM needs WHERE id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'), 0, 'Moderator blocked without break-glass');

-- 6. Mutual block hides need from blocked circle member
SET LOCAL ROLE postgres;
INSERT INTO blocks (blocker_id, blocked_id) VALUES ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
SELECT is((SELECT count(*)::int FROM needs WHERE id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'), 0, 'Blocked user cannot see need');

-- 7. Moderator WITH valid break-glass can inspect need
SET LOCAL ROLE postgres;
INSERT INTO admin_access_requests (admin_id, target_type, target_id, reason, expires_at)
VALUES ('44444444-4444-4444-4444-444444444444', 'need', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Investigating safety report #101', now() + interval '1 hour');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '44444444-4444-4444-4444-444444444444', true);
SELECT is((SELECT count(*)::int FROM needs WHERE id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'), 1, 'Moderator reads need with active break-glass');

-- 8. Private contact hidden until dual consent
SELECT set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
SELECT is((SELECT count(*)::int FROM private_contacts WHERE user_id = '11111111-1111-1111-1111-111111111111'), 0, 'Private contact hidden without dual reveal');

-- 9. Audit logs cannot be updated or deleted
SELECT throws_ok(
  $$DELETE FROM audit_logs$$,
  NULL,
  'Audit logs cannot be deleted'
);

-- 10. Impact event hidden when consent_status = revoked
SET LOCAL ROLE postgres;
INSERT INTO impact_events (need_id, circle_id, category, approximate_window, consent_status)
VALUES ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'groceries', 'today_evening', 'revoked');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
SELECT is((SELECT count(*)::int FROM impact_events), 0, 'Private impact event hidden when consent is revoked');

SELECT * FROM finish();
ROLLBACK;
