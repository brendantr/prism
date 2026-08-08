# Sprint: staging Supabase verification

## Document status

- **Status:** Implementation complete in the repository; **not yet executed against a real project**.
- **Date opened:** 2026-08-07
- **Branch:** `feature/v1-staging-supabase-verification`
- **Base:** `main` at `a72a2e5`
- **Labels used throughout:** `[fact]` (with evidence), `[assumption]`, `[recommendation]`,
  `[open question]` — per `Docs/agents.md` "Labeling ambiguity" and `Docs/invariants.md` I-15.

---

## 1. Why this sprint exists

`[fact]` As of `main` at `a72a2e5`, PRism has five migrations (`0001`–`0005`), three RPCs
(`save_workout_graph`, `save_check_in`, `delete_my_account`), a `security definer` account-deletion
path, and a complete client-side account lifecycle — and **no line of any of it has ever executed
against a real Supabase project**. Evidence: `src/data/supabase/__tests__/sessionFlow.integration.test.ts`
before this sprint contained four `it.todo`s and had been credential-gated and skipping since
2026-07-30; `Docs/architecture.md` records "not applied to a live project" in five separate delta
entries; `npm run test:integration` reports skipped.

`[fact]` Everything currently verified about the database is verified against **plain Postgres 16
with a hand-built imitation of Supabase's auth schema** (`supabase/tests/rls/00_setup_auth_emulation.sql`).
That suite is strong — 132 assertions, green in CI on every push — and it is structurally unable to
observe three things:

1. The real `auth.users`, its triggers, and the real `authenticated` role's grants.
2. **PostgREST.** Every call the app makes is HTTP, so a function that works in psql can still be
   unreachable through a missing `grant execute`, a stale schema cache, or an argument name that
   cannot bind. None of that is visible from SQL.
3. Any TypeScript at all. `fromWorkoutGraph` and the `save_check_in` key-presence patch builder are
   asserted only against mocked `rpc()` calls.

The compounding risk was the argument for doing this before more features: each sprint adds another
layer of "verified against an emulator" to a stack nobody has pointed at the real system.

---

## 2. What this sprint changed

| File | What |
|---|---|
| `src/data/supabase/__tests__/support/integrationProject.ts` | **New.** The harness: env gate, `loadApp()` module bootstrap, disposable-account lifecycle, and raw REST/RPC/refresh helpers. |
| `src/data/supabase/__tests__/support/nativeMocks.ts` | **New.** `expo-secure-store` and AsyncStorage fakes shared by the lane. The SecureStore fake enforces the real ~2048-byte ceiling. |
| `src/data/supabase/__tests__/sessionFlow.integration.test.ts` | **Rewritten.** The four `it.todo`s are now five real tests. |
| `src/data/supabase/__tests__/repository.integration.test.ts` | **New.** 14 tests across three suites: the repository, RLS between two real accounts, and deletion. |
| `.github/workflows/integration.yml` | **New.** A nightly + manually dispatchable job, deliberately separate from `ci.yml`. |
| `Docs/architecture.md` | Delta entry recording this sprint and its findings. |

**Nothing else was touched.** No migration, no schema, no app source, no dependency `[fact]` — see §7.

### 2.1 The one design decision worth stating

The harness drives **the app's own module graph**, not a client it built for itself. `loadApp()`
copies `PRISM_INTEGRATION_SUPABASE_*` into the `EXPO_PUBLIC_*` names, calls `jest.resetModules()`,
and re-requires `src/data/repository.ts`, `auth.ts` and `client.ts`.

That indirection is load-bearing twice over. `client.ts` reads `process.env` **at module load** and
memoises the client in a module-level singleton, so setting the variables afterwards changes nothing
and the suite would quietly talk to no backend. And `DEMO_MODE` falls back to `__DEV__` when unset —
which is `true` under Jest — so a harness that forgot the flag would run every assertion against
local seed data **and pass**. `repository.integration.test.ts` asserts `repo().kind === 'supabase'`
first, before anything else, for exactly that reason.

