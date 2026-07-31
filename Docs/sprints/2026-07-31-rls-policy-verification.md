# Sprint: rls-policy-verification

- **Status:** Complete (both phases). `supabase/migrations/0001_init.sql` **fails to apply** on both
  an emulated local Postgres instance (Phase 1) and a real, dedicated hosted Supabase project
  (Phase 2, `prism-rls-verification`) — identical failure, identical line, ruling out an
  environment-specific cause. Against an unapplied, scratch-only patched copy in both environments,
  all 57 planned cross-tenant isolation assertions **passed twice** (114/114 total), demonstrating the
  policies as written are correct once the migration itself can run.
  `supabase/migrations/0001_init.sql` is **not modified** by this sprint. See "Combined conclusion."
- **Date:** 2026-07-31
- **Branch:** `rls-policy-verification`
- **Type:** Read-only verification against existing, already-committed policy definitions. No schema
  changes, no new tables, no policy logic changes.
- **Predecessor context:** `Docs/architecture.md` gap G-3 / `Docs/invariants.md` I-1 — RLS policies
  are written for all 11 tables (`supabase/migrations/0001_init.sql`) but were, until this sprint,
  never exercised against a live Postgres instance.

## Phase 1 — local Postgres (complete)

Everything below "Phase 2" up to this point in the document is Phase 1: a local, disposable Postgres
instance (no Docker/Supabase CLI local stack available on that machine), an emulated Supabase
auth/role model, and an automated 57-assertion suite. **Central finding:**
`supabase/migrations/0001_init.sql` **fails to apply to a standard Postgres instance** (a
non-immutable function in an index expression), aborting before any RLS policy is ever created — a
more severe finding than "unverified." Against an unapplied, hypothetically-patched copy, all 57
planned cross-tenant isolation assertions **passed**, demonstrating the policies as written are
correct once the migration itself can run. `supabase/migrations/0001_init.sql` was **not modified** in
Phase 1. Full detail in "Results" and "Open questions" below.

## Phase 1 — Preflight

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

## Phase 1 — Scope

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

## Phase 1 — Tasks and success criteria

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

## Phase 1 — Results

### Task 1 — stand up local Postgres, apply both migrations

**Status: Blocked by a real, previously-undiscovered defect in `0001_init.sql`. Not fixed — reported,
per this sprint's own stop condition and `CLAUDE.md`'s database-change approval gate.**

**Fact.** `postgresql@16` installed via Homebrew; a disposable, isolated data directory and instance
created outside the repo and outside Homebrew's own default cluster (`initdb` into a scratch
directory, started on port 55432 with its own Unix socket directory). The auth/role emulation
described in "Preflight" was applied first (`00_setup_auth_emulation.sql`), then
`supabase/migrations/0001_init.sql` was applied exactly as committed, byte-for-byte, no edits.

**Fact, the central finding.** The migration **fails and aborts partway through**:

```
psql:supabase/migrations/0001_init.sql:209: ERROR:  functions in index expression must be marked IMMUTABLE
```

The failing statement:
```sql
create unique index check_ins_one_per_day
  on check_ins (profile_id, (checked_in_at::date));
```

Casting a `timestamptz` to `date` depends on the session's `TimeZone` setting, so Postgres correctly
classifies that cast as `STABLE`, not `IMMUTABLE` — confirmed directly, not assumed, by querying
`pg_proc`: `date(timestamptz)` shows `provolatile = 's'` (stable). This is a **hard, version- and
environment-independent Postgres constraint** on what may appear in an index expression, not a quirk
of this local install — the same `pg_proc` query also confirms `timezone(text, timestamptz)` is
`provolatile = 'i'` (immutable), which is what makes a corrected version of this same index possible
(see below).

**Fact.** Because `psql -v ON_ERROR_STOP=1` (and, in fact, Postgres's own error-abort behavior within
a single script) stops at the first error, **everything after line 209 in the file never executed**:
confirmed directly — `\dt` shows only 10 of the 11 tables exist (`personal_records` is entirely
absent), and both `pg_class.relrowsecurity` and `pg_policies` confirm **row-level security was never
enabled and zero policies exist anywhere** in this database, because the entire "ROW LEVEL SECURITY"
section of the file (lines 266–387) sits after the failing statement.

**This means the central premise of the task — "verify that 0001's RLS policies actually enforce
isolation" — could not be tested as stated, because the policies were never even created.** This is a
more severe finding than "RLS is unverified" (`Docs/architecture.md` G-3 / `Docs/invariants.md` I-1's
current wording): the migration that defines them **cannot complete on a standard Postgres instance
at all**, and, per the available evidence, never has — consistent with, and now explaining precisely
why, no test or CI job has ever exercised it.

