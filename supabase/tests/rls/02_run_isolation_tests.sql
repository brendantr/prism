-- ===========================================================================
-- RLS isolation test suite.
-- ===========================================================================
-- Verifies, against a live Postgres instance with 0001_init.sql and
-- 0002_security_hardening.sql applied exactly as committed, that every
-- RLS-enabled table actually enforces profile_id = auth.uid() isolation --
-- not just that the policies are written, but that they behave as designed.
--
-- Method: run each check as the non-owning `authenticated` role (RLS is not
-- enforced against a table owner or superuser -- see
-- 00_setup_auth_emulation.sql), with `request.jwt.claim.sub` set to a test
-- user's id, exactly matching how PostgREST drives a real Supabase request.
-- Every mutation assertion self-heals (restores the original row) if it
-- finds a real violation, so a single run leaves fixture data intact and the
-- suite is safely re-runnable from a clean database.
--
-- Fixture ids (seeded by 01_seed_test_data.sql):
--   User A = 11111111-1111-1111-1111-111111111111
--   User B = 22222222-2222-2222-2222-222222222222
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

-- Generic SELECT-visibility check: p_query must return a single bigint count.
create or replace function public._count_as(p_uid uuid, p_query text)
returns bigint language plpgsql as $$
declare
  v_count bigint;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', p_uid::text, true);
  execute p_query into v_count;
  reset role;
  perform set_config('request.jwt.claim.sub', '', true);
  return v_count;
end;
$$;

-- =====================================================================
-- profiles
-- =====================================================================
select public._record('profiles: A can SELECT own row',
  public._count_as('11111111-1111-1111-1111-111111111111',
    'select count(*) from profiles where id = ''11111111-1111-1111-1111-111111111111''') = 1);
select public._record('profiles: A cannot SELECT B''s row',
  public._count_as('11111111-1111-1111-1111-111111111111',
    'select count(*) from profiles where id = ''22222222-2222-2222-2222-222222222222''') = 0);

do $$
declare v_count int;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
  update profiles set display_name = 'A Updated Self' where id = '11111111-1111-1111-1111-111111111111';
  get diagnostics v_count = row_count;
  reset role;
  perform public._record('profiles: A can UPDATE own row', v_count = 1, 'rows_affected=' || v_count);
end $$;

do $$
declare v_count int;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
  update profiles set display_name = 'HACKED' where id = '22222222-2222-2222-2222-222222222222';
  get diagnostics v_count = row_count;
  reset role;
  if v_count > 0 then
    update profiles set display_name = 'Test User B' where id = '22222222-2222-2222-2222-222222222222';
  end if;
  perform public._record('profiles: A cannot UPDATE B''s row', v_count = 0, 'rows_affected=' || v_count);
end $$;

do $$
declare v_count int;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
  delete from profiles where id = '22222222-2222-2222-2222-222222222222';
  get diagnostics v_count = row_count;
  reset role;
  if v_count > 0 then
    insert into auth.users (id, raw_user_meta_data) values
      ('22222222-2222-2222-2222-222222222222', '{"display_name": "Test User B"}')
      on conflict (id) do nothing;
    insert into profiles (id, display_name) values
      ('22222222-2222-2222-2222-222222222222', 'Test User B') on conflict (id) do nothing;
  end if;
  perform public._record('profiles: A cannot DELETE B''s row', v_count = 0, 'rows_affected=' || v_count);
end $$;

-- =====================================================================
-- exercises (including the documented world-readable exception, I-6)
-- =====================================================================
select public._record('exercises: A can SELECT own row',
  public._count_as('11111111-1111-1111-1111-111111111111',
    'select count(*) from exercises where id = ''a0000000-0000-0000-0000-0000000000a1''') = 1);
select public._record('exercises: A cannot SELECT B''s row',
  public._count_as('11111111-1111-1111-1111-111111111111',
    'select count(*) from exercises where id = ''a0000000-0000-0000-0000-0000000000b1''') = 0);
select public._record('exercises: A CAN SELECT the null-profile_id system row (I-6 exception)',
  public._count_as('11111111-1111-1111-1111-111111111111',
    'select count(*) from exercises where id = ''a0000000-0000-0000-0000-000000000001''') = 1);
select public._record('exercises: B CAN SELECT the null-profile_id system row (I-6 exception)',
  public._count_as('22222222-2222-2222-2222-222222222222',
    'select count(*) from exercises where id = ''a0000000-0000-0000-0000-000000000001''') = 1);

