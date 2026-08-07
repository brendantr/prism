-- ===========================================================================
-- PRism -- workout write integrity
-- ===========================================================================
-- Follows 0002_security_hardening.sql. Closes `Docs/invariants.md` I-2 and the
-- gap `Docs/architecture.md` records as G-2: a completed session was written as
-- three sequential, non-transactional upserts plus a fourth, separate insert
-- for personal records.
--
-- 0001 and 0002 are deliberately not edited. An applied migration is never
-- rewritten, and there is no way from this repository to know whether a given
-- environment has already run one.
--
-- What was actually wrong, in the order it bit:
--
--   1. NOT ATOMIC. `SupabaseRepository.saveWorkout` issued `workouts`, then
--      `workout_exercises`, then `sets`. Each statement is atomic on its own;
--      nothing spanned the three. A failure at step two left a workout row with
--      no children, and a failure at step three left exercises with no sets.
--      The lifter saw "could not save" over a session that was half in the
--      database.
--
--   2. ADDITIVE ONLY. The write upserted what it was given and deleted nothing.
--      Saving a workout after removing an exercise left the removed exercise in
--      Postgres, and the next `listWorkouts()` read it back. The positional
--      unique constraints do not give replacement semantics -- they only reject
--      a duplicate `(workout_id, order_index)`.
--
--   3. PRs COULD DUPLICATE. Personal records were inserted after the workout
--      save, in a separate round trip, with freshly minted ids on every retry.
--      `personal_records` had no uniqueness beyond its primary key, so a retry
--      after a lost response inserted the same record a second time.
--
-- The fix is one function, `save_workout_graph`, that does all of it inside a
-- single implicit transaction.
--
-- SECURITY INVOKER -- deliberately, and it is the most important line here.
-- This function is NOT `security definer`. It runs with the caller's rights, so
-- every statement inside it is still subject to row level security exactly as
-- the individual upserts were. A `security definer` version would have been
-- shorter and would have quietly become the one hole in the authorization
-- boundary described in `Docs/invariants.md` I-1 and I-6. Ownership still comes
-- from `auth.uid()` and never from the payload.
--
-- Every statement is written to be safe to run more than once.
-- ===========================================================================

-- --------------------------------------------------------------------------
-- 1. Positional uniqueness must survive a reorder inside one transaction
-- --------------------------------------------------------------------------
-- `finish()` re-indexes: it drops exercise blocks where nothing was completed
-- and renumbers what is left, so an exercise saved at `order_index = 1` can
-- come back as `0`. Re-saving that workout updates several rows in ONE
-- statement, and a non-deferrable unique constraint is checked per row as the
-- statement walks them -- so a straight swap transiently collides and the whole
-- save fails, having touched nothing.
--
-- Deferring the check to commit time makes the intermediate states legal while
-- keeping the constraint itself exactly as strong at the point it matters. The
-- primary keys are untouched and stay non-deferrable: `on conflict (id)` below
-- needs them as arbiters, and a deferred unique index cannot serve as one.
alter table public.workout_exercises
  drop constraint if exists workout_exercises_workout_id_order_index_key;
alter table public.workout_exercises
  add constraint workout_exercises_workout_id_order_index_key
  unique (workout_id, order_index) deferrable initially deferred;

alter table public.sets
  drop constraint if exists sets_workout_exercise_id_set_index_key;
alter table public.sets
  add constraint sets_workout_exercise_id_set_index_key
  unique (workout_exercise_id, set_index) deferrable initially deferred;

-- --------------------------------------------------------------------------
-- 2. A personal record is unique per (lifter, session, exercise, kind)
-- --------------------------------------------------------------------------
-- This is what makes PR persistence idempotent. Without it, "insert the records
-- this session set" is only safe to run once, and a retry after a lost response
-- is indistinguishable from a second genuine PR.
--
-- `workout_id` is nullable (`on delete set null` from `workouts`), and Postgres
-- treats NULLs as distinct in a unique index. That is the behaviour we want: a
-- PR orphaned by a deleted workout keeps its history and never collides with a
-- live one.
--
-- Existing duplicates are removed first, otherwise the index cannot be built.
-- `ctid` picks an arbitrary survivor per group, which is correct here because
-- the duplicate rows are by definition the same record recorded twice.
delete from public.personal_records a
using public.personal_records b
where a.workout_id is not null
  and a.profile_id = b.profile_id
  and a.workout_id = b.workout_id
  and a.exercise_id = b.exercise_id
  and a.kind = b.kind
  and a.ctid > b.ctid;

