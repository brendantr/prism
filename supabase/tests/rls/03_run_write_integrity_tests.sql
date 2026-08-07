-- ===========================================================================
-- Workout write-integrity suite (I-2).
-- ===========================================================================
-- Verifies `public.save_workout_graph` (0003_workout_write_integrity.sql)
-- against a live Postgres instance with all three migrations applied exactly
-- as committed. This is the "test that simulates a mid-sequence failure" that
-- `Docs/invariants.md` I-2 names as its expected validation, plus the
-- reconciliation and idempotency behaviour the same migration adds.
--
-- Method matches 02_run_isolation_tests.sql: every call runs as the non-owning
-- `authenticated` role with `request.jwt.claim.sub` set, exactly as PostgREST
-- drives a real Supabase request. The function is `security invoker`, so this
-- is not merely a convenience -- running it as the table owner would bypass
-- the RLS these assertions depend on and prove nothing.
--
-- Re-runnable: every row this file creates uses the 9xxxxxxx id range and is
-- removed at the end, so the fixture data from 01_seed_test_data.sql is left
-- exactly as it was found.
--
-- Fixture ids (seeded by 01_seed_test_data.sql):
--   User A   = 11111111-1111-1111-1111-111111111111
--   User B   = 22222222-2222-2222-2222-222222222222
--   A's own exercise = a0000000-0000-0000-0000-0000000000a1
--   A's workout      = e0000000-0000-0000-0000-0000000000a1
-- ===========================================================================

-- `_record` and `_count_as` are created by 02_run_isolation_tests.sql, which
-- run.sh applies first and which aborts the run if any of its own assertions
-- fail. Recreating them keeps this file runnable on its own; truncating is
-- safe because 02 has already printed and enforced its summary by this point.
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

-- Calls save_workout_graph as a given user, returning the error message if it
-- raised and null if it succeeded. Every assertion below is phrased in terms
-- of this, so "did it throw" and "what did it leave behind" stay separable.
create or replace function public._save_as(p_uid uuid, p_workout jsonb, p_records jsonb default '[]'::jsonb)
returns text language plpgsql as $$
declare
  v_err text := null;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', p_uid::text, true);
  begin
    perform public.save_workout_graph(p_workout, p_records);
  exception when others then
    v_err := sqlerrm;
  end;
  reset role;
  perform set_config('request.jwt.claim.sub', '', true);
  return v_err;
end;
$$;

-- =====================================================================
-- 1. Happy path: the whole graph lands in one call
-- =====================================================================
do $$
declare
  v_err text;
begin
  v_err := public._save_as(
    '11111111-1111-1111-1111-111111111111',
    jsonb_build_object(
      'id', '90000000-0000-0000-0000-000000000001',
      'title', 'Integrity Session',
      'status', 'completed',
      'started_at', '2026-08-06T10:00:00Z',
      'ended_at', '2026-08-06T11:00:00Z',
      'exercises', jsonb_build_array(
        jsonb_build_object(
          'id', '91000000-0000-0000-0000-000000000001',
          'exercise_id', 'a0000000-0000-0000-0000-0000000000a1',
          'order_index', 0,
          'sets', jsonb_build_array(
            jsonb_build_object('id', '92000000-0000-0000-0000-000000000001',
              'workout_exercise_id', '91000000-0000-0000-0000-000000000001',
              'set_index', 0, 'weight_kg', 100, 'reps', 5, 'completed', true),
            jsonb_build_object('id', '92000000-0000-0000-0000-000000000002',
              'workout_exercise_id', '91000000-0000-0000-0000-000000000001',
              'set_index', 1, 'weight_kg', 100, 'reps', 5, 'completed', true)
          )
        )
      )
    ),
    jsonb_build_array(
      jsonb_build_object('id', '93000000-0000-0000-0000-000000000001',
        'exercise_id', 'a0000000-0000-0000-0000-0000000000a1',
        'kind', 'e1rm', 'value', 116.67, 'reps', 5, 'weight_kg', 100,
        'achieved_at', '2026-08-06T10:00:00Z')
    )
  );
  perform public._record('save_workout_graph: writes a whole graph in one call', v_err is null, coalesce(v_err, 'ok'));
end $$;

select public._record('happy path: workout row exists',
  (select count(*) from workouts where id = '90000000-0000-0000-0000-000000000001') = 1);