do $$
declare v_count int;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
  update exercises set cue = 'HACKED' where id = '22222222-2222-2222-2222-222222222222'::uuid
    or id = 'a0000000-0000-0000-0000-0000000000b1';
  get diagnostics v_count = row_count;
  reset role;
  if v_count > 0 then
    update exercises set cue = null where id = 'a0000000-0000-0000-0000-0000000000b1';
  end if;
  perform public._record('exercises: A cannot UPDATE B''s row', v_count = 0, 'rows_affected=' || v_count);
end $$;

do $$
declare v_count int;
begin
  -- The system exercise is documented as immutable -- nobody should be able
  -- to update or delete it, not just "not the other user."
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
  update exercises set cue = 'HACKED' where id = 'a0000000-0000-0000-0000-000000000001';
  get diagnostics v_count = row_count;
  reset role;
  if v_count > 0 then
    update exercises set cue = null where id = 'a0000000-0000-0000-0000-000000000001';
  end if;
  perform public._record('exercises: A cannot UPDATE the null-profile_id system row', v_count = 0, 'rows_affected=' || v_count);
end $$;

do $$
declare v_count int;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
  delete from exercises where id = 'a0000000-0000-0000-0000-000000000001';
  get diagnostics v_count = row_count;
  reset role;
  if v_count > 0 then
    insert into exercises (id, profile_id, name, equipment, primary_muscles) values
      ('a0000000-0000-0000-0000-000000000001', null, 'Test System Squat', 'barbell', '{quads}')
      on conflict (id) do nothing;
  end if;
  perform public._record('exercises: A cannot DELETE the null-profile_id system row', v_count = 0, 'rows_affected=' || v_count);
end $$;

do $$
declare
  v_failed boolean := false;
  v_errmsg text;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
  begin
    insert into exercises (id, profile_id, name, equipment, primary_muscles)
      values ('a0000000-0000-0000-0000-0000000000c1', '22222222-2222-2222-2222-222222222222', 'Impersonated', 'dumbbell', '{biceps}');
  exception when others then
    v_failed := true;
    v_errmsg := sqlerrm;
  end;
  reset role;
  delete from exercises where id = 'a0000000-0000-0000-0000-0000000000c1';
  perform public._record('exercises: A cannot INSERT a row claiming to be B''s', v_failed, coalesce(v_errmsg, 'insert succeeded unexpectedly'));
end $$;

-- =====================================================================
-- routines
-- =====================================================================
select public._record('routines: A can SELECT own row',
  public._count_as('11111111-1111-1111-1111-111111111111',
    'select count(*) from routines where id = ''b0000000-0000-0000-0000-0000000000a1''') = 1);
select public._record('routines: A cannot SELECT B''s row',
  public._count_as('11111111-1111-1111-1111-111111111111',
    'select count(*) from routines where id = ''b0000000-0000-0000-0000-0000000000b1''') = 0);

do $$
declare v_count int;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
  update routines set name = 'HACKED' where id = 'b0000000-0000-0000-0000-0000000000b1';
  get diagnostics v_count = row_count;
  reset role;
  if v_count > 0 then
    update routines set name = 'B''s Routine' where id = 'b0000000-0000-0000-0000-0000000000b1';
  end if;
  perform public._record('routines: A cannot UPDATE B''s row', v_count = 0, 'rows_affected=' || v_count);
end $$;

do $$
declare v_count int;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
  delete from routines where id = 'b0000000-0000-0000-0000-0000000000b1';
  get diagnostics v_count = row_count;
  reset role;
  if v_count > 0 then
    insert into routines (id, profile_id, name) values
      ('b0000000-0000-0000-0000-0000000000b1', '22222222-2222-2222-2222-222222222222', 'B''s Routine')
      on conflict (id) do nothing;
  end if;
  perform public._record('routines: A cannot DELETE B''s row', v_count = 0, 'rows_affected=' || v_count);
end $$;

do $$
declare
  v_failed boolean := false;
  v_errmsg text;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
  begin
    insert into routines (id, profile_id, name)
      values ('b0000000-0000-0000-0000-0000000000c1', '22222222-2222-2222-2222-222222222222', 'Impersonated');
  exception when others then
    v_failed := true;
    v_errmsg := sqlerrm;
  end;
  reset role;
  delete from routines where id = 'b0000000-0000-0000-0000-0000000000c1';
  perform public._record('routines: A cannot INSERT a row claiming to be B''s', v_failed, coalesce(v_errmsg, 'insert succeeded unexpectedly'));
