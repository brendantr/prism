# Sprint: v1 user-data writes

## 1. Document status

- **Date:** 2026-08-09
- **Branch:** `feature/v1-user-data-writes`, based on `main` at `6d8e4d9`.
- **Owner:** Engineer/owner.
- **Status:** Implementation complete; ready for cold-start owner verification and integration review.
  This record was reconstructed after the prior agent session ended before producing a handoff.
- **Labelling:** `[fact]` / `[decision]` / `[assumption]` / `[open question]`, per I-15.

## 2. Approved scope

`[decision, engineer/owner]` Make the already-present user-owned schema reachable from the client:

- Create, edit, and delete custom exercises in both repository implementations and the UI.
- Save and delete body measurements.
- Edit profile preferences in a new Settings modal: display name, units, bodyweight, training days,
  preferred weekdays, goal, experience, available equipment, and active plan.
- Apply onboarding answers to the real profile instead of discarding them.
- Preserve demo/Supabase behavioural parity and explain an attempted deletion of an in-use exercise.
- Add deterministic domain, repository, store, and copy tests. Validate with `npm run verify` and the
  credential-gated integration lane where available.

No migration or RLS change is approved or expected for this sprint. The tables and policies needed for
exercise, profile, measurement, and owned-routine writes already exist.

## 3. Branch-first recovery note

`[fact]` The preceding agent created this branch and worktree and left uncommitted partial changes, but
did not create the sprint record required by `Docs/agents.md`. The main checkout remained clean. This
record is the first continuation edit and makes the branch's existing scope auditable before further
implementation.

`[fact]` `CLAUDE.md` still says G-2 is open and readiness is unimplemented. Those claims conflict with
the later evidence in `Docs/architecture.md` and `Docs/invariants.md` (G-2/I-2 closed; readiness inputs
and honesty partially implemented). This sprint does not edit or rely on either stale claim.

## 4. Data and authorization boundaries

- Ownership is derived from the active Supabase session, never from a caller-supplied profile id (I-6).
- System exercises (`profile_id is null`) remain read-only. Edit/delete controls appear only for the
  lifter's custom rows.
- The foreign keys changed by migration `0007` remain non-cascading. Deleting an exercise referenced by
  logged history must fail clearly; it must never erase the history.
- Measurements and profile values are user-entered data, not medical assessments or diagnoses (I-7,
  I-8).
- No credential, external service, production setting, schema, or RLS policy changes in this sprint.

## 5. Routine-selection finding

`[fact]` Both routines currently shipped by migration `0006` are shared template rows with
`profile_id is null`. Their `is_active` column therefore cannot represent a per-user choice: changing it
would change the shared row, and the existing RLS policy correctly refuses the write.

`[decision within the approved profile-settings scope]` A shared-template choice is persisted through
the user's profile fields that already describe the same choice: `training_days_per_week` and, when all
days are pinned, `preferred_weekdays`. `getActiveRoutine()` resolves an owned active routine first, then
an owned routine, then the shared template matching the profile's training-day target. If user-owned
routine creation becomes reachable later, `setActiveRoutine()` can use the existing `is_active` column
for those owned rows.

This avoids a migration, preserves RLS, and removes the existing accidental alphabetical fallback to
"Prism 3".

`[fact]` Saving Settings can touch the profile and, for a user-owned routine, the routine flag in two
recoverable statements because no approved RPC spans those tables. If the latter statement fails, the
screen says that some changes may already be saved and tells the lifter to reopen and retry; it never
claims the whole form rolled back. The currently shipped shared-template path is one profile write.

## 6. Deliverables

- Repository contract and demo/Supabase implementations for exercise and measurement writes.
- Domain validation/selection helpers and typed, reviewed user-facing copy.
- Training-store actions that update the read model only after persistence succeeds.
- Settings, measurement, and custom-exercise routes and entry points.
- Onboarding-to-profile handoff.
- Tests covering validation, ownership-shaped repository calls, storage parity, failure behaviour, and
  copy guardrails.

## 7. Validation plan

- `npm run verify` — typecheck and hermetic Jest suite.
- `npm run test:integration` — record pass/skip honestly; no credential values are printed.
- Cold-start device verification is required after this branch lands because it changes onboarding,
  routing entry points, forms, and repository behaviour. A hot-reloaded render is not evidence.

## 8. Out of scope