The environment variables keep the deliberately different `PRISM_INTEGRATION_*` names they were given
in 2026-07-30: a developer with a real `.env` must never be able to point a suite that creates and
deletes accounts at their own project by accident.

---

## 3. What the tests assert

**Auth lifecycle** (`sessionFlow.integration.test.ts`) — a session issued by a real server; the
chunked Keychain adapter round-tripping a real token (asserted via chunk count > 1, against a mock
that enforces the real byte ceiling); a fresh module graph reading it back; refresh-token rotation
with the superseded token rejected; sign-out revoking server-side; sign-in returning to the same
account.

**Repository** (`repository.integration.test.ts`) — `handle_new_user` creating a profile on the real
`auth.users`; `completeWorkout` committing the whole graph through PostgREST and reading back; a
forged `profileId` in the payload overwritten from the session; an exact retry as a no-op; child
reconciliation on re-save; `save_check_in`'s three-state omit/value/null semantics including the
**merge under a new id** that `0004` fixed; export completeness.

**RLS between two real accounts** — one account cannot see another's workout by id or by list, and a
write forging another account as owner is rejected. This is the assumption
`src/data/__tests__/ownership.test.ts` has been taking on trust because there was no database to ask.

**Deletion** — `delete_my_account` erasing the account and cascading to its rows.

---

## 4. Runbook — the owner-only steps

`[fact]` Every step in this section requires credentials or a dashboard, and per `CLAUDE.md`
(cloud-resource changes) and `Docs/invariants.md` I-4 an agent does not hold or use them. **None of
this has been performed.**

1. **Create a project** named `prism-staging`, in the region you would use for production.
   **Not production.** This lane deletes accounts.
2. **Apply the migrations in order** — SQL Editor, one at a time, `0001_init.sql` → `0002` → `0003` →
   `0004` → `0005`. Stop at the first error rather than continuing.
3. **Disable email confirmation** (Authentication → Sign In / Providers → Confirm email → off). The
   suite creates disposable accounts and needs `signUp` to return a session. The harness fails with
   this exact instruction if it does not.
4. **Copy the project URL and the `anon` key.** The `anon` key only. A service-role key must never
   enter this environment (I-4), and nothing here needs one — each account is deleted with its own
   session.
5. **Run it locally first:**

```bash
PRISM_INTEGRATION_SUPABASE_URL='https://YOUR-PROJECT.supabase.co' PRISM_INTEGRATION_SUPABASE_ANON_KEY='YOUR-ANON-KEY' npm run test:integration
```

6. **Then add the same two values as repository secrets** (`PRISM_INTEGRATION_SUPABASE_URL`,
   `PRISM_INTEGRATION_SUPABASE_ANON_KEY`) and trigger the `Integration (staging Supabase)` workflow
   once by hand. Without the secrets the job emits a warning and exercises nothing, by design.

`[assumption]` Steps 1–4 take roughly 20 minutes. Nothing in the harness depends on the project's
region, plan, or Postgres minor version.

---

## 5. Findings — things this sprint uncovered without a project existing

### F-1 `[fact]` A fresh Supabase project has no exercises and no routines, and nothing in this repository seeds them

`grep` over `supabase/migrations/*.sql` finds **no `insert` into `exercises` or `routines`** in any of
the five migrations. `EXERCISE_LIBRARY` (`src/data/exerciseLibrary.ts`, ~90 movements) and
`ROUTINE_TEMPLATES` (`src/data/routineTemplates.ts`) are imported by exactly one consumer —
`DemoRepository` (`src/data/repository.ts:157,161`). `SupabaseRepository.listExercises()` and
`listRoutines()` read from Postgres.

So on a correctly migrated production project, a real lifter signs up and finds **an empty exercise
picker, no template plans, and no active routine**. The workout logger cannot be used at all, because
there is nothing to log against. `README.md` "Connecting Supabase" step 3 says to insert the library
by hand — an undefined manual step with no committed uuid mapping, so two environments would end up
with different ids for the same movement, and `trainingStore`'s hardcoded
`favouriteExerciseIds: ['ex_back_squat', …]` can never match either.