end $$;

-- =====================================================================
-- routine_days (EXISTS-walk to routines)
-- =====================================================================
select public._record('routine_days: A can SELECT own row',
  public._count_as('11111111-1111-1111-1111-111111111111',
    'select count(*) from routine_days where id = ''c0000000-0000-0000-0000-0000000000a1''') = 1);
select public._record('routine_days: A cannot SELECT B''s row',
  public._count_as('11111111-1111-1111-1111-111111111111',
    'select count(*) from routine_days where id = ''c0000000-0000-0000-0000-0000000000b1''') = 0);

do $$
declare v_count int;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
  update routine_days set name = 'HACKED' where id = 'c0000000-0000-0000-0000-0000000000b1';
  get diagnostics v_count = row_count;
  reset role;
  if v_count > 0 then
    update routine_days set name = 'Day 1' where id = 'c0000000-0000-0000-0000-0000000000b1';
  end if;
  perform public._record('routine_days: A cannot UPDATE B''s row', v_count = 0, 'rows_affected=' || v_count);
end $$;

do $$
declare
  v_failed boolean := false;
  v_errmsg text;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
  begin
    insert into routine_days (id, routine_id, name, day_index)
      values ('c0000000-0000-0000-0000-0000000000c1', 'b0000000-0000-0000-0000-0000000000b1', 'Impersonated', 2);
  exception when others then
    v_failed := true;
    v_errmsg := sqlerrm;
  end;
  reset role;
  delete from routine_days where id = 'c0000000-0000-0000-0000-0000000000c1';
  perform public._record('routine_days: A cannot INSERT a row under B''s routine', v_failed, coalesce(v_errmsg, 'insert succeeded unexpectedly'));
end $$;

-- =====================================================================
-- routine_exercises (EXISTS-walk to routine_days -> routines)
-- =====================================================================
select public._record('routine_exercises: A can SELECT own row',
  public._count_as('11111111-1111-1111-1111-111111111111',
    'select count(*) from routine_exercises where id = ''d0000000-0000-0000-0000-0000000000a1''') = 1);
select public._record('routine_exercises: A cannot SELECT B''s row',
  public._count_as('11111111-1111-1111-1111-111111111111',
    'select count(*) from routine_exercises where id = ''d0000000-0000-0000-0000-0000000000b1''') = 0);

do $$
declare v_count int;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
  update routine_exercises set target_sets = 99 where id = 'd0000000-0000-0000-0000-0000000000b1';
  get diagnostics v_count = row_count;
  reset role;
  if v_count > 0 then
    update routine_exercises set target_sets = 3 where id = 'd0000000-0000-0000-0000-0000000000b1';
  end if;
  perform public._record('routine_exercises: A cannot UPDATE B''s row', v_count = 0, 'rows_affected=' || v_count);
end $$;

do $$
declare
  v_failed boolean := false;
  v_errmsg text;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
  begin
    insert into routine_exercises (id, routine_day_id, exercise_id, order_index)
      values ('d0000000-0000-0000-0000-0000000000c1', 'c0000000-0000-0000-0000-0000000000b1', 'a0000000-0000-0000-0000-000000000001', 2);
  exception when others then
    v_failed := true;
    v_errmsg := sqlerrm;
  end;
  reset role;
  delete from routine_exercises where id = 'd0000000-0000-0000-0000-0000000000c1';
  perform public._record('routine_exercises: A cannot INSERT a row under B''s day', v_failed, coalesce(v_errmsg, 'insert succeeded unexpectedly'));
end $$;

-- =====================================================================
-- workouts
-- =====================================================================
select public._record('workouts: A can SELECT own row',
  public._count_as('11111111-1111-1111-1111-111111111111',
    'select count(*) from workouts where id = ''e0000000-0000-0000-0000-0000000000a1''') = 1);
select public._record('workouts: A cannot SELECT B''s row',
  public._count_as('11111111-1111-1111-1111-111111111111',
    'select count(*) from workouts where id = ''e0000000-0000-0000-0000-0000000000b1''') = 0);

do $$
declare v_count int;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
  update workouts set title = 'HACKED' where id = 'e0000000-0000-0000-0000-0000000000b1';
  get diagnostics v_count = row_count;
  reset role;
  if v_count > 0 then
    update workouts set title = 'B''s Workout' where id = 'e0000000-0000-0000-0000-0000000000b1';
  end if;
  perform public._record('workouts: A cannot UPDATE B''s row', v_count = 0, 'rows_affected=' || v_count);