- Routine creation/editing, custom plan builders, or new schema for explicit template selection.
- Observability, monetization, paywall gating, release configuration, builds, or store submission.
- Dependency upgrades or native project regeneration.
- Any automatic readiness or workout adjustment.

## 9. Handoff status

### Changed files

- `Docs/architecture.md`
- `Docs/sprints/2026-08-09-v1-user-data-writes.md`
- `app/(tabs)/body.tsx`
- `app/(tabs)/exercises.tsx`
- `app/(tabs)/index.tsx`
- `app/_layout.tsx`
- `app/exercise.tsx`
- `app/measurement.tsx`
- `app/onboarding/complete.tsx`
- `app/onboarding/steps.tsx`
- `app/settings.tsx`
- `app/workout/picker.tsx`
- `src/content/__tests__/onboarding.test.ts`
- `src/content/__tests__/userDataCopy.test.ts`
- `src/content/account.ts`
- `src/content/onboarding.ts`
- `src/content/userData.ts`
- `src/data/__tests__/repository.test.ts`
- `src/data/__tests__/userWritesOwnership.test.ts`
- `src/data/repository.ts`
- `src/data/repositoryErrors.ts`
- `src/data/routineTemplates.ts`
- `src/data/supabase/__tests__/repository.integration.test.ts`
- `src/data/supabase/mappers.ts`
- `src/domain/__tests__/customExercise.test.ts`
- `src/domain/__tests__/measurements.test.ts`
- `src/domain/__tests__/schedule.test.ts`
- `src/domain/__tests__/settings.test.ts`
- `src/domain/customExercise.ts`
- `src/domain/measurements.ts`
- `src/domain/settings.ts`
- `src/domain/types.ts`
- `src/store/__tests__/onboardingStore.test.ts`
- `src/store/__tests__/trainingStore.test.ts`
- `src/store/onboardingStore.ts`
- `src/store/trainingStore.ts`

### Commands run and actual results

- `git diff --check` — passed, no whitespace errors.
- `npm run typecheck` — passed, zero TypeScript errors (run during implementation before the full
  lane).
- `npx jest src/data/__tests__/repository.test.ts src/store/__tests__/onboardingStore.test.ts
  src/content/__tests__/userDataCopy.test.ts --runInBand` — passed, **31/31 across 3 suites**.
- `npm run verify` — passed: TypeScript clean; **543/543 tests across 35 suites**, zero failures.
  Jest emitted a worker-force-exit cleanup warning after the green run.
- Final `npm run typecheck` after the navigation-review edit — passed, zero TypeScript errors.
- `npx jest src/store/__tests__/onboardingStore.test.ts src/content/__tests__/onboarding.test.ts
  src/domain/__tests__/settings.test.ts --runInBand` after that edit — passed, **27/27 across 3
  suites**.
- `npm run test:integration` — valid credential gate, **23/23 skipped across 2 suites** because this
  Codex environment did not expose the staging variable names the harness requires. No hosted project
  was read or changed.
- `npx expo export --platform ios` — Metro started and reported no module/route error, but did not
  complete after several bounded waits. The process was interrupted; this is **not** a passed export.

### Validation results

Verified: domain validation and normalization; demo persistence/relaunch/tombstone behaviour; ownership-
shaped Supabase calls; training-store state changes only after durable writes; onboarding completion
state staying closed on a rejected local persistence write; copy guardrails; full hermetic regression
suite; clean TypeScript and diff whitespace.

Not verified: real PostgREST execution of the new write methods (credential-gated lane skipped), a
completed Expo export, or any screen/layout/interaction on a cold-started device. The repository has no
component-rendering test framework, so the actual forms and router transitions require the documented
walkthrough.

### Unresolved risks

- Shared plan choice remains encoded by `training_days_per_week`/pinned weekdays because the shipped
  routines are global rows. A future requirement to distinguish two shared plans with the same weekly
  target needs a schema/product decision.
- Settings can make a profile write plus an owned-routine activation. Those statements are retryable
  and the copy admits possible partial progress, but are not one transaction.
- Jest still reports one worker that needs force-exit after the otherwise-green hermetic lane.
- The incomplete iOS export and absent cold-start walkthrough mean this branch has no current rendered
  evidence.

### Exact next owner decision

**After running the cold-start walkthrough against staging, should this branch be accepted for the
release integration chain, or returned with a specific observed defect?**
