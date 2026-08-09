-- ===========================================================================
-- Local training-day suite (I-7, migration 0008).
-- ===========================================================================
-- Proves that one-per-day identity follows the client-captured local calendar
-- date while `checked_in_at` remains the event instant. The two boundary cases
-- are literal regressions:
--
--   * UTC-4: Monday 23:30 and Tuesday 00:30 are both Tuesday UTC, but must be
--     two local training dates.
--   * UTC+10: Monday 08:00 and Monday 18:00 fall on two UTC dates, but must be
--     one local training date.
--
-- Calls run as `authenticated`, not the table owner, because save_check_in is
-- SECURITY INVOKER and RLS is the authorization boundary.
-- Re-runnable: all fixture rows are removed at the end.
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

-- =====================================================================
-- 1. Schema and authorization shape
-- =====================================================================
select public._record('schema: local_date is a required Postgres date',
  (select a.atttypid = 'date'::regtype and a.attnotnull
   from pg_attribute a
   where a.attrelid = 'public.check_ins'::regclass
     and a.attname = 'local_date'
     and not a.attisdropped));

select public._record('schema: uniqueness is profile plus local_date, with no UTC expression',
  (select position('(profile_id, local_date)' in pg_get_indexdef('public.check_ins_one_per_day'::regclass)) > 0
      and position('timezone' in lower(pg_get_indexdef('public.check_ins_one_per_day'::regclass))) = 0));

select public._record('security: save_check_in remains security invoker',
  (select not p.prosecdef
   from pg_proc p
   join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'save_check_in'
     and pg_get_function_identity_arguments(p.oid) = 'p_patch jsonb'));

select public._record('security: authenticated can execute and anon cannot',
  has_function_privilege('authenticated', 'public.save_check_in(jsonb)', 'execute')
  and not has_function_privilege('anon', 'public.save_check_in(jsonb)', 'execute'));

-- =====================================================================
-- 2. West of UTC: adjacent local dates no longer collapse
-- =====================================================================
do $$
declare v_err text;
begin
  v_err := public._check_in_as(
    '11111111-1111-1111-1111-111111111111',
    jsonb_build_object(
      'id', '36000000-0000-0000-0000-000000000001',
      'local_date', '2040-03-04',
      'checked_in_at', '2040-03-05T03:30:00Z',
      'energy', 1
    )
  );
  perform public._record('west: Monday 23:30 saves on Monday local date',
    v_err is null, coalesce(v_err, 'ok'));

  v_err := public._check_in_as(
    '11111111-1111-1111-1111-111111111111',
    jsonb_build_object(
      'id', '36000000-0000-0000-0000-000000000002',
      'local_date', '2040-03-05',
      'checked_in_at', '2040-03-05T04:30:00Z',
      'energy', 2
    )
  );
  perform public._record('west: Tuesday 00:30 saves on Tuesday local date',
    v_err is null, coalesce(v_err, 'ok'));
end $$;

select public._record('west: the two local dates produce two rows despite one UTC date',
  (select count(*) from public.check_ins
   where profile_id = '11111111-1111-1111-1111-111111111111'
     and local_date in (date '2040-03-04', date '2040-03-05')) = 2);

select public._record('west: each local date kept its own answer',
  (select energy from public.check_ins
   where profile_id = '11111111-1111-1111-1111-111111111111'
     and local_date = date '2040-03-04') = 1
  and
  (select energy from public.check_ins
   where profile_id = '11111111-1111-1111-1111-111111111111'
     and local_date = date '2040-03-05') = 2);

-- =====================================================================
-- 3. East of UTC: one local date no longer splits
-- =====================================================================
do $$
declare v_err text;
begin
  v_err := public._check_in_as(
    '11111111-1111-1111-1111-111111111111',
    jsonb_build_object(
      'id', '36000000-0000-0000-0000-000000000003',
      'local_date', '2040-03-06',
      'checked_in_at', '2040-03-05T22:00:00Z',
      'sleep_quality', 4
    )
  );
  perform public._record('east: Monday morning saves on Monday local date',
    v_err is null, coalesce(v_err, 'ok'));

  v_err := public._check_in_as(
    '11111111-1111-1111-1111-111111111111',
    jsonb_build_object(
      'id', '36000000-0000-0000-0000-000000000004',
      'local_date', '2040-03-06',
      'checked_in_at', '2040-03-06T08:00:00Z',
      'energy', 2
    )
  );
  perform public._record('east: Monday evening merges on Monday local date',
    v_err is null, coalesce(v_err, 'ok'));
