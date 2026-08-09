# Runbook: putting PRism in front of real testers

## Document status

- **Status:** Repository-side work is complete. **Every step below is owner-only and none has been
  performed.**
- **Date opened:** 2026-08-09
- **Baseline:** `main` at `4277083`, which includes the first-run routing fix (#58) and the
  documentation/drift-guard correction (#59).
- **Labels:** `[fact]` (with evidence), `[assumption]`, `[recommendation]`, `[open question]` — per
  `Docs/agents.md` and `Docs/invariants.md` I-15.

`[fact]` Every step here needs a dashboard, a credential, or a build service. Per `CLAUDE.md`
(cloud-resource changes) and `Docs/invariants.md` I-4, an agent does not hold or use those. Nothing in
this document has been executed against a hosted project — the SQL was verified against a disposable
local Postgres 16.14 only, as stated per step.

---

## 1. Where things stand

`[fact]` The repository can now support a real tester. Three things had to be true, and are:

| | Evidence |
|---|---|
| A real account has something to log against | `0006_seed_library.sql` — 43 system movements, 2 template plans, 7 days, 38 slots |
| A real account can be deleted (I-10) | `0007_deletable_account_with_custom_exercises.sql` — the cascade-ordering defect is fixed |
| A real user can get in at all | #58 — before it, a real-backend build could neither sign up nor sign in |

`[fact]` What is **not** true is anything about the hosted project or the build environment. The
migrations have been applied to disposable local databases only, and the EAS `preview` environment has
no Supabase variables. Those two gaps are the whole of this runbook.

---

## 2. Step 0 — find out what your project already has

`[fact]` PRism has no migration-tracking table. Migrations are applied by hand in the SQL Editor, so
"which ones has this project had?" is answered by looking for what each one creates. Run this in the
SQL Editor of the project you intend to point testers at:

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

`[assumption]` Based on `Docs/sprints/2026-08-08-first-run-routing-fix.md`, which records an account
being created, onboarded and deleted on the live staging project, that project is at least at `0005`.
The probe replaces that assumption with an answer.

---

## 3. Step 1 — apply the missing migrations

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

`[fact]` This is the acceptance test, and it already exists. It drives PRism's own data layer — not a
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

## 6. Step 4 — cut the build and walk the loop yourself first

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
| **No custom movements** | `Repository` has no exercise write methods at all. A tester is capped at the 43 seeded movements — if their program uses something else, they cannot log it. This is the binding product gap. |
| **No body measurements** | `listMeasurements()` has no writer anywhere in the interface, so bodyweight and measurements can never be recorded against a real account. |
| **No observability (G-4)** | No crash reporting and no analytics. Tester feedback will arrive with nothing behind it — a report of "it crashed" is unactionable. `[recommendation]` Decide this before the cohort grows past people you can talk to directly. |
| **Check-in day is bucketed in UTC** | Uncommitted work on `feature/v1-local-training-day` addresses it. Testers west or east of UTC can see two adjacent local dates collapse, or one local date split. |
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
