-- ===========================================================================
-- Exercise-reference suite (0007_deletable_account_with_custom_exercises.sql).
-- ===========================================================================
-- The case `05_run_account_deletion_tests.sql` did not have: a lifter who
-- created their OWN movement and logged a session with it, then deleted their
-- account.
--
-- That suite's fixture user has a workout with no exercise blocks, so the two
-- cascade branches out of `profiles` (to `exercises`, and to `workouts` →
-- `workout_exercises`) never collided. 21 assertions, all green, and account
-- deletion was broken for every lifter with a custom movement. It was found by
-- the integration lane against a real project, not here.
--
-- So this file is deliberately built around the shape that was missing, and the
-- protection assertions sit next to it: the point of `0007` is that deletion
-- works WITHOUT the guard on logged history getting weaker.
--
-- Uses its own fixture users (D and E), created and destroyed here. Method
-- matches 02–06: every call runs as the non-owning `authenticated` role with
-- `request.jwt.claim.sub` set.
-- ===========================================================================

create table if not exists public._test_results (
  id          serial primary key,
  description text not null,
  passed      boolean not null,
  detail      text
);
truncate public._test_results;

create or replace function public._record(p_desc text, p_passed boolean, p_detail text default null)
returns void language plpgsql as $$
begin
  insert into public._test_results (description, passed, detail) values (p_desc, p_passed, p_detail);
end;
$$;

create or replace function public._delete_account_as(p_uid uuid)
returns text language plpgsql as $$
declare v_err text := null;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', p_uid::text, true);
  begin perform public.delete_my_account();
  exception when others then v_err := sqlerrm; end;
  reset role;
  perform set_config('request.jwt.claim.sub', '', true);
  return v_err;
end;
$$;

/**
 * Deleting one exercise, as its owner.
 *
 * `set constraints all immediate` forces a deferred constraint to report inside
 * this call rather than at the outer commit. Without it the delete would appear
 * to succeed here and blow up somewhere unrelated later, which is a genuinely
 * confusing way to read a test result.
 */
create or replace function public._delete_exercise_as(p_uid uuid, p_exercise uuid)
returns text language plpgsql as $$
declare v_err text := null;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', p_uid::text, true);
  begin
    delete from public.exercises where id = p_exercise;
    set constraints all immediate;
  exception when others then v_err := sqlerrm; end;
  reset role;
  perform set_config('request.jwt.claim.sub', '', true);
  return v_err;
end;
$$;

-- =====================================================================
-- 0. The constraints are deferrable, and still restrict-shaped
-- =====================================================================
-- Asserted on the catalogue, not only on behaviour: a later migration that
-- "tidied" these back to `on delete cascade` would still pass every behavioural
-- assertion below about deletion succeeding, while silently destroying logged
-- sets whenever a movement was removed.
do $$
declare
  v_bad int;
begin
  select count(*) into v_bad
    from pg_constraint
   where conname in ('workout_exercises_exercise_id_fkey', 'routine_exercises_exercise_id_fkey')
     and not (condeferrable and condeferred and confdeltype = 'a');

  perform public._record(
    'shape: both exercise FKs are NO ACTION, deferrable, initially deferred',
    v_bad = 0,
    format('%s constraint(s) not in the expected shape', v_bad));

  -- Never cascade. This is the assertion that protects training history.
  select count(*) into v_bad
    from pg_constraint
   where conname in ('workout_exercises_exercise_id_fkey', 'routine_exercises_exercise_id_fkey')
     and confdeltype = 'c';
  perform public._record(
    'shape: neither FK cascades -- deleting a movement must never delete logged sets',
    v_bad = 0,
    format('%s cascading', v_bad));
end $$;

-- =====================================================================
-- 1. Fixture: user D, with their own movement, logged in a session
-- =====================================================================
insert into auth.users (id, raw_user_meta_data) values
  ('44444444-4444-4444-4444-444444444444', '{"display_name": "Test User D"}')
on conflict (id) do nothing;

do $$
begin
  -- As the lifter, so the `assert_exercise_visible` trigger from 0002 sees the
  -- world the way it does in production.
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', '44444444-4444-4444-4444-444444444444', true);

  insert into public.exercises (id, profile_id, name, equipment, primary_muscles) values
    ('c0000000-0000-0000-0000-0000000000d1', '44444444-4444-4444-4444-444444444444',
     'D''s Gym-Specific Machine', 'machine', '{chest}');
  insert into public.workouts (id, profile_id, title, started_at) values
    ('e0000000-0000-0000-0000-0000000000d1', '44444444-4444-4444-4444-444444444444',
     'D''s Workout', '2026-03-05T10:00:00Z');
  insert into public.workout_exercises (id, workout_id, exercise_id, order_index) values
    ('f0000000-0000-0000-0000-0000000000d1', 'e0000000-0000-0000-0000-0000000000d1',
     'c0000000-0000-0000-0000-0000000000d1', 0);
  insert into public.sets (id, workout_exercise_id, set_index, weight_kg, reps, completed) values
    ('50000000-0000-0000-0000-0000000000d1', 'f0000000-0000-0000-0000-0000000000d1', 0, 60, 10, true);

  reset role;
  perform set_config('request.jwt.claim.sub', '', true);
