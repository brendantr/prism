# PRism Architecture

## Document Status

- **Status:** Draft for review
- **Date:** 2026-07-25
- **Repository commit reviewed:** `2490c8de94b6492c2c20a3a91299313c30042320` (branch `main`, working tree clean, no staged/unstaged changes at time of review — verified via `git status`).
- **Current baseline (2026-07-29):** `main` is at `c59cbdb12d8ba2374d4d22ad6a9f8e0b91481fcb`. Everything merged between the reviewed commit and that baseline was documentation-only (product-intent-and-guardrails, architecture-baseline-audit, readiness-inputs-and-confidence-foundation planning); no code, schema, or test changed, so this document's findings held up to that point. **The `readiness-inputs-and-confidence-foundation` implementation sprint then changed code**: the check-in path, `src/domain/types.ts`, and `src/domain/calc/readiness.ts` no longer match this document's description of them. Findings touching those files are superseded by that sprint and by `Docs/invariants.md` I-7 and I-18; the rest of this document was not re-verified from 2026-07-29 to 2026-08-01.
- **S4 entitlement delta (2026-08-09, `feature/v1-entitlements`, not yet integrated):**
  `react-native-purchases@10.7.0` provides purchase/restore transport for the exact lifetime product
  `app.prism.trainer.pro.lifetime`. `src/store/entitlementStore.ts` is a fail-closed phase machine;
  only `Repository.getEntitlement()` reading an authenticated Postgres row may unlock paid UI. The
  paywall gates 28/84-day Insights, Progress and Body while seven-day Insights, logging, history,
  exercises, measurements and account controls remain free. Migration `0009_entitlements.sql` adds
  owner-select-only entitlement rows, invisible event-target rows and a service-role-only atomic,
  idempotent event RPC. `supabase/functions/revenuecat-webhook` authenticates RevenueCat delivery and
  maps the supported exact-product events. The authenticated `delete-account` function erases the
  gateway-verified UUID from RevenueCat before invoking the existing no-argument database deletion,
  preventing account deletion from leaving processor data behind. Local evidence: typecheck clean,
  **532/532 Jest tests across 36 suites**, all **191 SQL assertions** (including 17 new entitlement
  assertions), and iOS/Android Expo exports passed. **No hosted migration/function, RevenueCat project, App Store,
  Play Console, EAS variable, native project or purchase was changed or exercised.** Those operational
  steps are release blockers, not implemented facts; see `Docs/revenuecat-release-runbook.md`.
- **Delta since the 2026-08-01 refresh (recorded 2026-08-03, not a full re-verification):** two
  feature sprints have landed on top of that baseline. `workout-session-continuity-v1`
  (2026-08-02) added the `workout/templates` route and local active-workout draft recovery;
  `workout-history-v1` (2026-08-03) added the `history`/`history/[id]` routes, the pure
  `src/domain/history.ts` derivation layer, and entry points from Today and Insights. Neither
  touched `src/data/repository.ts`, the stores' data contracts, or `supabase/migrations/`, so this
  document's Data Architecture, Security and Known Gaps sections are unchanged by them — G-1 (no
  auth path) and G-2 (non-atomic `saveWorkout`) both remain open. The route map below and the test
  counts are updated inline; nothing else in this document was re-verified on 2026-08-03. Current
  suite: **153 tests, 12 suites** (`npm test -- --ci`), typecheck clean. A third sprint,
  `today-insights-cohesion` (2026-08-03), then changed presentation only on those two screens —
  no data-layer, schema or store change — and added `src/content/deeperSurfaces.ts` as the single
  source of truth for the Progress/Body/History navigation row both screens render. Suite after it:
  **163 tests, 13 suites**, typecheck clean. A fourth, `logger-ux-polish` (2026-08-04), then
  polished the workout logger — confirmations in front of the two destructive removals, one shared
  set-type vocabulary in `src/content/setTypes.ts`, and the header metric relabelled "Sets done" so
  it stops colliding with the summary's warm-up-excluding "Working sets". Again presentation only:
  no data-layer, schema or store-contract change. Suite after it: **177 tests, 14 suites**,
  typecheck clean.
- **Baseline refresh (2026-08-01):** Re-verified against `main` after the `rls-policy-verification` → `rls-migration-fix` → `dependency-hygiene` → `cleanup-batch` sprint sequence (a pre-feature-readiness closure pass — see `Docs/readiness/2026-07-31-closure-inventory.md`). Commands re-run this session: `npm run typecheck` (clean), `npm test -- --ci` (**103/103 passed, 9 suites** — up from the 40/40, 1-suite baseline below), `npx expo-doctor` (**20/20**), `npm audit` (**11 moderate**, down from an unrecorded-here 36; the 1 high finding is fixed, the 11 moderate are confirmed unfixable short of a major, breaking Expo downgrade — see `Docs/sprints/2026-08-01-dependency-hygiene.md`). Material changes since 2026-07-29, superseding specific claims below where noted inline: (1) both security sprints landed (Keychain session storage, CSPRNG ids, server-derived write ownership, migration `0002_security_hardening.sql`); (2) the RLS migration defect is **fixed** — `supabase/migrations/0001_init.sql` now applies cleanly and 57/57 cross-tenant isolation assertions pass against the actual committed file (`Docs/sprints/2026-08-01-rls-migration-fix.md`), closing `Docs/invariants.md` I-1; (3) the UI was restructured to a five-tab bar (Today/Exercises/Insights/Social/Plans) with an onboarding flow, and all seven data-driven screens now share a loading/error/empty-state primitive (`ScreenState`); (4) a brand icon/splash asset pipeline (`assets/brand/`, `scripts/generate-app-icons.sh`) was added, including an Android Themed-Icons monochrome layer; (5) `react-hook-form`/`zod`/`@hookform/resolvers` were removed (previously unused); (6) the unreachable `CheckIn.note` field and the dead `Stepper.tsx` component were removed. This document's Known Gaps table is updated inline below rather than restating findings that no longer hold.
- **Delta since 2026-08-06 (`feature/v1-auth-and-session`, commit `0af00cd`):** **G-1 is closed in the
  client.** An authentication path now exists end to end — session state (`src/store/sessionStore.ts`),
  a combined onboarding+session route gate driven by a pure function (`src/domain/routing.ts`), a real
  sign-in/sign-up surface (`app/auth/index.tsx`), and an ordered sign-out teardown
  (`src/store/authActions.ts`). This is the first sprint since the baseline to change the **startup
  sequence itself**, so Runtime Architecture §1, §3, §4 and §7 are rewritten rather than annotated, as
  is the Security section's authentication-status paragraph. `SupabaseRepository.uid()` now reads
  `auth.getSession()` instead of `auth.getUser()` and throws a typed `AuthRequiredError`. Evidence:
  **287 tests, 20 suites** (`npx jest`), `npx tsc --noEmit` clean. `npm run test:integration` remains
  **1 suite / 5 tests skipped** — it is gated on `PRISM_INTEGRATION_SUPABASE_*` and no credentials were
  created, so **nothing in this sprint was exercised against a live Supabase project**. No schema, no
  migration, and no Supabase project setting changed: `supabase/migrations/` is untouched and the
  57-assertion RLS suite is unchanged. **I-2 and I-10 remain open**, and this sprint neither advanced
  nor was blocked by either. Full record: `Docs/sprints/2026-08-06-auth-and-session.md` and
  `Docs/decisions/ADR-0004-authentication-and-session.md`.
