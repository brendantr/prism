# Sprint: library seed — testers log their own training

## Document status

- **Status:** Implementation complete and verified against local Postgres 16.14.
  **Not applied to any hosted project**, and the tester build is not yet usable — see §6.
- **Date opened:** 2026-08-07
- **Branch:** `feature/v1-library-seed`, cut from `feature/v1-staging-supabase-verification`
  (not from `main`) so it inherits the integration lane whose assertions it changes.
- **Labels:** `[fact]`, `[assumption]`, `[recommendation]`, `[open question]` — per `Docs/agents.md`.

---

## 1. The problem, as the owner stated it

`[fact, engineer/owner, 2026-08-07]` Testers can only traverse a pre-built profile carrying eight
weeks of fabricated training. The goal is for a tester to open PRism and start logging **their own**
sessions.

`[fact]` Two separate causes, and conflating them is how this stays broken:

1. **`eas.json` shipped testers a demo build.** The `preview` profile set
   `EXPO_PUBLIC_DEMO_MODE: "true"`, so every tester ran `DemoRepository` against
   `src/data/demoSeed.ts` — eight weeks of a fictional lifter under `DEMO_PROFILE_ID`. A tester
   *could* log, and their sets were merged into that fiction, computed against its history, and
   written to device-local `AsyncStorage`. None of it ever reached the owner. `resetDemoData()` does
   not help: it resets *back to* the eight weeks.
2. **The real backend could not be logged into at all.** A correctly migrated project had **zero
   exercises and zero routines**, and there is **no way to create an exercise anywhere in the app** —
   `Repository` has no create/update/delete for exercises, and `activeWorkoutStore.addExercise`
   only attaches one that already exists. So flipping (1) without fixing (2) would have given
   testers an app where they could start a session and add nothing to it.

---

## 2. The decision

`[decision, engineer/owner, 2026-08-07]` Seed the movement catalogue as **shared app content**;
keep the demo seed for `development` builds only.

The reasoning worth preserving is the distinction the decision rests on. **Fabricated training
history is user data that is not the user's** — it has no business in a tester's account, and none is
seeded. **The movement catalogue is app content**: names, equipment, and the muscle mapping that
volume, muscle distribution and readiness are computed from, in the same sense that `muscle_group`
is an enum rather than something each account invents. A lifter starting with zero workouts and a
catalogue to log against **is** starting with their own information.

The schema also forces the point: `workout_exercises.exercise_id` is `uuid not null references
exercises(id)`, so a logged set can only reference a row that exists in Postgres.

Rejected alternatives, recorded so they are not relitigated: **provisioning the catalogue per account
on first sign-in** (~43 duplicated rows per lifter, and a catalogue improvement never reaching
accounts already created), and **no catalogue at all** (the first thing a tester does is type in
"Barbell Bench Press" and choose its muscle groups, which also makes readiness quality a function of
what each tester guessed).

---

## 3. What changed

| File | What |
|---|---|
| `supabase/migrations/0006_seed_library.sql` | **New.** 43 system exercises and both template plans (2 routines, 7 days, 38 slots), idempotent, with a guard that raises rather than seeding a half-catalogue. |
| `supabase/tests/rls/06_run_library_seed_tests.sql` | **New.** 14 assertions, written from the position of a lifter who owns none of it. |
| `supabase/tests/rls/run.sh` | Applies `0006`, and applies it **a second time** before the new suite, so idempotency is exercised rather than asserted. |
| `src/data/__tests__/librarySeed.test.ts` | **New.** 47 tests pinning the migration to `EXERCISE_LIBRARY`/`ROUTINE_TEMPLATES`, in both directions. |
| `src/data/supabase/__tests__/repository.integration.test.ts` | The F-1 assertion inverted: a fresh account now has a catalogue and no history. |
| `eas.json` | `preview` flipped to `EXPO_PUBLIC_DEMO_MODE: "false"`. **This is the change that is not yet safe to build from** — see §6. |