end $$;

do $$
declare v_count int;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
  delete from workouts where id = 'e0000000-0000-0000-0000-0000000000b1';
  get diagnostics v_count = row_count;
  reset role;
  if v_count > 0 then
    insert into workouts (id, profile_id, title) values
      ('e0000000-0000-0000-0000-0000000000b1', '22222222-2222-2222-2222-222222222222', 'B''s Workout')
      on conflict (id) do nothing;
  end if;
  perform public._record('workouts: A cannot DELETE B''s row', v_count = 0, 'rows_affected=' || v_count);
end $$;

do $$
declare
  v_failed boolean := false;
  v_errmsg text;
  v_new_id uuid := 'e0000000-0000-0000-0000-0000000000c1';
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
  begin
    insert into workouts (id, profile_id, title)
      values (v_new_id, '22222222-2222-2222-2222-222222222222', 'Impersonated');
  exception when others then
    v_failed := true;
    v_errmsg := sqlerrm;
  end;
  reset role;
  delete from workouts where id = v_new_id;
  perform public._record('workouts: A cannot INSERT a row claiming to be B''s', v_failed, coalesce(v_errmsg, 'insert succeeded unexpectedly'));
end $$;

-- Positive control: A CAN insert and delete their own workout end-to-end,
-- proving the harness itself (roles/grants) permits legitimate access rather
-- than blocking everything indiscriminately.
do $$
declare
  v_insert_count int;
  v_delete_count int;
  v_own_id uuid := 'e0000000-0000-0000-0000-0000000000a9';
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
  insert into workouts (id, profile_id, title) values (v_own_id, '11111111-1111-1111-1111-111111111111', 'A''s Own Insert Test');
  get diagnostics v_insert_count = row_count;
  delete from workouts where id = v_own_id;
  get diagnostics v_delete_count = row_count;
  reset role;
  perform public._record('workouts: A CAN INSERT and DELETE their own row (harness sanity check)',
    v_insert_count = 1 and v_delete_count = 1,
    format('insert=%s delete=%s', v_insert_count, v_delete_count));
end $$;

-- =====================================================================
-- workout_exercises (EXISTS-walk to workouts)
-- =====================================================================
select public._record('workout_exercises: A can SELECT own row',
  public._count_as('11111111-1111-1111-1111-111111111111',
    'select count(*) from workout_exercises where id = ''f0000000-0000-0000-0000-0000000000a1''') = 1);
select public._record('workout_exercises: A cannot SELECT B''s row',
  public._count_as('11111111-1111-1111-1111-111111111111',
    'select count(*) from workout_exercises where id = ''f0000000-0000-0000-0000-0000000000b1''') = 0);

do $$
declare v_count int;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
  update workout_exercises set notes = 'HACKED' where id = 'f0000000-0000-0000-0000-0000000000b1';
  get diagnostics v_count = row_count;
  reset role;
  if v_count > 0 then
    update workout_exercises set notes = null where id = 'f0000000-0000-0000-0000-0000000000b1';
  end if;
  perform public._record('workout_exercises: A cannot UPDATE B''s row', v_count = 0, 'rows_affected=' || v_count);
end $$;

do $$
declare
  v_failed boolean := false;
  v_errmsg text;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
  begin
    insert into workout_exercises (id, workout_id, exercise_id, order_index)
      values ('f0000000-0000-0000-0000-0000000000c1', 'e0000000-0000-0000-0000-0000000000b1', 'a0000000-0000-0000-0000-000000000001', 2);
  exception when others then
    v_failed := true;
    v_errmsg := sqlerrm;
  end;
  reset role;
  delete from workout_exercises where id = 'f0000000-0000-0000-0000-0000000000c1';
  perform public._record('workout_exercises: A cannot INSERT a row under B''s workout', v_failed, coalesce(v_errmsg, 'insert succeeded unexpectedly'));
end $$;

-- =====================================================================
-- sets (EXISTS-walk to workout_exercises -> workouts)
-- =====================================================================
select public._record('sets: A can SELECT own row',
  public._count_as('11111111-1111-1111-1111-111111111111',
    'select count(*) from sets where id = ''10000000-0000-0000-0000-0000000000a1''') = 1);
select public._record('sets: A cannot SELECT B''s row',
  public._count_as('11111111-1111-1111-1111-111111111111',
    'select count(*) from sets where id = ''10000000-0000-0000-0000-0000000000b1''') = 0);

