# Sprint: rls-policy-verification

- **Status:** In progress. Record opened before any Postgres instance, test infrastructure, or test
  file was created, per `Docs/agents.md` preflight.
- **Date:** 2026-07-31
- **Branch:** `rls-policy-verification`
- **Type:** Read-only verification against existing, already-committed policy definitions. No schema
  changes, no new tables, no policy logic changes.
- **Predecessor context:** `Docs/architecture.md` gap G-3 / `Docs/invariants.md` I-1 — RLS policies
  are written for all 11 tables (`supabase/migrations/0001_init.sql`) but were, until this sprint,
  never exercised against a live Postgres instance.

## Preflight

**Fact.** `git status --short --branch` on `main` was clean before branching; branch created off
`main` at `45280d3` (the `android-themed-icon-monochrome-layer` merge). `Docs/architecture.md`,
`Docs/invariants.md` (I-1, I-6 read in full; all others skimmed), and `Docs/agents.md` were read in
full before any code/infra change. The three files under `Docs/decisions/` were checked for
auth/data-access content (`grep -i "RLS|auth\.|profile_id"`); none define policy beyond what
`Docs/invariants.md` I-1/I-6 already states — ADR-0002 references RLS only as a precondition for a
later, unrelated phase (suggestion-audit persistence), not as a source of additional rules for this
sprint.

**Fact, a discrepancy from the task's stated premise.** The task's instructions named
`supabase/migrations/0001_init.sql` as the migration to verify. The repository now also contains
`supabase/migrations/0002_security_hardening.sql` (2026-07-30, `security-backend-foundation` sprint,
predating this one), which does not touch any RLS policy's `USING`/`WITH CHECK` clause but does add a
cross-tenant guard relevant to this sprint's subject matter: a trigger (`assert_exercise_visible`)
that closes a gap where a foreign key to `exercises` could otherwise reference another user's private
exercise row (FK checks run as table owner and bypass RLS). Testing only `0001` would exercise a
schema state that no longer matches what's actually committed and would skip a real, in-scope
cross-tenant boundary.

**Decision.** Apply both migrations, in order (`0001_init.sql` then `0002_security_hardening.sql`),
against the local verification database. This is unchanged, already-committed, already-reviewed SQL —
applying it to a disposable local test instance is execution of existing migrations for verification,
not a schema/policy edit requiring the database-change approval gate in `CLAUDE.md` (that gate governs
*writing* migrations or policy logic, which this sprint does not do). Both migrations are applied
byte-for-byte as committed; neither is edited.

**Fact, a second discrepancy from the task's stated premise.** Neither of the task's two suggested
approaches — "Supabase CLI local dev stack" or "a Docker Postgres container" — is achievable on this
machine as given: there is no Docker, Colima, or Podman installed (`which docker/colima/podman` all
empty), and the Supabase CLI (`supabase 2.109.1`, already installed) requires Docker for `supabase
start`; there is no non-Docker mode. There is also no native Postgres already installed (`psql`,
`postgres`, `pg_ctl` all absent).

**Decision.** Install a local, non-Docker Postgres server via Homebrew (`postgresql@16`) rather than
install a full container runtime (Docker Desktop/OrbStack) for this alone. *Rationale:* this is local
dev-machine tooling, not a project dependency change (same category as installing the Android SDK
command-line tools in a prior sprint) — lighter-weight, no VM/hypervisor, no elevated system
permissions. Because a plain Postgres instance does not have Supabase's `auth` schema, roles, or
`auth.uid()`, this sprint builds a minimal, transparent emulation of Supabase's real local-dev role
model, checked in as part of the test file itself (not hidden in a setup script) so its fidelity can
be independently audited rather than taken on trust:
- an `auth` schema with a `users` table shaped exactly like Supabase's (`id uuid primary key`, plus
  the columns `0001_init.sql`'s trigger reads: `raw_user_meta_data`), since `profiles.id` and the
  `on_auth_user_created` trigger both reference it;