`[fact]` **No training history of any kind is seeded** — no workouts, sets, check-ins, personal
records or measurements. Asserted twice, in SQL (`06`, assertion 6) and in TypeScript
(`librarySeed.test.ts`, "seeds no training history of any kind"), because it is the property the
owner actually asked for and it should fail loudly if a later sprint erodes it.

### 3.1 Two implementation choices worth stating

**Ids are not pinned.** Rows take `gen_random_uuid()`, so two projects hold different ids for the
same movement. Nothing depends on them agreeing: no id is referenced from application code, and the
app reads the catalogue from `listExercises()` at runtime. Pinning 43 literal uuids would buy
nothing and make the file unreadable.

**Idempotency is asserted as "no duplicates", not as a row count.** `01_seed_test_data.sql` creates
a system exercise of its own, so a total pinned to 43 fails for a reason unrelated to the seed
running twice. The duplicate check is the property itself and survives the fixture. *(This was
caught by the first run of the suite, which reported 13/14 — the assertion was wrong, not the
migration.)*

---

## 4. Validation

`[fact]` Commands run, with actual results:

| Command | Result |
|---|---|
| `supabase/tests/rls/run.sh` against a clean local Postgres **16.14** | **146/146 assertions passed** — 57 RLS + 31 write-integrity + 23 check-in + 21 deletion + **14 library seed**. Reproduced twice from a freshly created database. |
| `npx jest src/data/__tests__/librarySeed.test.ts` | **47 passed** |
| `npm test -- --ci` | see §7 |
| `npx tsc --noEmit` | see §7 |

The existing 132 assertions are unchanged and still pass with `0006` applied, which is the specific
thing worth checking: seeding a shared catalogue must not weaken the isolation the other four suites
verify.

`[fact]` **Not verified:** the migration has been applied to a disposable local database only. It has
never run against a hosted Supabase project, because none exists yet
(`Docs/sprints/2026-08-07-staging-supabase-verification.md` §4 is the runbook and is owner-only).

---

## 5. What was deliberately left out

- **A create-exercise flow.** Still absent, and still needed: a lifter with an unusual machine
  cannot log it. The schema and RLS already allow user-owned movements
  (`exercises: insert own`), so this is app code only — repository methods plus a create path in
  `app/workout/picker.tsx`. Its own branch, its own sprint.
- **`README.md`'s "Connecting Supabase"**, which still stops at `0001` and now omits five
  migrations. One-purpose change (I-14).
- **`trainingStore`'s default `favouriteExerciseIds`**, which names four `ex_*` slugs from the client
  library. Those match nothing in Postgres, so a real account simply starts with no favourites.
  Cosmetic, harmless, recorded rather than fixed. `[open question]` whether favourites should be
  seeded by name, or the defaults dropped entirely.

---

## 6. The tester build is not yet safe to cut

`[fact]` `eas.json`'s `preview` profile now says `EXPO_PUBLIC_DEMO_MODE: "false"`, which is the
decision — but a preview build made **today** would show
`SUPABASE_MISCONFIGURED_MESSAGE`, not the app. Three things outside this repository stand between
here and a tester logging a real set, and all three are owner-only:

1. A staging (or preview) Supabase project exists, with `0001`–**`0006`** applied in order.
2. The EAS `preview` environment has `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`
   (`Docs/production-posture-v1.md` §4 currently documents only `production`).
3. Email confirmation is settled for that project — testers either confirm by email, or it is
   disabled for the preview project.

That failure is loud by design (`feature/v1-production-posture`): a build claiming to be live must
not quietly write to device-only storage. But it does mean **do not cut a preview build until (1) and
(2) are done**, or revert this one line in the meantime.

---

## 7. Handoff

Changed files are §3. Validation is §4. The unresolved risks are §5 and §6.

**The exact next decision:** *do you want the create-exercise flow before or after the first real
tester build?* Before means testers can log anything, including movements the catalogue lacks, but
delays the build by a sprint. After means testers start on the 43 seeded movements and report what is
missing — which is arguably better feedback, and is the `[recommendation]` here, since a catalogue
gap found by a real lifter is worth more than one guessed at now.