create unique index if not exists personal_records_session_unique
  on public.personal_records (profile_id, workout_id, exercise_id, kind);

-- --------------------------------------------------------------------------
-- 3. The whole graph, in one transaction
-- --------------------------------------------------------------------------
-- A plpgsql function body runs inside the caller's transaction, so either every
-- statement below commits or none of them do. That is the entire point.
--
-- Shape of `p_workout` is the row shape the client already builds in
-- `src/data/supabase/mappers.ts` (`fromWorkout`), with an added `exercises`
-- array whose elements carry a `sets` array -- `fromWorkoutExercise` and
-- `fromSet` respectively. `p_records` is an array of `fromPersonalRecord`.
create or replace function public.save_workout_graph(
  p_workout jsonb,
  p_records jsonb default '[]'::jsonb
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_profile    uuid := auth.uid();
  v_workout_id uuid := (p_workout ->> 'id')::uuid;
begin
  -- Belt and braces. RLS would reject every statement below with `auth.uid()`
  -- null anyway; failing here says why, instead of surfacing as an empty
  -- policy violation on whichever statement happened to run first.
  if v_profile is null then
    raise exception 'save_workout_graph requires an authenticated session'
      using errcode = '28000';
  end if;

  if v_workout_id is null then
    raise exception 'save_workout_graph requires a workout id'
      using errcode = '22004';
  end if;

  -- 3a. The workout row itself. `profile_id` comes from the session.
  --
  -- If `v_workout_id` belongs to someone else, the insert conflicts with a row
  -- this caller cannot see under RLS, and Postgres raises a unique violation
  -- rather than updating it. A hard error on someone else's id is the correct
  -- outcome and is worth knowing is where it comes from.
  insert into public.workouts as w (
    id, profile_id, routine_day_id, title, status,
    started_at, ended_at, reflection, session_rating
  )
  values (
    v_workout_id,
    v_profile,
    nullif(p_workout ->> 'routine_day_id', '')::uuid,
    coalesce(nullif(p_workout ->> 'title', ''), 'Workout'),
    coalesce((p_workout ->> 'status')::public.workout_status, 'in_progress'),
    coalesce((p_workout ->> 'started_at')::timestamptz, now()),
    nullif(p_workout ->> 'ended_at', '')::timestamptz,
    p_workout ->> 'reflection',
    nullif(p_workout ->> 'session_rating', '')::smallint
  )
  on conflict (id) do update set
    routine_day_id = excluded.routine_day_id,
    title          = excluded.title,
    status         = excluded.status,
    started_at     = excluded.started_at,
    ended_at       = excluded.ended_at,
    reflection     = excluded.reflection,
    session_rating = excluded.session_rating
  where w.profile_id = v_profile;

  -- 3a-bis. The upsert must have landed on a row this caller owns.
  --
  -- Without this the cross-tenant case SUCCEEDS SILENTLY, which the write
  -- integrity suite caught: submitting another lifter's workout id conflicts
  -- with a row RLS hides, the `where` above evaluates false, and `on conflict
  -- do update` simply does nothing. No error is raised. RLS still protects the
  -- data -- every statement below matches zero rows, and the assertions in
  -- 03_run_write_integrity_tests.sql confirm the other lifter's session is
  -- untouched -- but the client is told the save worked when nothing was
  -- written. A save that quietly writes nothing is the exact failure this
  -- migration exists to remove, so it has to be an error.
  if not exists (
    select 1 from public.workouts w
    where w.id = v_workout_id and w.profile_id = v_profile
  ) then
    raise exception 'save_workout_graph: workout % is not owned by the calling session', v_workout_id
      using errcode = '42501';
  end if;

  -- 3b. Remove exercise blocks the submitted graph no longer contains.
  --
  -- This is the "additive only" fix. The payload is authoritative for this
  -- workout: what is not in it is not in the session any more. Deleting the
  -- block cascades to its sets (`on delete cascade`, 0001), so 3c only has to
  -- consider sets under blocks that survived.
  delete from public.sets s
  using public.workout_exercises we
  where s.workout_exercise_id = we.id
    and we.workout_id = v_workout_id
    and we.id not in (
      select (e ->> 'id')::uuid
      from jsonb_array_elements(coalesce(p_workout -> 'exercises', '[]'::jsonb)) as e
    );

  delete from public.workout_exercises we
  where we.workout_id = v_workout_id
    and we.id not in (
      select (e ->> 'id')::uuid
      from jsonb_array_elements(coalesce(p_workout -> 'exercises', '[]'::jsonb)) as e
    );

  -- 3c. Upsert the blocks that remain.
  insert into public.workout_exercises as we (id, workout_id, exercise_id, order_index, notes)
  select
    (e ->> 'id')::uuid,
    v_workout_id,
    (e ->> 'exercise_id')::uuid,
    (e ->> 'order_index')::smallint,
    e ->> 'notes'
  from jsonb_array_elements(coalesce(p_workout -> 'exercises', '[]'::jsonb)) as e
  on conflict (id) do update set
    exercise_id = excluded.exercise_id,
    order_index = excluded.order_index,
    notes       = excluded.notes
  where we.workout_id = v_workout_id;

  -- 3d. Remove sets the submitted graph no longer contains, under blocks that
  --     survived 3b.
  delete from public.sets s
  using public.workout_exercises we
  where s.workout_exercise_id = we.id
    and we.workout_id = v_workout_id
    and s.id not in (
      select (st ->> 'id')::uuid
      from jsonb_array_elements(coalesce(p_workout -> 'exercises', '[]'::jsonb)) as e,
           jsonb_array_elements(coalesce(e -> 'sets', '[]'::jsonb)) as st
    );

  -- 3e. Upsert the sets.
  --
  -- `logged_at` is intentionally absent: it is server-owned metadata with a
  -- `default now()`, the client never models it, and letting a client-supplied
  -- value through would make it a field the app can rewrite on every re-save.
  insert into public.sets as s (
    id, workout_exercise_id, set_index, type,
    weight_kg, reps, rpe, completed, rest_seconds, notes
  )
  select
    (st ->> 'id')::uuid,
    (st ->> 'workout_exercise_id')::uuid,
    (st ->> 'set_index')::smallint,
    coalesce((st ->> 'type')::public.set_type, 'working'),
    coalesce((st ->> 'weight_kg')::numeric, 0),
    coalesce((st ->> 'reps')::smallint, 0),
    nullif(st ->> 'rpe', '')::numeric,
    coalesce((st ->> 'completed')::boolean, false),
    nullif(st ->> 'rest_seconds', '')::smallint,
    st ->> 'notes'
  from jsonb_array_elements(coalesce(p_workout -> 'exercises', '[]'::jsonb)) as e,
       jsonb_array_elements(coalesce(e -> 'sets', '[]'::jsonb)) as st
  on conflict (id) do update set
    workout_exercise_id = excluded.workout_exercise_id,
    set_index           = excluded.set_index,
    type                = excluded.type,
    weight_kg           = excluded.weight_kg,
    reps                = excluded.reps,
    rpe                 = excluded.rpe,
    completed           = excluded.completed,
    rest_seconds        = excluded.rest_seconds,
    notes               = excluded.notes
  where s.workout_exercise_id in (
    select we.id from public.workout_exercises we where we.workout_id = v_workout_id
  );

  -- 3f. Personal records, in the same transaction and idempotent.
  --
  -- `do nothing` rather than `do update`: a PR for this session/exercise/kind
  -- already recorded is the same PR, and a retry must not change it. The id is
  -- taken from the payload so the first write wins and a retry is a no-op even
  -- though the client mints a fresh id each attempt.
  insert into public.personal_records (
    id, profile_id, exercise_id, kind, value, reps, weight_kg, achieved_at, workout_id
  )
  select
    (r ->> 'id')::uuid,
    v_profile,
    (r ->> 'exercise_id')::uuid,
    (r ->> 'kind')::public.pr_kind,
    (r ->> 'value')::numeric,
    nullif(r ->> 'reps', '')::smallint,
    nullif(r ->> 'weight_kg', '')::numeric,
    coalesce((r ->> 'achieved_at')::timestamptz, now()),
    v_workout_id
  from jsonb_array_elements(coalesce(p_records, '[]'::jsonb)) as r
  on conflict (profile_id, workout_id, exercise_id, kind) do nothing;
end;
$$;

comment on function public.save_workout_graph(jsonb, jsonb) is
  'Atomically persist a workout, its exercise blocks, its sets, and any personal '
  'records the session set. Security invoker: RLS applies to every statement and '
  'ownership comes from auth.uid(), never from the payload. See '
  'Docs/invariants.md I-2.';

revoke all on function public.save_workout_graph(jsonb, jsonb) from public;
grant execute on function public.save_workout_graph(jsonb, jsonb) to authenticated;