select public._record('happy path: exercise block exists',
  (select count(*) from workout_exercises where workout_id = '90000000-0000-0000-0000-000000000001') = 1);
select public._record('happy path: both sets exist',
  (select count(*) from sets where workout_exercise_id = '91000000-0000-0000-0000-000000000001') = 2);
select public._record('happy path: personal record exists',
  (select count(*) from personal_records where workout_id = '90000000-0000-0000-0000-000000000001') = 1);
select public._record('happy path: profile_id came from the session, not the payload',
  (select profile_id from workouts where id = '90000000-0000-0000-0000-000000000001')
    = '11111111-1111-1111-1111-111111111111');

-- =====================================================================
-- 2. Idempotent retry: the same session saved twice is saved once
-- =====================================================================
-- The retry deliberately mints a NEW personal-record id, which is exactly what
-- app/workout/active.tsx does on every attempt. Before 0003 this inserted a
-- second, duplicate PR row.
do $$
declare
  v_err text;
begin
  v_err := public._save_as(
    '11111111-1111-1111-1111-111111111111',
    jsonb_build_object(
      'id', '90000000-0000-0000-0000-000000000001',
      'title', 'Integrity Session',
      'status', 'completed',
      'started_at', '2026-08-06T10:00:00Z',
      'ended_at', '2026-08-06T11:00:00Z',
      'exercises', jsonb_build_array(
        jsonb_build_object(
          'id', '91000000-0000-0000-0000-000000000001',
          'exercise_id', 'a0000000-0000-0000-0000-0000000000a1',
          'order_index', 0,
          'sets', jsonb_build_array(
            jsonb_build_object('id', '92000000-0000-0000-0000-000000000001',
              'workout_exercise_id', '91000000-0000-0000-0000-000000000001',
              'set_index', 0, 'weight_kg', 100, 'reps', 5, 'completed', true),
            jsonb_build_object('id', '92000000-0000-0000-0000-000000000002',
              'workout_exercise_id', '91000000-0000-0000-0000-000000000001',
              'set_index', 1, 'weight_kg', 100, 'reps', 5, 'completed', true)
          )
        )
      )
    ),
    jsonb_build_array(
      jsonb_build_object('id', '93000000-0000-0000-0000-0000000000ff',
        'exercise_id', 'a0000000-0000-0000-0000-0000000000a1',
        'kind', 'e1rm', 'value', 116.67, 'reps', 5, 'weight_kg', 100,
        'achieved_at', '2026-08-06T10:00:00Z')
    )
  );
  perform public._record('retry: an exact re-save succeeds', v_err is null, coalesce(v_err, 'ok'));
end $$;

select public._record('retry: still exactly one personal record (no duplicate)',
  (select count(*) from personal_records where workout_id = '90000000-0000-0000-0000-000000000001') = 1);
select public._record('retry: the first record won -- the retry''s new id was discarded',
  (select count(*) from personal_records where id = '93000000-0000-0000-0000-000000000001') = 1);
select public._record('retry: still exactly two sets',
  (select count(*) from sets where workout_exercise_id = '91000000-0000-0000-0000-000000000001') = 2);

-- =====================================================================
-- 3. Reconciliation: what the payload omits is removed
-- =====================================================================
-- Before 0003 the write was additive only, so a set deleted in the logger
-- stayed in Postgres and came back on the next read.
do $$
declare
  v_err text;
begin
  v_err := public._save_as(
    '11111111-1111-1111-1111-111111111111',
    jsonb_build_object(
      'id', '90000000-0000-0000-0000-000000000001',
      'title', 'Integrity Session',
      'status', 'completed',
      'started_at', '2026-08-06T10:00:00Z',
      'exercises', jsonb_build_array(
        jsonb_build_object(
          'id', '91000000-0000-0000-0000-000000000001',
          'exercise_id', 'a0000000-0000-0000-0000-0000000000a1',
          'order_index', 0,
          'sets', jsonb_build_array(
            jsonb_build_object('id', '92000000-0000-0000-0000-000000000001',
              'workout_exercise_id', '91000000-0000-0000-0000-000000000001',
              'set_index', 0, 'weight_kg', 100, 'reps', 5, 'completed', true)
          )
        )
      )
    )
  );
  perform public._record('reconcile: a save with one set removed succeeds', v_err is null, coalesce(v_err, 'ok'));
end $$;

select public._record('reconcile: the removed set is gone from Postgres',
  (select count(*) from sets where id = '92000000-0000-0000-0000-000000000002') = 0);