- `anon`, `authenticated`, and `service_role` roles, matching Supabase's real names, with the same
  default grant pattern Supabase documents (schema usage + full table grants to `authenticated`, RLS
  as the actual gate — not a private convention, not this project's own choice);
- `auth.uid()` defined exactly as Supabase's own hosted implementation is publicly documented:
  reading the caller's user id from a session-local setting (`request.jwt.claim.sub`), so a test can
  simulate "logged in as user A" by setting that value for the duration of one transaction and
  resetting it after.

This is a **stated Assumption**, not a fact: it is a faithful reconstruction of Supabase's publicly
documented local-dev role/auth model, not a copy of anything proprietary, and not independently
verified against a genuine Supabase project in this sprint (no live Supabase project was reachable
here either). If this emulation is wrong in some way that makes RLS look more permissive or more
restrictive than it would on real Supabase infrastructure, that would invalidate this sprint's
verdicts — this is exactly why the emulation is committed in full, in the open, rather than run once
and discarded.

## Scope

**In scope:**
- Stand up a local, disposable Postgres instance; apply `0001_init.sql` and `0002_security_hardening.sql`
  exactly as committed (see Decision above for why both).
- Build the minimal auth/role emulation described above, as a checked-in, reviewable SQL file.
- Create two test profiles (user A, user B) and, for every one of the 11 RLS-enabled tables, assert:
  user A cannot SELECT/INSERT/UPDATE/DELETE user B's rows; user A can do all four against their own
  rows.
- Explicitly test the one documented exception (I-6): `exercises` rows with `profile_id is null`
  remain readable by both users.
- Write this as an automated, re-runnable SQL/pgTAP test file — not a one-off manual session — so it
  can be wired into CI later (wiring it into `.github/workflows/ci.yml` is **out of scope** for this
  sprint unless explicitly requested; the task asks for a re-runnable test, not a CI change).

**Explicitly out of scope:**
- **No changes to `supabase/migrations/0001_init.sql` or `0002_security_hardening.sql`.** Both are
  applied unmodified.
- **No new tables, no policy logic changes** — unless verification reveals a real gap, in which case
  this sprint stops and reports the exact failing table/policy rather than fixing it (per the task's
  explicit instruction and `CLAUDE.md`'s database-change approval gate).
- **No changes to `src/data/repository.ts`, `app/`, or any client code.**
- **No CI workflow changes.**
- **No live/production Supabase project is touched.** Everything here runs against a local, disposable
  instance created and torn down within this sprint.

## Tasks and success criteria

1. **Stand up local Postgres, apply both migrations.** Success: both migrations apply without error
   against a fresh local database; `\dt` / `\d+` confirms all 11 tables plus enums, triggers, and RLS
   are present exactly as the SQL declares.
2. **Two test users, full CRUD cross-access matrix.** Success: for each of the 11 RLS-enabled tables,
   four assertions per direction (A reading/writing B, and the reverse where meaningful) plus the
   own-row-access positive case — recorded pass/fail, not summarized as a single verdict.
3. **`exercises.profile_id is null` exception.** Success: both test users can SELECT a null-`profile_id`
   system exercise row; neither can UPDATE/DELETE it (no policy grants that), consistent with the
   migration's own comment ("world-readable, immutable").
4. **Automated, re-runnable test file.** Success: a single command re-runs the entire suite from a
   clean state and reports pass/fail per assertion, not prose.
5. **Stop-and-report gate.** If any assertion fails (cross-tenant access succeeds where it should be
   blocked), stop immediately, do not touch policy SQL, and report the exact table/policy/assertion
   that failed.

## Labelling discipline (`I-15`)

Same convention as prior sprints: **Fact** (observed/commanded), **Decision** (a choice made here,
with rationale), **Assumption** (not directly checked), **Open question** (for the engineer/owner).

## Progress log

- **2026-07-31 local** — Branch created off `main` (`45280d3`). Preflight docs read in full. Two
  discrepancies from the task's stated premise found and resolved (second migration exists; neither
  suggested local-Postgres approach is available on this machine) — both documented above with
  rationale rather than silently resolved. This record opened before any Postgres instance, test
  infrastructure, or test file was created.
