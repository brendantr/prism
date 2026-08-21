# Runbook: putting Repello in front of real testers

## Document status

- **Status:** Repository-side work is complete. **§3 is done — the owner has applied `0001`–`0007` to
  staging, and §4's integration lane is green against it — 19/19.** §5 (EAS `preview` variables) is
  the only remaining blocker.
- **Date opened:** 2026-08-09
- **Corrected:** 2026-08-09, same day. The first version of this document asserted that *none* of it
  had been performed. That was wrong when written — see the correction note below.
- **Baseline:** `main` at `08d373b`.
- **Labels:** `[fact]` (with evidence), `[assumption]`, `[recommendation]`, `[open question]` — per
  `Docs/agents.md` and `Docs/invariants.md` I-15.

`[fact]` Every step here needs a dashboard, a credential, or a build service. Per `CLAUDE.md`
(cloud-resource changes) and `Docs/invariants.md` I-4, an agent does not hold or use those — so the
status of each step is **reported by the owner**, and this document says which are confirmed and which
are not.

### Correction, 2026-08-09

`[fact]` The first version of this runbook stated that nothing in it had been executed against a hosted
project. **The owner had already created the staging project and applied `0001`–`0007` to it**
`[fact, owner, 2026-08-09]`, so §3 was describing work that was already done.

The claim came from `Docs/architecture.md`, which recorded "not applied to any hosted project" — true
when written, and stale by the time it was read. Worth naming the failure mode, because it is the same
one this repository keeps hitting: **an agent cannot see a dashboard, so every statement here about the
hosted project is the owner's report or it is nothing.** A document that infers cloud state from the
repository will be wrong the moment someone acts outside it, and it will be wrong confidently.

`[recommendation]` Treat §2's probe as the arbiter. It reads the project directly, so it settles the
question in a way no document can.

---

## 1. Where things stand

`[fact]` The repository can now support a real tester. Three things had to be true, and are:

| | Evidence |
|---|---|
| A real account has something to log against | `0006_seed_library.sql` — 43 system movements, 2 template plans, 7 days, 38 slots |
| A real account can be deleted (I-10) | `0007_deletable_account_with_custom_exercises.sql` — the cascade-ordering defect is fixed |
| A real user can get in at all | #58 — before it, a real-backend build could neither sign up nor sign in |

`[fact, owner, 2026-08-09]` A staging project exists and carries **`0001`–`0007`**. So the schema half
of tester readiness is done, on the repository side *and* on the project.

What remains is the build environment: `[fact]` the EAS `preview` environment still has no Supabase
variables, and `eas.json` sets `EXPO_PUBLIC_DEMO_MODE: "false"` there — so a preview build cut today
shows the misconfiguration message rather than the app. That is §5, and it is the one blocker left
between here and a tester holding the app.

`[fact, owner, 2026-08-09]` The integration lane (§4) has been run against staging and **passes,
19/19**, and both repository secrets are set. So the claim "the app works against the real project" is
no longer an inference from the repository — it is an observation, and §4 records what it covers.

---

## 2. Step 0 — confirm what the project actually has

`[fact]` Repello has no migration-tracking table. Migrations are applied by hand in the SQL Editor, so
"which ones does this project have?" is answered by looking for what each one creates. This query is
the only authority on that question — the repository cannot see a dashboard, and this document is a
report, not an observation. Run it in the SQL Editor of the project you intend to point testers at:

```sql
with fn as (
  select p.proname, pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
)
select
  to_regclass('public.profiles') is not null
    as "0001 schema + RLS",
  exists (select 1 from fn where proname = 'assert_exercise_visible')
    as "0002 hardening",
  exists (select 1 from fn where proname = 'save_workout_graph')
    as "0003 atomic writes",
  exists (select 1 from fn where proname = 'save_check_in' and args = 'p_patch jsonb')
    as "0004 partial check-ins",
  exists (select 1 from fn where proname = 'delete_my_account')
    as "0005 deletion",
  (select count(*) from public.exercises where profile_id is null) >= 43
    as "0006 catalogue",
  exists (select 1 from pg_constraint
           where conname = 'workout_exercises_exercise_id_fkey'
             and condeferrable and confdeltype = 'a')
    as "0007 deletable w/ custom";
```

Every column should read `true` before a tester touches the project. `[fact]` This query was checked
in both directions against a local Postgres 16.14: on a database migrated to `0005` it returns the
first five `true` and the last two `false`; after applying `0006` and `0007` all seven read `true`. It
is a read-only query and changes nothing.

