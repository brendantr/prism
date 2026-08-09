-- ===========================================================================
-- RLS test harness: seed two users with one row in every RLS-enabled table.
-- ===========================================================================
-- Most inserts run as `postgres` (table owner / superuser), which bypasses
-- RLS -- exactly what a seed step needs to do, and exactly why RLS tests must
-- switch to a non-owning role (see 02_run_isolation_tests.sql) rather than
-- test from this session.
--
-- `routine_exercises`, `workout_exercises`, and `personal_records` are the
-- three exceptions: `0002_security_hardening.sql` added a same-transaction
-- trigger (`assert_exercise_visible`) on each that calls `auth.uid()`
-- directly, not through RLS -- so it is NOT bypassed by the postgres
-- superuser the way RLS itself is. Seeding those three tables as `postgres`
-- with no JWT claim set makes `auth.uid()` return null, which the trigger
-- correctly rejects (null never matches a real owner). The fix mirrors how
-- the real app actually writes this data: as the owning user's own
-- authenticated session, which naturally satisfies the check. This is not a
-- workaround for a test-harness quirk -- it reflects the real, intended
-- caller context for these three tables' writes.
--
-- No explicit transaction wrapper: each statement commits independently, so
-- a mid-script failure cannot silently roll back and invalidate rows that
-- already succeeded (a real failure mode found and fixed during this sprint
-- -- see Docs/sprints/2026-07-31-rls-policy-verification.md).
--
-- Layout: everything suffixed `_a` belongs to test user A, `_b` to test user
-- B. One system (profile_id is null) exercise is also seeded to test the
-- documented exception (I-6).
-- ===========================================================================

insert into auth.users (id, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', '{"display_name": "Test User A"}'),
  ('22222222-2222-2222-2222-222222222222', '{"display_name": "Test User B"}')
on conflict (id) do nothing;

-- profiles: auto-created by the on_auth_user_created trigger. Confirm rather
-- than assume, and set deterministic display names for readability.
update profiles set display_name = 'Test User A' where id = '11111111-1111-1111-1111-111111111111';
update profiles set display_name = 'Test User B' where id = '22222222-2222-2222-2222-222222222222';

-- exercises: one system row (profile_id null), one owned by each user.
-- No visibility trigger on this table itself, so postgres/superuser is fine.
insert into exercises (id, profile_id, name, equipment, primary_muscles) values
  ('a0000000-0000-0000-0000-000000000001', null, 'Test System Squat', 'barbell', '{quads}'),
  ('a0000000-0000-0000-0000-0000000000a1', '11111111-1111-1111-1111-111111111111', 'A''s Custom Curl', 'dumbbell', '{biceps}'),
  ('a0000000-0000-0000-0000-0000000000b1', '22222222-2222-2222-2222-222222222222', 'B''s Custom Curl', 'dumbbell', '{biceps}')
on conflict (id) do nothing;

-- routines / routine_days: no visibility trigger on either, postgres is fine.
insert into routines (id, profile_id, name) values
  ('b0000000-0000-0000-0000-0000000000a1', '11111111-1111-1111-1111-111111111111', 'A''s Routine'),
  ('b0000000-0000-0000-0000-0000000000b1', '22222222-2222-2222-2222-222222222222', 'B''s Routine')
on conflict (id) do nothing;

insert into routine_days (id, routine_id, name, day_index) values
  ('c0000000-0000-0000-0000-0000000000a1', 'b0000000-0000-0000-0000-0000000000a1', 'Day 1', 1),
  ('c0000000-0000-0000-0000-0000000000b1', 'b0000000-0000-0000-0000-0000000000b1', 'Day 1', 1)
on conflict (id) do nothing;

-- routine_exercises: HAS the exercise-visibility trigger. Insert as each
-- owning user so auth.uid() matches that exercise's profile_id.
do $$
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
  insert into routine_exercises (id, routine_day_id, exercise_id, order_index) values
    ('d0000000-0000-0000-0000-0000000000a1', 'c0000000-0000-0000-0000-0000000000a1', 'a0000000-0000-0000-0000-0000000000a1', 1)
    on conflict (id) do nothing;
  reset role;
end $$;

do $$
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
  insert into routine_exercises (id, routine_day_id, exercise_id, order_index) values
    ('d0000000-0000-0000-0000-0000000000b1', 'c0000000-0000-0000-0000-0000000000b1', 'a0000000-0000-0000-0000-0000000000b1', 1)
    on conflict (id) do nothing;
  reset role;
end $$;

-- workouts: no visibility trigger, postgres is fine.
insert into workouts (id, profile_id, title) values
  ('e0000000-0000-0000-0000-0000000000a1', '11111111-1111-1111-1111-111111111111', 'A''s Workout'),
  ('e0000000-0000-0000-0000-0000000000b1', '22222222-2222-2222-2222-222222222222', 'B''s Workout')
on conflict (id) do nothing;

-- workout_exercises: HAS the exercise-visibility trigger.
do $$
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
  insert into workout_exercises (id, workout_id, exercise_id, order_index) values
    ('f0000000-0000-0000-0000-0000000000a1', 'e0000000-0000-0000-0000-0000000000a1', 'a0000000-0000-0000-0000-0000000000a1', 1)
    on conflict (id) do nothing;
  reset role;
end $$;

do $$
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
  insert into workout_exercises (id, workout_id, exercise_id, order_index) values
    ('f0000000-0000-0000-0000-0000000000b1', 'e0000000-0000-0000-0000-0000000000b1', 'a0000000-0000-0000-0000-0000000000b1', 1)
    on conflict (id) do nothing;
  reset role;
end $$;

-- sets: no visibility trigger, postgres is fine.
insert into sets (id, workout_exercise_id, set_index, weight_kg, reps) values
  ('10000000-0000-0000-0000-0000000000a1', 'f0000000-0000-0000-0000-0000000000a1', 1, 50, 10),
  ('10000000-0000-0000-0000-0000000000b1', 'f0000000-0000-0000-0000-0000000000b1', 1, 50, 10)
on conflict (id) do nothing;

-- body_measurements / check_ins: no visibility trigger, postgres is fine.
insert into body_measurements (id, profile_id, bodyweight_kg) values
  ('20000000-0000-0000-0000-0000000000a1', '11111111-1111-1111-1111-111111111111', 80.0),
  ('20000000-0000-0000-0000-0000000000b1', '22222222-2222-2222-2222-222222222222', 75.0)
on conflict (id) do nothing;

insert into check_ins (id, profile_id, local_date, sleep_quality, energy, soreness, stress) values
  ('30000000-0000-0000-0000-0000000000a1', '11111111-1111-1111-1111-111111111111', timezone('utc', now())::date, 4, 4, 2, 2),
  ('30000000-0000-0000-0000-0000000000b1', '22222222-2222-2222-2222-222222222222', timezone('utc', now())::date, 3, 3, 3, 3)
on conflict (id) do nothing;

-- personal_records: HAS the exercise-visibility trigger.
do $$
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
  insert into personal_records (id, profile_id, exercise_id, kind, value) values
    ('40000000-0000-0000-0000-0000000000a1', '11111111-1111-1111-1111-111111111111', 'a0000000-0000-0000-0000-0000000000a1', 'weight', 60.0)
    on conflict (id) do nothing;
  reset role;
end $$;

do $$
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
  insert into personal_records (id, profile_id, exercise_id, kind, value) values
    ('40000000-0000-0000-0000-0000000000b1', '22222222-2222-2222-2222-222222222222', 'a0000000-0000-0000-0000-0000000000b1', 'weight', 55.0)
    on conflict (id) do nothing;
  reset role;
end $$;
