-- ===========================================================================
-- Partial check-in suite (I-7).
-- ===========================================================================
-- Verifies `public.save_check_in` (0004_partial_check_ins.sql) against a live
-- Postgres instance with all four migrations applied exactly as committed.
--
-- What this is really testing is **parity with demo mode**. `DemoRepository`
-- has always supported partial check-ins with three-way per-field semantics,
-- and `src/data/__tests__/repository.test.ts` pins that behaviour precisely.
-- Postgres rejected any of it until 0004. Each assertion below names the demo
-- test it corresponds to, because a divergence between the two paths is the
-- failure mode this migration exists to remove -- and the one that would only
-- ever have surfaced in production.
--
-- Method matches 02/03: every call runs as the non-owning `authenticated` role
-- with `request.jwt.claim.sub` set. `save_check_in` is `security invoker`, so
-- running as the table owner would bypass the RLS these assertions depend on.
--
-- Dates are fixed in the past (2026-03-01/02) rather than relative to `now()`,
-- because 01_seed_test_data.sql seeds a check-in for each user at `now()` and
-- merging into it would make these assertions depend on the clock.
--
-- Re-runnable: everything created here is removed at the end.
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

/** Calls save_check_in as a given user; returns the error message, or null. */
create or replace function public._check_in_as(p_uid uuid, p_patch jsonb)
returns text language plpgsql as $$
declare
  v_err text := null;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', p_uid::text, true);
  begin
    perform public.save_check_in(p_patch);
  exception when others then
    v_err := sqlerrm;
  end;
  reset role;
  perform set_config('request.jwt.claim.sub', '', true);
  return v_err;
end;
$$;

-- Convenience readers for user A's 2026-03-01 record.
create or replace function public._a_day1() returns public.check_ins
language sql stable as $$
  select * from public.check_ins
  where profile_id = '11111111-1111-1111-1111-111111111111'
    and timezone('utc', checked_in_at)::date = date '2026-03-01'
  limit 1;
$$;

-- =====================================================================
-- 1. A check-in with ONE scale answered
-- =====================================================================
-- Corresponds to the demo test "accepts a check-in with only some fields
-- answered". Before 0004 the not-null columns rejected this outright, and the
-- client threw before even trying.
do $$
declare v_err text;
begin
  v_err := public._check_in_as(
    '11111111-1111-1111-1111-111111111111',
    jsonb_build_object(
      'id', '31000000-0000-0000-0000-000000000001',
      'checked_in_at', '2026-03-01T07:00:00Z',
      'sleep_quality', 4
    )
  );
  perform public._record('partial: a check-in with only sleep answered is accepted',
    v_err is null, coalesce(v_err, 'ok'));
end $$;

select public._record('partial: the answered scale is stored',
  (select sleep_quality from public._a_day1()) = 4);
select public._record('partial: unanswered scales are null, not defaulted',
  (select energy is null and soreness is null and stress is null from public._a_day1()));
select public._record('partial: owner came from the session, not the payload',
  (select profile_id from public._a_day1()) = '11111111-1111-1111-1111-111111111111');

-- =====================================================================
-- 2. A later submission the same day MERGES, and does not add a row
-- =====================================================================
-- Two things at once. The demo test is "merges a later submission on the same
-- day instead of adding another"; the second, quieter defect is that the old
-- client upserted on the primary key, so a submission carrying a NEW id would
-- have inserted a second row and violated `check_ins_one_per_day`. The id
-- below is deliberately different from the one used above.
do $$
declare v_err text;
begin
  v_err := public._check_in_as(
    '11111111-1111-1111-1111-111111111111',
    jsonb_build_object(
      'id', '31000000-0000-0000-0000-0000000000ff',
      'checked_in_at', '2026-03-01T19:00:00Z',
      'energy', 3
    )
  );
  perform public._record('merge: a second submission the same day, with a new id, succeeds',
    v_err is null, coalesce(v_err, 'ok'));
end $$;

select public._record('merge: still exactly one check-in for that day',
  (select count(*) from public.check_ins
   where profile_id = '11111111-1111-1111-1111-111111111111'
     and timezone('utc', checked_in_at)::date = date '2026-03-01') = 1);
select public._record('merge: the row kept its original id -- the new one was discarded',
  (select id from public._a_day1()) = '31000000-0000-0000-0000-000000000001');
select public._record('merge: the newly answered scale is stored',
  (select energy from public._a_day1()) = 3);

-- =====================================================================
-- 3. An OMITTED property preserves the stored answer
-- =====================================================================
-- Demo test: "preserves an answered field when a later patch omits that
-- property". This is the assertion a plain upsert cannot satisfy -- it sends
-- every column, so omission is indistinguishable from clearing.
select public._record('omit: sleep survived a patch that did not mention it',
  (select sleep_quality from public._a_day1()) = 4);

-- =====================================================================
-- 4. An EXPLICIT null clears the stored answer
-- =====================================================================
-- Demo test: "clears an answered field when the patch sends that property as
-- null". Same shape of payload as above, one key different, opposite outcome.
do $$
declare v_err text;
begin
  v_err := public._check_in_as(
    '11111111-1111-1111-1111-111111111111',
    jsonb_build_object(
      'checked_in_at', '2026-03-01T20:00:00Z',
      'sleep_quality', null
    )
  );
  perform public._record('clear: a patch sending sleep as null succeeds', v_err is null, coalesce(v_err, 'ok'));