`[fact, owner, 2026-08-09]` On the staging project all seven are expected to read `true`, because
`0001`–`0007` have been applied. Run it anyway, once: it costs nothing, and it is the difference
between believing the project is migrated and knowing it.

---

## 3. Step 1 — apply any migration the probe reported `false` — **done on staging**

`[fact, owner, 2026-08-09]` **Already performed for the staging project: `0001`–`0007` are applied.**
This section stays because it is still the procedure for the next project — production, or a second
staging project if §4's email-confirmation tension is resolved by splitting them.

For each file the probe reported `false`, in **numeric order**, paste the whole file into the SQL
Editor and run it. Stop at the first error rather than continuing.

`[fact]` Both new files are safe to re-run. `0006` conflicts on the
`exercises_system_name_key` partial unique index and guards its routines with an existence check;
`0007` only acts when the constraint is still `restrict`. Verified locally by applying each one twice
and confirming the system-exercise count stays at 43 and no duplicate routine appears.

`[fact]` `0006` **raises rather than seeding a half catalogue.** Each template slot is a `select` from
`exercises`, and a `select` matching nothing inserts nothing without erroring — so the file ends by
asserting 43 movements and 38 slots and aborting the whole transaction if either is short. If it
raises, nothing was written; read the message before re-running.

`[recommendation]` Do not skip `0007` because the app has no way to create a custom exercise yet. It
costs one statement now; discovering it later means a tester who cannot delete their account, which is
the store-submission blocker I-10 names.

---

## 4. Step 2 — prove it with the integration lane, before any tester sees it

`[fact, owner, 2026-08-09]` **Done, and green: 19/19 across 2 suites against the staging project.**
The two repository secrets are set as well, so the nightly workflow now has something to run.

This is the first time Repello's data layer has been verified end-to-end against a hosted project, and
it is the strongest evidence in the repository — unlike every other status line here, it was produced
by the app's own code talking to the real thing. What it establishes:

- `handle_new_user` creates a profile on the real `auth.users`; sign-up returns a usable session.
- `save_workout_graph` commits the whole graph through PostgREST, stamps ownership from the session
  over a forged payload, treats an exact retry as a no-op, and reconciles removed children — I-2 and
  G-2 confirmed against a real project, not an emulator.
- `save_check_in`'s omit / value / explicit-null semantics survive the real jsonb round trip,
  including the merge under a new id that `0004` exists for.
- RLS holds between two real accounts: no cross-account read by id or by list, and a write forging
  another account as owner is rejected.
- `0006` landed — the catalogue assertion requires at least 43 system movements and both templates.
- **`0007` landed** — the deletion test creates a custom movement, logs a session with it, then
  deletes the account. That is exactly the cascade-ordering case `0007` fixes, and it passes.

`[fact]` This is the acceptance test, and it already exists. It drives Repello's own data layer — not a
client the test built for itself — against the real project: sign-up on the real `auth.users`, the
whole workout graph through PostgREST, RLS between two real accounts, `save_check_in`'s omit/value/null
semantics, export completeness, and account deletion.

```bash
PRISM_INTEGRATION_SUPABASE_URL='https://YOUR-PROJECT.supabase.co' PRISM_INTEGRATION_SUPABASE_ANON_KEY='YOUR-ANON-KEY' npm run test:integration
```

Two prerequisites, both on the project:

1. **Email confirmation disabled** (Authentication → Sign In / Providers → Confirm email). The suite
   creates disposable accounts and needs `signUp` to return a session. It fails with this exact
   instruction if not. `[open question]` A tester cohort may well want confirmation *on*; the lane
   needs it *off*. If you want both, that is an argument for a separate project for the lane rather
   than for turning it on and off around test runs.
2. **The `anon` key only.** A service-role key must never enter this environment (I-4), and nothing
   here needs one — each account the suite creates, it deletes with that account's own session.

`[fact]` The lane deletes accounts. Point it at staging, never at a project holding real training data.

Once it passes locally, add the same two values as repository secrets
(`PRISM_INTEGRATION_SUPABASE_URL`, `PRISM_INTEGRATION_SUPABASE_ANON_KEY`) so the nightly
`Integration (staging Supabase)` workflow starts reporting. Without them the job emits a warning and
exercises nothing, by design — it will never report a pass it did not earn.

---

## 5. Step 3 — give the EAS `preview` environment its variables

`[fact]` `eas.json`'s `preview` profile sets `EXPO_PUBLIC_DEMO_MODE: "false"` and nothing else. The
two Supabase variables are not in the file — deliberately, because they differ per environment and
`eas.json` is committed. Until they exist in the EAS `preview` environment, **a preview build shows
the misconfiguration message instead of the app**: `getRepository()` no longer silently falls back to
device-only storage when demo mode is off and credentials are missing, because that fallback is the
invisible data loss I-2/I-15 exist to prevent.