- **Delta since 2026-08-08 (`feature/v1-signout-surface`, commit `0029a7f`, based on `d8c206d`):** the
  sign-out teardown that shipped unreachable on 2026-08-06 now has a surface. Today's header carries an
  Account control (`Screen`'s previously-unused `headerRight` slot), gated by the pure
  `canOfferSignOut`; it opens `app/account.tsx`, a modal with identity, one explanatory sentence, and a
  "Sign out" row. `SessionUser` gained `email` and it was propagated through `getCurrentUser`,
  `signInWithPassword`, `signUpWithPassword` and `subscribeToAuthState` so identity does not depend on
  how the session was obtained. `src/store/authActions.ts` was **not** modified — this sprint made the
  teardown reachable, not different. Evidence: **312 tests, 22 suites**, `npx tsc --noEmit` clean,
  integration lane still 5 skipped. No schema, migration, or Supabase project setting changed. **I-2 and
  I-10 remain open**, and no password reset or deep-link capture was implemented. Full record:
  `Docs/sprints/2026-08-08-signout-surface.md`.
- **Delta since 2026-08-09 (`feature/v1-password-reset`, commit `954d075`, based on `eb2873f`):**
  password reset exists, closing the supportability gap the sign-out sprint left named in
  `Docs/production-posture-v1.md` §7. It is **code-based**: `resetPasswordForEmail` with no
  `redirectTo`, then `verifyOtp({ type: 'recovery' })` → `updateUser({ password })` → `signOut()`. The
  emailed link is not used, because using it would require the deep-link capture this repository does
  not have. New: `src/domain/authReset.ts` (stage machine and field rules, pure);
  `requestPasswordReset`/`confirmPasswordReset`; `AuthFailure` gains `resetSent` and `invalidCode`, and
  `toAuthFailure` gains an optional context so a rejected password and a rejected code — both 4xx — get
  different sentences. Reset is a **mode inside `app/auth/index.tsx`**, not a route: the route map is
  unchanged. Evidence: **367 tests, 24 suites**, `npx tsc --noEmit` clean, integration lane still 5
  skipped. No schema, migration, or Supabase project setting changed. **I-2 and I-10 remain open**;
  reset changes a credential and deletes nothing. Full record:
  `Docs/sprints/2026-08-09-password-reset.md`.
- **Delta since 2026-08-06 (`feature/v1-workout-write-integrity`, based on `7d89bf1` with `main` merged in):**
  **G-2 is closed**, and this entry also corrects four claims elsewhere in this document that had gone
  stale without anyone noticing — which is the more important half of the sprint, because this document
  is what `CLAUDE.md` tells every agent to trust over the code.
  - *The gap itself.* `supabase/migrations/0003_workout_write_integrity.sql` adds
    `save_workout_graph(jsonb, jsonb)`, a **`security invoker`** plpgsql function that writes the
    workout, its exercise blocks, its sets, and the personal records the session set — in one
    transaction. It is authoritative over the payload, so children the payload omits are deleted
    (the write was previously additive only, and a removed exercise came back on the next read).
    `personal_records` gains a `(profile_id, workout_id, exercise_id, kind)` unique index, making
    record persistence idempotent under retry. The positional unique constraints on
    `workout_exercises` and `sets` become `deferrable initially deferred` so a re-index inside one
    statement cannot transiently collide. `SupabaseRepository.saveWorkout` and the new
    `completeWorkout` both go through it.
  - *Verified against a live database, not asserted.* `supabase/tests/rls/03_run_write_integrity_tests.sql`
    (31 assertions) runs the mid-sequence-failure case I-2 names, plus reconciliation, retry
    idempotency, reordering, cross-tenant rejection and the unauthenticated case. Against a
    disposable local Postgres 16.14: **57/57 RLS + 31/31 write-integrity, from a clean database.**
    The suite caught a real defect in the migration during development — a cross-tenant write
    succeeded silently instead of erroring — which is now an explicit `42501`.
  - *Corrections made inline below, each marked `Corrected 2026-08-06`:* the `src/store`
    responsibility entry and the **Active workout** glossary entry both claimed an in-progress
    session "is not persisted until `finish()`" (untrue since session-continuity); the **Tests**
    entry claimed tests existed "only for `src/domain/calc`" (untrue for several sprints); the
    component-layer entry stated an absolute no-stores rule that two components already break.
  - *Also in this sprint:* draft writes are queued and revision-checked
    (`src/store/activeWorkoutStore.ts`), closing a data-loss race where an older `AsyncStorage`
    write could land after a newer one — or after a `discard()`, resurrecting a thrown-away session.
    `Docs/release-checklist.md` §3 is corrected; it stated the **opposite** of the current
    demo-mode default and would have led a release operator to expect a demo build.
  - Evidence: **375 tests, 24 suites** (`npx jest --ci`), `npx tsc --noEmit` clean. Integration lane
    unchanged (still gated, still skipped) — **nothing here was exercised against a live Supabase
    project**, only against local Postgres. **I-10 remains open.** Full record:
    `Docs/sprints/2026-08-06-v1-workout-write-integrity.md`.
- **Delta since 2026-08-07 (`feature/v1-staging-supabase-verification`, based on `main` at `a72a2e5`):**
  the integration lane is real code rather than four `it.todo`s, and **nothing in this document's
  "verified" claims about the database changes as a result** — because the lane has not been run.
  What exists now: a harness that boots PRism's own module graph against a staging project
  (`src/data/supabase/__tests__/support/`), 19 tests across auth lifecycle, repository/RPC behaviour,
  RLS between two real accounts, and account deletion, and a separate nightly/dispatch workflow
  (`.github/workflows/integration.yml`) that warns rather than passes when no project is configured.
  Evidence: `npx tsc --noEmit` clean; `npm test -- --ci` **401/25, unchanged**, confirming the
  hermetic lane is untouched; `npm run test:integration` **19 skipped, 0 failures**. **No Supabase
  project was created and no migration was applied anywhere** — creating one is owner-only
  (`Docs/invariants.md` I-4), and the runbook is §4 of the sprint record.
  Two findings that did not need a project to establish, both recorded there in full: **F-1** — no
  migration seeds `exercises` or `routines`, and `EXERCISE_LIBRARY`/`ROUTINE_TEMPLATES` are consumed
  only by `DemoRepository`, so a correctly migrated production project gives a real lifter an empty
  exercise picker and no plans (a v1 blocker, invisible to every existing suite, now pinned by a test);
  **F-2** — an access token survives both sign-out and account deletion, because it is a stateless JWT,
  so the security property is "discarded and unrenewable", not "revoked". Full record:
  `Docs/sprints/2026-08-07-staging-supabase-verification.md`.
- **Delta since 2026-08-07 (`feature/v1-library-seed`, cut from the integration branch above):**
  **F-1 is closed.** `supabase/migrations/0006_seed_library.sql` seeds the 43-movement catalogue and
  both template plans (2 routines, 7 days, 38 slots) as system rows (`profile_id = null`), so a real
  account finally has something to log against. It seeds **no training history of any kind** — that
  property is asserted in both SQL and TypeScript, because it is the product decision itself
  `[decision, engineer/owner, 2026-08-07]`: fabricated history is user data that is not the user's,
  the catalogue is app content. Ids are not pinned (nothing in application code references one) and
  idempotency is asserted as "no duplicate rows" rather than as a total, which survives
  `01_seed_test_data.sql`'s own system fixture. Evidence: `supabase/tests/rls/run.sh` against a clean
  local Postgres **16.14** — **146/146 assertions** (57 + 31 + 23 + 21 + **14 new**), reproduced twice
  from a freshly created database, with `0006` deliberately applied twice by the runner; plus 47
  drift-guard tests (`src/data/__tests__/librarySeed.test.ts`) pinning the migration to
  `EXERCISE_LIBRARY`/`ROUTINE_TEMPLATES` in both directions. `eas.json`'s `preview` profile is flipped
  to `EXPO_PUBLIC_DEMO_MODE: "false"`. **Two things this does not mean:** `0006` has run against a
  disposable local database only and no hosted project has it *(superseded 2026-08-09 — applied to
  staging, see the delta below)*; and a preview build cut today shows
  `SUPABASE_MISCONFIGURED_MESSAGE` rather than the app, because the EAS `preview` environment still
  has no Supabase variables. A second, separate gap remains open and is now the binding one for
  testers — **there is still no way to create an exercise anywhere in the app** (`Repository` has no
  exercise write methods; `activeWorkoutStore.addExercise` only attaches an existing one), so a lifter
  is limited to the seeded 43. Full record: `Docs/sprints/2026-08-07-library-seed.md`.
- **Delta since 2026-08-08 (`feature/v1-library-seed`, same branch, later commit `c116c7e`):**
  `supabase/migrations/0007_deletable_account_with_custom_exercises.sql` fixes an **I-10 blocker the
  SQL suite could not see**: a lifter who created their own movement and logged a session with it
  could not delete their account. Deleting `auth.users` cascades to `profiles` and from there to both
  `exercises` and `workouts`; Postgres does not define which branch runs first, and `on delete
  restrict` is checked immediately, so when the exercise branch went first the whole delete aborted on
  `workout_exercises_exercise_id_fkey`. `0007` changes both exercise FKs
  (`workout_exercises`, `routine_exercises`) from `on delete restrict` to `on delete no action
  deferrable initially deferred` — the same rule, checked at commit instead of at statement time.
  **Not `cascade`** `[decision, 2026-08-08]`: cascade would silently delete the logged sets performed
  with a movement, and the `restrict` is what protects training history. `restrict` cannot be
  deferred; `no action` is the deferrable form of the same constraint.
  Found by the integration lane against a real project, not by the SQL suite —
  `05_run_account_deletion_tests.sql` builds its fixture user with a workout that has **no exercise
  blocks at all**, so the two cascade branches never collided: 21 assertions, all green, none of them
  this. Evidence: `supabase/tests/rls/run.sh` against a clean local Postgres **16.14** —
  **154/154 assertions** (57 + 31 + 23 + 21 + 14 + **8 new**), reproduced twice, superseding the
  146/146 recorded in the delta above. `07_run_exercise_reference_tests.sql` asserts the behaviour
  *and* the constraint's catalogue shape, because a later migration tidying these to `cascade` would
  pass every behavioural assertion while destroying logged sets. **Not applied to any hosted
  project**, including staging *(superseded 2026-08-09 — applied to staging, see the delta below)* —
  until it is, the integration lane's deletion test stays red and a test account holding a custom
  movement cannot be deleted. Full record:
  `Docs/sprints/2026-08-08-account-deletion-fk-fix.md`.
- **Delta since 2026-08-08 (documentation and drift-guard correction, no schema or product change):**
  The two deltas above landed with their operator-facing documentation out of step, which for a
  manually applied migration is a defect rather than untidiness. Corrected: `README.md`'s "Connecting
  Supabase" named only `0001_init.sql` and then instructed the operator to hand-seed the exercise
  library — the step `0006` replaced, and one that now collides with the `exercises_system_name_key`
  unique index; `integrationProject.ts` told the reader to apply `0001`–`0005` while that same lane
  asserts against `0006` and `0007`; the staging runbook's step 2 said the same. The drift guard
  (`src/data/__tests__/librarySeed.test.ts`) pinned movements field by field but pinned template
  **slots only by count and movement name**, so `targetSets`, the rep range, `targetRpe`,
  `restSeconds`, `dayIndex` and `weekday` could be retuned in TypeScript and never reach a real
  account. All are now rebuilt from the constants and matched verbatim, as are the routine headers.
  The 47 drift-guard tests recorded above are now **50**. Evidence: the gap was demonstrated before it
  was closed — three deliberate drifts (an RPE, a rest timer, a weekday pin) introduced into
  `routineTemplates.ts` passed the old guard **47/47** and fail the new one; `npm run typecheck` clean
  and **451/451 tests across 26 suites** with the drifts reverted. No migration, no `eas.json` and no
  application code was touched, so the 154/154 SQL evidence above still stands unmodified.
- **Delta 2026-08-09 — the schema is on a hosted project, and this document was the last to know:**
  `[fact, owner, 2026-08-09]` **The owner created a staging project and applied `0001`–`0007` to it.**
  Every "not applied to a live project" statement above is superseded, including the two marked
  inline. The residual risks those entries recorded — that `save_workout_graph` would fail outright
  against the real project, that the exercise picker would be empty, that I-10 would break for an
  account holding a custom movement — are closed **on staging**. They remain open for any project that
  has not had the same treatment, and production is such a project.
  **The failure worth recording is not the staleness, it is the mechanism** `[recommendation]`: this
  document inferred hosted state from the repository, which cannot observe it. An agent has no
  dashboard, so a claim here about a live project is the owner's report or it is nothing, and one
  written as a bare `[fact]` will be read as current long after it stops being true. Cloud-state
  claims belong in `Docs/tester-readiness-runbook.md` §2, whose probe reads the project directly and
  settles the question instead of asserting an answer. **Still open and confirmed:** the EAS
  `preview` environment has no Supabase variables, which is now the binding blocker for a tester
  build. Full record: `Docs/tester-readiness-runbook.md`.
- **Delta 2026-08-09 — the app has been verified against a hosted project, for the first time:**
  `[fact, owner, 2026-08-09]` `npm run test:integration` against the staging project: **19/19 across 2
  suites**, with both repository secrets set so the nightly lane now has something to run. This
  supersedes every "verified against an emulator only" caveat in the entries above, and it is the
  strongest evidence in this document — the app's own module graph, against the real system, rather
  than an inference drawn from the repository.
  Confirmed against a real PostgREST rather than a mocked `rpc()`: `handle_new_user` on the real
  `auth.users`; `save_workout_graph` committing the whole graph, stamping ownership over a forged
  payload, no-op on exact retry, reconciling removed children (**I-2/G-2 hold against a real
  project**); `save_check_in`'s omit/value/explicit-null semantics through the real jsonb round trip;
  RLS between **two real accounts** in both directions, which `src/data/__tests__/ownership.test.ts`
  had been taking on trust; and `delete_my_account` erasing an account that owns a custom movement
  logged in a session — **the exact cascade-ordering case `0007` fixes, so `0007` is confirmed correct
  on staging, not merely applied**. What remains unverified on a hosted project is everything above
  the data layer: no screen, no navigation and no build has been exercised there by this lane
  *(closed the same day — see the delta below)*.
- **Delta 2026-08-09 — the whole loop, on a device, against staging:**
  `[fact, owner, 2026-08-09]` **The full first-run walkthrough was performed on a cold-started iOS
  simulator, on a fresh install, against the staging project, and passed end to end**: sign-up,
  onboarding, Today, starting a session, adding a movement from the picker, logging a set, finishing
  it, force-quit and reopen with the session and login intact, history, a check-in, data export, and
  account deletion through the app.
  This closes the caveat the entry above ends on. It is the **only** verification in this repository
  that sees what a lifter sees — the integration lane drives `SupabaseRepository` directly and touches
  no screen, so a completely broken first run can coexist with 463 green unit tests and 19 green
  integration tests. That is not hypothetical: it is precisely what #58 was, and it reached `main`.
  `[recommendation]` Re-run the walkthrough (`Docs/tester-readiness-runbook.md` §6) after any change
  to routing, onboarding, session storage or the `Repository` interface.
  `[fact, owner, 2026-08-09]` A **preview build** was produced end to end the same day — Android,
  ~22 minutes, commit `048114b`, with all three environment variables confirmed resolving into it —
  which closes **G-7 for `preview`**. `production` and store submission remain unexercised.
  **The binding gates are now G-4 (no crash reporting or analytics at all) and the two product gaps
  below the store bar:** no way to create a custom exercise, and check-in days bucketed in UTC.
- **Delta 2026-08-09 (`feature/v1-user-data-writes`, based on `main` at `6d8e4d9`):** the custom-
  exercise blocker named immediately above is closed on this branch. The repository, training store,
  and UI now create/edit/delete user-owned movements while leaving system movements read-only and
  refusing deletion when logged history references one. Body measurements can be added, edited, and
  deleted from Body. A Settings modal writes profile/training preferences and exposes the authenticated
  account lifecycle; Today's header now opens Settings in demo and account modes. Onboarding answers
  are applied to the profile before its durable completion flag opens Today. Shared-plan selection is
  represented by the already-owned profile training-day fields because the shipped plans are global
  rows (`profile_id is null`) and cannot carry a per-account `is_active` value. No migration, RLS
  policy, dependency, native project, or hosted-project setting changed. Evidence on this branch:
  `npm run verify` **passed, 543/543 across 35 suites**, and TypeScript passed; the integration lane
  had no credentials in this Codex environment and **skipped 23/23**. `npx expo export --platform ios`
  started Metro but did not finish after several bounded waits and was stopped, so it is not counted
  as validation. The prior device walkthrough is superseded for the changed onboarding/routes/data
  contracts: a new cold-start walkthrough is still required. Full record:
  `Docs/sprints/2026-08-09-v1-user-data-writes.md`.
- **Delta 2026-08-09 (`fix/v1-zero-data-surfaces`, based on `main` at `6d8e4d9`):** three analysis
  surfaces now distinguish missing evidence from a result. Insights and Progress branch on zero
  completed workouts instead of a missing profile; Body replaces sixteen unsupported 100%/fresh rows
  with an actionable no-history state. Progress key lifts are selected from movements actually
  repeated in completed, non-future sessions during the last eight weeks, so hosted UUID exercise ids
  work instead of matching only demo catalogue slugs. The same selector bounds the panel to four and
  resolves real exercise names. Default favourites are empty rather than four demo-only ids. No
  repository, schema/RLS, dependency, native, or hosted-project change occurred. Evidence:
  `npm run verify` passed **529/529 tests across 31 suites** with clean TypeScript; Jest retained its
  worker-force-exit cleanup warning. The changed render states have no component tests and still need a
  cold-start zero-account walkthrough. Full record:
  `Docs/sprints/2026-08-09-v1-zero-data-surfaces.md`.
- **Delta 2026-08-09 (`feature/v1-observability`, based on `main` at `6d8e4d9`):** the
  crash-reporting half of **G-4 is implemented on this branch**. `@sentry/react-native` is wired
  through its Expo config plugin and Metro serializer; `app/_layout.tsx` initialises it before render
  and wraps the app in `AppErrorBoundary`; six existing handled-error sites report through one
  boundary while preserving their console warnings. Reporting is inert in development, Jest, demo,
  and releases without a DSN. Eligible release failures are rebuilt from a privacy allowlist:
  identity, request/response bodies, state, exception text, free-form/unknown fields, console/click
  breadcrumbs, screenshots, replay, performance tracing, sessions and product analytics do not
  leave the device. **G-4 is only partially closed until a release test event proves the external
  project and source maps; analytics remains deliberately absent, not an open implementation item.**
  Full record: `Docs/sprints/2026-08-09-v1-observability.md`.
- **Branch provenance note `[fact, 2026-08-09]` — supersedes the per-branch notes the four sprints
  above each wrote for themselves.** All four were cut independently from `main` at `6d8e4d9` and
  developed in parallel, so each recorded its own work as "branch-only until merged". That is no
  longer true: they are integrated on the app-store-submission branch, and the three earlier notes
  were removed rather than left contradicting each other. The production-posture, auth, sign-out,
  password-reset, hosted-verification and local-training-day work named above are ancestors of that
  baseline.

  **What integration does and does not establish** `[fact]`: each branch was green on its own
  (543/529/502/532 tests respectively), and that is *not* evidence the merge is green. Nothing here
  has been applied to a hosted project, no build has been cut, and no screen has been exercised on a
  device since these landed.
- **Integration delta 2026-08-09 — the four sprints above, merged** `[fact]`: `npx tsc --noEmit`
  clean and **642/642 tests across 46 suites**. That is the figure describing what exists now; the
  four per-branch numbers describe four repositories that no longer exist.

  **Two conflicts of intent were resolved by hand at integration, and neither was a textual
  conflict** — both merged cleanly and both would have shipped a defect:

  1. **The paywall took the screen the measurement writer had just been added to.**
     `feature/v1-entitlements` gated the whole Body screen behind the Pro unlock, correctly per its
     own brief. `feature/v1-user-data-writes` put body-measurement entry on Body, also correctly.
     Together they put a lifter's own bodyweight log behind a purchase, which is the single thing
     `Docs/decisions/ADR-0005-monetization.md`'s free tier is defined to prevent. Body is now split
     across the line rather than sitting on one side of it: measurements always render, and only the
     recovery estimate locks (`LockedProPanel`, a card, rather than `LockedProScreen`, a return).
  2. **Two independent early returns each swallowed the whole screen.** The lock and
     `fix/v1-zero-data-surfaces`'s no-evidence state both returned before the measurement section,
     so a lifter with no logged sessions — exactly the person recording a starting bodyweight — could
     not reach the writer at all. Both are now inline states within one page.

  **The same class of failure hit the privacy documents, and there it was worse**
  `[fact, see `Docs/privacy-data-inventory.md`]`: the observability and entitlement sprints each
  rewrote that file as though it were the only change in flight, so each described **two**
  third-party processors. There are **three** (Supabase, Sentry, RevenueCat), and both crash
  diagnostics *and* purchase history are now collected. Separately,
  `feature/v1-user-data-writes` falsified three standing claims in that document — that no screen
  calls `updateProfile`, that the training preferences have no UI write path, and that
  `body_measurements` and custom `exercises` rows are dormant. Body measurements are the **sensitive
  health/fitness category**, so that last one would have produced a store privacy declaration that
  under-reported the most scrutinised data PRism holds. All corrected at integration and marked as
  corrections rather than silently rewritten.

  `[recommendation]` The mechanism is worth more than the fixes: **a document owned by one sprint is
  wrong the moment two sprints run in parallel.** Privacy and store-form claims should be re-derived
  at integration by default, not merged.
- **Delta 2026-08-10 — the app verified against the hosted project, and the one thing that is broken**
  `[fact, integration lane, project ref `gyxcjmitzktffyuroucz`]`. The project ref is recorded here
  deliberately: a probe or a lane result without the project it ran against is the ambiguity that cost
  this repository a full schema applied to an unrelated app earlier the same day.

  `npm run test:integration` against that project: **22 passed, 1 failed, 23 total.** Confirmed against
  real PostgREST and real GoTrue rather than against a mock or local Postgres — sign-up on the real
  `auth.users`, the whole workout graph committing through `save_workout_graph`, ownership stamped over
  a forged payload, exact-retry idempotency, reconciliation of removed children, RLS between **two
  genuinely separate accounts** in both directions, `save_check_in`'s omit / value / explicit-null
  semantics through a real jsonb round trip, the `0009` entitlement read, and export completeness
  across every table.

  **The one failure is `delete_my_account`, and it is a store-submission blocker.**
  `SupabaseRepository.deleteAccount` no longer calls the RPC directly — it invokes the `delete-account`
  Edge Function (`repository.ts`), which also erases the RevenueCat customer so deletion does not stop
  at Postgres. That function is not deployed, so deletion fails outright with a non-2xx. **I-10
  requires working deletion before submission and App Review tests it**, so this would have been a
  rejection rather than a bug report.

  **Closed the same day, and the fix was a design correction rather than configuration**
  `[decision, owner, 2026-08-10]`. `delete-account` treated a missing `REVENUECAT_PROJECT_ID` /
  `REVENUECAT_SECRET_API_KEY` as a `503`, alongside the genuinely required platform values — so
  **account deletion refused to run until a payment processor was configured, on a build that had no
  RevenueCat keys in any environment and therefore could not sell anything.** That inverts the
  priority: I-10 is a hard store gate that App Review tests, and billing is optional until you charge
  someone.

  The function now separates two cases a single condition had conflated (`revenueCatConfigured`, pure
  and tested):
  - **Not configured** — no customer was ever sent, so there is nothing to erase. Skip it and delete
    the account.
  - **Configured but failing** — a customer may exist, so this still aborts *before* the database
    delete with a `502`. A lifter is never told their data is gone while a copy sits at a processor.

  A half-set deployment counts as unconfigured, since one value without the other cannot authenticate
  a v2 request.

  `[fact]` Both Edge Functions were then deployed to `gyxcjmitzktffyuroucz` with the `verify_jwt`
  settings `supabase/config.toml` specifies (`revenuecat-webhook` false, `delete-account` true), and
  the lane re-run: **23 passed, 0 failed, 23 total.** Account deletion is now verified end to end
  against a hosted project — the erasure of an account owning a custom movement logged in a session,
  which is the exact cascade-ordering case `0007` exists to fix. **I-10 is met in practice, not only
  in code.**

  `[fact]` Still true: the earlier failing runs left their disposable test accounts behind, so that
  project holds orphaned test users to clear before real ones arrive. And the RevenueCat secrets are
  still unset — the webhook rejects everything until `REVENUECAT_WEBHOOK_AUTH` exists, so **entitlements
  cannot yet be granted**; deletion simply no longer waits on that.

- **Delta 2026-08-10 — the startup read is bounded** `[fact]`: `refresh()` loaded every session an
  account had ever logged, three levels deep (`workouts → workout_exercises → sets`), with no
  `.limit()`, `.range()` or pagination anywhere in `src/data/repository.ts`. The cost grew with
  tenure, so the longest-standing users had the slowest cold start. `listWorkouts` now takes an
  optional `{ limit }` and the store asks for the most recent `WORKING_SET_WORKOUT_LIMIT` (120)
  sessions; startup also drops from **ten reads to eight**, because `getActiveRoutine()` re-fetched
  the profile and routine list that `refresh()` already had.

  Three properties worth carrying forward, all covered by tests:
  **(1)** the bound is **opt-in** — `listWorkouts()` still returns everything, because
  `exportAccountData` (I-10, "export everything") and `DemoRepository.deleteExercise` (a movement is
  undeletable while any logged session references it, however old) would both have broken *silently*
  under a bounded default. **(2)** A bounded read returns the **newest** sessions: adding `.limit()`
  to the existing ascending query returns the *oldest* N, which typechecks, satisfies a row-count
  assertion, and shows a lifter their first month in place of their last. **(3)** History is the only
  surface that browses past the window and tops up on entry; every analysis window (Insights 84 days,
  key lifts 56, readiness 28) fits inside the bound, and `coversLongestAnalysisWindow` fails a test if
  that stops being true.

  **Extended the same day to the check-in and record reads.** `listCheckIns` and
  `listPersonalRecords` take the same optional `{ limit }`, bounded at startup to 120 and 400 rows;
  the sort inversion the three share lives once in `readWindow`. Records carry a hazard the other two
  do not: History matches them to sessions, so a record window narrower than the session window prints
  **"0 PRs" on a session that set three** — a wrong number rather than a missing row. What prevents
  that is not the constant but the coupling: `historyComplete` (renamed from `workoutsComplete`) is one
  flag for both, false when *either* window hit its cap, and `loadFullHistory` loads sessions and
  records together in one step.

  Evidence: `npx tsc --noEmit` clean, **665/665 tests across 48 suites**. **Not** measured against a
  real account and not run on a device — the improvement is argued from the query shape, not
  benchmarked, and the 400-record bound is headroom rather than a derived ceiling. `listMeasurements`
  is now the only unbounded list read. Full record:
  `Docs/sprints/2026-08-10-workout-read-window.md`.
- **Scope:** A read-only, evidence-based inventory of the current state of the PRism repository — code, schema, tests, CI, and configuration as they exist today.
- **Non-goals:** This document does not propose a future architecture, does not create new process documents (invariants, ADRs, product intent), and does not evaluate anything outside this repository (App Store/Play listing, backend infrastructure beyond the committed SQL migration, third-party services). It is not a design review of the visual/UX system beyond what is verifiable from code.

---

## Executive Summary

**What is currently working (verified):**
- The app boots, typechecks, and passes its full test suite with zero errors (`npm run typecheck` → clean; `npm test -- --ci` → **103/103 tests passed, 9 suites** as of 2026-08-01, up from 40/40 in 1 suite at this document's original review; `npx expo-doctor` → 20/20 checks passed).
- **RLS policies are now demonstrated correct and deployable, not just written.** `supabase/migrations/0001_init.sql` applies cleanly (a previously-undiscovered non-immutable index expression was fixed 2026-08-01) and an automated 57-assertion suite (`supabase/tests/rls/`) confirms cross-tenant isolation across all 11 tables and every CRUD operation, against the actual committed migration file, reproduced twice from a clean database and once more on a real hosted Supabase project. See `Docs/invariants.md` I-1 and `Docs/sprints/2026-08-01-rls-migration-fix.md`. This does not mean production/non-demo mode is reachable by a real user yet — see the authentication gap below, unchanged.
- A complete **demo mode** runs the entire app on deterministic, locally generated data with zero network calls and zero configuration (`src/data/demoSeed.ts`, `src/data/repository.ts`).
- A pure, thoroughly unit-tested **calculation engine** (`src/domain/calc/`) implements 1RM estimation, volume, PR detection, recovery estimation, a composite readiness score, and next-load recommendations.
- A **Supabase/Postgres schema** with row-level security exists and is checked into the repo (`supabase/migrations/0001_init.sql`), covering 11 tables and a consistent ownership model.
- One full user workflow — start a session, log sets, finish, see a summary — is implemented end-to-end in the demo backend: `app/(tabs)/index.tsx` → `app/workout/active.tsx` → `app/workout/summary.tsx`.

**What is demo-only, mocked, partial, or unknown:**
- The Supabase backend path (`SupabaseRepository` in `src/data/repository.ts`) is implemented in code but has **no evidence in this repository of having been executed against a live Supabase project** — there is no integration test, no CI job, and no auth UI to obtain a session. This is unknown / needs confirmation, not a confirmed defect.
- There is **no authentication UI anywhere in the app** (`app/` contains no sign-in/sign-up/sign-out screens; confirmed by search). Supabase mode requires a signed-in user (`SupabaseRepository.uid()` throws otherwise), but nothing in this repository can produce that session.
- Tabs **Progress, Body, Insights, and Plans** are explicitly labelled in-code and in the README as partial: each renders real calculations today but ships a `PhasePanel` describing unbuilt future scope (interactive charts, SVG body map, recommendation engine, plan editor).
- No CI job runs against a real Supabase instance, and no automated test exercises `SupabaseRepository`, RLS policies, or the migration itself.
- Native `ios/` and `android/` directories are git-ignored and regenerated locally via `expo prebuild` — this repository's tracked source is the Expo-managed layer only.

**Five most material architecture / launch risks (updated 2026-08-01):**
1. **No authentication path exists**, so the Supabase (production) backend is currently unreachable by any UI in this repository — demo mode is the only mode a user can actually run. **Unchanged** — this is now the single most material gap, since the RLS blocker beneath it (below) is resolved.
2. ~~**Multi-record workout writes are still not atomic**~~ — **Resolved 2026-08-06** (`feature/v1-workout-write-integrity`). The three sequential, non-transactional upserts are replaced by `save_workout_graph`, a single-transaction `security invoker` Postgres function that also reconciles removed children and makes personal-record persistence idempotent (see G-2 below, and migration `0003`). Verified by 31 assertions against a live Postgres 16.14, including the mid-sequence-failure case. **Residual risk:** the migration has been applied to a disposable local database only — applying it to the real Supabase project is a manual, un-automated step (see G-4), and until it is applied there, every workout save against that project fails outright rather than partially.
3. **Observability was absent at this baseline. Partially resolved 2026-08-09** on
   `feature/v1-observability`: crash reporting exists in code; release delivery and source-map
   symbolication remain unverified. Product analytics remains deliberately absent.
4. **No CD/release pipeline** — CI covers typecheck and test only; there is no `eas.json`, no EAS build/submit workflow, and no App Store/Play release automation in this repository. **Unchanged.**
5. **Residual dependency vulnerabilities** — this baseline recorded 11 moderate findings. The
   2026-08-09 audit supersedes the count with 17 high / 8 moderate / 0 critical across Expo/React
   Native/Metro tool chains; see G-10 and the observability sprint record.

~~Previously listed here, now resolved:~~ *RLS policies and the schema are unexercised* — **resolved 2026-08-01**, see above. *Unused dependencies present* (`react-hook-form`, `zod`, `@hookform/resolvers`) — **resolved 2026-08-01**, all three removed (confirmed zero imports before removal).

**This is an evidence-based current-state document, not a future-state design.** Every claim below is either marked *verified* (backed by a specific file, command output, or test), *inferred* (a reasonable reading of code that was not directly executed), or *unknown* (cannot be determined from this repository and requires confirmation).

---

## Product and System Boundaries

**Intended user outcome and core workflow** (source: `README.md`): PRism is a strength-training and workout-tracking app for intermediate lifters training 3–6 days/week. The core loop, as implemented, is: see today's readiness and scheduled session (Today tab) → start and log a workout set-by-set (Workout logger) → review a post-session summary with PRs and volume (Workout summary). Every derived number (readiness, recovery, load suggestions) ships with a plain-language rationale rather than being presented as an unexplained verdict — this is a stated design principle in the README and is verifiably implemented (`READINESS_EXPLANATION`, `RECOVERY_MODEL_EXPLANATION`, `LoadSuggestion.rationale`).

**In-scope platforms** (verified, `app.json` + `package.json`): iOS (`ios.bundleIdentifier: app.prism.trainer`, `supportsTablet: false`), Android (`android.package: app.prism.trainer`), and web (`web.bundler: metro`, `web.output: single`, plus `react-native-web` dependency and an `npm run web` script). No platform-specific code branches beyond a few `Platform.OS` checks in styling (e.g. `app/(tabs)/_layout.tsx`) were found.

**Explicit originality boundary for Liftly reference material:** The README's "Originality" section (`README.md`, final section) states in-repo that the design system, copy, exercise library, coaching cues, template plans, calculation model, and every UI component were written from scratch, and that Epley's formula, volume-as-weight-×-reps, and the acute:chronic ratio are cited as standard, public-domain strength-training mathematics rather than borrowed proprietary content. This document does not independently verify originality against any external product — that determination is out of scope for a code-only audit and is recorded here only as the stated project position.

**What this repository does and does not currently implement:**
- **Implements:** demo-mode data layer, calculation engine, Today/Workout logger/Exercise picker/Workout summary screens, Supabase schema + RLS (as SQL), a typed repository abstraction, design token system, Jest suite for the calc engine, CI for typecheck+test.
- **Does not implement (verified absent):** authentication screens, onboarding flow, settings screen, data export/delete UI (the README lists these as Phase 6 / "planned"), push notifications, analytics/crash reporting, EAS build configuration, any server-side code beyond the SQL migration, offline-queue/sync logic for the Supabase path.

---

## Technology Inventory

| Concern | Technology / Package | Version (verified) | Responsibility | Evidence |
|---|---|---|---|---|
| Framework | Expo | `^57.0.8` | Managed native runtime, build tooling | `package.json` |
| Mobile runtime | React Native | `0.86.0` | Cross-platform native rendering | `package.json` |
| UI library | React / React DOM | `19.2.3` | Component model | `package.json` |
| Language | TypeScript | `~6.0.3`, `strict: true` | Static typing across app/src | `package.json`, `tsconfig.json` |
| Routing | Expo Router | `~57.0.8` | File-based navigation, typed routes (`experiments.typedRoutes: true`) | `package.json`, `app.json` |
| State management | Zustand | `^5.0.3` | Two stores: persisted training data, ephemeral active-workout session | `package.json`, `src/store/*.ts` |
| Backend / data | Supabase (`@supabase/supabase-js`) | `^2.48.1` | Postgres + auth + RLS backend, optional (demo mode is default) | `package.json`, `src/data/supabase/client.ts` |
| In-app purchase transport | RevenueCat (`react-native-purchases`) | `^10.7.0` | Exact-product native purchase/restore and store-localized price; never entitlement authority | `package.json`, `src/data/purchases.ts` |
| Local persistence | `@react-native-async-storage/async-storage` | `2.2.0` | Demo-mode local writes; Supabase session storage | `src/data/repository.ts`, `src/data/supabase/client.ts` |
| Auth | Supabase Auth (client SDK only) | `^2.48.1` | `auth.getUser()` used to scope queries; **no sign-in/out UI exists** | `src/data/repository.ts` (`SupabaseRepository.uid()`) |
| Forms | *(removed 2026-08-01)* | — | `react-hook-form`, `@hookform/resolvers`, `zod` were declared but never imported anywhere in `app/` or `src/`; removed as dead weight (`Docs/sprints/2026-08-01-dependency-hygiene.md`). Auth and check-in forms use hand-rolled validation instead. | `git log` |
| Testing | Jest `^29.7.0` + `jest-expo` `~57.0.2` | — | Unit tests for `src/domain/calc` | `package.json`, `src/domain/calc/__tests__/calc.test.ts` |
| CI | GitHub Actions | — | Typecheck + test on push/PR to `main` | `.github/workflows/ci.yml` |
| Build / release | Expo CLI (`expo run:ios`/`run:android`), no EAS config | — | Local native builds only; no `eas.json` found in repo | `package.json` scripts; absence confirmed via file search |
| Environment config | `EXPO_PUBLIC_*` vars, inlined at build time | — | Demo-mode toggle, Supabase URL/anon key, and RevenueCat public platform SDK keys | `.env.example`, `src/data/supabase/client.ts`, `src/data/purchases.ts` |
| Icons | `@expo/vector-icons` | `^15.0.2` | Ionicons used throughout tab bar and UI | `package.json`, `app/(tabs)/_layout.tsx` |
| Gestures/safe area | `react-native-gesture-handler` `~2.32.0`, `react-native-safe-area-context` `~5.7.0`, `react-native-screens` `~4.26.0` | — | Navigation plumbing required by Expo Router | `package.json`, `app/_layout.tsx` |
| Graphics | `react-native-svg` `15.15.4` | — | Present but no SVG component found in `src/components` yet (Phase 3 body map is "planned") | `package.json` |
| Haptics | `expo-haptics` `~57.0.1` | — | Feedback on set completion | `src/store/activeWorkoutStore.ts` |
| Keep-awake | `expo-keep-awake` `~57.0.1` | — | Prevents device sleep during a logged session | `app/workout/active.tsx` |

---

## Repository Map

```
prism/
├── app/                     # Expo Router — file-based routes only
│   ├── _layout.tsx          # Root stack: gesture root, safe area, data bootstrap
│   ├── (tabs)/               # Tab navigator: index, progress, body, insights, plans
│   └── workout/               # Modal/stack routes: active, picker, summary
├── src/
│   ├── theme/                # Design tokens: colour, spacing, radius, typography
│   ├── components/
│   │   ├── ui/                 # Primitives (Button, Card, Text, Screen, ...)
│   │   ├── today/               # Today-tab composite components
│   │   └── workout/              # Logger composite components
│   ├── domain/                # Pure logic — no React, no I/O (types, muscles,
│   │   │                       # schedule, calc/*) — enforced by convention, not lint
│   │   └── calc/                # oneRepMax, volume, prs, recovery, readiness,
│   │                            # loadRecommendation, __tests__/
│   ├── data/                  # Repository interface + demo & Supabase impls,
│   │   │                       # exercise library, routine templates, demo seed
│   │   └── supabase/             # client.ts (lazy client), mappers.ts (snake<->camel)
│   ├── store/                 # trainingStore (persisted read model),
│   │                          # activeWorkoutStore (ephemeral session state)
│   └── utils/                 # format.ts, id.ts
├── supabase/migrations/       # 0001–0009 — schema, RLS, integrity, seed, lifecycle, entitlement
├── .github/workflows/ci.yml   # Typecheck + test on push/PR
├── ios/, android/             # Git-ignored, regenerated via `expo prebuild`
└── package.json / tsconfig.json / app.json / .env.example
```

**Additions since 2026-07-25, not reflected in the tree above (kept as originally drawn rather than
redrawn wholesale, to avoid introducing new unverified claims into a diagram):**
- `app/(tabs)/` gained `exercises.tsx` and `social.tsx`; the tab bar is five destinations
  (Today/Exercises/Insights/Social/Plans), with Progress and Body still routable but hidden from the
  bar (`href: null`).
- `app/onboarding/` — a first-run flow (splash, welcome, feature carousel, presentation-only auth,
  four-step setup, completion), gating first launch via a persisted flag in `app/_layout.tsx`.
- `assets/brand/` — the brand icon/splash source artwork and four generated derivatives (app icon,
  adaptive icon, splash icon, Android monochrome icon), plus `scripts/generate-app-icons.sh` and two
  Python helpers (`alpha-key.py`, `monochrome-key.py`), all deterministic/reproducible from the
  committed source.
- `supabase/migrations/0002_security_hardening.sql` — a second migration (`display_name` bounding, a
  cross-tenant exercise-visibility trigger), applied and verified in this repository as of 2026-08-01.
- `supabase/tests/rls/` — the RLS isolation test suite (57 SQL assertions + a runner script), not
  wired into CI.
- `src/store/onboardingStore.ts` — onboarding's local, `AsyncStorage`-only draft state.
- `src/components/ui/ScreenState.tsx` — the shared loading/error/empty-state primitive all seven
  data-driven screens now use.
- `src/content/` — user-facing copy held outside the screens that render it (`onboarding.ts`,
  `social.ts`; `deeperSurfaces.ts`, added 2026-08-03, the single source of truth for the
  Progress/Body/History navigation row that both Today and Insights draw from; and `setTypes.ts`,
  added 2026-08-04, the one set-type vocabulary shared by the logger and History).
- `src/domain/history.ts` + `app/history/` — the Workout History v1 derivation layer and its two
  screens (added 2026-08-03).

**Responsibility and dependency direction (verified by import inspection):**

- **`app/` (routes/screens):** Thin composition layer. Reads from `useTrainingStore` / `useActiveWorkoutStore`, calls `src/domain/calc` selectors, and renders `src/components`. No screen talks to `src/data` directly except via the stores.
- **`src/components/ui` and `src/components/{today,workout}`:** Presentational by default — data and callbacks arrive as props, and styling comes from `src/theme`. **Corrected 2026-08-06** `[fact]`: the rule was previously stated as absolute ("do not call the repository or stores directly"), qualified only by "verified for the files read". An exhaustive grep of `src/components/` for `useTrainingStore|useActiveWorkoutStore|useSessionStore|getRepository` finds **two** standing exceptions, and no others: `today/CheckInPrompt.tsx` subscribes to `useTrainingStore` and calls `saveCheckIn` itself, and `workout/RestTimerBar.tsx` reads `restTimer` and calls `adjustRest`/`clearRest` on `useActiveWorkoutStore`. **No component reaches `src/data` directly.** Treat the boundary as **"components never touch the repository; two container-like components do touch stores"** — and prefer lifting new store access to the screen rather than lengthening that list.
- **`src/domain` (business logic):** Pure functions and types. `src/domain/types.ts` documents itself as mirroring the SQL schema one-to-one. The README states the rule "`src/domain` never imports from `src/components`, `app/`, or `src/data`" — confirmed for every file read (`schedule.ts`, `readiness.ts`, `volume.ts`, `oneRepMax.ts`); no lint rule enforces this, so it is a convention, not a guarantee.
- **`src/store` (application/state):** `trainingStore` is a read model populated by the `Repository`; it holds no calculation logic itself and delegates all derived values to `src/domain/calc`. `activeWorkoutStore` is deliberately separate, and holds the in-progress session. **Corrected 2026-08-06** `[fact]`: this entry previously said an in-progress session "is not persisted until `finish()`". That has not been true since the session-continuity sprint. There are **two distinct persistence layers**, and conflating them is how a reader concludes a process kill always loses the session:
  - *Local draft* — every mutation mirrors `workout` to `AsyncStorage` under `prism.activeWorkout.draft.v1`, so a killed process can recover it on relaunch (`hydrate()`, and the `subscribe` at the foot of the module). Writes are queued and revision-checked, so the newest state is the one that survives a kill and a discarded session cannot be resurrected by a stale write. This mirror is read by nothing except that `hydrate()`, is scoped to a `DraftOwner`, and is removed on sign-out (`src/store/authActions.ts`).
  - *Repository-backed workout* — only on `finish()`, when the completed workout goes to `trainingStore.completeWorkout` and through the repository. This is the only layer that reaches Postgres.
- **`src/data` (repositories/data access):** `repository.ts` defines the `Repository` interface and two implementations (`DemoRepository`, `SupabaseRepository`), selected once at module load via `getRepository()` based on `isSupabaseConfigured`. `supabase/client.ts` lazily constructs the Supabase client only when configured, so demo mode makes zero network calls.
- **Supabase/database:** `supabase/migrations/` holds the schema — **nine files as of S4 on
  2026-08-09** (`0001_init` … `0009_entitlements`). They are exercised against a disposable Postgres
  by `supabase/tests/rls/run.sh`. S4 adds `supabase/config.toml` to declare that the RevenueCat
  webhook performs its own Authorization check (`verify_jwt = false`) while account deletion keeps
  the platform user-JWT gate (`verify_jwt = true`), plus both Edge Function sources; the repository is
  still unlinked and nothing was deployed or applied to a hosted project.
  Hosted migration/function deployment remains an explicit manual release operation.
- **Tests:** **Corrected 2026-08-06** `[fact, `npx jest --ci`]`. This entry claimed tests existed "only for `src/domain/calc`" with "no tests found for `src/data`, `src/store`". That stopped being true several sprints ago and stayed in the baseline. Actual coverage today: **24 suites, 375 tests**, across `src/content`, `src/data` (repository, ownership, auth posture, Supabase session flow, secure storage), `src/domain` (calc, schedule, history, auth validation, auth errors, routing, account), `src/store` (active workout, training, auth actions, session), and `src/utils`. Still genuinely untested: **anything under `app/` and anything under `src/components`** — there is no component or screen test in the repository.
- **Configuration/build/CI:** `app.json` (Expo config), `tsconfig.json` (strict TS, `@/*` path alias to `src/`), `.env.example` (documents three `EXPO_PUBLIC_*` variables), `.github/workflows/ci.yml` (Node 20, `npm ci`, typecheck, test).

---

## Runtime Architecture

**1. App startup and route entry** *(verified, `app/_layout.tsx`)*
Expo Router's entry point (`expo-router/entry`, `package.json` → `main`) mounts `app/_layout.tsx` as the root layout. It wraps the app in `AppErrorBoundary` (added 2026-08-09 — an uncaught render error was previously a white screen with no report), then `GestureHandlerRootView` and `SafeAreaProvider`, sets the status bar, and defines a `Stack` whose top-level routes are `(tabs)` (the tab group), `auth/index` (sign-in/sign-up, gestures disabled), `account`, `settings`, `exercise`, `measurement` and `paywall` (modals), `onboarding`, `workout/active` (slide-from-bottom, gestures disabled), `workout/picker` and `workout/templates` (modals), `workout/summary`, and the two `history` routes.

**Rewritten 2026-08-06 (`feature/v1-auth-and-session`).** The root layout previously ran two things on mount — an unconditional `trainingStore.load()` and a redirect effect that knew only about onboarding — and held the splash until the persisted onboarding flag resolved. It now holds **one combined gate**. `sessionStore.initialize()` and `onboardingStore.load()` both fire on mount and are allowed to race, because each only reads local storage and neither redirects; `Splash` renders until `sessionPhase !== 'unknown' && onboardingStatus === 'ready'`. Adding a second condition to the old shape would have meant two effects redirecting off the same `useSegments()` array, which is how a gate turns into a redirect loop.

A **single** effect then calls `resolveInitialRoute({ onboardingCompleted, sessionPhase, currentSegment })` (`src/domain/routing.ts`) and redirects only on a non-null result; returning `null` when already at the destination is the loop guard, and is asserted as a stability property in `src/domain/__tests__/routing.test.ts`. Precedence: an incomplete onboarding flag wins first — including for an already-authenticated user, so signing in on the account step does not skip the questions that follow — then `'unauthenticated'` routes to `/auth`, and finally `'authenticated'` or `'disabled'` evicts from the `onboarding` and `auth` segments only, leaving any other route (a deep link, an in-progress session) where it is. The decision lives in a pure function rather than inside the effect because this repository has no component-test tooling by decision (`Docs/sprints/2026-08-01-onboarding-ui-redesign.md` Decision 6), so a rule left in a component is a rule with no coverage.

**2. Environment / configuration loading** *(verified, `src/data/supabase/client.ts`)*
`EXPO_PUBLIC_DEMO_MODE`, `EXPO_PUBLIC_SUPABASE_URL`, and `EXPO_PUBLIC_SUPABASE_ANON_KEY` are read from `process.env` at module load (inlined into the bundle at build time by Expo's `EXPO_PUBLIC_` convention — not runtime-configurable post-build). No `.env` values are read by this audit; only variable names from `.env.example` are documented.

**3. Demo-mode vs. production-mode selection** *(verified, `src/data/repository.ts` + `src/data/supabase/client.ts`)*
`isSupabaseConfigured = !DEMO_MODE && url.length > 0 && anonKey.length > 0`. `getRepository()` is a lazily-initialized singleton: it constructs a `SupabaseRepository` if configured, otherwise a `DemoRepository`, and this decision is made once per app process (no runtime toggle). **Superseded 2026-08-06 (`feature/v1-production-posture`):** `DEMO_MODE` no longer defaults to `true` unconditionally. An unset `EXPO_PUBLIC_DEMO_MODE` now follows the build — `__DEV__` (Metro, Jest) means demo, any release bundle means real backend — and an explicit value still wins either way, so local "no backend needed" behaviour is unchanged. `getRepository()` also no longer falls back to `DemoRepository` when demo is off but credentials are missing: that combination now throws (surfaced as the normal `ScreenState` error via `trainingStore.refresh`'s try block), because silently downgrading a live-looking build to device-only storage is exactly the invisible data loss I-2/I-15 exist to prevent. Full posture, including the per-profile table and the G-1 blocker: `Docs/production-posture-v1.md`.

**Extended 2026-08-06 (`feature/v1-auth-and-session`).** Mode selection itself is unchanged; what is new is that repository *use* is now also gated on session state. `isAuthEnabled()` (`src/data/supabase/auth.ts`) returns `!DEMO_MODE && isSupabaseConfigured`, and `sessionStore.initialize()` reads it before anything else, which yields three startup states:

- **Demo** (`EXPO_PUBLIC_DEMO_MODE` truthy, or unset under `__DEV__` — Metro and Jest): phase resolves to `'disabled'` immediately. No Supabase client is constructed, no Keychain read occurs, and no network call is made. `DemoRepository` and the `DEMO_PROFILE_ID` literal are unchanged, and the onboarding account step is skipped entirely. Asserted by `src/data/__tests__/authPosture.test.ts`.
- **Misconfigured** (demo off, credentials absent): phase also resolves to `'disabled'` — deliberately. Routing this build to a sign-in screen would ask someone to type a password into a form that cannot work, while hiding the message that names the real problem. Resolving it to `'disabled'` instead lets startup proceed to `getRepository()`'s existing `SUPABASE_MISCONFIGURED_MESSAGE` throw, which still surfaces as the ordinary retryable `ScreenState` error. The auth gate must never be the thing that reports a configuration fault.
- **Configured** (demo off, credentials present): the phase is determined by the persisted Keychain session — `'authenticated'` or `'unauthenticated'`. `SupabaseRepository` is reached only in the former.

**4. Data retrieval and state updates** *(verified, `src/store/trainingStore.ts`)*
`load()` guards against re-entry (`if status is 'loading' or 'ready', return`) and delegates to `refresh()`, which sets `status: 'loading'`, fires eight repository calls in parallel via `Promise.all` (profile, exercises, routines, active routine, workouts, check-ins, measurements, personal records), and on success sets `status: 'ready'` with all data populated; on failure sets `status: 'error'` with a message. Screens key their loading/error UI off `status` (verified in `app/(tabs)/index.tsx`).

**Rewritten 2026-08-06 (`feature/v1-auth-and-session`).** This used to begin "`app/_layout.tsx` calls `load()` once on mount," and that is no longer true. Data loading waits for the session: a second effect keyed on `sessionPhase` calls `refresh()` when the phase is `'authenticated'` or `'disabled'`. Previously a real-backend build fired all eight calls before any session existed — six of them reach `uid()` — so the store landed in `status: 'error'` before the gate had decided the lifter should be looking at a sign-in screen. The same effect hydrates the local workout draft, passing a `DraftOwner` so a draft belonging to a different account, or to a prior demo run where the id is the `DEMO_PROFILE_ID` literal, is discarded rather than resumed.

`refresh()`'s catch now discriminates. An `AuthRequiredError` (`src/data/authRequired.ts`) sets `status: 'idle'` — **not** `'error'` — and calls `sessionStore.markUnauthenticated()`, which the route gate turns into a redirect. The `'idle'` choice is load-bearing rather than cosmetic: `load()`'s re-entry guard returns early on `'loading'`/`'ready'`, so leaving a stale status here would silently swallow the first load after a successful sign-in. Every other failure keeps the previous behaviour.

**5. Workout logging flow** *(verified, `src/store/activeWorkoutStore.ts` + `app/workout/active.tsx`)*
`activeWorkoutStore.start()` builds a `Workout` in memory, pre-populated with empty sets from the routine day's targets (or empty if an "open session"). All mutations (`updateSet`, `toggleSetComplete`, `addSet`, etc.) are synchronous, in-memory, and optimistic — nothing touches the repository until `finish()` is called. `finish()` strips any exercise with zero completed sets, stamps `endedAt`/`status: completed`, clears the active-workout store, and returns the finished `Workout`. The caller (`app/workout/active.tsx`, evidenced by import of `useTrainingStore`'s `upsertWorkout`) is responsible for calling `trainingStore.upsertWorkout(finished)`, which persists via `repo.saveWorkout()` and updates the read model. `toggleSetComplete` also fires a haptic and starts a rest timer.

**6. Calculation / insight flow** *(verified across `src/domain/calc/*.ts` and consuming screens)*
Screens do not store derived values — they call `src/domain/calc` functions inside `useMemo` on every render with the latest data from the stores. Example chain on the Today screen (`app/(tabs)/index.tsx`): `estimateRecovery()` → `computeReadiness()` → rendered by `ReadinessCard`; `volumeInWindow()` computes this-week vs. last-week volume for the consistency card. The same functions back Progress (`e1rmSeries`), Body (`estimateRecovery`), and Insights (`muscleDistribution`, `volumeInWindow`) screens — there is one calculation implementation reused across every surface, matching the README's "portable, testable in isolation" design goal.

**7. Error, loading, empty, and offline behavior**
- **Loading:** Verified — `TodayScreen` renders an `ActivityIndicator` while `status` is `'idle'`/`'loading'`.
- **Error:** Verified — `TodayScreen` renders a retry `Card` when `status === 'error'`, wired to `refresh()`. Other tabs (Progress, Body, Insights, Plans) were not observed to render a distinct error state; they consume `useTrainingStore` selectors directly and would render with empty/default data if `status` were `'error'`, since they do not branch on `status` (verified by reading each file — none references `s.status`). **This is a confirmed gap**, not an inference. *(Superseded by G-5's resolution: all seven data-driven screens now share `ScreenState`.)*
- **Error, auth vs. data (added 2026-08-06):** the two are now separated. "No session" is a routing event, not a load failure: it travels as `AuthRequiredError`, is caught by `refresh()`, and moves the session phase to `'unauthenticated'` so the gate redirects to sign-in. `ScreenState` is reserved for genuine data failures. This removes the case the previous design produced — "Could not load this" over the message *Not signed in.*, behind a Retry button that could never succeed, on a build with no route to a sign-in screen because none existed.
- **Empty:** Verified per-screen — Today shows "No plan is active yet..." when no session resolves; sections (fatigued muscles, recent PRs) are conditionally hidden when empty (`fatigued.length > 0`, `recentPrs.length > 0`).
- **Offline:** No offline-detection code was found (`NetInfo`, `isConnected`, or similar — searched across `app/` and `src/`, one unrelated match for the word "offline" in a comment in `src/theme/typography.ts`). Demo mode is inherently offline-capable since it never calls the network. The Supabase path's behavior when offline is **unknown** — `SupabaseRepository` calls will presumably reject and propagate an `Error` up to `trainingStore.refresh()`'s catch block, but this was not exercised by any test.

```mermaid
flowchart TD
    A[App launch] --> B[app/_layout.tsx mounts]
    B --> C[trainingStore.load]
    C --> D{isSupabaseConfigured?}
    D -- no --> E[DemoRepository: seeded + AsyncStorage data]
    D -- yes --> F[SupabaseRepository: Postgres via RLS]
    E --> G[trainingStore status = ready]
    F --> G
    G --> H[Today tab: readiness, schedule, consistency]
    H --> I[Start workout: activeWorkoutStore]
    I --> J[Log sets, in-memory, optimistic]
    J --> K[Finish: trainingStore.upsertWorkout]
    K --> L[repo.saveWorkout persists]
    L --> M[Workout summary: PRs, volume, muscle distribution]
```

---

## Data Architecture

**Entities and relationships** *(verified, `supabase/migrations/0001_init.sql` and `src/domain/types.ts`, which the file's own header states mirrors the SQL 1:1)*:
`profiles` (1) → `workouts` (N) → `workout_exercises` (N) → `sets` (N); `profiles` → `routines` (N) → `routine_days` (N) → `routine_exercises` (N); `profiles` → `body_measurements`, `check_ins`, `personal_records` (N each); `exercises` is shared (system rows have `profile_id = null`) and referenced by `workout_exercises` and `routine_exercises`.

**Ownership and lifecycle:** Every user-owned row carries `profile_id`, and `profiles.id` references `auth.users(id) on delete cascade` — deleting the Supabase auth user cascades through the entire schema (verified in migration comments and FK definitions). A trigger (`handle_new_user`) auto-creates a `profiles` row on signup. In demo mode, there is no `auth.users` equivalent — `DemoRepository` uses a fixed `DEMO_PROFILE_ID` constant and persists the profile override plus user-logged workouts, records, check-ins, custom exercises, and measurement overrides/tombstones to `AsyncStorage` under versioned keys; the seeded history is regenerated in memory each launch and merged with those writes.

**Demo data vs. Supabase data:** These are two structurally-identical but operationally distinct datasets behind one `Repository` interface (verified, `src/data/repository.ts`). Demo data has no expiry, sync, or multi-device concept — it is single-device, `AsyncStorage`-backed. A `resetDemoData()` function exists to wipe it back to the pristine seed.

**Repository abstraction and contracts:** The `Repository` interface (`src/data/repository.ts`) is the sole data-access contract used by the stores. It covers profile reads/updates; exercise list/create/update/delete; routine list/resolution/owned activation; atomic workout completion plus workout CRUD; partial check-in writes; measurement list/save/delete; personal-record writes; and account export/deletion. Both implementations satisfy it. Supabase ownership is stamped from the active session rather than caller fields; demo mode stamps its one `DEMO_PROFILE_ID`. Workout completion goes through `save_workout_graph`, including personal records, in one idempotent database transaction (G-2/I-2 closed).

**Database migrations, RLS, and authorization posture:** Eight migration files (`0001`–`0008`) define the schema, security hardening, atomic workout RPC, partial/day-local check-ins, account deletion, shared library seed, and deferrable custom-exercise references. The committed SQL is exercised against disposable Postgres in CI; hosted application remains an owner-run step because this repository still has no linked Supabase CLI project.

**Data integrity gaps or unknowns:**
- Shared-template choice is inferred from the profile's session target because global template rows cannot hold a per-user flag. An explicit choice distinct from that target would require an approved schema decision.
- Saving Settings can span profile and owned-routine rows. It is safely retryable and the failure copy admits possible partial progress, but there is no cross-table transaction without a new RPC/migration.
- `exercises` has a partial unique index for system movements only; user-created duplicate names are currently allowed by design.
- The new write methods have hermetic ownership tests, but their staging integration cases skipped in this environment; live-project verification remains required.

---

## Security and Privacy Posture

**Authentication/authorization implementation status:** ~~Client-side Supabase Auth SDK is wired (`getSupabase().auth.getUser()` in `src/data/repository.ts`), but **no sign-in, sign-up, sign-out, or session-recovery screen exists anywhere in `app/`**. Category: **confirmed issue**.~~ **Superseded 2026-08-06 (`feature/v1-auth-and-session`).**

A complete client-side authentication path now exists. `src/data/supabase/auth.ts` is the only module in the app that calls Supabase's auth API (`isAuthEnabled`, `getCurrentUser`, `signInWithPassword`, `signUpWithPassword`, `signOut`, `subscribeToAuthState`), which keeps `getSupabase()` — a function that throws on an unconfigured build — out of the store layer. `src/store/sessionStore.ts` owns a four-phase machine (`unknown` / `unauthenticated` / `authenticated` / `disabled`) and subscribes once, for the process lifetime, to `onAuthStateChange`; that subscription is what turns a revoked or permanently-unrefreshable token into a routing event rather than a mystery error on the next load. `app/auth/index.tsx` is a real sign-in/sign-up surface, and `app/onboarding/auth.tsx` is now a `<Redirect>` into it.

`SupabaseRepository.uid()` changed in two ways. It reads `auth.getSession()` rather than `auth.getUser()`: `getUser()` round-trips to `/auth/v1/user` on every call, and `uid()` is reached by six of the eight repository calls `trainingStore.refresh()` fires in parallel — six requests before a single row is fetched — while the access token is what Postgres evaluates RLS against anyway, so a second client-side validation proves nothing the query itself will not. And it throws `AuthRequiredError` rather than a bare `Error`, which is what allows the store layer to distinguish "no session" from every other failure. The error type lives in `src/data/authRequired.ts` rather than in a store, preserving the one-directional layering: `src/data` defines and throws it, stores catch and interpret it, and no repository reads session state back out of a store. No repository method accepts a caller-supplied id; `sessionStore.userId` exists for display and test assertions only.

**Sign-out is reachable as of 2026-08-08** (`feature/v1-signout-surface`). As of the user-data-writes sprint, Today renders a Settings control for both demo and account modes; authenticated Settings includes an Account and privacy row leading to `app/account.tsx`, whose destructive-toned "Sign out" row calls `signOutAndTearDown`. The account row remains absent outside the authenticated phase. Confirmation follows UX decision D6: the sheet warns before tearing down only when logged work would be lost (`shouldConfirmSignOut`, which counts completed sets including warm-ups), and signs out immediately otherwise.

**Password reset added 2026-08-09** (`feature/v1-password-reset`), and it is **code-based, not link-based**. `requestPasswordReset(email)` wraps `resetPasswordForEmail` and deliberately passes **no `redirectTo`**: this flow does not use the emailed link. `confirmPasswordReset(email, token, newPassword)` then runs three server calls behind one function — `verifyOtp({ type: 'recovery' })` to exchange the emailed code for a session, `updateUser({ password })` to make the change, and `signOut()` to hand the session straight back.

The shape is forced rather than preferred, and the reasoning belongs here because it is the kind of thing that looks like an oversight later. The SDK's own contract is that reset is two steps — log in via the link, then update the password — and `updateUser` requires a signed-in user. The **return leg** of that link is deep-link capture, which this repository does not have: `detectSessionInUrl` is `false` and a repo-wide search finds no `expo-linking` import and no `Linking` listener in `app/` or `src/`. Reading six digits out of the email is therefore the only variant that completes, and it needs no redirect URL allow-listed on the project.

Two properties worth stating explicitly. The **OTP is user-supplied, transient and never stored** — it is typed in, sent once, and held in component state for the length of one submit; it is not a credential this app persists (I-4/I-5). And **reset changes a credential; it deletes and exports nothing.** The copy is constrained by test against implying otherwise, because "reset" and "sign out" are both phrases a worried person can read as erasure — I-10 is untouched and still open.

The sign-out step at the end is deliberate: `verifyOtp` leaves the app authenticated, and continuing into Today off the back of an emailed code is a surprising way to end a password reset, especially on a shared device. `sessionStore` suppresses auth-state events for the duration of the call (`passwordResetInFlight`), because without it the intervening `SIGNED_IN` would flip the phase, the route gate would redirect to Today, and the following `SIGNED_OUT` would bounce back to `/auth` — a visible flash through the home screen mid-reset.

Category: **resolved in the client.** What is *not* resolved, and must not be read into the above: **no code path in this repository has been executed against a live Supabase project.** The integration suite (`src/data/supabase/__tests__/sessionFlow.integration.test.ts`) is gated on `PRISM_INTEGRATION_SUPABASE_*` and skipped; no credentials were created. Sign-in has never obtained a real token here, and **whether the recovery email actually carries a six-digit code depends on an owner-side edit to the Supabase recovery template (`{{ .Token }}`) that this repository did not and cannot make.** Deep-link session capture still does not exist, and account deletion and export (I-10) remain absent — neither the Account surface nor the reset flow claims any of them.

**RLS status and evidence:** RLS is enabled on all 13 tables after S4. The full migration sequence is
applied by the disposable Postgres runner and 191 assertions cover ownership, write integrity,
deletion, seed visibility, local-day semantics and entitlements. Hosted production enforcement is
still an operational validation gate.

**Environment variable names (values never read or reproduced):** `EXPO_PUBLIC_DEMO_MODE`,
`EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`,
`EXPO_PUBLIC_REVENUECAT_IOS_KEY`, and `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY` (source:
`.env.example`). All are public build values, inlined into the client bundle by design. The Edge
Functions read `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
`REVENUECAT_WEBHOOK_AUTH`, `REVENUECAT_SECRET_API_KEY`, and `REVENUECAT_PROJECT_ID` from their server
environment as needed. The anon key and project id are identifiers/public configuration; the other
three are privileged server values. No value is committed or logged.

**Client/server trust boundaries:** The mobile client holds only public Supabase and RevenueCat SDK
keys. Training/account authorization relies on Postgres RLS. Entitlement writes are a separate
server-only path: RevenueCat calls an authenticated Edge Function, which uses the service role to call
the exact-product event RPC. The client can select its entitlement row but has no policy permitting
insert, update or delete. SDK state is therefore a transport hint, never access authority (I-9).

**Risks around user health/training data:** The schema stores body measurements
(`body_measurements.bodyweight_kg`, `body_fat_pct`, `circumferences_cm`) and check-ins
(sleep/energy/soreness/stress) — data a user might reasonably consider sensitive. Export and deletion
UI now exist and the privacy-policy draft inventories both Supabase and RevenueCat processing. The
remaining release risk is operational/legal: production migrations, deletion/export, owner
placeholders, processor terms and the published policy URL are not yet verified.

**Secrets, logging, dependency, or data-access concerns:**
- No `.env` file contents were read or reproduced by this audit, per instruction.
- No structured logging, log-scrubbing, or PII-redaction code was found — **unknown**, since no logging framework exists at all yet to audit.
- `npm audit` was not run (not in the approved non-mutating command list for this sprint and not requested); dependency vulnerability posture is **unknown**.
- The `SupabaseRepository.saveWorkout` non-atomic multi-step upsert (see Data Architecture) is a **likely risk** for partial writes rather than a security issue per se.

---

## Navigation and UI Architecture

**Route map** *(verified, file-based routing under `app/`)*:

| Route | File | Type |
|---|---|---|
| `auth` | `app/auth/index.tsx` | Stack screen — sign-in / sign-up, gestures disabled (added 2026-08-06, `feature/v1-auth-and-session`). There is nothing behind sign-in to return to. `app/onboarding/auth.tsx` is no longer a screen: it is a `<Redirect>` that resolves to `/auth` where accounts exist and to `/onboarding/steps` where they do not. |
| `account` | `app/account.tsx` | Modal — identity, sign out, export, account deletion, and the **Restore purchases** row Apple requires for a non-consumable. **Reached from Settings**, not from Today: the account control moved there when Settings landed, and the two sprints that changed this route each described the old entry point. |
| `settings` | `app/settings.tsx` | Modal — profile, units/bodyweight, training preferences, active plan, equipment, and the authenticated account entry. |
| `exercise` | `app/exercise.tsx` | Modal — create/edit a user-owned movement; delete only when no active or logged session references it. |
| `measurement` | `app/measurement.tsx` | Modal — add/edit/delete optional bodyweight, body-fat, and waist entries. |
| `paywall` | `app/paywall.tsx` | Modal — original Pro explanation, exact one-time product price, purchase, restore, and support-oriented outcomes. SDK success never grants access directly; the server entitlement does. |
| `(tabs)/index` | `app/(tabs)/index.tsx` | Tab — Today |
| `(tabs)/exercises` | `app/(tabs)/exercises.tsx` | Tab — exercise library, custom movement entry/edit. |
| `(tabs)/insights` | `app/(tabs)/insights.tsx` | Tab — Insights |
| `(tabs)/social` | `app/(tabs)/social.tsx` | Tab — Social |
| `(tabs)/plans` | `app/(tabs)/plans.tsx` | Tab — Plans |
| `(tabs)/progress` | `app/(tabs)/progress.tsx` | Hidden tab route — deeper progress surface reached from Insights/Today. |
| `(tabs)/body` | `app/(tabs)/body.tsx` | Hidden tab route — recovery plus user-entered measurements. |
| `workout/active` | `app/workout/active.tsx` | Stack screen, slide-from-bottom, gestures disabled |
| `workout/picker` | `app/workout/picker.tsx` | Modal |
| `workout/summary` | `app/workout/summary.tsx` | Stack screen. **Updated 2026-08-03:** now registered explicitly in `app/_layout.tsx` (no options, so no behavioural change), closing the file-convention-only routing noted here and in `Docs/sprints/2026-08-02-workout-logging-v1-planning.md` §2.5 |
| `workout/templates` | `app/workout/templates.tsx` | Modal — "Choose a workout" (added 2026-08-02, `workout-session-continuity-v1`) |
| `history` | `app/history/index.tsx` | Stack screen — completed-workout list (added 2026-08-03, `workout-history-v1`) |
| `history/[id]` | `app/history/[id].tsx` | Stack screen — read-only session detail (added 2026-08-03, `workout-history-v1`) |

**Primary navigation:** A five-tab bottom bar (`app/(tabs)/_layout.tsx`), each tab with both an icon and a visible text label, plus an `accessibilityLabel`. Workout screens sit outside the tab navigator at the root `Stack` level so they cover the tab bar during an active session (stated design intent in `app/_layout.tsx` comment, confirmed by the `Stack.Screen` registration).

**Screen responsibilities:** Today = readiness + scheduled session + week consistency (see Runtime Architecture §6 for its exact calculation chain). Progress/Body/Insights/Plans each render real, currently-computed data plus a `PhasePanel` describing what's still planned for that phase (verified per-screen reads above). Workout logger/picker/summary form the session-logging flow.

**Shared component/design-system status:** A token-based theme (`src/theme/tokens.ts`, `typography.ts`) is the sole source of colour, spacing, radius, and type — verified via consistent `color`/`space`/`radius`/`type` imports across every screen and component read. A primitive component library exists in `src/components/ui` (Button, Card, Chip, Screen, SectionHeader, StatBlock, ReadinessRing, ConsistencyStrip, LinearSpectrum, Stepper, PhasePanel, Text) — **verified present**, not exhaustively verified for API consistency across every consumer.

**Accessibility and responsive/platform considerations verifiable from code:**
- `accessibilityRole`/`accessibilityLabel` are present on interactive elements in every component file read (`Button.tsx`, `Chip.tsx`, `SetRow.tsx`, `ReadinessRing.tsx` — the latter uses `accessibilityRole="progressbar"` with a numeric label, matching the README's claim).
- `hitSlop` is used on visually small controls (`Chip.tsx`, `SetRow.tsx` stepper buttons) to reach a larger touch target — verified in code; the README's specific "≥44pt" claim was not independently measured by this audit (no visual/rendered test was performed).
- Tab bar items enforce `minHeight: 44` (`app/(tabs)/_layout.tsx` styles) — verified.
- `maxFontSizeMultiplier` (README's font-scaling claim) was **not found** in any of the component files read during this audit (`Text.tsx`, `Button.tsx`, `Card.tsx`, `SetRow.tsx`) — **discrepancy noted**: this is either implemented in a file not read in this pass, or the README claim is currently aspirational. Flagged as **unknown, needs confirmation** rather than asserted either way.
- No platform-specific accessibility code (VoiceOver/TalkBack-specific branches) beyond standard React Native accessibility props was found.

---

## Quality and Operational Readiness

**Per-branch evidence (2026-08-09), each measured on its own branch before integration** `[fact]`:

| Branch | `npm run verify` |
|---|---|
| `feature/v1-user-data-writes` | **543/543 tests, 35 suites**, TypeScript clean |
| `fix/v1-zero-data-surfaces` | **529/529 tests, 31 suites**, TypeScript clean |

New coverage on the first spans custom-exercise and measurement validation, settings/plan selection,
onboarding completion durability, demo persistence, Supabase ownership-shaped calls, training-store
post-persistence updates, and copy guardrails; on the second, UUID-backed and demo-backed key-lift
selection, evidence windows/thresholds/order, completed/non-future session boundaries, recovery
evidence, empty favourites/reset, and zero-data copy. The credential-gated integration lane found no
credentials and skipped. **Neither number is the post-merge figure** — the integrated result is
recorded in the integration delta below, because two independently green branches are not evidence
that their merge is green. App rendering still has no component-test framework, so every changed
screen remains unverified by test and needs the cold-start walkthrough
(`Docs/tester-readiness-runbook.md` §6).

**Existing test suites and what they cover (original, 2026-07-25):** One suite, `src/domain/calc/__tests__/calc.test.ts` (434 lines, 40 tests), covering: Epley 1RM (including rep cap and inversion), training volume (warm-up exclusion, incomplete-set exclusion), PR detection (both `e1rm` and `weight` kinds, extrapolation guard), recovery estimate (monotonicity, clamping, status bands), all five next-load-recommendation branches (deload/hold/increase×2/establish, rounding-cancellation guard), readiness score (bounds, weight-sum, ISO-week boundaries), and the demo seed generator (determinism, 8-week coverage, no future dates). **No tests exist** for `src/data` (repository, mappers), `src/store` (Zustand stores), any file under `app/`, or any file under `src/components`.

**Current test suites (2026-08-06): 24 suites, 375 tests, all hermetic (`npx jest --ci`).** The
per-suite inventory immediately below was written at **9 suites / 103 tests (2026-08-01)** and is kept
as the description of those suites; it is not a current count. Added since it: the auth/session,
sign-out and password-reset suites (2026-08-06 → 2026-08-09), and this sprint's draft-write-ordering
and `completeWorkout` cases. Separately, `supabase/tests/rls/` holds **88 SQL assertions** (57 RLS
isolation + 31 write integrity) which are *not* part of `npx jest` — they need a live Postgres and are
run via `supabase/tests/rls/run.sh`. Added since the
original review: `src/data/supabase/__tests__/secureStorage.test.ts` and `sessionFlow.test.ts` (Keychain
session storage, real-client session-storage contract), `src/utils/__tests__/id.test.ts` (CSPRNG id
generation), `src/domain/__tests__/authValidation.test.ts` (presentation-only credential validation),
`src/data/__tests__/repository.test.ts` and `ownership.test.ts` (check-in partial-submission semantics,
server-derived write ownership), `src/store/__tests__/trainingStore.test.ts` and
`activeWorkoutStore.test.ts` (readiness confidence states, the finish()-must-not-discard-on-failure
regression guard). A separate, non-hermetic integration lane exists (`npm run test:integration`,
`*.integration.test.ts`, excluded from the default run) and skips unless
`PRISM_INTEGRATION_SUPABASE_URL`/`..._ANON_KEY` are set — it holds `it.todo` placeholders for
server-issued-session round-trip, refresh-token rotation, server-side sign-out, and RLS rejecting a
forged `profile_id`, none of which are implemented yet (no CI job or local environment currently
exercises this lane). `src/data` (repository) and `src/store` now have coverage; `app/` and
`src/components` still do not — no component-test framework exists (a deliberate choice, recorded in
`Docs/sprints/2026-07-27-readiness-inputs-and-confidence-foundation.md` Decision 6).
Separately, `supabase/tests/rls/` (57 pgTAP-style SQL assertions, not Jest) verifies RLS policy
enforcement directly against Postgres — see G-3 below.

**Current test suites (2026-08-06): 20 suites, 287 tests, all hermetic (`npm test`), typecheck clean.**
This supersedes the "177 tests, 14 suites" figure recorded in the 2026-08-04 delta above. Added by
`feature/v1-auth-and-session`:

| Suite | Covers |
|---|---|
| `src/domain/__tests__/authErrors.test.ts` | Failure-code mapping; network is preferred over the status-code branches, so a dropped connection is never reported as a rejected password; unrecognised shapes map to `unknown` and never pass a raw message through |
| `src/domain/__tests__/routing.test.ts` | The route gate's full truth table across onboarding flag × phase × segment, both loop guards, and a stability property asserting that re-running the gate against its own result never redirects again |
| `src/store/__tests__/sessionStore.test.ts` | Restore paths; a half-written session resolving to `'unauthenticated'` rather than an error; `SIGNED_OUT` → `sessionExpired`; idempotent initialise/subscribe; sign-up not authenticating under email confirmation; demo constructing no client |
| `src/store/__tests__/authActions.test.ts` | Sign-out teardown, including an assertion that the store is already empty at the moment the phase flips; the onboarding flag surviving as a deliberate exception; draft-ownership discard; auth-vs-data error routing |
| `src/content/__tests__/authCopy.test.ts` | Copy as policy — no account-enumeration wording, no environment-variable or internal identifier on any auth surface, no diagnostic/clinical language (I-8), and D2's reversal being complete rather than partial |
| `src/data/__tests__/authPosture.test.ts` | Demo, misconfigured and configured startup, each re-importing the module graph under a different environment; includes that the misconfigured build still throws `SUPABASE_MISCONFIGURED_MESSAGE` and is not intercepted by the auth gate |

`src/data/__tests__/ownership.test.ts` was updated from `getUser` to `getSession` with no change to what
it asserts.

**Current test suites (2026-08-08): 22 suites, 312 tests**, typecheck clean. Added by
`feature/v1-signout-surface`:

| Suite | Covers |
|---|---|
| `src/domain/__tests__/account.test.ts` | `canOfferSignOut` across the full phase × `authEnabled` matrix, including the impossible-but-guarded case; `shouldConfirmSignOut` for no session, an untouched session, one logged set, a completed warm-up, a second exercise, and an empty session; `countCompletedSets` agreeing with the predicate that the confirmation copy quotes |
| `src/content/__tests__/accountCopy.test.ts` | No environment variable or internal identifier; no diagnostic/clinical language (I-8); **never promises deletion or export** (I-10 is open); the explanation covers both sides of the device boundary; the confirmation names the count and the session; pluralisation |

`authActions.test.ts`, `sessionStore.test.ts` and `authPosture.test.ts` were each extended — teardown
against a session with logged sets, identity (`userId` *and* `email`) cleared on sign-out, the control
unable to survive its own action, and demo/misconfigured builds offering no control while the
misconfiguration message stays primary.

**Current test suites (2026-08-09): 24 suites, 367 tests**, typecheck clean. Added by
`feature/v1-password-reset`:

| Suite | Covers |
|---|---|
| `src/domain/__tests__/authReset.test.ts` | The stage machine, including that a **failed code returns to the code form rather than the start** (a mistyped digit should cost a correction, not a whole new email); `startOver` from any stage; every stage × event pair returning a known stage rather than throwing; code shape; the new password held to the same `PASSWORD_MIN_LENGTH` as sign-up, imported rather than retyped |
| `src/data/__tests__/authReset.test.ts` | A call log pinning the order `verifyOtp → updateUser → signOut`; that no `redirectTo` is passed; that `updateUser` never runs on a rejected code; that raw Supabase errors are thrown for the domain layer to map rather than formatted here |

`authErrors.test.ts`, `sessionStore.test.ts` and `authCopy.test.ts` were extended — the context-sensitive
4xx mapping (a wrong code and an expired code deliberately reaching the *same* value), the reset ending
`'unauthenticated'` with `resolveInitialRoute` never pointing at Today, the suppression flag clearing on
both success and throw, and the copy reporting the same outcome whether or not the address has an account.

**Still uncovered, and unchanged by either sprint:** `app/` and `src/components` have no rendering
coverage — the auth screen's states, Today's header control, the Account modal's presentation, and the
`Alert` itself are not tested, nor is the gate as actually executed by Expo Router. That is why both the
routing decision and the sign-out visibility rule were extracted into pure functions.

**Commands run and exact outcomes (2026-07-25 original review, commit `2490c8d`):**

| Command | Result |
|---|---|
| `npm run` | Lists scripts: `start`, `android`, `ios`, `web`, `typecheck`, `test`, `fix-deps` |
| `npm run typecheck` (`tsc --noEmit`) | **Passed**, zero output, zero errors |
| `npm test -- --ci` (`jest --ci`) | **Passed** — 1 suite, 40/40 tests passed, 1.432s |
| `npx expo-doctor` | **Passed** — "20/20 checks passed. No issues detected!" |
| `git log --oneline --decorate -20` | 14 commits shown, linear history culminating in "restore: return to Expo SDK 57 baseline" and two merge commits into `main` |

**Commands re-run and exact outcomes (2026-08-01, current baseline):**

| Command | Result |
|---|---|
| `npm run typecheck` (`tsc --noEmit`) | **Passed**, zero output |
| `npm test -- --ci` (`jest --ci`) | **Passed** — 9 suites, 103/103 tests |
| `npx expo-doctor` | **Passed** — 20/20 (was 19/20 mid-session before `Docs/sprints/2026-08-01-dependency-hygiene.md` fixed a 7-package version drift) |
| `npm audit` | 11 moderate findings remain, confirmed unfixable without a major Expo downgrade — see G-10 |
| `npx expo export --platform ios` | **Passed** — single iOS bundle, 5.1 MB |

**Lint status:** No lint script exists in `package.json` (no `eslint`, no `.eslintrc*` file found in the repository root). **Not run because it does not exist**, not because it was skipped.

**CI coverage:** `.github/workflows/ci.yml` runs on push/PR to `main` as two parallel jobs: `verify` (checkout → Node 20 setup → `npm ci` → `npm run typecheck` → `npm test -- --ci`) and, **added 2026-08-04** (PR #31, `Docs/sprints/2026-08-04-supabase-rls-ci.md`), `rls` (checkout → install `postgresql-client-16` → run `supabase/tests/rls/run.sh` against a disposable `postgres:16` GitHub Actions service container). Both were observed green on the merging PR. Still no build step, no lint step (matching the absence noted above), no E2E test, no artifact publishing, and no real Supabase project is touched by either job — the `rls` job is a plain, ephemeral Postgres instance, not a linked hosted project.

**Observability, analytics, crash reporting, backups, release tooling, EAS status:**
- **Crash reporting:** Implemented on `feature/v1-observability` with Sentry, a root render boundary,
  six handled-error call sites, Expo/Metro integration, and deterministic privacy-policy tests.
  External release delivery and source-map symbolication are not yet verified.
- **Analytics:** Absent — no analytics SDK found.
- **Logging:** Local console warnings remain; handled failures route through one crash-reporting
  boundary. No general remote logging pipeline exists.
- **Backups:** Not applicable to this repository — Supabase-managed Postgres backup policy would be a Supabase-project-level configuration, not something this repo controls or documents.
- **Release tooling** *(superseded 2026-08-09; the original text said "Absent — no `eas.json`, no `eas-cli` in dependencies")*: `eas.json` is committed with three build profiles, `cli.appVersionSource: "remote"`, and a `submit.production` block configuring the Android submitter to the `internal` track as a draft. `app.json` `version` is **1.0.0**. Procedure: `Docs/store-submission-runbook.md`.
- **EAS status** *(superseded 2026-08-09)*: configured, with an EAS project id in `app.json` and a preview build produced end to end on 2026-08-09. `ios/` and `android/` remain git-ignored and generated by `expo prebuild` — a continuous-native-generation setup, which is why `expo-secure-store`, `@sentry/react-native` and `react-native-purchases` all integrate as config plugins rather than as hand-edited native projects. **No `production` build and no store submission has been run.**

---

## Known Gaps and Risks

Updated 2026-08-01. Closed/resolved gaps are kept in the table, struck through, rather than deleted —
per `Docs/invariants.md` I-15, a document's history of what was found and fixed is itself evidence.

| ID | Severity | Category | Evidence | User/business impact | Recommended next action | Requires product decision? |
|---|---|---|---|---|---|---|
| ~~G-1~~ | ~~High~~ | ~~Auth~~ | **Resolved in the client 2026-08-06** (`feature/v1-auth-and-session`). A full auth path exists: `src/store/sessionStore.ts` (four-phase machine, `onAuthStateChange` subscription), `src/store/authActions.ts` (ordered sign-out teardown), `src/data/authRequired.ts` (`AuthRequiredError`), `src/data/supabase/auth.ts` (the sole caller of Supabase's auth API), `src/domain/routing.ts` (the pure route gate), and `app/auth/index.tsx` (the real sign-in/sign-up surface). `uid()` now reads `getSession()` and throws `AuthRequiredError`, which `trainingStore.refresh()` routes to sign-in instead of to `ScreenState`. **Sign-out made reachable 2026-08-08** (`feature/v1-signout-surface`): `src/domain/account.ts` (`canOfferSignOut`, `shouldConfirmSignOut`), `src/content/account.ts`, `app/account.tsx`, and Today's `headerRight` control. **Password reset added 2026-08-09** (`feature/v1-password-reset`): `src/domain/authReset.ts`, `requestPasswordReset`/`confirmPasswordReset` in `src/data/supabase/auth.ts`, and a reset mode inside `app/auth/index.tsx` — code-based, since deep-link capture does not exist. The client-side account lifecycle is now complete: sign up, sign in, sign out, recover. Evidence: 367/367 across 24 suites. **One limit remains, stated rather than implied:** nothing here has run against a live Supabase project — the integration lane is credential-gated and skipped — and reset additionally depends on an owner-side recovery-template edit. | Production mode is now reachable by a real user in code, and a real user can sign in, sign out and recover a lost password; whether any of it works end to end against a real project is unverified | Exercise the `preview` profile against a real project once the owner creates its EAS variables, applies the migrations, and adds `{{ .Token }}` to the recovery template | No |
| G-2 | ~~High~~ **Closed** | Data integrity | **Resolved 2026-08-06** (`feature/v1-workout-write-integrity`). The three sequential non-transactional upserts are gone; `SupabaseRepository.saveWorkout`/`completeWorkout` call `save_workout_graph` (migration `0003`), one `security invoker` transaction. Three defects were closed, not one: non-atomicity, additive-only writes that never deleted removed children, and duplicate personal records on retry. | Was: a failure mid-save could leave a workout with missing exercises/sets, against a real account's training history. Now: the save either lands whole or not at all, a retry is a no-op, and a cross-tenant id is rejected with `42501` rather than silently doing nothing. | Done — verified by `supabase/tests/rls/03_run_write_integrity_tests.sql`, 31/31 against local Postgres 16.14. **Not yet applied to the real Supabase project** (see G-4). | No |
| ~~G-3~~ | ~~High~~ | ~~Verification gap~~ | **Resolved 2026-08-01, CI-wiring closed 2026-08-04.** `supabase/tests/rls/` (57 assertions) runs against the actual, corrected `0001_init.sql`/`0002_security_hardening.sql` on a disposable local Postgres instance and passes; a prior blocking DDL defect (non-immutable index expression) was found and fixed first. **The "wire into CI" recommendation this row used to carry is now done** — PR #31 added an `rls` job to `.github/workflows/ci.yml` running the suite against a disposable `postgres:16` service container on every push/PR to `main`, observed green (`Docs/sprints/2026-08-04-supabase-rls-ci.md`). | RLS correctness is now demonstrated, not just written, and a regression in `supabase/migrations/*.sql` now fails CI | — | No |
| G-4 | Medium | Observability | **Partially resolved on `feature/v1-observability`.** Privacy-filtered Sentry crash reporting covers root render failures and the six existing handled-error sites. Product analytics is deliberately absent. A release/non-demo test event and source-map symbolication have not been exercised because no DSN/upload credentials were added to this branch. | Code now has a diagnosable failure path, but the external delivery path is unproved until a release artifact sends and symbolicates one test failure | Configure owner-controlled Sentry/EAS values, send one release test event on each platform, confirm symbolication and privacy fields, then close the crash-reporting half | Yes |
| ~~G-5~~ | ~~Medium~~ | ~~Error handling~~ | **Resolved.** All seven data-driven screens (`Today`, `Exercises`, `Insights`, `Social`, `Plans`, `Progress`, `Body`) now share `src/components/ui/ScreenState.tsx` and branch on `trainingStore.status` (`2026-07-30-ui-ux-product-polish.md`). Four of seven were individually photographed in their error state; three (Plans, Social, and one of Progress/Body) were wired identically and typecheck-covered but not individually screenshotted — see `Docs/readiness/2026-07-31-closure-inventory.md` item B2. | A load failure now shows an honest error state with retry, not stale/empty data | Photograph the remaining screens' error states (low-cost follow-up) | No |
| ~~G-6~~ | ~~Medium~~ | ~~Dependency hygiene~~ | **Resolved 2026-08-01.** `react-hook-form`, `zod`, `@hookform/resolvers` removed — confirmed zero imports before removal (`Docs/sprints/2026-08-01-dependency-hygiene.md`). | — | — | — |
| G-7 | Low | Release tooling | **Partially resolved 2026-08-06.** `eas.json` (development/preview/production, `appVersionSource: remote`) and an EAS project id in `app.json` are committed; `npx eas config --platform ios --profile production` resolves cleanly; each profile now sets `EXPO_PUBLIC_DEMO_MODE` explicitly. **No build has been run**, `submit.production` is empty, and the production EAS environment still has no Supabase variables — so a production build today hits the misconfigured path by design rather than shipping demo silently (`Docs/production-posture-v1.md` §4–§5). **Updated 2026-08-06 (auth sprint):** the `preview` flip from demo to real is now unblocked *in code* — G-1 no longer stands in its way — but it remains blocked on three things outside this repository, two of them owner-only: EAS environment variables for the `preview` environment (§4 currently documents only `production`), the migrations actually applied to the real project, and the project's email-confirmation setting. | A cloud build path exists on paper; whether it produces a working artifact is unverified. The auth blocker is gone, so this is now the nearest gate to a testable release | Create the EAS env vars for `preview` **and** `production`, confirm migrations are applied, then prove the `preview` profile with one build | Yes |
| ~~G-8~~ | ~~Low~~ | ~~Accessibility (unconfirmed)~~ | **Resolved.** `maxFontSizeMultiplier` is implemented — confirmed in `src/components/ui/Text.tsx:41` (1.6×) plus `SearchField.tsx`, `Input.tsx` (1.4× each; `Stepper.tsx` also had it before its 2026-08-01 removal as dead code). The original discrepancy was this document not having read those files, not an implementation gap. | — | — | — |
| G-9 | Low | Offline handling | No network-state detection code found (`NetInfo` or equivalent). **Precondition met 2026-08-06:** this row's recommended action was gated on "once production mode has an auth path", and that path now exists, so the item is actionable rather than blocked. | Behavior of the Supabase path when offline is unverified. One narrow case is now handled: `signOutAndTearDown` completes local teardown even when the server sign-out fails, so an offline sign-out cannot leave a lifter signed in on a shared device | Add offline detection/handling; its own branch, and out of v1 UX scope per `Docs/ui-ux-foundation-v1.md` §7 | No |
| G-10 | Low | Dependency vulnerabilities | **Rechecked 2026-08-09 on S4:** `npm audit --omit=dev` reports **26 findings (18 high, 8 moderate)** across transitive Expo/Metro/React Native paths (`brace-expansion`, `image-size`, `js-yaml`, `nanoid`, `uuid`). Some advisory fixes are offered by `npm audit fix`; others require forced breaking Expo/React Native changes. No fix was run because dependency upgrades beyond the approved RevenueCat addition are outside this sprint. This supersedes the older 11-moderate count. | These are dependency-tree advisories, not evidence of an exploitable PRism path; their runtime/build-time reach and safe compatible resolutions have not been assessed, so the risk cannot honestly be called build-tooling-only anymore | Open a dedicated dependency-hygiene sprint, review each path and compatible patch, then re-run Expo Doctor, exports and the full suite; do not use `--force` blindly | No |
| G-11 | High | Monetization operations | S4 implements fail-closed entitlements and processor-aware account deletion in source, but the exact Apple/Google products, dedicated RevenueCat project/entitlement/offering, custom-ID restore behavior, webhook plan/configuration, server secrets, hosted migration/functions, public SDK keys, and sandbox purchase/restore/refund/transfer/delete have not been configured or exercised. | A missing public key disables purchase; a missing/misrouted webhook can take payment while access remains locked; a drifted product cannot be sold; missing customer-deletion configuration blocks account deletion by design. | Complete `Docs/revenuecat-release-runbook.md` against staging/sandbox, preserve evidence, then repeat the verified configuration for production before submission. | Yes |
| G-12 | Medium | Expo SDK patch drift | `npx expo-doctor` on the integrated branch: **19/20**, failing only "packages match versions required by installed Expo SDK" — `expo`, `expo-asset`, `expo-constants`, `expo-linking` and `expo-router` are each one patch behind SDK 57's expectation. | `expo-doctor` is a documented pre-release-build gate (`Docs/release-checklist.md` §1), so this blocks a clean release build rather than the app itself | `npm run fix-deps` (`expo install --fix`), then re-run `npm run verify` and `expo-doctor`. A dependency change, so it needs owner approval per `CLAUDE.md` | Yes |

---

## Recommended Documentation Sequence

Recommended, not created, in dependency order:

1. **`Docs/invariants.md`** — Purpose: capture the "rules that must not break" implied by the code today (e.g. "weights are always stored in kg," "`src/domain` never imports from `app/`/`src/components`/`src/data`," "demo and Supabase repositories must stay contract-identical"). Audience: engineers making any future change. Resolves: currently these rules exist only as comments and README prose with no enforcement — this document would make them explicit and checkable.
2. **`AGENTS.md` or `CLAUDE.md`** — Purpose: operating instructions for AI coding agents working in this repo (build/test commands, the read-only-by-default posture demonstrated in this sprint, the demo/Supabase toggle, what not to touch). Audience: AI agents and new contributors. Resolves: prevents repeat rediscovery of the facts gathered in this audit.
3. **`Docs/product-intent.md`** — Purpose: record the product's target user, phased roadmap (already partially captured in the README's "Phased plan"), and the explicit non-goals relative to comparable products. Audience: product/design/eng alignment. Resolves: the ambiguity between "what's built" (this document) and "what PRism is trying to become."
4. **`Docs/data-model.md`** — Purpose: a dedicated entity-relationship reference expanding on this document's Data Architecture section, including field-level semantics not fully captured here (e.g. every enum's meaning, every `MUSCLE_CONTRIBUTION` weighting). Audience: anyone writing queries, migrations, or new calc-engine logic. Resolves: G-2 and G-3's context — a shared reference before touching schema or write paths.
5. **`Docs/security-and-privacy.md`** — Purpose: a dedicated deep-dive on the auth gap (G-1), RLS verification plan (G-3), and a privacy stance on health/training data (from Security and Privacy Posture above). Audience: eng + whoever owns compliance/privacy decisions. Resolves: turns "likely risk" and "unknown requiring validation" items into decided policy.
6. **`Docs/testing-and-release.md`** — Purpose: document the current test/CI boundary (calc-engine-only) and lay out what a release process would require (EAS config, lint, RLS tests, E2E). Audience: eng. Resolves: G-3, G-4, G-7's shared "we have no path to a verified release" gap.
7. **`Docs/adr/` directory and first ADR candidates** — Purpose: record *why* key decisions were made where the reasoning isn't self-evident from code — e.g. "why upsert instead of a transactional RPC for `saveWorkout`" (relates to G-2), "why demo mode is the default and Supabase is opt-in," "why native `ios/`/`android/` are regenerated rather than committed." Audience: future eng making changes that might otherwise reverse a deliberate choice. Resolves: prevents relitigating settled trade-offs without the original context.

---

## Glossary

- **Demo mode** — The default runtime mode (`EXPO_PUBLIC_DEMO_MODE=true`) in which the app runs entirely on deterministic, locally generated seed data with no network calls. Source: `src/data/demoSeed.ts`, `src/data/repository.ts`.
- **Repository** — The `Repository` TypeScript interface (`src/data/repository.ts`) that abstracts data access; implemented by `DemoRepository` and `SupabaseRepository`.
- **e1RM (estimated one-rep max)** — Computed via the Epley formula (`weight × (1 + reps/30)`, reps capped at 12). Source: `src/domain/calc/oneRepMax.ts`.
- **Effective sets** — Volume/set credit split across muscles a movement trains: 100% to primary movers, a reduced share to synergists (`MUSCLE_CONTRIBUTION.secondary` in `src/domain/muscles.ts`). Source: `src/domain/calc/volume.ts`.
- **Readiness score** — A 0–100 composite of four weighted factors (recovery 40%, workload 25%, wellbeing/check-in 25%, consistency 10%). Source: `src/domain/calc/readiness.ts`.
- **Acute:chronic ratio** — Last-7-days training volume divided by the 28-day weekly average volume; used as the "workload" readiness factor. Source: `src/domain/calc/readiness.ts` (`workloadFactor`).
- **RoutineDay / Routine** — A training plan (`Routine`) made of ordered days (`RoutineDay`), each with target exercises, sets, reps, RPE, and rest. Source: `src/domain/types.ts`, `supabase/migrations/0001_init.sql`.
- **Active workout** — A session in progress, held in `activeWorkoutStore`. Mirrored to a local recoverable draft on every mutation, and sent to the repository only on `finish()` — see the two persistence layers under §Responsibilities. **Corrected 2026-08-06**: this entry called it "genuinely ephemeral ... not persisted until `finish()`", which was true when written and has not been since. Source: `src/store/activeWorkoutStore.ts`.
- **PhasePanel** — A UI component shown on partially-built tabs (Progress, Body, Insights, Plans) that states what is already computed versus what is still planned for that phase. Source: `src/components/ui/PhasePanel.tsx`.
- **Spectrum 4 / Prism 3** — The two original template training plans seeded into the app. Source: `src/data/routineTemplates.ts`.