end $$;

select public._record('east: timestamps on two UTC dates produce one local-date row',
  (select count(*) from public.check_ins
   where profile_id = '11111111-1111-1111-1111-111111111111'
     and local_date = date '2040-03-06') = 1);

select public._record('east: the merge kept the original row id',
  (select id from public.check_ins
   where profile_id = '11111111-1111-1111-1111-111111111111'
     and local_date = date '2040-03-06') = '36000000-0000-0000-0000-000000000003');

select public._record('east: omitted and newly answered fields both survive',
  (select sleep_quality = 4 and energy = 2 from public.check_ins
   where profile_id = '11111111-1111-1111-1111-111111111111'
     and local_date = date '2040-03-06'));

select public._record('timestamp: the merged row keeps the latest submission instant',
  (select checked_in_at = '2040-03-06T08:00:00Z'::timestamptz from public.check_ins
   where profile_id = '11111111-1111-1111-1111-111111111111'
     and local_date = date '2040-03-06'));

-- =====================================================================
-- 4. Required/typed input and database uniqueness
-- =====================================================================
do $$
declare v_err text;
begin
  v_err := public._check_in_as(
    '11111111-1111-1111-1111-111111111111',
    jsonb_build_object(
      'id', '36000000-0000-0000-0000-000000000005',
      'checked_in_at', '2040-03-07T07:00:00Z',
      'stress', 3
    )
  );
  perform public._record('input: a missing local_date is rejected',
    v_err is not null, coalesce(v_err, 'call unexpectedly succeeded'));
end $$;

select public._record('input: the rejected missing-date call wrote no row',
  (select count(*) from public.check_ins
   where id = '36000000-0000-0000-0000-000000000005') = 0);

do $$
declare v_err text;
begin
  v_err := public._check_in_as(
    '11111111-1111-1111-1111-111111111111',
    jsonb_build_object(
      'id', '36000000-0000-0000-0000-000000000006',
      'local_date', '2040-02-30',
      'checked_in_at', '2040-03-07T08:00:00Z',
      'stress', 3
    )
  );
  perform public._record('input: an impossible local_date is rejected',
    v_err is not null, coalesce(v_err, 'call unexpectedly succeeded'));
end $$;

do $$
declare v_err text := null;
begin
  begin
    insert into public.check_ins (id, profile_id, local_date, checked_in_at, energy)
    values (
      '36000000-0000-0000-0000-000000000007',
      '11111111-1111-1111-1111-111111111111',
      date '2040-03-04',
      '2040-03-04T12:00:00Z',
      5
    );
  exception when others then
    v_err := sqlerrm;
  end;
  perform public._record('uniqueness: a direct duplicate local date is rejected',
    v_err is not null, coalesce(v_err, 'insert unexpectedly succeeded'));
end $$;

-- =====================================================================
-- 5. The date changes no ownership boundary
-- =====================================================================
do $$
declare v_err text;
begin
  v_err := public._check_in_as(
    '22222222-2222-2222-2222-222222222222',
    jsonb_build_object(
      'id', '36000000-0000-0000-0000-000000000008',
      'profile_id', '11111111-1111-1111-1111-111111111111',
      'local_date', '2040-03-04',
      'checked_in_at', '2040-03-04T12:00:00Z',
      'soreness', 5
    )
  );
  perform public._record('security: another user may use the same local date for their own row',
    v_err is null, coalesce(v_err, 'ok'));
end $$;

select public._record('security: payload profile_id is ignored and auth.uid owns the row',
  (select profile_id from public.check_ins
   where id = '36000000-0000-0000-0000-000000000008')
    = '22222222-2222-2222-2222-222222222222');

-- =====================================================================
-- Cleanup and summary
-- =====================================================================
delete from public.check_ins
where local_date between date '2040-03-04' and date '2040-03-07';

select id, description, passed, detail from public._test_results order by id;

do $$
declare
  v_total int;
  v_failed int;
begin
  select count(*), count(*) filter (where not passed)
  into v_total, v_failed
  from public._test_results;
  raise notice '=== local training-day suite: % / % assertions passed ===',
    (v_total - v_failed), v_total;
  if v_failed > 0 then
    raise exception '% local training-day assertion(s) FAILED -- see rows above with passed=false',
      v_failed;
  end if;
end $$;
