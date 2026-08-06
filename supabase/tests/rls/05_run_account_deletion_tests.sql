-- ===========================================================================
-- Account deletion suite (I-10).
-- ===========================================================================
-- Verifies `public.delete_my_account` (0005_account_deletion.sql).
--
-- This is the only `security definer` function in PRism's schema, and the only
-- one that destroys data. Roughly half the assertions below are therefore about
-- the function's *shape* rather than its behaviour -- that it takes no
-- arguments, that its search_path is pinned, that `anon` cannot call it. Those
-- are the properties that contain a definer function, and a future migration
-- that quietly relaxes one of them would still pass a behaviour-only suite.
--
-- Uses its OWN fixture user (user C, `33333333-…`), created and destroyed here.
-- The isolation and write-integrity suites depend on users A and B still
-- existing, and a deletion test that erased a shared fixture would work exactly
-- once and then break every suite that ran after it.
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

create or replace function public._delete_as(p_uid uuid)
returns text language plpgsql as $$
declare
  v_err text := null;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', p_uid::text, true);
  begin
    perform public.delete_my_account();
  exception when others then
    v_err := sqlerrm;
  end;
  reset role;
  perform set_config('request.jwt.claim.sub', '', true);
  return v_err;
end;
$$;

-- =====================================================================
-- 0. The shape of the function -- what contains a `security definer`
-- =====================================================================

-- THE most important assertion in this file. The function is safe because it
-- cannot be pointed at anyone: there is no argument to forge. If a future
-- migration adds a parameter -- however well-intentioned -- this fails, and it
-- should, because the containment would be gone.
select public._record('shape: takes NO arguments, so it can only ever delete auth.uid()',
  (select pronargs from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'delete_my_account') = 0);

select public._record('shape: is security definer (it has to be -- auth.users is not ours)',
  (select prosecdef from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'delete_my_account'));

-- Without a pinned search_path a definer function can be induced to call an
-- attacker's `delete` or operator from an earlier schema. This is the standard
-- definer escalation and the reason 0002 pinned `handle_new_user` too.
select public._record('shape: search_path is pinned to empty',
  (select coalesce(array_to_string(proconfig, ','), '') from pg_proc p
   join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'delete_my_account')
  like '%search_path=%');

select public._record('shape: authenticated may execute it',
  has_function_privilege('authenticated', 'public.delete_my_account()', 'execute'));

select public._record('shape: anon may NOT execute it',
  not has_function_privilege('anon', 'public.delete_my_account()', 'execute'));

select public._record('shape: PUBLIC may NOT execute it',
  not has_function_privilege('public', 'public.delete_my_account()', 'execute'));

-- =====================================================================
-- 1. Fixture: user C, with data in several tables
-- =====================================================================
insert into auth.users (id, raw_user_meta_data) values
  ('33333333-3333-3333-3333-333333333333', '{"display_name": "Test User C"}')
on conflict (id) do nothing;

insert into public.workouts (id, profile_id, title, started_at) values
  ('e0000000-0000-0000-0000-0000000000c1', '33333333-3333-3333-3333-333333333333',
   'C''s Workout', '2026-03-05T10:00:00Z')
on conflict (id) do nothing;

insert into public.check_ins (id, profile_id, checked_in_at, energy) values
  ('30000000-0000-0000-0000-0000000000c1', '33333333-3333-3333-3333-333333333333',
   '2026-03-05T07:00:00Z', 4)
on conflict (id) do nothing;

insert into public.body_measurements (id, profile_id, bodyweight_kg) values
  ('20000000-0000-0000-0000-0000000000c1', '33333333-3333-3333-3333-333333333333', 82.0)
on conflict (id) do nothing;

select public._record('fixture: user C has a profile',
  (select count(*) from public.profiles where id = '33333333-3333-3333-3333-333333333333') = 1);
select public._record('fixture: user C has a workout, a check-in and a measurement',
  (select count(*) from public.workouts where profile_id = '33333333-3333-3333-3333-333333333333') = 1
  and (select count(*) from public.check_ins where profile_id = '33333333-3333-3333-3333-333333333333') = 1
  and (select count(*) from public.body_measurements where profile_id = '33333333-3333-3333-3333-333333333333') = 1);

-- =====================================================================
-- 2. Deleting the account removes the account and everything it owns
-- =====================================================================
do $$
declare v_err text;
begin
  v_err := public._delete_as('33333333-3333-3333-3333-333333333333');
  perform public._record('delete: C can delete their own account', v_err is null, coalesce(v_err, 'ok'));
end $$;

select public._record('delete: the auth user is gone',
  (select count(*) from auth.users where id = '33333333-3333-3333-3333-333333333333') = 0);
select public._record('delete: the profile went with it (cascade)',
  (select count(*) from public.profiles where id = '33333333-3333-3333-3333-333333333333') = 0);
select public._record('delete: the workout went with it (cascade)',
  (select count(*) from public.workouts where id = 'e0000000-0000-0000-0000-0000000000c1') = 0);
select public._record('delete: the check-in went with it (cascade)',
  (select count(*) from public.check_ins where id = '30000000-0000-0000-0000-0000000000c1') = 0);
select public._record('delete: the measurement went with it (cascade)',
  (select count(*) from public.body_measurements where id = '20000000-0000-0000-0000-0000000000c1') = 0);

-- =====================================================================
-- 3. Nobody else was touched
-- =====================================================================
-- The cascade is broad by design, so this is worth asserting explicitly rather
-- than inferring from "the delete was scoped".
select public._record('blast radius: user A still exists',
  (select count(*) from auth.users where id = '11111111-1111-1111-1111-111111111111') = 1);
select public._record('blast radius: user B still exists',
  (select count(*) from auth.users where id = '22222222-2222-2222-2222-222222222222') = 1);
select public._record('blast radius: A''s workout survived',
  (select count(*) from public.workouts where id = 'e0000000-0000-0000-0000-0000000000a1') = 1);
select public._record('blast radius: the shared system exercise survived',
  (select count(*) from public.exercises where id = 'a0000000-0000-0000-0000-000000000001') = 1);

-- =====================================================================
-- 4. Deleting an account that is already gone is a success
-- =====================================================================
-- Idempotence matters for a real reason: the client tears the device down after
-- this call, so a lost response leaves a lifter who may retry. A second attempt
-- must not surface an error over an account that is correctly already deleted.
do $$
declare v_err text;
begin
  v_err := public._delete_as('33333333-3333-3333-3333-333333333333');
  perform public._record('idempotent: deleting an already-deleted account succeeds',
    v_err is null, coalesce(v_err, 'ok'));
end $$;

-- =====================================================================
-- 5. Unauthenticated calls are refused
-- =====================================================================
-- Refused loudly rather than matching zero rows. A destructive statement in a
-- privileged function must not rely on `where id is null` happening to be safe.
do $$
declare
  v_err text := null;
  v_before int;
  v_after int;
begin
  select count(*) into v_before from auth.users;
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', '', true);
  begin
    perform public.delete_my_account();
  exception when others then
    v_err := sqlerrm;
  end;
  reset role;
  select count(*) into v_after from auth.users;
  perform public._record('unauthenticated: a call with no session is refused', v_err is not null,
    coalesce(v_err, 'call unexpectedly succeeded'));
  perform public._record('unauthenticated: no user was deleted', v_before = v_after,
    'before=' || v_before || ' after=' || v_after);
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
  raise notice '=== account deletion suite: % / % assertions passed ===', (v_total - v_failed), v_total;
  if v_failed > 0 then
    raise exception '% deletion assertion(s) FAILED -- see rows above with passed=false', v_failed;
  end if;
end $$;
