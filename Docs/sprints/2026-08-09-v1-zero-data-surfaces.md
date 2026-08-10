# Sprint: v1 zero-data surfaces

## 1. Document status

- **Date:** 2026-08-09
- **Branch:** `fix/v1-zero-data-surfaces`, based on `main` at `6d8e4d9`.
- **Owner:** Engineer/owner.
- **Status:** Implementation complete; ready for cold-start owner verification and integration review.
  Reconstructed after the prior agent session ended before handoff.
- **Labelling:** `[fact]` / `[decision]` / `[assumption]` / `[open question]`, per I-15.

## 2. Approved scope

`[decision, engineer/owner]` Correct four zero-data/real-account defects before the analysis surfaces
are monetized:

- Derive Progress key lifts from movements in the account's actual completed history, never from the
  bundled demo catalogue's fixed ids.
- Give Body a real no-history state instead of sixteen unsupported 100%/fresh rows.
- Make Insights and Progress empty states reachable by branching on zero completed workouts.
- Start `favouriteExerciseIds` empty because the previous seeded ids exist only in demo mode and match
  no UUID-backed production movements.

No repository, schema, RLS, entitlement, dependency, or native-project change is approved here.

## 3. Branch-first recovery note

`[fact]` The preceding agent created this branch/worktree and left uncommitted partial changes without
the sprint record required by `Docs/agents.md`. `main` remained clean. This record restores the audit
trail before the continuation changes or validates that work.

## 4. Findings and decisions

- `[fact]` `app/(tabs)/progress.tsx` used four `EXERCISE_LIBRARY` slug ids, while migration `0006`
  deliberately assigns hosted system movements UUIDs with `gen_random_uuid()`. Exact-id matching made
  the Key lifts panel permanently empty for real accounts.
- `[decision within approved scope]` A key lift is a movement repeated in at least two completed
  sessions inside the last eight weeks. Up to four are shown, ordered by session count, recent
  estimated 1RM, then name. Compound/isolation is not inferred because the domain model has no such
  metadata.
- `[fact]` `estimateRecovery` intentionally returns a value for every muscle, using fresh/100% when a
  muscle has no stimulus. That remains useful inside calculations; the Body renderer separately asks
  whether any row has a real stimulus before presenting the estimate.
- `[fact]` The prior Insights/Progress guards collapsed to missing-profile checks, which are errors in
  a ready store rather than valid new-account emptiness. Finished-session count is the actual evidence
  boundary.

## 5. Deliverables

- Pure, deterministic key-lift selection and tests for UUID ids, windows, thresholds, ordering, and
  missing exercise metadata.
- A recovery-evidence predicate without changing the recovery model's numeric contract.
- Reviewed central copy and copy-policy tests for Insights, Progress, Body, and the key-lifts panel.
- Reachable, actionable empty states on all three screens.
- Empty default favourites with store-reset coverage.

## 6. Validation plan

- `npm run verify` — typecheck and full hermetic Jest suite.
- `git diff --check` — whitespace integrity.
- Cold-start rendering on a real zero-data account remains required because `app/` has no component
  test framework and hot reload is not accepted as UI evidence.

## 7. Out of scope

- Adding data writers, changing the recovery/readiness algorithm, entitlements/paywalls, observability,
  release configuration, schema/RLS, or hosted resources.
- Choosing lifts by a new semantic classification not represented in `Exercise`.

## 8. Handoff status

### Changed files

- `Docs/architecture.md`
- `Docs/sprints/2026-08-09-v1-zero-data-surfaces.md`
- `app/(tabs)/body.tsx`
- `app/(tabs)/insights.tsx`
- `app/(tabs)/progress.tsx`
- `src/content/__tests__/zeroDataCopy.test.ts`
- `src/content/zeroData.ts`
- `src/domain/calc/__tests__/calc.test.ts`
- `src/domain/calc/__tests__/keyLifts.test.ts`
- `src/domain/calc/index.ts`
- `src/domain/calc/keyLifts.ts`
- `src/domain/calc/recovery.ts`
- `src/store/__tests__/trainingStore.test.ts`
- `src/store/trainingStore.ts`

### Commands run and actual results

- `git diff --check` — passed, no whitespace errors.
- `npm run typecheck` — passed, zero TypeScript errors.
- Initial focused run:
  `npx jest src/domain/calc/__tests__/keyLifts.test.ts src/domain/calc/__tests__/calc.test.ts
  src/content/__tests__/zeroDataCopy.test.ts src/store/__tests__/trainingStore.test.ts --runInBand`
  — **failed 2 of 103 tests**. Both failures demanded five-decimal equality between percentages
  calculated from displayed two-decimal e1RM points and the mathematically unrounded ratio; the
  implementation values were correct and would display as the asserted one-decimal percentage.
- `npx jest src/domain/calc/__tests__/keyLifts.test.ts --runInBand` after aligning those two assertions
  with the stored-point precision — passed, **19/19**.
- `npm run verify` — passed: TypeScript clean; **529/529 tests across 31 suites**, zero failures. Jest
  emitted a worker-force-exit cleanup warning after the green run.

### Validation results

Verified: UUID and bundled-id key lifts; repeat threshold, eight-week window, completed/non-future
session boundary, stable ordering, row limit, missing metadata, decline and zero-baseline handling;
recovery-evidence detection; empty favourites and sign-out reset; copy safety/honesty; the full
hermetic regression suite; clean TypeScript and whitespace.

Not verified: rendered empty states, navigation from their actions, accessibility/layout, or a real
zero-data account on a cold-started device. No integration suite was run because this sprint does not
change a repository or hosted contract.

### Unresolved risks

- `app/` has no component-rendering test framework, so the branches are proved by their extracted
  rules/copy but not by a mounted screen.
- Parallel S1 adds body measurements above recovery on Body. Integration must keep measurement entry
  reachable for a lifter with zero workouts rather than accepting S2's whole-screen early return.
- Jest still reports one worker that needs force-exit after the otherwise-green hermetic lane.

### Exact next owner decision

**After a cold-start walkthrough with a fresh zero-data account, should this branch be accepted for
the release integration chain, or returned with a specific observed rendering/navigation defect?**