This is a **v1 blocker** and it is invisible to every existing test: the SQL suites seed their own
exercises, and the default Jest lane runs the demo repository. `repository.integration.test.ts`
pins it as a test (`starts with an empty shared library, because nothing seeds one`) so that a seed
migration has to change the assertion deliberately.

`[recommendation]` A `0006_seed_library.sql` with **literal, committed uuids** for the system
exercises and template routines — not generated ones — so every environment agrees on the ids and the
seed is idempotent (`on conflict do nothing`). That is a migration, and migrations are behind
`CLAUDE.md`'s approval gate, so it is proposed here rather than written.

### F-2 `[fact]` An access token outlives both sign-out and account deletion

A Supabase access token is a stateless JWT; PostgREST validates it by signature and expiry and does
not consult a user table. Sign-out revokes the **refresh** token, and deleting the account removes
the rows, but neither invalidates an access token already issued — it keeps authenticating until it
expires (default 1 hour).

This is not a defect in PRism's code and no assertion was written claiming otherwise. It is recorded
because its absence from the test suite looks like an oversight: `sessionFlow.integration.test.ts`
carries a comment saying exactly why the obvious assertion is missing, and asserts the two things
that are true instead (locally discarded, cannot be renewed).

`[open question]` Whether to shorten the project's JWT expiry. It is the only lever that shortens the
window, and it trades against refresh frequency. Owner decision; no code change either way.

### F-3 `[fact]` `README.md`'s "Connecting Supabase" is three migrations out of date

It instructs the reader to apply `0001_init.sql` and stops. `0002`–`0005` are not mentioned, and
`0003`/`0004`/`0005` each add a function the app now calls unconditionally — so following the README
produces a project where every workout save, every check-in and account deletion fails outright.
Not fixed in this sprint (§7); the runbook in §4 is correct and is the one to follow.

---

## 6. Validation

`[fact]` Commands run in this working tree, with their actual results:

| Command | Result |
|---|---|
| `npx tsc --noEmit` | **Clean**, zero errors |
| `npm test -- --ci` | **401 passed, 25 suites** — unchanged from `main`, confirming the default lane is untouched |
| `npm run test:integration` (unconfigured) | **19 skipped, 2 suites, 0 failures** — the gate reports "not exercised" rather than passing |

**Not verified, and this is the whole point of §4:** every assertion in the new lane. No Supabase
project was created, no migration was applied anywhere, and the 19 tests have never run green. They
are written and they typecheck; whether they *pass* is unknown until someone performs §4. Treat any
claim that this sprint verified PRism against a real backend as false.

`[assumption]` The tests are correct as written. The most likely failure on first run is a mismatch
in an assumption about the real project's defaults — email confirmation, the exact refresh-token
reuse window, or an enum value — not a defect in the app. F-1 means the first run will also need §4
step 2 to have succeeded through `0005`.

---

## 7. Scope discipline — what was deliberately not done

- **No migration was written**, including the `0006` seed F-1 calls for. Migrations are behind
  `CLAUDE.md`'s approval gate.
- **No dependency was added.** The Supabase CLI (recommendation #5 of the review that opened this
  sprint) would replace the manual SQL-Editor step in §4, and is a separate decision.
- **No Supabase project was created or configured**, and no credential was created, read, or written.
- **`README.md` was not corrected** for F-3 — it is a separate, one-purpose change (I-14) and
  correcting it here would put two purposes on one branch.

---

## 8. The exact next decision

**Do you want a `0006_seed_library.sql` on this branch, or on its own?**

F-1 means the integration lane can prove the *write paths* work but cannot prove the app is usable,
because a real account has nothing to train with. The seed is the smallest change that closes that,
it is a migration, and migrations need your explicit approval. The alternatives are: (a) approve it
here, (b) approve it as its own branch after this one merges, or (c) decide the shared library should
not live in Postgres at all and stays a client constant — which is a larger product decision about
where PRism's catalogue lives, and would need its own ADR.

Separately, and not blocking: **§4 is yours to run.** Until it is run, this sprint has changed what
can be verified, not what has been.