do $$
declare v_count int;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
  update sets set weight_kg = 999 where id = '10000000-0000-0000-0000-0000000000b1';
  get diagnostics v_count = row_count;
  reset role;
  if v_count > 0 then
    update sets set weight_kg = 50 where id = '10000000-0000-0000-0000-0000000000b1';
  end if;
  perform public._record('sets: A cannot UPDATE B''s row', v_count = 0, 'rows_affected=' || v_count);
end $$;

do $$
declare v_count int;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
  delete from sets where id = '10000000-0000-0000-0000-0000000000b1';
  get diagnostics v_count = row_count;
  reset role;
  if v_count > 0 then
    insert into sets (id, workout_exercise_id, set_index, weight_kg, reps) values
      ('10000000-0000-0000-0000-0000000000b1', 'f0000000-0000-0000-0000-0000000000b1', 1, 50, 10)
      on conflict (id) do nothing;
  end if;
  perform public._record('sets: A cannot DELETE B''s row', v_count = 0, 'rows_affected=' || v_count);
end $$;

do $$
declare
  v_failed boolean := false;
  v_errmsg text;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
  begin
    insert into sets (id, workout_exercise_id, set_index, weight_kg, reps)
      values ('10000000-0000-0000-0000-0000000000c1', 'f0000000-0000-0000-0000-0000000000b1', 2, 40, 8);
  exception when others then
    v_failed := true;
    v_errmsg := sqlerrm;
  end;
  reset role;
  delete from sets where id = '10000000-0000-0000-0000-0000000000c1';
  perform public._record('sets: A cannot INSERT a row under B''s workout_exercise', v_failed, coalesce(v_errmsg, 'insert succeeded unexpectedly'));
end $$;

-- =====================================================================
-- body_measurements
-- =====================================================================
select public._record('body_measurements: A can SELECT own row',
  public._count_as('11111111-1111-1111-1111-111111111111',
    'select count(*) from body_measurements where id = ''20000000-0000-0000-0000-0000000000a1''') = 1);
select public._record('body_measurements: A cannot SELECT B''s row',
  public._count_as('11111111-1111-1111-1111-111111111111',
    'select count(*) from body_measurements where id = ''20000000-0000-0000-0000-0000000000b1''') = 0);

do $$
declare v_count int;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
  update body_measurements set bodyweight_kg = 999 where id = '20000000-0000-0000-0000-0000000000b1';
  get diagnostics v_count = row_count;
  reset role;
  if v_count > 0 then
    update body_measurements set bodyweight_kg = 75.0 where id = '20000000-0000-0000-0000-0000000000b1';
  end if;
  perform public._record('body_measurements: A cannot UPDATE B''s row', v_count = 0, 'rows_affected=' || v_count);
end $$;

do $$
declare
  v_failed boolean := false;
  v_errmsg text;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
  begin
    insert into body_measurements (id, profile_id, bodyweight_kg)
      values ('20000000-0000-0000-0000-0000000000c1', '22222222-2222-2222-2222-222222222222', 70.0);
  exception when others then
    v_failed := true;
    v_errmsg := sqlerrm;
  end;
  reset role;
  delete from body_measurements where id = '20000000-0000-0000-0000-0000000000c1';
  perform public._record('body_measurements: A cannot INSERT a row claiming to be B''s', v_failed, coalesce(v_errmsg, 'insert succeeded unexpectedly'));
end $$;

-- =====================================================================
-- check_ins
-- =====================================================================
select public._record('check_ins: A can SELECT own row',
  public._count_as('11111111-1111-1111-1111-111111111111',
    'select count(*) from check_ins where id = ''30000000-0000-0000-0000-0000000000a1''') = 1);
select public._record('check_ins: A cannot SELECT B''s row',
  public._count_as('11111111-1111-1111-1111-111111111111',
    'select count(*) from check_ins where id = ''30000000-0000-0000-0000-0000000000b1''') = 0);

do $$
declare v_count int;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
  update check_ins set stress = 5 where id = '30000000-0000-0000-0000-0000000000b1';
  get diagnostics v_count = row_count;
  reset role;
  if v_count > 0 then
    update check_ins set stress = 3 where id = '30000000-0000-0000-0000-0000000000b1';
  end if;
  perform public._record('check_ins: A cannot UPDATE B''s row', v_count = 0, 'rows_affected=' || v_count);
end $$;