```bash
eas env:create --environment preview --name EXPO_PUBLIC_SUPABASE_URL --value 'https://YOUR-PROJECT.supabase.co'
eas env:create --environment preview --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value 'YOUR-ANON-KEY'
eas env:list --environment preview
```

`[fact]` Both are `EXPO_PUBLIC_*`, so both are inlined into the client bundle and are public by
design. That is safe for the `anon` key and only for the `anon` key — row-level security is what
enforces access. A service-role key in this environment would be readable by anyone with the build
(I-4, I-5).

---

## 6. Step 4 — cut the build and walk the loop yourself first — **done**

`[fact, owner, 2026-08-09]` **Performed, and the whole walkthrough passed** — on a cold-started iOS
simulator, on a fresh install, against the staging project. Every step below, including account
deletion through the app.

That is the last gap this runbook existed to close. Until it, everything verified against staging was
the **data layer only**: the integration lane drives `SupabaseRepository` directly and touches no
screen, no navigation and no build. A first-run path can therefore be completely broken while 463 unit
tests and 19 integration tests are green — which is not hypothetical, it is exactly what #58 was.

`[fact, owner, 2026-08-09]` A **preview build** was also produced end to end (Android, ~22 minutes,
commit `048114b`), with all three environment variables confirmed resolving into it. `Docs/release-checklist.md`
§4's G-7 is closed for `preview` on that evidence; `production` and store submission remain
unexercised.

Repeat this walkthrough after any change to routing, onboarding, session storage or the repository
interface. It is cheap, and it is the only check in this repository that sees what a lifter sees:

`[recommendation]` Before distributing, do the whole first-run path on a device, on a **fresh install**
— the defect #58 fixed was invisible to every unit test and only appeared on a cold start against a
real project:

1. Install, open, complete onboarding, create an account.
2. Start a session, add a movement from the picker, log a set, finish it.
3. Force-quit, reopen, confirm the session is still there.
4. Submit a check-in.
5. Export the account data, then delete the account, from Settings.

`[fact]` Step 2 is the one that proves the catalogue landed: before `0006` the picker was empty and
there was nothing to add. Step 5 is the one that proves `0007` landed, and it only exercises the bug
if the account owns a custom movement — which, today, is not reachable from the UI (see §7).

---

## 7. What a tester still cannot do

`[fact]` Known and open. None blocks a first cohort, but each will be reported as a bug if unstated:

| Limit | Detail |
|---|---|
| **No custom movements** | **Closed.** `feature/v1-user-data-writes` added `createExercise`/`updateExercise`/`deleteExercise` to `Repository`, reachable from the Exercises tab and the mid-session picker — the 43-movement ceiling no longer applies. See `Docs/release-checklist.md` §4 (refreshed 2026-08-09). |
| **No body measurements** | **Closed.** The same `feature/v1-user-data-writes` sprint added a body-measurement writer. See `Docs/release-checklist.md` §4 (refreshed 2026-08-09). |
| **Observability not release-proven (G-4)** | `feature/v1-observability` adds privacy-filtered crash reporting, but no owner-configured release test has proved delivery or source-map symbolication. Product analytics remains deliberately absent. `[recommendation]` Complete the test-event checklist before the cohort grows past people you can talk to directly. |
| **Check-in day is bucketed in UTC** | **Closed.** `0008_local_training_day.sql` landed and is covered by 20 SQL assertions. See `Docs/release-checklist.md` §4 (refreshed 2026-08-09). |
| **No favourites on a real account** | `trainingStore`'s default `favouriteExerciseIds` are bundle slugs (`ex_*`) that match no seeded UUID. Cosmetic. |
| **Active routine is arbitrary** | `getActiveRoutine()` returns the first non-template routine or else the first by name, so every new account silently starts on "Prism 3". Nobody chose that. |

---

## 8. Stop conditions

Stop and reconsider rather than working around it if:

- The probe in §2 returns `false` for `0001`–`0005` on a project you believed was migrated. That means
  the project is not what the sprint records describe, and applying `0006`/`0007` on top would be
  guessing.
- `0006` raises. It is telling you the catalogue would have been seeded incomplete. Nothing was
  written; read the message.
- The integration lane fails **after** the probe reads all-`true`. That is a real defect in the app
  against a real project, which is exactly what the lane exists to find, and it should be fixed before
  a tester meets it.
- You are tempted to point any of this at a project holding real training data. The lane deletes
  accounts.