end $$;

-- =====================================================================
-- 2. THE REGRESSION: that account can be deleted
-- =====================================================================
do $$
declare
  v_err text;
begin
  v_err := public._delete_account_as('44444444-4444-4444-4444-444444444444');

  perform public._record(
    'deletion: an account with a custom movement logged in a session deletes',
    v_err is null,
    coalesce(v_err, 'no error'));

  perform public._record(
    'deletion: and leaves nothing of theirs behind',
    (select count(*) from auth.users where id = '44444444-4444-4444-4444-444444444444') = 0
      and (select count(*) from public.exercises where profile_id = '44444444-4444-4444-4444-444444444444') = 0
      and (select count(*) from public.workouts  where profile_id = '44444444-4444-4444-4444-444444444444') = 0
      and (select count(*) from public.sets s
             join public.workout_exercises we on we.id = s.workout_exercise_id
            where we.id = 'f0000000-0000-0000-0000-0000000000d1') = 0,
    'users/exercises/workouts/sets');
end $$;

-- =====================================================================
-- 3. And the protection it must not have cost: user E
-- =====================================================================
insert into auth.users (id, raw_user_meta_data) values
  ('55555555-5555-5555-5555-555555555555', '{"display_name": "Test User E"}')
on conflict (id) do nothing;

do $$
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', '55555555-5555-5555-5555-555555555555', true);

  insert into public.exercises (id, profile_id, name, equipment, primary_muscles) values
    ('c0000000-0000-0000-0000-0000000000e1', '55555555-5555-5555-5555-555555555555',
     'E In Use', 'machine', '{chest}'),
    ('c0000000-0000-0000-0000-0000000000e2', '55555555-5555-5555-5555-555555555555',
     'E Unused', 'machine', '{chest}');
  insert into public.workouts (id, profile_id, title, started_at) values
    ('e0000000-0000-0000-0000-0000000000e1', '55555555-5555-5555-5555-555555555555',
     'E''s Workout', '2026-03-05T10:00:00Z');
  insert into public.workout_exercises (id, workout_id, exercise_id, order_index) values
    ('f0000000-0000-0000-0000-0000000000e1', 'e0000000-0000-0000-0000-0000000000e1',
     'c0000000-0000-0000-0000-0000000000e1', 0);

  reset role;
  perform set_config('request.jwt.claim.sub', '', true);
end $$;

do $$
declare
  v_in_use text;
  v_unused text;
  v_sets   int;
begin
  v_in_use := public._delete_exercise_as('55555555-5555-5555-5555-555555555555',
                                         'c0000000-0000-0000-0000-0000000000e1');
  perform public._record(
    'protection: a movement a logged session references still cannot be deleted',
    v_in_use is not null,
    coalesce(v_in_use, 'DELETE SUCCEEDED -- protection lost'));

  perform public._record(
    'protection: and the session that referenced it is intact',
    (select count(*) from public.workout_exercises
      where id = 'f0000000-0000-0000-0000-0000000000e1') = 1);

  v_unused := public._delete_exercise_as('55555555-5555-5555-5555-555555555555',
                                         'c0000000-0000-0000-0000-0000000000e2');
  perform public._record(
    'protection: a movement nothing references is still deletable',
    v_unused is null,
    coalesce(v_unused, 'deleted'));
end $$;

-- =====================================================================
-- 4. The shared catalogue is not collateral damage
-- =====================================================================
do $$
declare v_system int;
begin
  select count(*) into v_system from public.exercises where profile_id is null;
  perform public._record(
    'catalogue: the seeded system movements survived all of the above',
    v_system >= 43,
    format('found %s', v_system));
end $$;

-- =====================================================================
-- Cleanup
-- =====================================================================
do $$
begin
  perform public._delete_account_as('55555555-5555-5555-5555-555555555555');
end $$;

drop function if exists public._delete_account_as(uuid);
drop function if exists public._delete_exercise_as(uuid, uuid);

-- =====================================================================
-- Summary
-- =====================================================================
select id, description, passed, detail from public._test_results order by id;

do $$
declare
  v_total int;
  v_failed int;
begin
  select count(*), count(*) filter (where not passed) into v_total, v_failed from public._test_results;
  raise notice '=== exercise reference suite: % / % assertions passed ===', (v_total - v_failed), v_total;
  if v_failed > 0 then
    raise exception '% exercise reference assertion(s) FAILED -- see rows above with passed=false', v_failed;
  end if;
end $$;
