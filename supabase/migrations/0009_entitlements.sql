-- ===========================================================================
-- PRism -- server-established lifetime entitlement
-- ===========================================================================
-- The mobile client may SELECT its own entitlement and may never write one.
-- RevenueCat events reach an Edge Function that authenticates the provider and
-- calls `apply_revenuecat_entitlement_event` as `service_role`. One RPC applies
-- every target in an event in a single transaction, including both sides of a
-- transfer. Duplicate delivery is harmless and older events cannot overwrite a
-- newer decision. Docs/invariants.md I-4, I-6, I-9 and I-10.
-- ===========================================================================

create table if not exists public.entitlements (
  profile_id              uuid        not null references public.profiles(id) on delete cascade,
  entitlement_id          text        not null,
  product_id              text        not null,
  granted_at              timestamptz not null,
  revoked_at              timestamptz,
  source                   text        not null check (source = 'revenuecat'),
  last_event_id            text        not null,
  last_event_type          text        not null,
  last_event_timestamp_ms  bigint      not null check (last_event_timestamp_ms > 0),
  updated_at               timestamptz not null default now(),
  primary key (profile_id, entitlement_id),
  constraint entitlements_id_not_blank check (char_length(btrim(entitlement_id)) between 1 and 80),
  constraint entitlements_product_not_blank check (char_length(btrim(product_id)) between 1 and 200),
  constraint entitlements_event_id_not_blank check (char_length(btrim(last_event_id)) between 1 and 255)
);

-- One row per event target is the idempotency key. A TRANSFER legitimately
-- touches several profiles with the same event id, hence the composite key.
create table if not exists public.revenuecat_event_targets (
  event_id           text        not null,
  profile_id         uuid        not null references public.profiles(id) on delete cascade,
  entitlement_id     text        not null,
  event_type         text        not null,
  event_timestamp_ms bigint      not null check (event_timestamp_ms > 0),
  processed_at       timestamptz not null default now(),
  primary key (event_id, profile_id, entitlement_id)
);

alter table public.entitlements enable row level security;
alter table public.revenuecat_event_targets enable row level security;

drop policy if exists "entitlements: read own" on public.entitlements;
create policy "entitlements: read own"
  on public.entitlements for select
  using (profile_id = (select auth.uid()));

-- Table grants are explicit. There is no client insert/update/delete grant and
-- no policy that could authorize one even if a grant were added accidentally.
revoke all on public.entitlements from anon, authenticated;
grant select on public.entitlements to authenticated;
grant select, insert, update, delete on public.entitlements to service_role;

revoke all on public.revenuecat_event_targets from anon, authenticated;
grant select, insert, update, delete on public.revenuecat_event_targets to service_role;

create or replace function public.apply_revenuecat_entitlement_event(
  p_event_id text,
  p_event_type text,
  p_event_timestamp_ms bigint,
  p_actions jsonb
)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_action jsonb;
  v_profile_id uuid;
  v_entitlement_id text;
  v_product_id text;
  v_active boolean;
  v_event_at timestamptz;
  v_rows integer;
  v_applied integer := 0;
begin
  if p_event_id is null or char_length(btrim(p_event_id)) not between 1 and 255 then
    raise exception 'invalid RevenueCat event id' using errcode = '22023';
  end if;
  if p_event_type not in ('NON_RENEWING_PURCHASE', 'CANCELLATION', 'REFUND_REVERSED', 'TRANSFER') then
    raise exception 'unsupported RevenueCat event type' using errcode = '22023';
  end if;
  if p_event_timestamp_ms is null or p_event_timestamp_ms <= 0 then
    raise exception 'invalid RevenueCat event timestamp' using errcode = '22023';
  end if;
  if p_actions is null or jsonb_typeof(p_actions) <> 'array'
     or jsonb_array_length(p_actions) not between 1 and 100 then
    raise exception 'RevenueCat actions must be a non-empty array' using errcode = '22023';
  end if;

  v_event_at := to_timestamp(p_event_timestamp_ms / 1000.0);

  for v_action in select value from jsonb_array_elements(p_actions)
  loop
    if jsonb_typeof(v_action) <> 'object'
       or jsonb_typeof(v_action -> 'active') <> 'boolean' then
      raise exception 'invalid RevenueCat action' using errcode = '22023';
    end if;

    begin
      v_profile_id := (v_action ->> 'profile_id')::uuid;
      v_entitlement_id := v_action ->> 'entitlement_id';
      v_product_id := v_action ->> 'product_id';
      v_active := (v_action ->> 'active')::boolean;
    exception when invalid_text_representation then
      raise exception 'invalid RevenueCat action profile' using errcode = '22023';
    end;

    -- v1 has exactly one entitlement/product pair. Pinning both here makes a
    -- malformed Edge Function call fail rather than mint an arbitrary grant.
    if v_entitlement_id <> 'pro'
       or v_product_id <> 'app.prism.trainer.pro.lifetime' then
      raise exception 'unknown RevenueCat entitlement contract' using errcode = '22023';
    end if;

    -- Account deletion can race a delayed webhook. A deleted UUID is ignored;
    -- it is never recreated and never turns retries into a foreign-key loop.
    if not exists (select 1 from public.profiles p where p.id = v_profile_id) then
      continue;
    end if;

    insert into public.revenuecat_event_targets (
      event_id, profile_id, entitlement_id, event_type, event_timestamp_ms
    ) values (
      p_event_id, v_profile_id, v_entitlement_id, p_event_type, p_event_timestamp_ms
    ) on conflict do nothing;
    get diagnostics v_rows = row_count;
    if v_rows = 0 then
      continue;
    end if;

    insert into public.entitlements (
      profile_id,
      entitlement_id,
      product_id,
      granted_at,
      revoked_at,
      source,
      last_event_id,
      last_event_type,
      last_event_timestamp_ms,
      updated_at
    ) values (
      v_profile_id,
      v_entitlement_id,
      v_product_id,
      v_event_at,
      case when v_active then null else v_event_at end,
      'revenuecat',
      p_event_id,
      p_event_type,
      p_event_timestamp_ms,
      now()
    )
    on conflict (profile_id, entitlement_id) do update
      set product_id = excluded.product_id,
          granted_at = case
            when v_active then excluded.granted_at
            else public.entitlements.granted_at
          end,
          revoked_at = excluded.revoked_at,
          source = excluded.source,
          last_event_id = excluded.last_event_id,
          last_event_type = excluded.last_event_type,
          last_event_timestamp_ms = excluded.last_event_timestamp_ms,
          updated_at = now()
    where excluded.last_event_timestamp_ms > public.entitlements.last_event_timestamp_ms
       or (
         excluded.last_event_timestamp_ms = public.entitlements.last_event_timestamp_ms
         and excluded.revoked_at is not null
         and public.entitlements.revoked_at is null
       );
    get diagnostics v_rows = row_count;
    v_applied := v_applied + v_rows;
  end loop;

  return v_applied;
end;
$$;

comment on function public.apply_revenuecat_entitlement_event(text, text, bigint, jsonb) is
  'Apply one authenticated RevenueCat event atomically. Service-role only; clients can only read their own resulting entitlement.';

revoke all on function public.apply_revenuecat_entitlement_event(text, text, bigint, jsonb) from public;
revoke all on function public.apply_revenuecat_entitlement_event(text, text, bigint, jsonb) from anon, authenticated;
grant execute on function public.apply_revenuecat_entitlement_event(text, text, bigint, jsonb) to service_role;
