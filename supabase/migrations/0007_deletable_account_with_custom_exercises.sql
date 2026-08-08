-- ---------------------------------------------------------------------------
-- 0007_deletable_account_with_custom_exercises.sql
-- ---------------------------------------------------------------------------
--
-- THE BUG
-- -------
-- A lifter who created their own movement and logged a session with it could
-- not delete their account. `delete_my_account()` raised:
--
--   update or delete on table "exercises" violates foreign key constraint
--   "workout_exercises_exercise_id_fkey" on table "workout_exercises"
--
-- Deleting the `auth.users` row cascades to `profiles`, and from there to BOTH
-- the lifter's `exercises` and their `workouts`. PostgreSQL does not define the
-- order in which those two cascade branches run, and `on delete restrict` is
-- checked immediately — so when the exercise branch happens to go first, a
-- `workout_exercises` row is still pointing at the movement and the whole
-- delete aborts.
--
-- That is `Docs/invariants.md` I-10, which blocks store submission, failing for
-- a case a real lifter reaches on their first custom movement.
--
-- WHY NOTHING CAUGHT IT
-- ---------------------
-- `supabase/tests/rls/05_run_account_deletion_tests.sql` builds its fixture
-- user with a workout that has **no exercise blocks at all**, so the two
-- cascade branches never collided. 21 assertions, all passing, none of them
-- this. It was found by the integration lane on a real Supabase project
-- (`repository.integration.test.ts`), by an account doing an ordinary thing.
--
-- `0002_security_hardening.sql` §2 saw half of this — it documents `restrict`
-- permanently blocking an owner's delete, but only for the *cross-tenant* case,
-- and fixed that with a visibility trigger. The same-tenant case, where your own
-- workout blocks your own account, went unconsidered.
--
-- THE FIX, AND WHY NOT THE OBVIOUS ONE
-- ------------------------------------
-- `on delete cascade` would have been one word and is wrong: deleting a
-- movement would silently delete the logged sets performed with it. The
-- `restrict` is protecting real training history and must keep protecting it.
--
-- `on delete no action deferrable initially deferred` keeps the same rule and
-- moves *when* it is enforced from statement time to commit time. Inside the
-- delete transaction the `workout_exercises` rows are removed too, so by commit
-- there is nothing dangling and the check passes. Outside it — a lifter deleting
-- a movement a session still references — the rows do not go away, the check
-- fails at commit, and the delete is rejected exactly as before.
--
-- `restrict` cannot be deferred; `no action` is the deferrable form of the same
-- constraint. That is the entire difference between them here.
--
-- `personal_records.exercise_id` is left alone: it is already `on delete
-- cascade`, so it can never block a delete.
--
-- VERIFIED
-- --------
-- `supabase/tests/rls/07_run_exercise_reference_tests.sql`, against a clean
-- Postgres 16.14 with all seven migrations applied: the account deletes and
-- leaves nothing behind; an in-use movement still cannot be deleted; an unused
-- one still can; the system catalogue is untouched throughout.
--
-- Sprint record: `Docs/sprints/2026-08-08-account-deletion-fk-fix.md`.
-- ---------------------------------------------------------------------------

do $$
begin
  -- Guarded on `confdeltype = 'r'` (restrict) so re-application is a no-op
  -- rather than an error: applying migrations to a hosted project is manual,
  -- and "did that one already run?" should be answerable by running it again.
  if exists (
    select 1 from pg_constraint
     where conname = 'workout_exercises_exercise_id_fkey'
       and conrelid = 'public.workout_exercises'::regclass
       and confdeltype = 'r'
  ) then
    alter table public.workout_exercises
      drop constraint workout_exercises_exercise_id_fkey,
      add  constraint workout_exercises_exercise_id_fkey
        foreign key (exercise_id) references public.exercises (id)
        on delete no action deferrable initially deferred;
  end if;

  -- The same hazard, one table over: a lifter's own routine referencing their
  -- own movement. Not yet reachable in the app — routine editing does not exist
  -- — but it is the identical constraint and fixing one without the other would
  -- leave a trap for whoever builds the plan editor.
  if exists (
    select 1 from pg_constraint
     where conname = 'routine_exercises_exercise_id_fkey'
       and conrelid = 'public.routine_exercises'::regclass
       and confdeltype = 'r'
  ) then
    alter table public.routine_exercises
      drop constraint routine_exercises_exercise_id_fkey,
      add  constraint routine_exercises_exercise_id_fkey
        foreign key (exercise_id) references public.exercises (id)
        on delete no action deferrable initially deferred;
  end if;
end $$;
