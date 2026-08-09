-- ===========================================================================
-- Library seed suite (0006_seed_library.sql).
-- ===========================================================================
-- Verifies the shared movement catalogue and the template plans against a live
-- Postgres instance with all six migrations applied exactly as committed.
--
-- The property under test is **what a brand-new lifter can actually do**. Before
-- 0006 the answer on a correctly migrated project was "nothing" — an empty
-- picker and no plans — and no suite in this repository could see that, because
-- 01_seed_test_data.sql creates its own exercises and the Jest lane runs the
-- demo repository. So these assertions are deliberately written from the
-- position of a user who owns none of the catalogue.
--
-- Method matches 02/03/04: every read runs as the non-owning `authenticated`
-- role with `request.jwt.claim.sub` set, so RLS is the thing answering. Running
-- as the table owner would prove only that the rows exist.
--
-- Re-runnable, and one assertion depends on that: applying 0006 a second time
-- must change nothing.
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

-- =====================================================================
-- 1. The catalogue exists, and is PRism's rather than anyone's
-- =====================================================================
do $$
declare
  v_count int;
  v_owned int;
begin
  select count(*) into v_count from public.exercises where profile_id is null;
  perform public._record(
    'seed: at least 43 system exercises exist',
    v_count >= 43,
    format('found %s', v_count));

  -- If any seeded row carried a profile_id it would belong to one account and
  -- be invisible to everyone else, which is the failure this seeding is meant
  -- to remove rather than reproduce.
  select count(*) into v_owned
    from public.exercises
   where profile_id is not null
     and name in ('Barbell Bench Press', 'Back Squat', 'Conventional Deadlift');
  perform public._record(
    'seed: no catalogue movement was written as a user-owned row',
    v_owned = 0,
    format('found %s', v_owned));

  select count(*) into v_count from public.routines where profile_id is null and is_template;
  perform public._record(
    'seed: both template routines exist',
    v_count = 2,
    format('found %s', v_count));

  select count(*) into v_count
    from public.routine_exercises re
    join public.routine_days d on d.id = re.routine_day_id
    join public.routines r     on r.id = d.routine_id
   where r.profile_id is null;
  perform public._record(
    'seed: every template slot resolved to a real exercise (38)',
    v_count = 38,
    format('found %s', v_count));

  -- A slot pointing at nothing is the silent failure the migration's own guard
  -- exists for; this asserts the outcome independently of that guard.
  select count(*) into v_count
    from public.routine_exercises re
    left join public.exercises e on e.id = re.exercise_id
   where e.id is null;
  perform public._record(
    'seed: no template slot references a missing exercise',
    v_count = 0,
    format('found %s dangling', v_count));
end $$;

-- =====================================================================
-- 2. It seeds a catalogue, NOT training history
-- =====================================================================
-- The whole point of the product decision behind this migration: a tester
-- starts with something to log against and nothing already logged.
do $$
declare
  v_workouts int;
  v_checkins int;
  v_prs      int;
begin
  select count(*) into v_workouts from public.workouts
   where profile_id not in ('11111111-1111-1111-1111-111111111111',
                            '22222222-2222-2222-2222-222222222222');
  select count(*) into v_checkins from public.check_ins
   where profile_id not in ('11111111-1111-1111-1111-111111111111',
                            '22222222-2222-2222-2222-222222222222');
  select count(*) into v_prs from public.personal_records
   where profile_id not in ('11111111-1111-1111-1111-111111111111',
                            '22222222-2222-2222-2222-222222222222');

  perform public._record(
    'seed: no workout, check-in or personal record was seeded',
    v_workouts = 0 and v_checkins = 0 and v_prs = 0,
    format('workouts=%s check_ins=%s prs=%s', v_workouts, v_checkins, v_prs));
end $$;

-- =====================================================================
-- 3. A lifter who owns none of it can read all of it
-- =====================================================================
do $$
declare
  v_visible int;
  v_days    int;
  v_slots   int;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub',
                     '11111111-1111-1111-1111-111111111111', true);

  select count(*) into v_visible from public.exercises where profile_id is null;
  select count(*) into v_days
    from public.routine_days d join public.routines r on r.id = d.routine_id
   where r.profile_id is null;
  select count(*) into v_slots
    from public.routine_exercises re
    join public.routine_days d on d.id = re.routine_day_id
    join public.routines r     on r.id = d.routine_id
   where r.profile_id is null;

  reset role;
  perform set_config('request.jwt.claim.sub', '', true);

  perform public._record(
    'visibility: user A reads the whole system catalogue under RLS',
    v_visible >= 43,
    format('saw %s', v_visible));
  perform public._record(
    'visibility: user A reads the template days (7) and slots (38) under RLS',
    v_days = 7 and v_slots = 38,
    format('days=%s slots=%s', v_days, v_slots));