end $$;

select public._record('clear: sleep is now null',
  (select sleep_quality is null from public._a_day1()));
select public._record('clear: energy was untouched by that patch',
  (select energy from public._a_day1()) = 3);

-- =====================================================================
-- 5. Clearing every scale is permitted, matching demo mode
-- =====================================================================
-- 0004 deliberately does NOT add an at-least-one-answered constraint. An empty
-- row carries no information and the UI will not submit one, but demo mode
-- permits reaching this state and Postgres rejecting it would be a divergence.
-- Asserted so the decision is visible rather than implicit.
do $$
declare v_err text;
begin
  v_err := public._check_in_as(
    '11111111-1111-1111-1111-111111111111',
    jsonb_build_object('checked_in_at', '2026-03-01T21:00:00Z', 'energy', null)
  );
  perform public._record('empty: clearing the last answered scale is permitted',
    v_err is null, coalesce(v_err, 'ok'));
end $$;

select public._record('empty: the row survives with every scale null',
  (select sleep_quality is null and energy is null and soreness is null and stress is null
   from public._a_day1()));

-- =====================================================================
-- 6. A different day is a different check-in
-- =====================================================================
do $$
declare v_err text;
begin
  v_err := public._check_in_as(
    '11111111-1111-1111-1111-111111111111',
    jsonb_build_object(
      'id', '31000000-0000-0000-0000-000000000002',
      'checked_in_at', '2026-03-02T07:00:00Z',
      'soreness', 5
    )
  );
  perform public._record('day: the next day creates its own check-in', v_err is null, coalesce(v_err, 'ok'));
end $$;

select public._record('day: two distinct check-ins now exist across the two days',
  (select count(*) from public.check_ins
   where profile_id = '11111111-1111-1111-1111-111111111111'
     and timezone('utc', checked_in_at)::date in (date '2026-03-01', date '2026-03-02')) = 2);

-- =====================================================================
-- 7. Cross-tenant: the merge is scoped per lifter
-- =====================================================================
-- B submits for the same day A already has. B must get their own row; A's must
-- be untouched. This is what proves the day lookup is scoped by `auth.uid()`
-- and not merely by date.
do $$
declare v_err text;
begin
  v_err := public._check_in_as(
    '22222222-2222-2222-2222-222222222222',
    jsonb_build_object(
      'id', '31000000-0000-0000-0000-0000000000b1',
      'checked_in_at', '2026-03-01T07:00:00Z',
      'stress', 1
    )
  );
  perform public._record('cross-tenant: B can save their own check-in on the same day',
    v_err is null, coalesce(v_err, 'ok'));
end $$;

select public._record('cross-tenant: B got their own row',
  (select stress from public.check_ins
   where profile_id = '22222222-2222-2222-2222-222222222222'
     and timezone('utc', checked_in_at)::date = date '2026-03-01') = 1);
select public._record('cross-tenant: A''s row for that day was not merged into',
  (select stress is null from public._a_day1()));
select public._record('cross-tenant: A''s row still belongs to A',
  (select profile_id from public._a_day1()) = '11111111-1111-1111-1111-111111111111');

-- =====================================================================
-- 8. Unauthenticated calls are refused
-- =====================================================================
do $$
declare v_err text := null;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', '', true);
  begin
    perform public.save_check_in(
      jsonb_build_object('checked_in_at', '2026-03-03T07:00:00Z', 'energy', 3));
  exception when others then
    v_err := sqlerrm;
  end;
  reset role;
  perform public._record('unauthenticated: a call with no session is refused', v_err is not null,
    coalesce(v_err, 'call unexpectedly succeeded'));
end $$;

select public._record('unauthenticated: no check-in was created',
  (select count(*) from public.check_ins
   where timezone('utc', checked_in_at)::date = date '2026-03-03') = 0);

-- =====================================================================
-- 9. The one-per-day index is still doing its job
-- =====================================================================
-- 0004 relaxes nullability, not uniqueness. A direct second insert must still
-- be rejected, or the merge above would be a convention rather than a rule.
do $$
declare v_err text := null;
begin
  begin
    insert into public.check_ins (id, profile_id, checked_in_at, energy)
    values ('31000000-0000-0000-0000-0000000000ee',
            '11111111-1111-1111-1111-111111111111', '2026-03-01T08:00:00Z', 2);
  exception when others then
    v_err := sqlerrm;
  end;
  perform public._record('uniqueness: a direct second row for the same day is still rejected',
    v_err is not null, coalesce(v_err, 'insert unexpectedly succeeded'));
end $$;

-- =====================================================================
-- Cleanup
-- =====================================================================
delete from public.check_ins
where timezone('utc', checked_in_at)::date in
  (date '2026-03-01', date '2026-03-02', date '2026-03-03');

drop function if exists public._a_day1();

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
  raise notice '=== partial check-in suite: % / % assertions passed ===', (v_total - v_failed), v_total;
  if v_failed > 0 then
    raise exception '% check-in assertion(s) FAILED -- see rows above with passed=false', v_failed;
  end if;
end $$;