do $$
declare v_count int;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
  delete from check_ins where id = '30000000-0000-0000-0000-0000000000b1';
  get diagnostics v_count = row_count;
  reset role;
  if v_count > 0 then
    insert into check_ins (id, profile_id, sleep_quality, energy, soreness, stress) values
      ('30000000-0000-0000-0000-0000000000b1', '22222222-2222-2222-2222-222222222222', 3, 3, 3, 3)
      on conflict (id) do nothing;
  end if;
  perform public._record('check_ins: A cannot DELETE B''s row', v_count = 0, 'rows_affected=' || v_count);
end $$;

do $$
declare
  v_failed boolean := false;
  v_errmsg text;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
  begin
    insert into check_ins (id, profile_id, sleep_quality, energy, soreness, stress)
      values ('30000000-0000-0000-0000-0000000000c1', '22222222-2222-2222-2222-222222222222', 4, 4, 4, 4);
  exception when others then
    v_failed := true;
    v_errmsg := sqlerrm;
  end;
  reset role;
  delete from check_ins where id = '30000000-0000-0000-0000-0000000000c1';
  perform public._record('check_ins: A cannot INSERT a row claiming to be B''s', v_failed, coalesce(v_errmsg, 'insert succeeded unexpectedly'));
end $$;

-- =====================================================================
-- personal_records
-- =====================================================================
select public._record('personal_records: A can SELECT own row',
  public._count_as('11111111-1111-1111-1111-111111111111',
    'select count(*) from personal_records where id = ''40000000-0000-0000-0000-0000000000a1''') = 1);
select public._record('personal_records: A cannot SELECT B''s row',
  public._count_as('11111111-1111-1111-1111-111111111111',
    'select count(*) from personal_records where id = ''40000000-0000-0000-0000-0000000000b1''') = 0);

do $$
declare v_count int;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
  update personal_records set value = 999 where id = '40000000-0000-0000-0000-0000000000b1';
  get diagnostics v_count = row_count;
  reset role;
  if v_count > 0 then
    update personal_records set value = 55.0 where id = '40000000-0000-0000-0000-0000000000b1';
  end if;
  perform public._record('personal_records: A cannot UPDATE B''s row', v_count = 0, 'rows_affected=' || v_count);
end $$;

do $$
declare v_count int;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
  delete from personal_records where id = '40000000-0000-0000-0000-0000000000b1';
  get diagnostics v_count = row_count;
  reset role;
  if v_count > 0 then
    insert into personal_records (id, profile_id, exercise_id, kind, value) values
      ('40000000-0000-0000-0000-0000000000b1', '22222222-2222-2222-2222-222222222222', 'a0000000-0000-0000-0000-0000000000b1', 'weight', 55.0)
      on conflict (id) do nothing;
  end if;
  perform public._record('personal_records: A cannot DELETE B''s row', v_count = 0, 'rows_affected=' || v_count);
end $$;

do $$
declare
  v_failed boolean := false;
  v_errmsg text;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
  begin
    insert into personal_records (id, profile_id, exercise_id, kind, value)
      values ('40000000-0000-0000-0000-0000000000c1', '22222222-2222-2222-2222-222222222222', 'a0000000-0000-0000-0000-0000000000b1', 'weight', 999);
  exception when others then
    v_failed := true;
    v_errmsg := sqlerrm;
  end;
  reset role;
  delete from personal_records where id = '40000000-0000-0000-0000-0000000000c1';
  perform public._record('personal_records: A cannot INSERT a row claiming to be B''s', v_failed, coalesce(v_errmsg, 'insert succeeded unexpectedly'));
end $$;

-- =====================================================================
-- Reverse-direction spot check: B cannot access A's data either (proves
-- isolation is not accidentally one-directional).
-- =====================================================================
select public._record('workouts: B cannot SELECT A''s row (reverse direction)',
  public._count_as('22222222-2222-2222-2222-222222222222',
    'select count(*) from workouts where id = ''e0000000-0000-0000-0000-0000000000a1''') = 0);
select public._record('sets: B cannot SELECT A''s row (reverse direction)',
  public._count_as('22222222-2222-2222-2222-222222222222',
    'select count(*) from sets where id = ''10000000-0000-0000-0000-0000000000a1''') = 0);

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
  raise notice '=== RLS isolation suite: % / % assertions passed ===', (v_total - v_failed), v_total;
  if v_failed > 0 then
    raise exception '% RLS assertion(s) FAILED -- see rows above with passed=false', v_failed;
  end if;
end $$;