end $$;

-- =====================================================================
-- 4. And cannot change it
-- =====================================================================
-- `0001`'s write policies are `profile_id = auth.uid()`, so a system row is
-- unwritable by construction. Asserted rather than assumed, because a lifter
-- editing the shared cue for every other lifter is the concrete harm.
do $$
declare
  v_updated int;
  v_deleted int;
  v_err     text := null;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub',
                     '11111111-1111-1111-1111-111111111111', true);

  with u as (
    update public.exercises set cue = 'hijacked'
     where profile_id is null and name = 'Barbell Bench Press'
     returning 1
  ) select count(*) into v_updated from u;

  with d as (
    delete from public.exercises
     where profile_id is null and name = 'Barbell Bench Press'
     returning 1
  ) select count(*) into v_deleted from d;

  -- Claiming a system row as your own is the interesting variant: RLS filters
  -- the update to zero rows rather than raising, so a policy regression would
  -- look like success to a client that did not check the row count.
  begin
    insert into public.exercises (profile_id, name, equipment, primary_muscles)
    values (null, 'Smuggled Movement', 'barbell', '{chest}');
  exception when others then
    v_err := sqlerrm;
  end;

  reset role;
  perform set_config('request.jwt.claim.sub', '', true);

  perform public._record('immutability: a lifter cannot update a system exercise',
    v_updated = 0, format('%s row(s) updated', v_updated));
  perform public._record('immutability: a lifter cannot delete a system exercise',
    v_deleted = 0, format('%s row(s) deleted', v_deleted));
  perform public._record('immutability: a lifter cannot insert a system exercise',
    v_err is not null, coalesce(v_err, 'insert unexpectedly succeeded'));
end $$;

-- =====================================================================
-- 5. A lifter's own movements still work alongside it
-- =====================================================================
-- Seeding a shared catalogue must not have closed the door the schema already
-- opened for custom movements -- `01_seed_test_data.sql` gives user A one.
do $$
declare
  v_own    int;
  v_others int;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub',
                     '11111111-1111-1111-1111-111111111111', true);

  select count(*) into v_own from public.exercises
   where profile_id = '11111111-1111-1111-1111-111111111111';
  select count(*) into v_others from public.exercises
   where profile_id = '22222222-2222-2222-2222-222222222222';

  reset role;
  perform set_config('request.jwt.claim.sub', '', true);

  perform public._record('coexistence: user A still sees their own custom movement',
    v_own >= 1, format('found %s', v_own));
  perform public._record('coexistence: and still cannot see user B''s',
    v_others = 0, format('found %s', v_others));
end $$;

-- =====================================================================
-- 6. Applying it twice changes nothing
-- =====================================================================
-- Applying migrations to a hosted project is a manual step, so "did I already
-- run that one?" has to be a question the operator can answer by running it
-- again. The re-application happens in run.sh, immediately before this file.
-- Asserted as "no duplicates" rather than as an absolute row count, and that is
-- not a weaker test — it is the property itself, and it survives a fixture.
-- 01_seed_test_data.sql adds a system exercise of its own ('Test System
-- Squat'), so a total pinned to 43 would fail here for a reason that has
-- nothing to do with the seed running twice.
do $$
declare
  v_dupe_ex   int;
  v_dupe_rt   int;
  v_slots     int;
begin
  select count(*) into v_dupe_ex from (
    select lower(name) as n, equipment
      from public.exercises where profile_id is null
     group by 1, 2 having count(*) > 1
  ) d;

  select count(*) into v_dupe_rt from (
    select name from public.routines where profile_id is null
     group by 1 having count(*) > 1
  ) d;

  select count(*) into v_slots
    from public.routine_exercises re
    join public.routine_days d on d.id = re.routine_day_id
    join public.routines r     on r.id = d.routine_id
   where r.profile_id is null;

  perform public._record(
    'idempotency: a second application produced no duplicate rows',
    v_dupe_ex = 0 and v_dupe_rt = 0 and v_slots = 38,
    format('duplicate exercises=%s duplicate routines=%s slots=%s',
           v_dupe_ex, v_dupe_rt, v_slots));
end $$;

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
  raise notice '=== library seed suite: % / % assertions passed ===', (v_total - v_failed), v_total;
  if v_failed > 0 then
    raise exception '% library seed assertion(s) FAILED -- see rows above with passed=false', v_failed;
  end if;
end $$;