**Decision, not applied to the repository.** To (a) confirm this is really and only the one statement
at fault, and (b) give the engineer concrete, tested evidence rather than a bare bug report, a
**throwaway, unapplied scratch copy** of `0001_init.sql` was patched with the standard fix implied by
the `pg_proc` check above — `(checked_in_at::date)` → `(timezone('utc', checked_in_at)::date)` — and
run against a second disposable database. This copy was never written back into
`supabase/migrations/0001_init.sql`; the committed file is untouched. Task 3's original success
criterion ("apply migration 0001 exactly as committed") is deliberately not met in the sense of "the
committed file, verbatim, produces a working schema" — because it does not — but the substitute
hypothetical-patch step exists specifically to support Task 5's stop-and-report requirement with real
evidence rather than a guess.

**Fact.** With that one-line, unapplied hypothetical fix, the migration completes fully: all 11 tables
are created, `pg_class.relrowsecurity = true` on all of them, and all policies from the file are
present. `0002_security_hardening.sql` then applies cleanly on top, unmodified.

### Task 2 — two test users, full CRUD cross-access matrix

**Status: Done, against the hypothetically-patched schema (see Task 1) — 57/57 assertions passed.**

**Fact.** Two test users (`auth.users` + auto-created `profiles`, via the real `handle_new_user`
trigger) and one row in every one of the 11 tables were seeded for each. A second, real defect was
found and fixed **in the test harness, not in product code** during seeding: `0002_security_hardening.sql`'s
new `assert_exercise_visible` trigger (on `routine_exercises`, `workout_exercises`,
`personal_records`) calls `auth.uid()` directly rather than through RLS, so it is not bypassed by a
superuser/table-owner session the way RLS itself is — seeding those three tables as `postgres` with no
JWT claim set made `auth.uid()` resolve to null, which the trigger correctly rejected. **Also found:**
the seed script's original single `begin;...commit;` wrapper meant that failure silently rolled back
everything already inserted, so the first test run's apparent "passes" were actually running against
an empty, uncommitted database — caught before drawing any conclusion from it, when a later,
FK-dependent positive-control assertion failed outright rather than silently. Both are fixed in the
committed `01_seed_test_data.sql`: the three affected tables are now seeded as the owning user's own
authenticated session (matching how the real app would actually write this data), and the script no
longer wraps everything in one transaction.

**Fact.** `02_run_isolation_tests.sql` (`supabase/tests/rls/`) runs 57 assertions covering, for every
one of the 11 tables: SELECT-own (positive control), SELECT-other (expect blocked), UPDATE-other and
DELETE-other (expect 0 rows affected, self-healing if not), and INSERT-impersonate (expect a
row-level-security policy violation error) — plus two explicit reverse-direction checks (B against A)
and one end-to-end INSERT+DELETE-own positive control, so a broken grant setup that blocked
*everything* (which would make every negative test trivially "pass" for the wrong reason) would have
been caught rather than mistaken for correct enforcement.

**Result: 57 / 57 passed.** Full table:

| # | Table | Assertions | Result |
|---|---|---|---|
| 1–5 | `profiles` | own-select, other-select, own-update, other-update, other-delete | **5/5 pass** |
| 6–13 | `exercises` | own/other/system-select ×2 (I-6), other-update, system-update, system-delete, impersonate-insert | **8/8 pass** |
| 14–18 | `routines` | own/other-select, other-update, other-delete, impersonate-insert | **5/5 pass** |
| 19–22 | `routine_days` | own/other-select, other-update, impersonate-insert | **4/4 pass** |
| 23–26 | `routine_exercises` | own/other-select, other-update, impersonate-insert | **4/4 pass** |
| 27–32 | `workouts` | own/other-select, other-update, other-delete, impersonate-insert, own-insert+delete control | **6/6 pass** |
| 33–36 | `workout_exercises` | own/other-select, other-update, impersonate-insert | **4/4 pass** |
| 37–41 | `sets` | own/other-select, other-update, other-delete, impersonate-insert | **5/5 pass** |
| 42–45 | `body_measurements` | own/other-select, other-update, impersonate-insert | **4/4 pass** |
| 46–50 | `check_ins` | own/other-select, other-update, other-delete, impersonate-insert | **5/5 pass** |
| 51–55 | `personal_records` | own/other-select, other-update, other-delete, impersonate-insert | **5/5 pass** |
| 56–57 | reverse direction (B vs. A) | `workouts`, `sets` select | **2/2 pass** |

