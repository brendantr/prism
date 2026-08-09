-- ===========================================================================
-- PRism -- local training day
-- ===========================================================================
-- Follows 0007_deletable_account_with_custom_exercises.sql. Resolves the final
-- demo/Supabase parity gap recorded by Docs/invariants.md I-7.
--
-- RENUMBERED. This file was written as `0006_local_training_day.sql` on a branch
-- cut from `main` at a72a2e5. While it sat unlanded, `0006_seed_library.sql` and
-- `0007_deletable_account_with_custom_exercises.sql` were merged, so two
-- different migrations claimed the 0006 prefix. Applying these to a hosted
-- project is a manual, ordered, by-hand step (see Docs/tester-readiness-runbook.md),
-- and an ambiguous order there is not a tidiness problem — it is an operator
-- applying the wrong file, or skipping one, on a project holding real training
-- data. It touches nothing 0006 or 0007 touch: they concern `exercises`,
-- `routines` and two foreign keys; this concerns `check_ins` and
-- `save_check_in`. The renumber is positional only.
--
-- Demo mode has always treated a check-in day as the device's local calendar
-- date. The original database index used the UTC date of `checked_in_at`.
-- West of UTC that can collapse two adjacent local dates; east of UTC it can
-- split one local date into two rows.
--
-- The client now captures the semantic value directly as `local_date`.
-- `checked_in_at` remains the event instant and continues to order check-ins
-- and drive readiness staleness in elapsed hours.
--
-- SECURITY
-- --------
-- `local_date` is user data, not identity. The function stays SECURITY
-- INVOKER, every statement remains under RLS, and ownership still comes only
-- from auth.uid(). The client sends no profile_id.
--
-- Existing rows are backfilled with their former UTC bucket. No production
-- data exists as of this migration; the backfill makes the DDL safe on any
-- development database that does contain fixtures without pretending their
-- historical device timezone can be recovered.
-- ===========================================================================

alter table public.check_ins
  add column if not exists local_date date;

update public.check_ins
set local_date = timezone('utc', checked_in_at)::date
where local_date is null;

alter table public.check_ins
  alter column local_date set not null;

comment on column public.check_ins.local_date is
  'Device-local calendar date captured at check-in time. One record per '
  'profile and local date; checked_in_at remains the event instant.';

drop index if exists public.check_ins_one_per_day;

create unique index check_ins_one_per_day
  on public.check_ins (profile_id, local_date);

-- Replace 0004's UTC-bucketed merge. Partial-field semantics are unchanged:
-- omitted keeps the stored value, present null clears it, and present 1..5
-- overwrites it.
create or replace function public.save_check_in(p_patch jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_profile     uuid := auth.uid();
  v_at          timestamptz := coalesce((p_patch ->> 'checked_in_at')::timestamptz, now());
  v_local_date  date;
  v_existing_id uuid;
begin
  if v_profile is null then
    raise exception 'save_check_in requires an authenticated session'
      using errcode = '28000';
  end if;

  if not (p_patch ? 'local_date') or nullif(p_patch ->> 'local_date', '') is null then
    raise exception 'save_check_in requires local_date'
      using errcode = '22023';
  end if;

  v_local_date := (p_patch ->> 'local_date')::date;

  select c.id into v_existing_id
  from public.check_ins c
  where c.profile_id = v_profile
    and c.local_date = v_local_date
  limit 1;

  if v_existing_id is null then
    insert into public.check_ins (
      id, profile_id, local_date, checked_in_at,
      sleep_quality, energy, soreness, stress
    )
    values (
      coalesce(nullif(p_patch ->> 'id', '')::uuid, gen_random_uuid()),
      v_profile,
      v_local_date,
      v_at,
      nullif(p_patch ->> 'sleep_quality', '')::smallint,
      nullif(p_patch ->> 'energy', '')::smallint,
      nullif(p_patch ->> 'soreness', '')::smallint,
      nullif(p_patch ->> 'stress', '')::smallint
    );
    return;
  end if;

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
  'Insert or merge a check-in by its client-captured local_date. A key absent '
  'from the patch leaves the stored answer alone; a present null clears it. '
  'Security invoker: RLS applies and ownership comes from auth.uid(). See '
  'Docs/invariants.md I-7.';

revoke all on function public.save_check_in(jsonb) from public;
grant execute on function public.save_check_in(jsonb) to authenticated;
