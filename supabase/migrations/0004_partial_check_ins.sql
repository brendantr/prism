-- ===========================================================================
-- PRism -- partial check-ins
-- ===========================================================================
-- Follows 0003_workout_write_integrity.sql. Closes the limitation
-- `Docs/invariants.md` I-7 records against itself: optional check-in fields
-- work against `DemoRepository` and **throw** against Supabase.
--
-- 0001, 0002 and 0003 are deliberately not edited.
--
-- WHAT WAS BROKEN, AND WHY IT MATTERED MORE THAN IT LOOKED
-- --------------------------------------------------------
-- I-7 makes optionality a hard product boundary: sleep, energy, soreness and
-- stress are each answerable on their own, and a field left alone is stored as
-- null rather than defaulted. `CheckInPrompt` is built for exactly that -- it
-- enables submit as soon as *any* scale is answered.
--
-- `check_ins` declared all four `not null` (0001). So `SupabaseRepository`
-- carried `assertCompleteCheckIn`, which threw before writing anything.
--
-- The result: a feature that works in demo mode and fails the instant the app
-- points at a real backend, showing the lifter a generic "couldn't save" with
-- the reason deliberately withheld from the screen. Nothing catches this in a
-- demo build, which is the only build anyone has run.
--
-- TWO THINGS THIS MIGRATION HAS TO DO
-- -----------------------------------
--   1. Let the columns be null.
--   2. Reproduce the *merge* semantics `DemoRepository` implements, which are
--      finer than "upsert the row" and are the reason a plain PostgREST call
--      cannot express them. See the function comment below.
--
-- Every statement is written to be safe to run more than once.
-- ===========================================================================

-- --------------------------------------------------------------------------
-- 1. The four scales become optional
-- --------------------------------------------------------------------------
-- The `between 1 and 5` checks from 0001 are left exactly as they are and do
-- not need touching: a CHECK constraint evaluates to unknown -- not false --
-- for a null input, so null passes without weakening the range for any value
-- actually supplied.
alter table public.check_ins alter column sleep_quality drop not null;
alter table public.check_ins alter column energy        drop not null;
alter table public.check_ins alter column soreness      drop not null;
alter table public.check_ins alter column stress        drop not null;

-- Deliberately NOT added: a constraint requiring at least one answered scale.
--
-- It is tempting -- an all-null check-in carries no information, and the UI
-- already refuses to submit one. But `DemoRepository` permits clearing every
-- field (`repository.test.ts` asserts a cleared field stays cleared), so a
-- constraint here would make Postgres reject a state demo mode accepts. A
-- divergence between the two modes is worse than an empty row: it is the class
-- of bug that only ever appears in production, which is precisely what this
-- migration exists to remove. The UI stays the gate.

-- --------------------------------------------------------------------------
-- 2. Merge-on-write, matching DemoRepository exactly
-- --------------------------------------------------------------------------
-- `DemoRepository.saveCheckIn` distinguishes THREE cases per field, and the
-- distinction is load-bearing (`src/domain/types.ts` CheckInPatch says so
-- outright: "collapsing null into absent would make an erased answer come back
-- on the next read"):
--
--   * key absent from the patch  -> leave whatever is stored alone
--   * key present, value null    -> clear the stored answer
--   * key present, value 1..5    -> set it
--
-- A plain `upsert` cannot express that. It sends a row, so every column is
-- present, and "not mentioned" and "explicitly cleared" become the same thing.
-- jsonb can express it -- `p_patch ? 'energy'` is true only when the client
-- actually sent the key -- which is why the payload arrives as jsonb and this
-- is a function rather than a table write.
--
-- It also fixes a second, quieter defect. The old client code upserted on the
-- primary key, so a second submission the same day with a NEW id would insert
-- a second row and violate `check_ins_one_per_day`. It only worked because the
-- UI happened to have today's id in memory to reuse. Resolving the day here
-- means the write is correct whether or not the client knows that id.
--
-- SECURITY INVOKER, for the same reason as `save_workout_graph`: RLS applies
-- to every statement inside, and ownership comes from `auth.uid()` rather than
-- from the payload. See 0003's header.
create or replace function public.save_check_in(p_patch jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_profile     uuid := auth.uid();
  v_at          timestamptz := coalesce((p_patch ->> 'checked_in_at')::timestamptz, now());
  v_existing_id uuid;
begin
  if v_profile is null then
    raise exception 'save_check_in requires an authenticated session'
      using errcode = '28000';
  end if;

  -- Which day this belongs to is decided the same way `check_ins_one_per_day`
  -- decides it -- `timezone('utc', ...)::date`. It has to be: the index is the
  -- thing that would reject a second row, so any other definition here would
  -- merge into one day and then be rejected for colliding with another.
  --
  -- NOTE, and it is a real divergence rather than an oversight: the demo path
  -- uses the DEVICE's local calendar day (`sameCalendarDay`, via
  -- `Date.getFullYear/getMonth/getDate`). For a lifter west of UTC, check-ins
  -- at 23:30 and 00:30 local are two days to demo mode and one day to
  -- Postgres. Reconciling that is a product decision about what a training day
  -- is, not a schema decision, so it is recorded here and in the sprint record
  -- rather than settled quietly in a migration.
  select c.id into v_existing_id
  from public.check_ins c
  where c.profile_id = v_profile
    and timezone('utc', c.checked_in_at)::date = timezone('utc', v_at)::date
  limit 1;

  if v_existing_id is null then
    insert into public.check_ins (
      id, profile_id, checked_in_at, sleep_quality, energy, soreness, stress
    )
    values (
      coalesce(nullif(p_patch ->> 'id', '')::uuid, gen_random_uuid()),
      v_profile,
      v_at,
      nullif(p_patch ->> 'sleep_quality', '')::smallint,
      nullif(p_patch ->> 'energy', '')::smallint,
      nullif(p_patch ->> 'soreness', '')::smallint,
      nullif(p_patch ->> 'stress', '')::smallint
    );
    return;
  end if;

  -- `p_patch ? 'x'` is the whole point: absent leaves the stored value alone,
  -- present overwrites it -- including present-and-null, which clears it.
  update public.check_ins c
  set
    checked_in_at = v_at,
    sleep_quality = case when p_patch ? 'sleep_quality'
                         then nullif(p_patch ->> 'sleep_quality', '')::smallint
                         else c.sleep_quality end,
    energy        = case when p_patch ? 'energy'
                         then nullif(p_patch ->> 'energy', '')::smallint
                         else c.energy end,
    soreness      = case when p_patch ? 'soreness'
                         then nullif(p_patch ->> 'soreness', '')::smallint
                         else c.soreness end,
    stress        = case when p_patch ? 'stress'
                         then nullif(p_patch ->> 'stress', '')::smallint
                         else c.stress end
  where c.id = v_existing_id
    and c.profile_id = v_profile;
end;
$$;

comment on function public.save_check_in(jsonb) is
  'Insert or merge today''s check-in. A key absent from the patch leaves the '
  'stored answer alone; a key present with a null value clears it. Security '
  'invoker: RLS applies and ownership comes from auth.uid(). See '
  'Docs/invariants.md I-7.';

revoke all on function public.save_check_in(jsonb) from public;
grant execute on function public.save_check_in(jsonb) to authenticated;
