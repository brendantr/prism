# Sprint: workout-session-continuity-v1

## 1. Status and intent

- **Status:** Implemented and validated (typecheck, full test suite, and on-device manual verification
  all pass — see §4–§5).
- **Date:** 2026-08-02
- **Branch:** `feature/workout-session-continuity-v1`, branched from `planning/workout-logging-v1`
  (docs-only, not merged into `main`, no open PR at the time this branch was cut) so the planning
  document this work is grounded in — `Docs/sprints/2026-08-02-workout-logging-v1-planning.md` —
  travels with it.
- **Mission:** "Workout Session Continuity and Template Selection v1" — a lifter can deliberately start
  from a template or `Start empty`; can freely edit the active instance without rewriting the reusable
  template; a killed process's in-progress draft is recovered locally on relaunch with an explicit
  Resume/Discard decision; existing finish-workout save-failure/retry behavior is unchanged.
- **Product decisions treated as binding, per the mission brief:** template-first UI with `Start empty`
  as a secondary path; "editable templates" means per-session editing only (no persistent template
  editor — deferred); losing an in-progress workout on app kill is a blocker, not an accepted v1
  limitation; local active-workout persistence/recovery precedes Workout History (explicitly out of
  scope, a separate future sprint); no AI coaching, social, rankings, subscriptions, wearables, medical
  claims, complex programs/periodization, or broad unrelated UI redesigns.

## 2. Explicit non-fixes (per their own invariant/ADR exception processes)

- **`Docs/invariants.md` I-2** (non-atomic `SupabaseRepository.saveWorkout`, three sequential
  non-transactional upserts) is **not fixed by this sprint**. The new local draft persistence added here
  is pure `AsyncStorage`, entirely independent of the repository/save path (`src/data/repository.ts` is
  untouched) — it neither depends on nor worsens I-2. The existing finish/save/retry flow in
  `app/workout/active.tsx` is unmodified.
- **Auth (`Docs/architecture.md` G-1)**: this sprint is built and verified against demo mode only,
  consistent with the planning doc's recommendation (open question 5). The new draft-recovery mechanism
  is repository-agnostic (raw `AsyncStorage`, not `DemoRepository`/`SupabaseRepository`), so it needs no
  auth-path work either way and behaves identically once auth exists.
- **`routines.is_active`** (planning doc §2.2 — fetched from Postgres but never read or written anywhere)
  remains untouched. Which routine is "active" for Today's auto-suggestion is a separate concept from
  "which session did I just deliberately start," and this sprint does not wire it up.

## 3. What changed

**New files:**
- `app/workout/templates.tsx` — "Choose a workout" modal screen. Lists every `RoutineDay` across
  `trainingStore.routines` (today: Spectrum 4's 4 days + Prism 3's 3 days), grouped by routine, plus a
  "Start empty" option, using the existing `OptionRow`/`SectionHeader` primitives. Registered in
  `app/_layout.tsx` as a modal `Stack.Screen`, mirroring the existing `workout/picker` entry.
- `src/domain/__tests__/schedule.test.ts` — unit tests for the new `listTemplateChoices` helper.

**Modified files:**
- `src/domain/schedule.ts` — added `TemplateChoice`/`listTemplateChoices`, a pure flatten of
  `Routine[]` into selectable `RoutineDay`s, used by the new screen and covered by its own test.
- `src/store/activeWorkoutStore.ts` — added local crash-recovery persistence:
  - `hydrationStatus`, `draftPendingReview` state; `hydrate()`, `resumeDraft()` actions.
  - A module-level `subscribe` on the `workout` reference (not per-action code) fire-and-forget mirrors
    the in-progress workout to `AsyncStorage` (`prism.activeWorkout.draft.v1`) and clears it when
    `workout` becomes null. Every mutating action already replaces `workout` with a new object, so this
    catches every meaningful change without touching `start`/`addSet`/`updateSet`/etc. individually.
  - `finish()` itself is unchanged and, on inspection, already had the needed property for free: it
    builds and returns a completed-workout object **without calling `set()`**, so the persisted draft
    keeps reflecting the true in-progress state through an entire finish/save attempt, including a
    failed one — a kill mid-retry recovers the exact pre-finish session. No defect was found in the
    existing finish/save/retry path, so none was corrected (mission point 7).
  - **Pre-commit review fix:** `hydrate()`'s `AsyncStorage.getItem` read is asynchronous, so a user could
    start a brand-new session (`start()`) while a still-in-flight `hydrate()` call from app launch was
    awaiting a stale on-disk draft. Without a guard, `hydrate()` resolving afterward would unconditionally
    overwrite that fresh, real `workout` with the stale one. Fixed by checking `get().workout` immediately
    after the read resolves and before applying any restore: if a workout is already present at that
    point, `hydrate()` only marks itself `'ready'` and returns, leaving the fresh session completely
    untouched. Covered by a new deterministic unit test in `activeWorkoutStore.test.ts` that holds the
    mocked `AsyncStorage.getItem` open, starts a fresh session mid-flight, then resolves the stale read
    and asserts the fresh session survives unmodified.
  - Rest timer (`restTimer`) is deliberately **not** persisted or restored — a wall-clock countdown
    surviving an arbitrary kill-to-relaunch gap would be misleading UI state, not workout data.