**Conclusion: as written, the RLS policies in `0001_init.sql`/`0002_security_hardening.sql` correctly
enforce `profile_id = auth.uid()` isolation across every table and every CRUD operation tested — but
this has only ever been demonstrated against the unapplied, hypothetically-patched copy. It is not
demonstrated for the migration as it actually exists in this repository today, because that migration
does not run.**

### Task 3 — the documented exception (I-6)

**Status: Done.** Assertions 8, 9, 11, 12 above: both test users can SELECT the null-`profile_id`
system exercise row; neither can UPDATE or DELETE it. Matches the migration's own comment exactly
("world-readable, immutable").

### Task 4 — automated, re-runnable test file

**Status: Done.** `supabase/tests/rls/run.sh` re-runs the whole suite (auth emulation → both
migrations → seed → assertions) against any reachable Postgres via standard `PG*` env vars or a
`PSQL_URI`, parameterized so it is CI-ready without this sprint adding a CI job. Confirmed re-runnable
from a clean state twice in a row against the hypothetically-patched schema (second run: also 57/57,
exit code 0). **Cannot yet be run against the real, unpatched `0001_init.sql`** — it would reproduce
the Task 1 failure and stop before any RLS assertion runs, which is itself accurate, expected
behavior given the defect, not a bug in the test file.

### Task 5 — stop-and-report gate

**Status: Triggered, correctly, before any policy or migration edit.** Per the task's explicit
instruction and `CLAUDE.md`'s database-change approval gate, `supabase/migrations/0001_init.sql` is
**not modified** anywhere in this sprint. The one-line fix used to unblock verification exists only as
an unapplied scratch file outside the repository and is described, not committed, above.

## Phase 1 — Open questions

1. **Should `supabase/migrations/0001_init.sql`'s `check_ins_one_per_day` index be fixed?** *Owner
   decision* — this sprint recommends `(timezone('utc', checked_in_at)::date)` in place of
   `(checked_in_at::date)`, tested and confirmed to unblock the rest of the migration (Task 1), but
   does not apply it, per scope and the database-change approval gate.
2. **Is `I-1` now "met"?** **No** — see "Handoff" for the precise recommended wording. The policies
   *as written* are now demonstrated to behave correctly (Task 2, 57/57), which is new, real progress
   over "unverified." But the migration that creates them cannot run today, so RLS is not enabled
   anywhere real data would exist, and I-1 cannot be marked met until the index defect is fixed **and**
   this same suite passes against the actual, corrected `0001_init.sql` (not a scratch copy).
3. **Should `supabase/tests/rls/` be wired into CI?** Deliberately out of scope for this sprint (the
   task asked for a re-runnable test, not a CI change) — but now that the suite exists and passes
   against a corrected schema, wiring it into `.github/workflows/ci.yml` (with a Postgres service
   container) is a natural, low-risk next step. *Owner decision on priority.*

## Phase 1 — Progress log

- **2026-07-31 local** — Branch created off `main` (`45280d3`). Preflight docs read in full. Two
  discrepancies from the task's stated premise found and resolved (second migration exists; neither
  suggested local-Postgres approach is available on this machine) — both documented above with
  rationale rather than silently resolved. This record opened before any Postgres instance, test
  infrastructure, or test file was created.
- **2026-07-31 local (continued)** — Installed local Postgres; built the auth/role emulation harness;
  applied `0001_init.sql` and discovered it fails at a non-immutable index expression, aborting before
  any RLS policy is created (Task 1). Built the seed and assertion suite; found and fixed two real
  bugs in the test harness itself during seeding (a trigger/auth.uid() interaction, and a
  transaction-wrapper masking a mid-script failure). Verified, via an unapplied scratch-only patched
  copy of the migration, that all 57 planned isolation assertions pass once the DDL defect is fixed.
  Did not modify `supabase/migrations/0001_init.sql`. Local Postgres instance stopped and its data
  directory is disposable scratch state, not part of this repository.

## Phase 2 — hosted Supabase project (this section)

