-- ===========================================================================
-- RLS test harness: Supabase auth/role emulation for a plain local Postgres.
-- ===========================================================================
-- This project's migrations (supabase/migrations/*.sql) assume a real Supabase
-- project: an `auth.users` table, `auth.uid()`, and the `anon`/`authenticated`/
-- `service_role` roles that Supabase's own local dev stack and hosted
-- infrastructure provide automatically. A plain Postgres instance has none of
-- that, so this file reconstructs the minimum needed to exercise the schema's
-- RLS policies faithfully -- not a private convention invented for this
-- project, but a reproduction of Supabase's own publicly documented local-dev
-- setup (the same schema/roles/function every `supabase start` creates).
--
-- Run this BEFORE applying supabase/migrations/0001_init.sql, since that
-- migration's `profiles` table has a foreign key to `auth.users` and its
-- `on_auth_user_created` trigger fires on insert into `auth.users`.
--
-- See Docs/sprints/2026-07-31-rls-policy-verification.md ("Preflight" section)
-- for why this emulation exists and what would invalidate it if it were wrong.
-- ===========================================================================

create schema if not exists auth;

-- Shaped like Supabase's real auth.users: only the columns this repo's own
-- migration actually reads (id, raw_user_meta_data) plus the minimum Postgres
-- needs for a usable primary key. Not a full reproduction of Supabase's auth
-- schema (many auth-internal columns are irrelevant to RLS testing and are
-- deliberately omitted).
create table if not exists auth.users (
  id                 uuid primary key default gen_random_uuid(),
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at         timestamptz not null default now()
);

-- Supabase's real, publicly documented implementation (present verbatim in
-- every `supabase start` stack): reads the caller's user id from a
-- session-local GUC that PostgREST sets per-request from the caller's JWT.
-- A test simulates "logged in as user X" by setting this value for the
-- duration of one transaction.
create or replace function auth.uid() returns uuid
language sql stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;

-- Supabase's real role names. `anon`/`authenticated` are ordinary (non-owner,
-- non-superuser) roles -- RLS applies to them normally, which is the entire
-- point. `service_role` is granted here for completeness/parity but this
-- suite does not use it to read/write test data; the fixture setup below
-- uses `postgres` for that instead.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end
$$;

grant usage on schema public to anon, authenticated, service_role;
grant usage on schema auth to anon, authenticated, service_role;

-- Supabase's real default: `authenticated`/`anon` get ordinary table grants;
-- RLS -- not the absence of a grant -- is the actual gate. This must be
-- re-run after the migrations create their tables (see 01_seed_test_data.sql
-- header), since `alter default privileges` only affects objects created
-- after it runs in the same session/role.
alter default privileges in schema public
  grant select, insert, update, delete on tables to anon, authenticated;
alter default privileges in schema public
  grant all on tables to service_role;