select public._record('reconcile: the kept set survived',
  (select count(*) from sets where id = '92000000-0000-0000-0000-000000000001') = 1);

-- Removing the whole exercise block cascades to its remaining sets.
do $$
declare
  v_err text;
begin
  v_err := public._save_as(
    '11111111-1111-1111-1111-111111111111',
    jsonb_build_object(
      'id', '90000000-0000-0000-0000-000000000001',
      'title', 'Integrity Session',
      'status', 'completed',
      'started_at', '2026-08-06T10:00:00Z',
      'exercises', '[]'::jsonb
    )
  );
  perform public._record('reconcile: a save with every exercise removed succeeds', v_err is null, coalesce(v_err, 'ok'));
end $$;

select public._record('reconcile: the removed exercise block is gone',
  (select count(*) from workout_exercises where workout_id = '90000000-0000-0000-0000-000000000001') = 0);
select public._record('reconcile: its sets went with it',
  (select count(*) from sets where id = '92000000-0000-0000-0000-000000000001') = 0);
select public._record('reconcile: the workout row itself survived',
  (select count(*) from workouts where id = '90000000-0000-0000-0000-000000000001') = 1);

-- =====================================================================
-- 4. Atomicity: a failure part-way leaves NOTHING behind
-- =====================================================================
-- This is the mid-sequence failure I-2 asks for. `reps = 900` violates the
-- `reps <= 500` check on `sets`, which is the LAST table the function writes
-- to -- so the workout row and its exercise block have already been inserted
-- when it fires. If the function were not one transaction, they would survive.
do $$
declare
  v_err text;
begin
  v_err := public._save_as(
    '11111111-1111-1111-1111-111111111111',
    jsonb_build_object(
      'id', '90000000-0000-0000-0000-000000000002',
      'title', 'Doomed Session',
      'status', 'completed',
      'started_at', '2026-08-06T12:00:00Z',
      'exercises', jsonb_build_array(
        jsonb_build_object(
          'id', '91000000-0000-0000-0000-000000000002',
          'exercise_id', 'a0000000-0000-0000-0000-0000000000a1',
          'order_index', 0,
          'sets', jsonb_build_array(
            jsonb_build_object('id', '92000000-0000-0000-0000-000000000003',
              'workout_exercise_id', '91000000-0000-0000-0000-000000000002',
              'set_index', 0, 'weight_kg', 100, 'reps', 900, 'completed', true)
          )
        )
      )
    ),
    jsonb_build_array(
      jsonb_build_object('id', '93000000-0000-0000-0000-000000000002',
        'exercise_id', 'a0000000-0000-0000-0000-0000000000a1',
        'kind', 'e1rm', 'value', 200, 'achieved_at', '2026-08-06T12:00:00Z')
    )
  );
  perform public._record('atomicity: an invalid set aborts the call', v_err is not null, coalesce(v_err, 'call unexpectedly succeeded'));
end $$;

select public._record('atomicity: no workout row was left behind',
  (select count(*) from workouts where id = '90000000-0000-0000-0000-000000000002') = 0);
select public._record('atomicity: no exercise block was left behind',
  (select count(*) from workout_exercises where id = '91000000-0000-0000-0000-000000000002') = 0);
select public._record('atomicity: no personal record was left behind',
  (select count(*) from personal_records where id = '93000000-0000-0000-0000-000000000002') = 0);

-- =====================================================================
-- 5. Reordering inside one call (deferred positional uniqueness)
-- =====================================================================
-- Two blocks swap order_index in a single statement. With the non-deferrable
-- constraint 0001 shipped, the row-by-row check collides mid-statement and the
-- entire save fails; 0003 defers it to commit.
do $$
declare
  v_err text;
  v_payload jsonb;