**Fact.** A second instruction, in the same session, asked for the same underlying verification against
a real hosted Supabase project rather than local Postgres — explicitly noting no Docker/container
runtime is available (consistent with Phase 1's own finding) and asking for a dedicated test-only
project. This is additive to Phase 1, not a replacement: Phase 1's finding (the migration cannot even
apply) is independently real and unaffected by which Postgres instance is used to demonstrate it —
Phase 2 exists to re-confirm that finding against genuine Supabase infrastructure (not just a
faithful emulation of one) and to check anything Phase 1's local emulation could not, by construction,
verify (e.g., PostgREST's actual request path, a real `auth.users`/GoTrue).

**Decision, confirmed with the engineer/owner before any cloud action was taken.** Two things were
flagged and confirmed rather than assumed:
1. The Supabase CLI on this machine (`supabase 2.109.1`) is already authenticated, but to an account
   (org `dokonveymdzabfxzhwjf`) whose only existing project is `Simulisten` — unrelated to PRism.
   Confirmed to proceed in that same account, creating a new, dedicated project for PRism RLS testing
   only.
2. `rls-policy-verification` already existed as a branch (this one) with Phase 1's two real commits.
   Confirmed to continue on this same branch and sprint doc, with Phase 2 recorded as an additive
   section rather than starting over or discarding Phase 1.

**Scope, Phase 2 specifically:**
- Create one new, dedicated Supabase project for this verification only — no real user data, ever.
- Apply `0001_init.sql` (and, since Phase 1 already found it cannot succeed unmodified,
  document exactly what has to change to get it running in this real project too — same
  stop-and-report posture as Phase 1: no fix is written back into `supabase/migrations/` without
  explicit approval).
- Re-run the same style of two-user, 11-table, four-operation isolation matrix against this real
  project (via `psql` against the project's Postgres connection string, or the SQL editor/CLI), plus
  the `exercises.profile_id is null` exception.
- Document exact commands/queries and pass/fail per table in this same doc.
- **No CI wiring, no policy/migration edits, no client-code changes** without explicit approval,
  unchanged from Phase 1's scope.
- At the end of Phase 2: decide, with evidence from *two independent environments* (emulated local
  Postgres and real hosted Supabase), whether G-3 is closed and whether I-1 can be marked met.

### Phase 2 — Project used

**Fact.** Project `prism-rls-verification`, ref `gyxcjmitzktffyuroucz`, org `dokonveymdzabfxzhwjf`
(same org as the pre-existing, unrelated `Simulisten` project — confirmed with the engineer/owner
before creation), region `us-east-1`, Postgres 17.6. Created via `supabase projects create
prism-rls-verification --org-id dokonveymdzabfxzhwjf --db-password <generated> --region us-east-1
--yes`. Dashboard: `https://supabase.com/dashboard/project/gyxcjmitzktffyuroucz`. The database
password was generated locally (`openssl rand -base64 24`, 32 characters), used only for direct
`psql` connections during this sprint, stored only in this session's scratch directory, and never
committed, echoed to chat output, or written into this document — per `Docs/invariants.md` I-4/I-5.
Confirmed before any schema work: `public` schema was empty (fresh project) and no other tables or
data existed.

### Phase 2 — Results

**Fact, confirming Phase 1's central finding on genuine infrastructure.** Applying the real,
committed `supabase/migrations/0001_init.sql` (unmodified) against this hosted project reproduces
**the identical failure, at the identical line**:

```
psql:supabase/migrations/0001_init.sql:209: ERROR:  functions in index expression must be marked IMMUTABLE
```

Confirmed via the same checks as Phase 1: 10 of 11 tables created (`personal_records` absent),
`pg_class.relrowsecurity = false` on every table, zero rows in `pg_policies`. This rules out any
possibility that Phase 1's finding was an artifact of the local emulation, a specific Postgres
version (this project runs 17.6; Phase 1's local instance ran 16.14), or of anything else
environment-specific — the defect is in the SQL itself.

**Fact.** This real project arrives pre-provisioned with genuine `auth.users` (the actual GoTrue
schema, not Phase 1's stub), genuine `auth.uid()`, and genuine `anon`/`authenticated`/`service_role`
roles — confirmed by inspection before any migration ran. Phase 1's auth/role emulation
(`00_setup_auth_emulation.sql`) was correctly **not** run here; it would have conflicted with the
real schema.

**Fact, a new and different finding from Phase 1's own harness gap.** Unlike Phase 1's local
instance, this real project did **not** automatically grant `authenticated`/`anon` the table
privileges Supabase's own documented convention describes (RLS as the actual gate, ordinary GRANTs
underneath it) for tables created via a direct `psql` session as `postgres` — seeding failed with
`permission denied for table routine_exercises` until an explicit
`grant select, insert, update, delete on all tables in schema public to anon, authenticated;` (and
`grant all ... to service_role;`) was run. This is **expected, not a defect**: Supabase's dashboard
and CLI-driven migration flow ordinarily establishes these grants as part of its own provisioning;
applying a migration via a raw, direct `psql` connection — which is itself only happening here
because there is no Docker to run the Supabase CLI's normal migration path — bypasses that step.
Any real deployment of this schema through Supabase's own tooling would not hit this; it is called
out here only for completeness and reproducibility of this test.

**Fact.** With the DDL fix applied via the same unapplied, scratch-only patched copy used in Phase 1
(never written into `supabase/migrations/`), plus the grant statement above, `0002_security_hardening.sql`
applied cleanly, the same two-user fixture (`supabase/tests/rls/01_seed_test_data.sql`, unmodified)
seeded correctly across all 11 tables, and `02_run_isolation_tests.sql` (unmodified) ran to completion.

**Result: 57 / 57 assertions passed — identical outcome to Phase 1, on real hosted Supabase
infrastructure with genuine auth, genuine roles, and Postgres 17.6 rather than an emulation.** Same
per-table breakdown as Phase 1's table (all 11 tables, all four CRUD directions, the I-6 exception,
both reverse-direction checks, and the own-row positive control) — not reproduced a second time here
verbatim; see Phase 1 — Results for the full per-table list, which is identical in structure and
outcome.

### Phase 2 — Limitations

**Assumption, not independently checked.** This verification exercised Postgres's RLS enforcement
directly via `psql` (session-level `SET ROLE` + `request.jwt.claim.sub`), which is the same
mechanism PostgREST uses per request in production, but does not route through PostgREST or a real
mobile-client session itself — no actual JWT was minted by GoTrue, and no request went through
Supabase's API gateway. This is the standard, documented way to test RLS directly and is what
`supabase test db` itself does under the hood, but it is not a full end-to-end client test.
`src/data/repository.ts`'s `SupabaseRepository` was not exercised at all (out of scope, and there is
still no auth UI in this app to obtain a session from — `Docs/architecture.md` G-1).

**Fact.** No real user data was ever placed in this project — only the two fictional test
users/profiles and one fixture row per table, all with clearly synthetic UUIDs (`1111...`,
`2222...`, and `a0000000`–`40000000` prefixes). The project remains, as of this writing, live and
billed to org `dokonveymdzabfxzhwjf` — its disposition (kept for future re-verification/eventual CI
use, or deleted) is an open question below, not decided by this sprint.

## Combined conclusion (Phase 1 + Phase 2)

**G-3 (`Docs/architecture.md`) is now substantively addressed, but not in the direction originally
assumed.** The question "do the RLS policies actually enforce isolation" now has a confident,
evidence-based answer — **yes**, demonstrated 114 times over (57 assertions × 2 independent
environments: emulated local Postgres and real hosted Supabase) — but the question underneath it,
"can this schema even be deployed as committed," has a confident **no**. G-3 is closed in the sense
that the *policies* are no longer an open question; a **new, more fundamental gap** (the migration
cannot apply) has been substituted in its place, and is now the actual blocker to closing I-1.

**I-1 is still not met**, for a more specific reason than before this sprint: not "unverified," but
"the schema that would need verifying cannot be created in the first place." The path to meeting I-1
is now narrow and concrete: fix the one DDL statement, then re-run
`supabase/tests/rls/run.sh` against the actual corrected `supabase/migrations/0001_init.sql` (not a
scratch copy) in at least one real environment.

## Phase 2 — Open questions

1. **Disposition of the `prism-rls-verification` Supabase project.** It is live and billed to org
   `dokonveymdzabfxzhwjf` right now, contains only synthetic test data, and could be kept (for
   re-running this suite once the DDL fix lands, or as a future CI target) or deleted. *Owner
   decision* — not deleted by this sprint without being asked.
2. **Same DDL-fix and CI-wiring questions as Phase 1** (see "Phase 1 — Open questions"), now with
   twice the evidence behind them.

## Phase 2 — Progress log

- **2026-07-31 local (continued from Phase 1)** — New instruction received asking for the same
  verification against real hosted Supabase infrastructure; two discrepancies flagged and confirmed
  with the engineer/owner before any cloud action (which account/org to use; how to handle the
  already-existing `rls-policy-verification` branch/doc) rather than assumed. Sprint doc restructured
  into Phase 1/Phase 2 before touching any code, per preflight. Created `prism-rls-verification`
  (org `dokonveymdzabfxzhwjf`, ref `gyxcjmitzktffyuroucz`). Confirmed the real, committed
  `0001_init.sql` fails identically to Phase 1's local finding. Found and resolved a
  real-project-specific harness gap (missing `authenticated`/`anon` table grants, expected given a
  direct `psql` connection bypasses Supabase's normal provisioning path). Re-ran the unmodified Phase
  1 test suite (seed + 57 assertions) against the hypothetically-patched schema: 57/57 passed.
  `supabase/migrations/0001_init.sql` not modified. Combined conclusion recorded above.
