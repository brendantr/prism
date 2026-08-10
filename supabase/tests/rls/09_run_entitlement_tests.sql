-- ===========================================================================
-- Entitlement authority suite (I-4, I-6, I-9, I-10; migration 0009).
-- ===========================================================================

create table if not exists public._test_results (
  id serial primary key,
  description text not null,
  passed boolean not null,
  detail text
);
truncate public._test_results;

create or replace function public._record(p_desc text, p_passed boolean, p_detail text default null)
returns void language plpgsql as $$
begin
  insert into public._test_results (description, passed, detail) values (p_desc, p_passed, p_detail);
end;
$$;

create or replace function public._entitlement_count_as(p_uid uuid)
returns integer language plpgsql as $$
declare v_count integer;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', p_uid::text, true);
  select count(*) into v_count from public.entitlements;
  reset role;
  perform set_config('request.jwt.claim.sub', '', true);
  return v_count;
end;
$$;

create or replace function public._client_entitlement_write(p_uid uuid, p_operation text)
returns text language plpgsql as $$
declare v_error text := null;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', p_uid::text, true);
  begin
    if p_operation = 'insert' then
      insert into public.entitlements (
        profile_id, entitlement_id, product_id, granted_at, source,
        last_event_id, last_event_type, last_event_timestamp_ms
      ) values (
        p_uid, 'pro', 'app.prism.trainer.pro.lifetime', now(), 'revenuecat',
        'forged', 'NON_RENEWING_PURCHASE', 1
      );
    elsif p_operation = 'update' then
      update public.entitlements set revoked_at = null where profile_id = p_uid;
    elsif p_operation = 'delete' then
      delete from public.entitlements where profile_id = p_uid;
    end if;
  exception when others then
    v_error := sqlerrm;
  end;
  reset role;
  perform set_config('request.jwt.claim.sub', '', true);
  return v_error;
end;
$$;

-- Security shape: select-only client; service-only function.
select public._record('security: authenticated receives SELECT and no table write privileges',
  has_table_privilege('authenticated', 'public.entitlements', 'select')
  and not has_table_privilege('authenticated', 'public.entitlements', 'insert')
  and not has_table_privilege('authenticated', 'public.entitlements', 'update')
  and not has_table_privilege('authenticated', 'public.entitlements', 'delete'));

select public._record('security: webhook RPC is security invoker',
  (select not p.prosecdef from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'apply_revenuecat_entitlement_event'
     and pg_get_function_identity_arguments(p.oid) =
       'p_event_id text, p_event_type text, p_event_timestamp_ms bigint, p_actions jsonb'));

select public._record('security: only service_role can execute the webhook RPC',
  has_function_privilege(
    'service_role',
    'public.apply_revenuecat_entitlement_event(text,text,bigint,jsonb)',
    'execute'
  )
  and not has_function_privilege(
    'authenticated',
    'public.apply_revenuecat_entitlement_event(text,text,bigint,jsonb)',
    'execute'
  )
  and not has_function_privilege(
    'anon',
    'public.apply_revenuecat_entitlement_event(text,text,bigint,jsonb)',
    'execute'
  ));

-- One authenticated provider event grants A.
do $$
declare v_applied integer;
begin
  set local role service_role;
  select public.apply_revenuecat_entitlement_event(
    'rc-grant-a', 'NON_RENEWING_PURCHASE', 1000,
    jsonb_build_array(jsonb_build_object(
      'profile_id', '11111111-1111-1111-1111-111111111111',
      'entitlement_id', 'pro',
      'product_id', 'app.prism.trainer.pro.lifetime',
      'active', true
    ))
  ) into v_applied;
  reset role;
  perform public._record('provider: a valid lifetime purchase applies one grant', v_applied = 1);
end $$;

select public._record('RLS: A can read A entitlement',
  public._entitlement_count_as('11111111-1111-1111-1111-111111111111') = 1);
select public._record('RLS: B cannot read A entitlement',
  public._entitlement_count_as('22222222-2222-2222-2222-222222222222') = 0);

select public._record('client: insert is refused',
  public._client_entitlement_write('22222222-2222-2222-2222-222222222222', 'insert') is not null);
select public._record('client: update is refused',
  public._client_entitlement_write('11111111-1111-1111-1111-111111111111', 'update') is not null);
select public._record('client: delete is refused',
  public._client_entitlement_write('11111111-1111-1111-1111-111111111111', 'delete') is not null);

-- Same event/target is a no-op.
do $$
declare v_applied integer;
begin
  set local role service_role;
  select public.apply_revenuecat_entitlement_event(
    'rc-grant-a', 'NON_RENEWING_PURCHASE', 1000,
    '[{"profile_id":"11111111-1111-1111-1111-111111111111","entitlement_id":"pro","product_id":"app.prism.trainer.pro.lifetime","active":true}]'::jsonb
  ) into v_applied;
  reset role;
  perform public._record('idempotency: duplicate event target applies zero changes', v_applied = 0);