begin
  v_payload := jsonb_build_object(
    'id', '90000000-0000-0000-0000-000000000003',
    'title', 'Reorder Session',
    'status', 'in_progress',
    'started_at', '2026-08-06T13:00:00Z',
    'exercises', jsonb_build_array(
      jsonb_build_object('id', '91000000-0000-0000-0000-00000000000a',
        'exercise_id', 'a0000000-0000-0000-0000-0000000000a1', 'order_index', 0, 'sets', '[]'::jsonb),
      jsonb_build_object('id', '91000000-0000-0000-0000-00000000000b',
        'exercise_id', 'a0000000-0000-0000-0000-0000000000a1', 'order_index', 1, 'sets', '[]'::jsonb)
    )
  );
  v_err := public._save_as('11111111-1111-1111-1111-111111111111', v_payload);
  perform public._record('reorder: initial two-block save succeeds', v_err is null, coalesce(v_err, 'ok'));

  -- Same two blocks, positions swapped.
  v_payload := jsonb_set(v_payload, '{exercises}', jsonb_build_array(
    jsonb_build_object('id', '91000000-0000-0000-0000-00000000000a',
      'exercise_id', 'a0000000-0000-0000-0000-0000000000a1', 'order_index', 1, 'sets', '[]'::jsonb),
    jsonb_build_object('id', '91000000-0000-0000-0000-00000000000b',
      'exercise_id', 'a0000000-0000-0000-0000-0000000000a1', 'order_index', 0, 'sets', '[]'::jsonb)
  ));
  v_err := public._save_as('11111111-1111-1111-1111-111111111111', v_payload);
  perform public._record('reorder: swapping two order_index values in one call succeeds', v_err is null, coalesce(v_err, 'ok'));
end $$;

select public._record('reorder: block A ended up at index 1',
  (select order_index from workout_exercises where id = '91000000-0000-0000-0000-00000000000a') = 1);
select public._record('reorder: block B ended up at index 0',
  (select order_index from workout_exercises where id = '91000000-0000-0000-0000-00000000000b') = 0);

-- =====================================================================
-- 6. Cross-tenant: the function is not a way around RLS
-- =====================================================================
-- The whole reason it is `security invoker`. B submits a graph carrying A's
-- workout id; it must fail, and A's row must be untouched.
do $$
declare
  v_err text;
begin
  v_err := public._save_as(
    '22222222-2222-2222-2222-222222222222',
    jsonb_build_object(
      'id', 'e0000000-0000-0000-0000-0000000000a1',
      'title', 'Hijacked By B',
      'status', 'completed',
      'started_at', '2026-08-06T14:00:00Z',
      'exercises', '[]'::jsonb
    )
  );
  perform public._record('cross-tenant: B cannot save onto A''s workout id', v_err is not null, coalesce(v_err, 'call unexpectedly succeeded'));
end $$;

select public._record('cross-tenant: A''s workout title is unchanged',
  (select title from workouts where id = 'e0000000-0000-0000-0000-0000000000a1') = 'A''s Workout');
select public._record('cross-tenant: A''s workout still belongs to A',
  (select profile_id from workouts where id = 'e0000000-0000-0000-0000-0000000000a1')
    = '11111111-1111-1111-1111-111111111111');
select public._record('cross-tenant: A''s exercise block was not deleted by B''s empty payload',
  (select count(*) from workout_exercises where workout_id = 'e0000000-0000-0000-0000-0000000000a1') = 1);

-- =====================================================================
-- 7. Unauthenticated calls are refused
-- =====================================================================
do $$
declare
  v_err text := null;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', '', true);
  begin
    perform public.save_workout_graph(
      jsonb_build_object('id', '90000000-0000-0000-0000-00000000000f', 'title', 'Anon', 'exercises', '[]'::jsonb));
  exception when others then
    v_err := sqlerrm;
  end;
  reset role;
  perform public._record('unauthenticated: a call with no session is refused', v_err is not null,
    coalesce(v_err, 'call unexpectedly succeeded'));
end $$;

select public._record('unauthenticated: no workout row was created',
  (select count(*) from workouts where id = '90000000-0000-0000-0000-00000000000f') = 0);

-- =====================================================================
-- Cleanup -- leave 01_seed_test_data.sql's fixtures exactly as found
-- =====================================================================
delete from personal_records where workout_id in (
  '90000000-0000-0000-0000-000000000001',
  '90000000-0000-0000-0000-000000000002',
  '90000000-0000-0000-0000-000000000003');
delete from workouts where id in (
  '90000000-0000-0000-0000-000000000001',
  '90000000-0000-0000-0000-000000000002',
  '90000000-0000-0000-0000-000000000003',
  '90000000-0000-0000-0000-00000000000f');

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
  raise notice '=== workout write-integrity suite: % / % assertions passed ===', (v_total - v_failed), v_total;
  if v_failed > 0 then
    raise exception '% write-integrity assertion(s) FAILED -- see rows above with passed=false', v_failed;
  end if;
end $$;
