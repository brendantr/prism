-- ===========================================================================
-- PRism -- security hardening
-- ===========================================================================
-- Follows 0001_init.sql. Written against the 2026-07-29 security audit; see
-- Docs/sprints/2026-07-30-security-backend-foundation.md for the reasoning and
-- for what is NOT covered.
--
-- 0001 is deliberately not edited. An applied migration is never rewritten,
-- and there is no way from this repository to know whether a given environment
-- has already run it.
--
-- Three changes:
--   1. Bound `profiles.display_name`, which arrives from client-controlled
--      signup metadata with no length limit today.
--   2. Refuse a workout/routine/PR row that references an exercise the caller
--      cannot see. Foreign-key checks run as the table owner and IGNORE row
--      level security, so this is the one place a user can touch another
--      user's private row.
--   3. Pin `handle_new_user`'s search_path to the empty string, the current
--      Supabase recommendation for SECURITY DEFINER routines.
--
-- Every statement is written to be safe to run more than once.
-- ===========================================================================

-- --------------------------------------------------------------------------
-- 1. profiles.display_name is attacker-controlled and unbounded
-- --------------------------------------------------------------------------
-- `handle_new_user` copies `raw_user_meta_data ->> 'display_name'` straight in.
-- That value is whatever the caller passed to signUp(), and `text` has no
-- length limit, so one signup can write a multi-megabyte name.
--
-- Existing rows are normalised first: adding a validated constraint to a table
-- that already violates it would fail, and failing here would leave the rest
-- of this migration unapplied.

update public.profiles
   set display_name = left(btrim(display_name), 60)
 where char_length(display_name) > 60;

update public.profiles
   set display_name = 'Lifter'
 where btrim(display_name) = '';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_display_name_len'
  ) then
    alter table public.profiles
      add constraint profiles_display_name_len
      check (char_length(display_name) between 1 and 60);
  end if;
end
$$;

-- --------------------------------------------------------------------------
-- 2. Foreign keys to `exercises` bypass RLS
-- --------------------------------------------------------------------------
-- PostgreSQL performs referential-integrity checks in internal triggers that
-- run as the referenced table's owner, and those checks are explicitly exempt
-- from row-level security. So a user can insert a row whose `exercise_id`
-- points at another user's private exercise even though the SELECT policy
-- hides it from them.
--
-- They still cannot read it. The damage is on the other side: 0001 declares
--   workout_exercises.exercise_id  ... on delete restrict
--   routine_exercises.exercise_id  ... on delete restrict
-- so the reference permanently blocks the owner from deleting their own
-- exercise, with nothing in their own data explaining why.
--
-- `personal_records.exercise_id` is `on delete cascade` rather than restrict,
-- so it cannot block a delete -- but a cross-tenant reference there is still
-- not something to leave open, and it is the same one-line guard.
--
-- SECURITY INVOKER (the default) is deliberate: the check must see the world as
-- the caller sees it. The exercises SELECT policy already encodes visibility,
-- so a hidden row simply is not found. The predicate is spelled out anyway so
-- the intent survives someone reading this without the policy in front of them.

create or replace function public.assert_exercise_visible()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1
      from public.exercises e
     where e.id = new.exercise_id
       and (e.profile_id is null or e.profile_id = (select auth.uid()))
  ) then
    raise exception 'exercise % is not available to this user', new.exercise_id
      using errcode = '42501';  -- insufficient_privilege
  end if;
  return new;
end;
$$;

drop trigger if exists workout_exercises_exercise_visible on public.workout_exercises;
create trigger workout_exercises_exercise_visible
  before insert or update of exercise_id on public.workout_exercises
  for each row execute function public.assert_exercise_visible();

drop trigger if exists routine_exercises_exercise_visible on public.routine_exercises;
create trigger routine_exercises_exercise_visible
  before insert or update of exercise_id on public.routine_exercises
  for each row execute function public.assert_exercise_visible();

drop trigger if exists personal_records_exercise_visible on public.personal_records;
create trigger personal_records_exercise_visible
  before insert or update of exercise_id on public.personal_records
  for each row execute function public.assert_exercise_visible();

-- --------------------------------------------------------------------------
-- 3. handle_new_user: bound the input, tighten the search_path
-- --------------------------------------------------------------------------
-- Two changes from 0001's version.
--
-- `search_path = ''` rather than `public`. To be accurate about what this does
-- and does not fix: `search_path = public` was already safe against operator
-- and function shadowing, because PostgreSQL implicitly searches pg_catalog
-- FIRST whenever it is not named explicitly. The empty path is the current
-- Supabase recommendation and removes any reliance on that implicit rule, but
-- it is a tightening, not the repair of a live hole. Every reference below is
-- schema-qualified, which is what makes the empty path workable.
--
-- The display_name handling is the substantive change: trim it, cap it, and
-- fall back rather than trusting whatever arrived in the signup payload. The
-- constraint added above would otherwise turn a long name into a failed signup.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      nullif(left(btrim(new.raw_user_meta_data ->> 'display_name'), 60), ''),
      'Lifter'
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
