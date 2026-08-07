-- ===========================================================================
-- PRism -- account deletion
-- ===========================================================================
-- Follows 0004_partial_check_ins.sql. Provides the deletion half of
-- `Docs/invariants.md` I-10, which is a blocking requirement for store
-- submission and has no exception process.
--
-- 0001-0004 are deliberately not edited.
--
-- ===========================================================================
-- WHY THIS FUNCTION IS `SECURITY DEFINER` AND THE OTHERS ARE NOT
-- ===========================================================================
-- `save_workout_graph` (0003) and `save_check_in` (0004) are both
-- `security invoker`, and their headers argue at length that a definer function
-- would have become the one hole in the RLS boundary. That argument still
-- stands. This function is the deliberate exception, and it is worth being
-- precise about why, because "the last one needed definer" is exactly how a
-- boundary erodes.
--
-- A lifter deleting their account has to delete their row in `auth.users`.
-- That table belongs to the `supabase_auth_admin` role. No amount of RLS policy
-- on PRism's own tables grants an `authenticated` caller the right to delete
-- from it, and nothing the client can be given would either -- the alternative
-- is the service-role key, which `Docs/invariants.md` I-4 forbids from ever
-- reaching the client, without exception. So the privilege has to live on the
-- server, in a function, or the feature cannot exist.
--
-- WHAT CONTAINS IT
-- ----------------
-- The containment is structural, not procedural:
--
--   1. **It takes no arguments.** There is no parameter to point at another
--      lifter, no id to forge, no jsonb to smuggle a uid through. The only
--      user it can ever delete is the one the JWT names. This is the single
--      most important line in the file, and it is a design property rather
--      than a check that could be edited out later.
--   2. **`auth.uid()` is read inside the function**, from the request's own
--      JWT claim, and a null one raises rather than falling through to a
--      `where id = null` that would quietly match nothing.
--   3. **`set search_path = ''`** with every object schema-qualified. Without
--      it, a definer function can be induced to call an attacker's `delete`
--      or operator from a schema earlier in the path -- the standard definer
--      escalation, and the reason 0002 pinned `handle_new_user` the same way.
--   4. **`revoke all from public`.** Only `authenticated` may execute it.
--
-- WHAT IT DELETES
-- ---------------
-- One row. `profiles.id references auth.users (id) on delete cascade`, and all
-- six user tables cascade from `profiles` (0001). So deleting the auth user
-- removes the profile, workouts, workout_exercises, sets, body_measurements,
-- check_ins, personal_records, and any custom exercises and routines -- with no
-- list of tables written here that a future migration could forget to update.
-- The cascade is the mechanism precisely so this function cannot drift out of
-- step with the schema.
--
-- Safe to run more than once.
-- ===========================================================================

create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile uuid := auth.uid();
begin
  -- Not defensive padding. Because this function is `security definer`, a null
  -- uid reaching the delete would run as the owner with `where id is null` --
  -- matching nothing today, but relying on an accident of SQL semantics for a
  -- destructive statement in a privileged function is not a property worth
  -- depending on. Refuse instead.
  if v_profile is null then
    raise exception 'delete_my_account requires an authenticated session'
      using errcode = '28000';
  end if;

  -- The whole account, via cascade. Note there is deliberately no `returning`
  -- and no row count check: deleting an account that is already gone is a
  -- success, not an error, so a retry after a lost response is safe.
  delete from auth.users where id = v_profile;
end;
$$;

comment on function public.delete_my_account() is
  'Permanently delete the calling user''s account and, by cascade, every row they '
  'own. Takes no arguments by design: it can only ever delete auth.uid(). '
  'Security definer because auth.users belongs to supabase_auth_admin -- see the '
  'header of this migration. Docs/invariants.md I-10.';

revoke all on function public.delete_my_account() from public;
grant execute on function public.delete_my_account() to authenticated;