end $$;

-- Older revoke cannot displace a newer grant; newer revoke can.
do $$
declare v_old integer; v_new integer;
begin
  set local role service_role;
  select public.apply_revenuecat_entitlement_event(
    'rc-old-refund-a', 'CANCELLATION', 900,
    '[{"profile_id":"11111111-1111-1111-1111-111111111111","entitlement_id":"pro","product_id":"app.prism.trainer.pro.lifetime","active":false}]'::jsonb
  ) into v_old;
  select public.apply_revenuecat_entitlement_event(
    'rc-new-refund-a', 'CANCELLATION', 2000,
    '[{"profile_id":"11111111-1111-1111-1111-111111111111","entitlement_id":"pro","product_id":"app.prism.trainer.pro.lifetime","active":false}]'::jsonb
  ) into v_new;
  reset role;
  perform public._record('ordering: old revoke is ignored and newer revoke applies',
    v_old = 0 and v_new = 1);
end $$;

select public._record('ordering: A is revoked by the newest event',
  (select revoked_at is not null and last_event_id = 'rc-new-refund-a'
   from public.entitlements
   where profile_id = '11111111-1111-1111-1111-111111111111' and entitlement_id = 'pro'));

-- A grant at the exact same millisecond cannot beat a revocation (fail closed).
do $$
declare v_applied integer;
begin
  set local role service_role;
  select public.apply_revenuecat_entitlement_event(
    'rc-same-time-grant-a', 'REFUND_REVERSED', 2000,
    '[{"profile_id":"11111111-1111-1111-1111-111111111111","entitlement_id":"pro","product_id":"app.prism.trainer.pro.lifetime","active":true}]'::jsonb
  ) into v_applied;
  reset role;
  perform public._record('ordering: same-timestamp grant cannot reopen a revoked entitlement',
    v_applied = 0);
end $$;

-- One TRANSFER RPC revokes A and grants B in one transaction.
do $$
declare v_applied integer;
begin
  set local role service_role;
  select public.apply_revenuecat_entitlement_event(
    'rc-transfer-a-b', 'TRANSFER', 3000,
    '[
      {"profile_id":"11111111-1111-1111-1111-111111111111","entitlement_id":"pro","product_id":"app.prism.trainer.pro.lifetime","active":false},
      {"profile_id":"22222222-2222-2222-2222-222222222222","entitlement_id":"pro","product_id":"app.prism.trainer.pro.lifetime","active":true}
    ]'::jsonb
  ) into v_applied;
  reset role;
  perform public._record('transfer: both source revoke and destination grant apply atomically',
    v_applied = 2);
end $$;

select public._record('transfer: A is revoked and B is active',
  (select revoked_at is not null from public.entitlements
   where profile_id = '11111111-1111-1111-1111-111111111111' and entitlement_id = 'pro')
  and
  (select revoked_at is null from public.entitlements
   where profile_id = '22222222-2222-2222-2222-222222222222' and entitlement_id = 'pro'));

-- A delayed webhook after account deletion is ignored, never recreates data.
do $$
declare v_applied integer;
begin
  set local role service_role;
  select public.apply_revenuecat_entitlement_event(
    'rc-deleted-user', 'NON_RENEWING_PURCHASE', 4000,
    '[{"profile_id":"44444444-4444-4444-8444-444444444444","entitlement_id":"pro","product_id":"app.prism.trainer.pro.lifetime","active":true}]'::jsonb
  ) into v_applied;
  reset role;
  perform public._record('deletion race: an absent profile is ignored', v_applied = 0);
end $$;

select public._record('deletion race: no orphan entitlement or event target is created',
  (select count(*) from public.entitlements
   where profile_id = '44444444-4444-4444-8444-444444444444') = 0
  and
  (select count(*) from public.revenuecat_event_targets
   where profile_id = '44444444-4444-4444-8444-444444444444') = 0);

delete from public.revenuecat_event_targets
where profile_id in (
  '11111111-1111-1111-1111-111111111111',
  '22222222-2222-2222-2222-222222222222'
);
delete from public.entitlements
where profile_id in (
  '11111111-1111-1111-1111-111111111111',
  '22222222-2222-2222-2222-222222222222'
);

select id, description, passed, detail from public._test_results order by id;

do $$
declare v_total integer; v_failed integer;
begin
  select count(*), count(*) filter (where not passed)
    into v_total, v_failed from public._test_results;
  raise notice '=== entitlement suite: % / % assertions passed ===', v_total - v_failed, v_total;
  if v_failed > 0 then
    raise exception '% entitlement assertion(s) FAILED -- see rows above with passed=false', v_failed;
  end if;
end $$;