- `app/_layout.tsx` — calls `useActiveWorkoutStore.getState().hydrate()` once on mount, alongside the
  existing `load()`/`loadOnboarding()` calls. Deliberately not added to the onboarding-status hard gate:
  that gate decides which route renders first; draft hydration only affects what Today renders once
  already showing.
- `app/(tabs)/index.tsx` — the existing one-line "Session in progress" resume banner is now mutually
  exclusive with a new "Recovered session" `Card` (title, relative start time, set count, **Resume
  workout** / **Discard draft** actions — the latter behind an `Alert.alert` confirmation, matching the
  existing `handleDiscard` phrasing/pattern in `active.tsx`), shown only when `draftPendingReview` is
  true. Both `SessionCard`'s secondary action and the no-active-routine empty state's button now open
  `/workout/templates` instead of starting an empty session directly; the primary auto-suggested "Start
  session" path (`handleStart`/`resolveTodaySession`) is unchanged.
- `src/components/today/SessionCard.tsx` — one-line label change, "Build a different session" → "Choose
  a workout", reflecting what the button now does.
- `src/store/__tests__/activeWorkoutStore.test.ts` — extended with `describe` blocks for local draft
  persistence and `hydrate()`/`resumeDraft()`, mocking `@react-native-async-storage/async-storage` via
  the same `jest/async-storage-mock` used by `src/data/__tests__/repository.test.ts`.

**Verified by design, no code change needed:** point 2 of the mission ("edit the active instance without
overwriting the reusable source template") was already true before this sprint —
`activeWorkoutStore.start()` only ever *reads* `routineDay.exercises[].{exerciseId,targetSets,
targetRepsLow,restSeconds}` to seed new `WorkoutExercise`/`WorkoutSet` objects; nothing in the store or
repository writes back to `Routine`/`RoutineDay` or `src/data/routineTemplates.ts`.

## 4. Validation performed

| Check | Result |
|---|---|
| `npm run typecheck` (baseline, before changes) | Pass, zero output |
| `npm test -- --ci` (baseline, before changes) | Pass — 115/115 tests, 10 suites |
| `npm run typecheck` (after changes) | **Pass, zero output** |
| `npm test -- --ci` (after changes) | **Pass — 126/126 tests, 11 suites** (11 new: 3 in `schedule.test.ts`, 8 in the extended `activeWorkoutStore.test.ts`) |
| `npm run typecheck` (after pre-commit-review race fix) | **Pass, zero output** |
| `npm test -- --ci` (after pre-commit-review race fix) | **Pass — 127/127 tests, 11 suites** (+1: the new hydrate-vs-fresh-start race test) |
| `git diff --check` | Clean, no whitespace/conflict-marker issues |
| Manual on-device verification | See §5 below |

**On the hydrate-vs-fresh-start race specifically:** this is a sub-tens-of-milliseconds timing window
between an `AsyncStorage` read starting and resolving, racing against a user tap. It is not something the
existing `idb`-driven manual verification pass (§5) can reliably reproduce or prove absent — attempting to
"manually" hit a microsecond-scale race by tapping a button at the right instant would not be a
meaningful test and risks a false sense of confidence. It is instead deterministically covered by the new
unit test (`hydrate() › does not let a stale draft overwrite a workout started while the AsyncStorage read
is still in flight`), which controls the exact interleaving directly rather than relying on timing luck.
No manual on-device re-verification of this specific fix was performed, and none is claimed.

A real test-writing note worth recording: the first version of the new `hydrate()` tests was flaky
because simulating "a fresh process" by setting the live store's `workout` to `null` mid-test also fires
the same persistence `subscribe` a real `discard()` would — it deletes the very draft the test just
wrote, racing the test's own `hydrate()` call. Fixed by capturing the on-disk JSON before nulling and
explicitly restoring it after, rather than assuming the reset leaves storage untouched. Documented here
because it is a real, non-obvious interaction between the subscribe-based design and test setup, not
just a flaky-test footnote.

## 5. Manual on-device verification

Performed on iOS Simulator (iPhone 16e, iOS 26.0), demo mode, native build via `expo run:ios`
(required a one-time `pod install` resync — see §6). Driven via `idb` (device-coordinate touch
injection + accessibility tree queries), verified visually via `xcrun simctl io screenshot` at each
step — never via a real-screen capture of this machine's display (see note below).

| Step | Result |
|---|---|
| Today → "Choose a workout" opens the new modal | **Pass.** Lists "Spectrum 4" (4 days) and "Prism 3" (3 days) as grouped templates, each showing lift count and estimated time, plus a separated "Start empty" option. |
| Select a template day ("Lower — Squat") | **Pass.** Starts the session and lands directly in the logger with the template's 6 exercises/20 sets pre-populated — matches `resolveTodaySession`'s existing template-day behavior exactly, confirming template selection didn't need to duplicate any seeding logic. |
| Log a set (bump weight, mark complete) | **Pass.** Set 1 (Back Squat) set to 10 kg × 5, marked complete — rest timer started, header stats updated (Sets 1/20, Volume 50 kg), matching existing, unmodified behavior. |
| Force-kill the app process, relaunch | **Pass.** Today shows a "Recovered session" card: title "Lower — Squat", "Started today · 1/20 sets logged", explanatory copy, and both **Resume workout** / **Discard draft** actions — distinct from and replacing the plain one-line resume banner. |
| Tap "Resume workout" | **Pass.** Landed back in the logger with the exact prior state: Set 1 still 10 kg × 5, still marked complete (checkmark), Volume still 50 kg, Back Squat still 1/4 sets — an exact restore, not a re-seed. |
| Kill again without finishing, relaunch | **Pass.** Recovered session card reappears (correct — nothing was finished or discarded yet, so the draft should still be there on every cold start). |
| Tap "Discard draft" | **Pass.** Triggers `Alert.alert("Discard this draft?", "Nothing you logged will be saved.")` with Cancel/Discard — confirmed before anything is cleared, matching the existing `handleDiscard` pattern's phrasing and structure. |
| Confirm discard | **Pass.** Today returns to normal (plain SessionCard, no recovered-session card); weekly session count stayed `0/4` (confirming the discarded draft was never counted as a workout — no write ever reached `trainingStore`/the repository). |
| Kill and relaunch once more | **Pass.** No recovered-session card reappears — the discard was durable, not just an in-memory clear. |
| "Choose a workout" → "Start empty" | **Pass.** Starts an empty session and opens the exercise picker directly, identical to the pre-existing "Build a different session" behavior it replaced. |

**Not separately re-verified on-device:** the Finish/save-failure/retry flow itself (mission point 7) —
correctly unmodified code, already covered by `activeWorkoutStore.test.ts`'s pre-existing regression
tests (`finish()` must not clear the session), which still pass unchanged.

**A privacy note on method, recorded transparently:** while calibrating tap coordinates early in this
verification, one full-screen `screencapture` call and one arbitrary-screen-region capture were run
before the correct approach (`idb`'s device-coordinate touch injection, which never touches the host
display) was adopted. Both captures briefly surfaced unrelated content on this machine (a streaming
dashboard with live viewer chat, and what appeared to be an unrelated browser tab) that has nothing to
do with this repository. Both files were deleted immediately upon discovery and were not otherwise used,
retained, or described beyond what was necessary to recognize the mistake. Every screenshot used for
actual verification (all files referenced above) came from `xcrun simctl io screenshot`, which captures
only the simulated device's own framebuffer.

## 6. Unresolved risks / carried-forward gaps

- `Docs/invariants.md` I-2 (non-atomic `saveWorkout`) remains open, as stated in §2 — unchanged by this
  sprint, and still the responsible party for any partial-write risk at the moment Finish is tapped.
- `routines.is_active` remains unwired (planning doc §2.2) — untouched by this sprint, as stated in §2.
- Workout History (browsing/reopening a past session) remains out of scope, per the mission brief —
  unchanged from the planning doc's own open question 3, now resolved by the mission's explicit "do not
  build it here."
- The native iOS build environment for this repo needed a Pods resync (`ios/Podfile.lock` had drifted
  from `node_modules` — a pre-existing local-environment issue, not caused by this sprint's changes) to
  run manual verification at all; noted here in case it recurs for the next person building locally.
  `ios/` is git-ignored (regenerated via `expo prebuild`/CocoaPods), so this did not touch anything
  tracked by Git — confirmed by `git status` before and after.

## The exact next decision needed

None blocking — this sprint's scope was fully specified by the mission brief's "Product decisions
already approved" section. The engineer/owner's next decision point is whichever of I-2 (atomic writes),
auth, or Workout History they choose to scope next; none of the three is decided by this document.
