# Sprint: workout-logging-v1-planning

## 1. Status and intent

- **Status:** `Planned — implementation not authorized`
- **Date:** 2026-08-02
- **Branch:** `planning/workout-logging-v1`
- **Sprint type:** Planning only. No product code, dependency, database schema, Supabase migration,
  RLS policy, native configuration, test, or CI change is made by this sprint. The single artifact
  this sprint produces is this document.
- **User outcome this work is intended to produce:** a lifter can start a session in under two taps
  (from one of a small set of templates, or empty), log every set's weight/reps/effort with minimal
  friction, finish with a truthful summary of what actually happened, and trust that the recorded
  data is real evidence — available, unaltered, to whatever History, Progress, and Readiness surfaces
  read it next.

**Baseline validation, this session (2026-08-02, read-only, no code changed):**

| Command | Result |
|---|---|
| `npm run typecheck` | Pass, zero output |
| `npm test -- --ci` | Pass — 115/115 tests, 10 suites |

This confirms the repository state this plan is written against matches the state described in
`Docs/architecture.md`'s 2026-08-01 refresh and `Docs/readiness/2026-08-01-pre-feature-readiness.md`'s
verdict (**READY for new feature/UI-UX ideation**) — nothing has regressed between that audit and this
one.

---

## 2. Current-state inventory

**Headline finding, stated up front:** PRism already has a complete, working, single-path logging
loop. Steps 2 through 8 of the mission's six numbered goals are substantially *built*, not merely
scaffolded — this is not a green-field feature. The actual gap between what exists and the v1 product
decision in this mission is narrower and more specific than "build workout logging": it is (a) **no
explicit template-choice entry point** — today's start action is a single auto-resolved suggestion,
not a pick-from-several-templates flow, (b) **no user-facing sense in which a template is "editable"**
beyond what any active session already allows, (c) **no way to review a workout after the one moment
you land on its summary screen**, and (d) **the in-progress session lives only in memory** and is lost,
silently, on an app kill. Each is detailed below with citations.

### 2.1 How a user currently starts a workout

There is exactly one automatic path and one manual fallback, both on the Today tab
(`app/(tabs)/index.tsx:154-241`):

- **Automatic:** `SessionCard`'s primary action calls `handleStart` (`app/(tabs)/index.tsx:154-162`),
  which starts a session from `today.day` — a `RoutineDay` chosen by
  `src/domain/schedule.ts`'s `resolveTodaySession` (`schedule.ts:35-73`). That function has **no user
  choice in it at all**: it looks at the single `activeRoutine` (see 2.5) and picks a day by (1) a
  weekday pin not yet trained this week, else (2) the next untrained day in rotation order, else (3)
  the first day again (labelled a "rest day" reason). The user never sees or picks among templates —
  they see one resolved suggestion and either start it or don't.
- **Manual fallback ("start empty"):** two call sites both do the same thing — call
  `activeWorkoutStore.start({ profileId, title: 'Open session', routineDay: null })` — one when there
  is no active routine at all (`app/(tabs)/index.tsx:231-239`), one via `SessionCard`'s "Browse" action
  which starts empty and immediately opens the exercise picker (`app/(tabs)/index.tsx:219-224`).
- **Resume:** if `activeWorkoutStore.workout` is already non-null, Today shows a "Session in progress"
  banner (`app/(tabs)/index.tsx:175-188`) that routes back into `workout/active` rather than starting
  a second session — there is no way to have two sessions in flight, which is correct and should be
  preserved.

**What does not exist:** a screen or control where the user is shown several templates and picks one
explicitly. "Choose how to start a workout" (mission goal 1) is not yet a real choice — it is an
algorithm's suggestion plus a single manual escape hatch.

### 2.2 What "template" currently means, and the `is_active` gap

`src/data/routineTemplates.ts` defines exactly two hand-written, original `Routine` objects —
`SPECTRUM_FOUR` (4-day upper/lower split) and `PRISM_THREE` (3-day full-body) — each composed of
`RoutineDay`s, each with an ordered list of `RoutineExercise` slots (`targetSets`, `targetRepsLow/High`,
`targetRpe`, `restSeconds`). This is real, original programming (`routineTemplates.ts:1-8` states as
much), not placeholder data, and it is what `resolveTodaySession` reads from today.

Three things about this that bear directly on the mission's "editable workout templates" requirement:

1. **Nothing about a template is user-editable today.** The Plans tab (`app/(tabs)/plans.tsx`) renders
   both templates read-only (`plans.tsx:46-95`) and its own `PhasePanel` explicitly lists "Custom plan
   editor" and "Clone a template into an editable personal plan" as **Phase 5, not built**
   (`plans.tsx:97-113`).
2. **There is no user-facing way to choose which routine is "active."** `Routine` has no `isActive`
   field in `src/domain/types.ts`, but the Postgres schema does: `routines.is_active boolean`, with a
   partial unique index enforcing at most one active routine per profile
   (`supabase/migrations/0001_init.sql:92,98-99`). `SupabaseRepository.listRoutines()` even selects
   `is_active` in its query string (`src/data/repository.ts:250`) — **but `toRoutine()` never reads it**
   (`repository.ts:384-415`), so the column's value is fetched and silently discarded. `getActiveRoutine()`
   falls back to "first non-template routine, else the first routine at all"
   (`repository.ts:257-260`) — a heuristic, not a stored user choice, and nothing anywhere writes
   `is_active`. In demo mode, `DemoRepository.getActiveRoutine()` is simpler and more absolute: it
   **always** returns `SPECTRUM_FOUR`, unconditionally (`repository.ts:122-124`). **Fact:** no code path
   in this repository currently lets a user select or persist which routine (or template) is theirs to
   run. This is a genuine, previously-undocumented gap — it does not appear in `Docs/architecture.md`'s
   Known Gaps table or `Docs/invariants.md`.
3. **Plans' "Active" chip is cosmetic, not interactive.** `isActive` in the Plans screen
   (`plans.tsx:47`) only compares IDs to decide styling; tapping a routine card does nothing (no
   `onPress` on the `Card` at all).

### 2.3 Recording exercises, sets, weight, reps, and effort — already built, in-session

Once a session exists in `activeWorkoutStore`, the following is real, working, in-memory state
management, not a mock:

- **Exercises:** `addExercise`, `removeExercise`, `reorderExercise`, `setExerciseNotes`
  (`src/store/activeWorkoutStore.ts:44-47,122-181`). Adding goes through the exercise picker
  (`app/workout/picker.tsx`) — a full-screen modal (`app/_layout.tsx:65`) with text/region/equipment
  filters and a favourites toggle, reused from `src/components/ui` (`SearchField`, `Chip`), that calls
  `addExercise(exercise.id, { sets: 3, reps: 8, rest: 120 })` on tap (`picker.tsx:70-73`).
- **Sets:** `addSet` (inherits the previous set's weight/reps/rest — `activeWorkoutStore.ts:183-214`),
  `updateSet`, `removeSet`, `toggleSetComplete` (fires haptics and starts a rest timer —
  `activeWorkoutStore.ts:248-270`).
- **Fields recorded per set** (`WorkoutSet`, `src/domain/types.ts:85-97`): `type` (working / warm-up /
  drop set / failure / back-off), `weightKg`, `reps`, `rpe` (nullable, 5–10 half-steps), `completed`,
  `restSeconds`, `notes`. The UI (`SetRow.tsx`) exposes type-toggle (tap the set-index cell), weight and
  reps via equipment-aware nudge steppers (`loadIncrementKg`, `SetRow.tsx:41-46`), an `RpeSelector`, a
  one-tap "copy previous" affordance, and a complete/incomplete toggle. Set removal is a **long-press on
  the set-index cell** (`SetRow.tsx:62`) with no visible affordance advertising it — worth a UX-polish
  note for the future implementation sprint, not a v1 blocker.
- **Live load suggestions and PR flags:** `app/workout/active.tsx:103-122` computes one
  `recommendNextLoad` suggestion per exercise against real history and renders it via `ExerciseBlock`'s
  expandable rationale (`ExerciseBlock.tsx:112-174`), with an explicit "Apply to all sets" action that
  only fires on a deliberate tap (`ExerciseBlock.tsx:159-170`, `active.tsx:294-298`) — this already
  satisfies `Docs/invariants.md` I-11 ("no readiness/suggestion may alter a workout without explicit
  confirmation"). PR detection runs live, set by set, via `evaluateSetForPr`
  (`ExerciseBlock.tsx:66-77`), separate from the end-of-workout PR persistence in 2.4.

**What this means for planning:** goals 2–4 of the mission ("add/remove/reorder exercises," "add, edit,
duplicate, and complete sets," "record weight/reps/effort") require **no new component work** — they
need, at most, small additions (e.g., "duplicate a set" is not currently a distinct action, though
`addSet` already inherits the prior set's values, which is functionally close). The future
implementation sprint should treat this area as *verify and lightly extend*, not *build*.

### 2.4 Finishing a workout

`app/workout/active.tsx:131-190`, `handleFinish`:

1. Refuses to finish with zero completed sets, offering "Keep going" or "Discard" instead
   (`active.tsx:132-138`).
2. Confirms via `Alert` showing set count and elapsed time (`active.tsx:141`).
3. Calls `activeWorkoutStore.finish()`, which **builds** the completed `Workout` (dropping any exercise
   with no completed sets, stamping `endedAt`/`status: 'completed'`) **without clearing the store**
   (`activeWorkoutStore.ts:296-324`) — this is a deliberate, tested design (see 2.7): the session is not
   thrown away until the write is confirmed.
4. Persists via `trainingStore.upsertWorkout` → `repo.saveWorkout` (`active.tsx:154`,
   `trainingStore.ts:98-104`).
5. Detects PRs against pre-session bests and persists them via `addPersonalRecords`
   (`active.tsx:157-171`).
6. Only on success: sets a `finishing` ref (guards a redirect effect from bouncing the user back to
   Today), routes to `/workout/summary`, and *then* calls `discard()` (`active.tsx:174-176`).
7. On any failure: the sets stay on screen, a visible retry banner appears
   (`active.tsx:329-340`, `accessibilityRole="alert"`), and nothing is silently lost
   (`active.tsx:177-186`).

This flow already correctly implements "finish the workout" (mission goal 5) including its harder
edges (nothing-logged, save failure, double-finish safety — see `activeWorkoutStore.test.ts`).

### 2.5 Reviewing the completed workout

`app/workout/summary.tsx` renders, immediately after finishing: a headline stat block (volume, working
sets, reps, duration), a "New records" list, a muscle-distribution breakdown
(`muscleDistribution`), and a 1–5 session-quality rating plus a 280-character free-text reflection —
both optional, both persisted via a second `upsertWorkout` call on "Save and finish"
(`summary.tsx:78-86`). "Skip for now" discards nothing already saved; it just skips the rating/reflection
step (`summary.tsx:213`).

**Two real gaps here, both directly relevant to the mission's goal 5 ("review the completed workout")
and goal 6 ("make data available to downstream views"):**

1. **This screen is reachable exactly once per workout — the moment you finish it.** There is no
   dedicated workout-history list anywhere in this repository (confirmed: `find app -iname "*history*"`
   returns nothing) and `repo.deleteWorkout` exists in the `Repository` interface and both
   implementations (`repository.ts:51,141-145,302-313`) but has **zero UI call sites** anywhere in
   `app/` or `src/components/` — confirmed by search; its only reference outside its own definition is
   its own test (`src/data/__tests__/ownership.test.ts:139`). A user cannot browse, reopen, or delete a
   past session from anywhere in the app today.
2. **`workout/summary` is not registered as an explicit `Stack.Screen`** in `app/_layout.tsx:52-66` — it
   is reached only via Expo Router's file-based convention (`router.replace({ pathname:
   '/workout/summary', ... })`, `active.tsx:175`). This was already flagged, unresolved, in
   `Docs/architecture.md` §"Runtime Architecture" item 1 and is carried forward here rather than
   re-litigated — it does not currently break anything, but a future implementation sprint that adds a
   history screen should register the route family properly rather than accreting more file-convention
   routing.

### 2.6 What data persists versus what is demo-only or in-memory-only

| Layer | Persistence | Evidence |
|---|---|---|
| `activeWorkoutStore` (the in-progress session) | **In-memory only, JS heap, no `AsyncStorage`.** No `persist` middleware is used (`activeWorkoutStore.ts:74`, plain `create<...>((set, get) => ...)`). | Confirmed by reading the whole file — no `zustand/middleware` import, no `AsyncStorage` call anywhere in it. |
| A finished `Workout`, demo mode | `AsyncStorage`, key `prism.demo.workouts.v1`, merged with the generated 8-week seed on read. | `repository.ts:64-69,126-139` |
| A finished `Workout`, Supabase mode | Three sequential Postgres upserts (`workouts` → `workout_exercises` → `sets`), **not wrapped in a transaction.** | `repository.ts:278-300` |
| `PersonalRecord`s from a session | Same split: `AsyncStorage` (demo) or `insert` (Supabase), always after the workout write. | `repository.ts:183-187,363-380` |
| Session rating / reflection | Round-trips through the same `Workout` object and the same `saveWorkout` path — no separate storage. | `summary.tsx:78-86` |

**The in-memory-only active session is the single most consequential current-state finding of this
audit, and it is new — it does not appear in `Docs/architecture.md`'s Known Gaps table or in
`Docs/invariants.md`.** A user who is mid-session when the OS kills the app (backgrounded too long,
low memory, a crash, an accidental swipe-away followed by force-quit) loses every set logged in that
session with **no warning, no recovery, and no record that a session was ever attempted.** This is
functionally worse than the server-side non-atomicity gap already tracked as
`Docs/invariants.md` I-2 / `Docs/architecture.md` G-2 (A3 in the closure inventory), because I-2 only
risks a *partially* written finished workout after an explicit "Finish" tap under narrow conditions
(mid-upsert network failure), whereas this risks losing an **entire, otherwise-successful** session
that was never even submitted. This is flagged here as a new, unresolved finding — not implemented, not
designed, just surfaced — and the v1 flow in §3 names it as an explicit open question rather than
silently building on top of it.

### 2.7 Server-side write path: atomicity and ownership

- **Non-atomic (unchanged, tracked):** `saveWorkout`'s three sequential upserts
  (`repository.ts:278-300`) are exactly `Docs/architecture.md` G-2 / `Docs/invariants.md` I-2's
  "confirmed gap, not yet met." Nothing in this audit changes that status; it is restated here because
  the workout-logging feature is precisely the feature this gap is about.
- **Ownership is correctly server-derived, not client-trusted (I-6, aligned):** `profile_id` on every
  write is taken from `this.uid()` (the signed-in session), never from the object passed in
  (`repository.ts:280-284`, comment: *"Ownership comes from the session, never from the passed-in
  object"*). `src/data/__tests__/ownership.test.ts` asserts this directly for `saveWorkout`,
  `saveCheckIn`, `savePersonalRecords`, and `deleteWorkout` against a hostile object carrying a forged
  `profileId` (`ownership.test.ts:74-168`) — this is real, tested protection, not an aspiration.
- **RLS (I-1, met as of 2026-08-01):** `workouts`, `workout_exercises`, and `sets` all have RLS enabled
  with `profile_id = auth.uid()` (direct on `workouts`, `exists`-walk on the two child tables)
  (`supabase/migrations/0001_init.sql:284-286,357-380`), verified by 57/57 assertions against the
  actual committed migration file (`Docs/sprints/2026-08-01-rls-migration-fix.md`). A second migration
  (`0002_security_hardening.sql:80-112`) adds a trigger, `assert_exercise_visible`, that blocks any
  `workout_exercises`/`routine_exercises`/`personal_records` row from referencing an `exercise_id` the
  writer cannot see — closing a foreign-key-bypasses-RLS path that plain `select` policies alone would
  have missed. Verified per that migration's own record.
- **No auth path exists (G-1, unchanged, the largest cross-cutting dependency):** `SupabaseRepository.uid()`
  throws `'Not signed in.'` if there is no session (`repository.ts:216-219`), and no sign-in/sign-up UI
  exists anywhere in this repository. **This means the entire logging flow planned here is fully
  buildable and testable against demo mode today, but cannot reach real Postgres for a real user until
  authentication is scoped and built** — a pre-existing, correctly-sequenced dependency
  (`Docs/readiness/2026-08-01-pre-feature-readiness.md` item A4), not something this sprint changes.

### 2.8 What History, Progress, and Readiness can currently consume

Every derived screen reads `trainingStore.workouts` (populated by `Repository.listWorkouts()`) and
recomputes from it in a `useMemo` — there is no cache, no derived-and-stored table, matching
`Docs/invariants.md` I-3. Concretely, today:

- **Today** (`app/(tabs)/index.tsx`): `resolveTodaySession`, `estimateRecovery`, `computeReadiness`,
  `volumeInWindow`, `completedThisWeek`, recent-PR list — all read `selectCompletedWorkouts` (workouts
  with `status === 'completed'` only; an in-progress or abandoned workout is invisible to every
  downstream calculation, which is correct and should stay true).
- **Progress / Body / Insights**: same pattern — `e1rmSeries`, `estimateRecovery`,
  `muscleDistribution`, `volumeInWindow`, all recomputed from `selectCompletedWorkouts` on every render.
- **Readiness** (`src/domain/calc/readiness.ts`): the `workload` factor is literally last-7-days versus
  28-day-average training volume computed from these same workout records — so any change to how/what
  workout-logging v1 records (e.g., what counts as a "completed" set, whether warm-ups are excluded)
  flows directly into the readiness score's honesty. `Docs/invariants.md` I-18 (met 2026-07-29) already
  requires this path to report `sufficient: false` rather than default when there isn't enough history —
  that behavior sits downstream of, and depends on, workout data being real and complete.
- **History (as a named surface):** does not exist yet (2.5). "Make data available to downstream views"
  (mission goal 6) is therefore *already true* for every view that exists today, and is an open
  question only for the History surface that doesn't exist yet — see §5.

### 2.9 Failure, loading, empty, and offline behavior

- **Today** branches on `trainingStore.status` via the shared `ScreenState` primitive
  (`index.tsx:139-152`) — loading/error/ready, matching every other data-driven tab
  (`Docs/architecture.md` G-5, resolved).
- **`workout/active.tsx` and `workout/picker.tsx` do not branch on `trainingStore.status` at all** —
  both assume `profile`/`exerciseById` are already populated (reasonable in practice, since both are
  only reachable after Today has already loaded successfully and started a session, but neither screen
  defensively guards against a `status !== 'ready'` state; `active.tsx:129` only null-guards on
  `!workout || !profile`, not on load status). Not a currently-observed bug — flagged as a design
  consideration for the future implementation sprint, consistent with how `ScreenState` is used
  everywhere else.
- **Save failure on finish:** handled and user-visible (2.4, point 7) — a real, working pattern to
  extend, not replace.
- **No offline-detection code exists anywhere in this repository** (`NetInfo` or equivalent — confirmed
  absent, matching `Docs/architecture.md` G-9). The Supabase write path's actual behavior when offline
  is unverified by any test; the existing UI treats "offline" and "any other save failure" identically
  (one generic retry banner), which is an honest, defensible v1 posture and is recommended to remain the
  posture rather than inventing offline-specific UX before there is a way to test it.
- **Cancellation / accidental exit today:** `handleDiscard` requires an explicit destructive
  confirmation (`active.tsx:192-204`); a bare navigation-back on the header chevron only *minimizes* the
  session (`router.back()`, `active.tsx:216`) rather than discarding it, and the session survives because
  it lives in the store, not the screen. This works correctly **only while the process stays alive** —
  it does not survive the process being killed (2.6).

### 2.10 Existing test coverage for workout/session behavior

| File | Covers | Does not cover |
|---|---|---|
| `src/domain/calc/__tests__/calc.test.ts` | Pure functions: 1RM, volume, PR detection, recovery, load recommendation, readiness — all thoroughly unit-tested. | Nothing in `app/` or the stores. |
| `src/store/__tests__/activeWorkoutStore.test.ts` | Only `finish()`/`discard()` session-survival behavior (5 tests) — the regression this file exists to guard is specifically "finish() must not clear the session before a save is confirmed." | `addExercise`, `removeExercise`, `reorderExercise`, `addSet`, `updateSet`, `removeSet`, `toggleSetComplete`, rest-timer logic — none of the store's other 15+ actions have a test. |
| `src/data/__tests__/repository.test.ts` | `DemoRepository` check-in patch/merge/clear semantics only. | `saveWorkout`, `deleteWorkout`, `listWorkouts` — no test touches the workout path in either repository. |
| `src/data/__tests__/ownership.test.ts` | Server-derived `profile_id` stamping on `saveWorkout`, `saveCheckIn`, `savePersonalRecords`, `deleteWorkout`, against a mocked Supabase client. | The actual shape/correctness of `workout_exercises`/`sets` upsert payloads; any partial-failure/non-atomicity scenario (explicitly named as future work by I-2's own "Enforcement evidence" entry). |

No test exists for `app/workout/active.tsx`, `app/workout/picker.tsx`, `app/workout/summary.tsx`, or any
component in `src/components/workout/` (`ExerciseBlock`, `SetRow`, `RestTimerBar`, `RpeSelector`) — this
matches the repository-wide, deliberate absence of a component-rendering test framework
(`Docs/sprints/2026-07-27-readiness-inputs-and-confidence-foundation.md` Decision 6, reconfirmed as
still current by every UI sprint since, most recently
`Docs/sprints/2026-08-01-onboarding-ui-redesign.md`). A future implementation sprint should plan its
test strategy the same way this repository already does elsewhere: hermetic Jest over store/domain
logic, manual on-device verification for screens, honestly recorded as such.

### 2.11 Existing UI components available for reuse

| Need | Existing component | Notes |
|---|---|---|
| Lists / rows | `ListRow`, `OptionRow` (`src/components/ui/ListRow.tsx`, `OptionRow.tsx`) | `OptionRow` already has selected/unselected states with a check or radio indicator (`OptionRow.tsx:6-16`) — a strong fit for "pick a template" if that UI is scoped. |
| Inputs / steppers | The set-row nudge-stepper pattern in `SetRow.tsx:147-194` (`ValueCell`) is the established convention for numeric in-session editing — reuse this pattern rather than introducing a new one (e.g. for any new template-level numeric field). |
| Set rows | `SetRow.tsx`, `RpeSelector.tsx` | Already exactly what mission goal 3 needs; no new component required. |
| Sheets / modals | No dedicated bottom-sheet primitive exists. The one precedent (`workout/picker.tsx`) is a full-screen `Stack.Screen` with `presentation: 'modal'` (`app/_layout.tsx:65`) — this is the established pattern a template-picker screen should follow, not a new sheet component. |
| Buttons | `Button` (`src/components/ui/Button.tsx`) — used identically everywhere, including loading state (`loading` prop, `active.tsx:344-349`). |
| Loading / error / empty | `ScreenState` (loading/error/ready), `EmptyState` (named reason + a way out, `EmptyState.tsx:1-21`) — both already the established, repository-wide convention (`Docs/architecture.md` G-5). |
| Summary stats | `StatBlock`, `SectionHeader`, `Chip`, `LinearSpectrum` (used as thin distribution bars, not backgrounds, matching the capped-usage convention in `Docs/sprints/2026-08-01-onboarding-ui-redesign.md`) — all already exactly what `workout/summary.tsx` uses today. |
| Cards | `Card` (`variant="outline"`/`"flat"`/`"raised"`, optional `spectral` top-edge band) — the established "instrument panel" look for grouped content, already used throughout Plans, Today, and the summary screen. |

**Conclusion: no new design tokens or primitive components are needed for any part of this feature that
is genuinely new** (a template-choice screen, a history list, a persisted-draft indicator). Every
plausible new screen has a direct precedent to build from.

---

## 3. v1 user flow

This section defines the intended end-to-end flow. It is a plan, not an implementation — every step
below is a design description for a future, separately-scoped implementation sprint, cross-referenced
against what already exists (§2) so the future sprint knows exactly what is new work versus reuse.

**1. Entry point from the existing app shell.**
Today's `SessionCard` remains the primary entry surface (no navigation restructuring implied by this
mission). Its current single auto-resolved suggestion is supplemented, not replaced, by an explicit
"Choose a workout" affordance that opens a new template-choice screen (§3.2). The existing "Session in
progress" resume banner (`index.tsx:175-188`) and the existing behavior of routing back into an
already-active session rather than permitting a second one are both preserved unchanged.

**2. Choose a template or select "Start empty."**
A new full-screen modal route (precedent: `workout/picker.tsx`'s existing pattern, §2.11), showing a
**small, fixed set of templates** — recommended granularity: individual session/day templates (the
existing `RoutineDay` shape — name + ordered exercise slots with target sets/reps/RPE/rest), not whole
multi-day `Routine`s, so the picker reads as "Push Day / Pull Day / Leg Day," matching the mission's
"small set" language — plus one explicit "Start empty" option, using `OptionRow`'s existing
selected-state pattern (§2.11). **This is a recommendation, not a decision** — see §5, open question 1,
for why this needs explicit engineer/owner confirmation before an implementation sprint scopes it.

**3. Create/open the active workout.**
Unchanged mechanism: `activeWorkoutStore.start({ profileId, title, routineDay })` already accepts
either a `RoutineDay` (template path) or `null` (empty path) and pre-populates sets accordingly
(`activeWorkoutStore.ts:79-118`). The only new requirement is that `start()`'s caller now comes from the
new template-choice screen (or the existing empty-session shortcuts) rather than exclusively from
`resolveTodaySession`.

**4. Add/remove/reorder exercises.**
Already fully built (§2.3) — `addExercise` (via the existing picker), `removeExercise`,
`reorderExercise`. No new work.

**5. Add, edit, duplicate, and complete sets.**
Add/edit/complete already built (§2.3). "Duplicate" is not a distinct action today, though `addSet`
already inherits the previous set's weight/reps/rest (`activeWorkoutStore.ts:191-193`), which covers the
overwhelmingly common case ("one more set, same numbers") already. Whether a literal "duplicate this
specific set" action (as opposed to "add a set, which happens to match") is worth a distinct control is
a small, cheap product call for the implementation sprint, not a planning blocker.

**6. Record the required v1 fields.**
Already fully built and already exactly matches this mission's stated v1 scope: weight (`weightKg`),
reps, and effort (`rpe`, half-steps 5–10, nullable). No RIR field — consistent with
`Docs/invariants.md` I-16 (RPE is the sole perceived-effort field until a separately approved sprint).
No new fields are proposed by this plan.

**7. Finish the workout.**
Already fully built (§2.4), including the nothing-logged guard, the confirmation prompt, and — most
importantly for trustworthiness — the save-failure recovery path that keeps sets on screen rather than
discarding them. No change proposed to this mechanism. The one addition this plan recommends: **explicit
handling for the in-memory-only session risk named in §2.6** — see below, "accidental exit," and §5
open question 2.

**8. Show a truthful completion summary.**
Already fully built (§2.5) — volume/sets/reps/duration, new records, muscle distribution, optional
rating/reflection. No change proposed to the summary screen's content or honesty posture. The one gap:
it is reachable exactly once. Whether that is acceptable for v1 or needs a "view later" affordance is
tied to whether a History surface is in scope for this feature or a separate one — see §5, open question
3.

**9. Return to the appropriate post-workout destination.**
Already built: both "Save and finish" and "Skip for now" `router.replace('/')` back to Today
(`summary.tsx:85,213`), where the just-finished session is already reflected in the readiness/consistency
calculations on next render (`selectCompletedWorkouts` re-reads the store, which `upsertWorkout` already
updated — `trainingStore.ts:98-104`). No change proposed.

**10. Make the completed data available to downstream views.**
Already true for every view that exists today (§2.8). Nothing in this plan proposes a new derived
metric or a new consumer; the recommendation is only to confirm — in the future implementation sprint's
own testing, not here — that whatever the template-choice screen adds does not change the shape of a
finished `Workout`, so nothing downstream needs to change either.

### Cancellation, accidental exit, save failure, and no network

| Scenario | Current behavior | Plan for v1 |
|---|---|---|
| **Explicit cancel ("Discard")** | Destructive-confirm `Alert`, then clears the store and returns to Today (`active.tsx:192-204`). Nothing is written. | Unchanged. Already correct and matches the "no silent duplicates, no silent partial writes" spirit of `Docs/invariants.md` I-2, even though I-2 itself is about the server side. |
| **Accidental exit (back button / gesture)** | Minimizes only — the header chevron calls `router.back()`, not discard (`active.tsx:216`); the session is untouched in the store and is resumed via Today's banner. | Unchanged — this is already the correct behavior and should not be touched. |
| **App killed mid-session (backgrounded, crashed, force-quit)** | **Total, silent loss.** The session lives only in `activeWorkoutStore`'s in-memory state (§2.6) — nothing survives a process restart, and the user gets no warning before it happens and no indication after that a session was ever in progress. | **Not designed by this planning sprint** — flagged as the most material open risk this audit found (§5, open question 2). A future implementation sprint must explicitly decide whether v1 requires a persisted draft (e.g. an `AsyncStorage`-backed session snapshot, written incrementally as sets complete, cleared on discard/finish) before this can honestly be called a trustworthy logging loop, or whether that is deliberately deferred with the risk stated plainly — either is a legitimate answer, but silence is not. |
| **Save failure on Finish (server rejects, expired session, etc.)** | Sets stay on screen; a visible, accessible retry banner appears; the user can retry Finish; nothing is discarded until a save actually succeeds (`active.tsx:174-186,329-340`). | Unchanged — already the correct pattern, already tested for the "must not clear on failure" property (`activeWorkoutStore.test.ts`). |
| **No network** | Not distinguished from any other save failure — no `NetInfo` or connectivity check exists anywhere in the repository (§2.9), so an offline Finish attempt surfaces the same generic retry banner as a server-side rejection. | Recommend keeping this posture for v1 rather than inventing offline-specific UX (a distinct "you're offline" banner, a write queue, background retry) without a way to test it honestly — matches `Docs/architecture.md` G-9's existing, accepted framing ("add offline detection/handling once production mode has an auth path"). A future implementation sprint could reasonably choose to add a plain connectivity check purely to give a more specific error message, without building a queue — that is a small, separable decision, not named here as required. |
| **Non-atomic server write during Finish** | `saveWorkout`'s three sequential upserts can leave a partially-written workout in Postgres on a failure between steps (`Docs/invariants.md` I-2, unchanged, unmet). | Not solved by this plan — this is `Docs/invariants.md` I-2 / `Docs/architecture.md` G-2 / closure-inventory item A3, already correctly tracked as needing its own design decision (Postgres RPC vs. client-side reconciliation) before implementation. This plan does not re-scope that decision; it only confirms that workout-logging v1 is the feature that makes I-2 concretely matter, and recommends the future implementation sprint either (a) makes I-2's fix a precondition, or (b) explicitly, visibly accepts the interim risk the way `Docs/invariants.md` I-2's own "Exception process" already requires ("any interim non-atomic write path must be explicitly called out in the relevant sprint document until fixed"). |

---

## 4. Explicit non-goals (restated from the mission, confirmed against current code)

No code found anywhere in this repository implements or scaffolds any of the following — confirmed
absent, not merely out of scope by omission: multi-week programs/periodization beyond the existing
`Routine`/`RoutineDay` rotation shape, social features, leaderboards, subscriptions/payments (`I-9`
remains entirely unimplemented, no RevenueCat dependency exists), AI/generative coaching (ADR-0001
already rejects this for the whole product, not just this feature), wearable/HealthKit integration.
This plan proposes none of them and treats their absence as correct, not as a gap.

---

## 5. Open questions requiring an engineer/owner decision

Per `Docs/agents.md` "Required handoff," these are stated as specific questions, not left implicit.

1. **Template granularity and editability.** Is the v1 "small set of editable workout templates"
   correctly modeled as (a) individual session/day templates (the `RoutineDay` shape, decoupled from
   the weekly-rotation `resolveTodaySession` logic), with "editable" meaning *the started session is
   freely editable in the logger, exactly as it already is today regardless of origin* — the
   zero-new-capability interpretation this plan recommends — or (b) something closer to Plans'
   already-deferred "Phase 5" template editor, where the template *definitions themselves* are
   persistently editable? These are very different scopes: (a) needs a new picker screen and nothing
   else; (b) needs new schema-write UI, ownership rules for a user's edited copy of a system template
   (`routines.profile_id` is nullable specifically for system templates — cloning semantics would need
   design), and touches `is_active` (§2.2). This plan recommends (a) for v1, consistent with the
   mission's own "reduce first-workout friction" framing and CLAUDE.md's exclusion of "complex
   periodization," but does not decide it unilaterally.
2. **The in-memory-only active session (§2.6).** Is losing an entire in-progress session on an app kill
   an acceptable, explicitly-stated v1 limitation, or a blocking requirement for this feature to be
   called "trustworthy"? This plan takes no position beyond naming the risk precisely; the answer
   materially changes the future implementation sprint's scope (a persisted-draft mechanism is real,
   non-trivial work: incremental writes, restore-on-launch UX, staleness handling).
3. **Is a workout-history browsing/review surface in scope for "Workout Logging v1," or a separate,
   later "History" sprint?** The mission's goal 6 says "make trustworthy workout data available to
   future History, Progress, and Readiness features" — phrased as something those *future* features
   will consume, which this plan reads as "History is not this sprint's deliverable." But goal 5
   ("review the completed workout") and the current one-time-only summary screen (§2.5) sit right at
   that boundary. Recommend treating "History" as its own future sprint and keeping this feature's
   review surface to the existing summary screen, but this is a scope call for the engineer/owner, not
   this plan.

   **Resolved 2026-08-03 — the recommendation was taken.** History was scoped as its own sprint
   (`Docs/sprints/2026-08-03-workout-history-v1.md`), after `workout-session-continuity-v1`
   deliberately left it out. That sprint built the list and a read-only session detail; it did not
   make the post-finish summary screen reachable a second time, and it did not add editing or
   deletion of a completed session. This question is closed; the open one it leaves behind is
   whether a completed session should become editable or deletable, which that record states as its
   own next decision.
4. **Sequencing against `Docs/invariants.md` I-2 (non-atomic `saveWorkout`).** Should the future
   implementation sprint treat fixing I-2 as a precondition, given that workout-logging v1 is the
   feature I-2 is actually about? Or ship v1 against the existing non-atomic path with the risk
   explicitly re-stated in that sprint's own record, per I-2's stated exception process? Both are
   legitimate; this plan does not choose.
5. **Sequencing against authentication (G-1).** Workout-logging v1 can be fully built and verified
   against demo mode without auth. Should the implementation sprint be scoped demo-mode-only (with
   Supabase-mode changes limited to what's already needed for schema/RLS parity, already met), or should
   it be blocked until an authentication sprint lands so it can also be verified against real Postgres?
   `Docs/readiness/2026-08-01-pre-feature-readiness.md` lists "scope an authentication-implementation
   sprint" as its own next step (item 6) — this plan recommends *not* blocking workout-logging-v1
   planning or early implementation on that, since demo mode is a real, fully-functional target, but
   flags that Supabase-path end-to-end verification will remain "unknown" (per the existing G-1
   framing) until auth exists regardless of what this feature does.

---

## 6. What a future implementation sprint would need to scope (explicitly not started here)

Listed for continuity only — none of this is designed, sized, or committed to by this planning sprint:

- The template-choice screen itself (new route, new content data — likely no new domain type, per §5
  open question 1's recommended interpretation).
- A decision and, if needed, a design for the in-memory-session risk (§5 open question 2).
- Deterministic tests for whatever the template-choice screen adds (unit tests over any new pure
  selection/derivation logic, following this repository's existing hermetic-Jest-only convention — no
  new test-framework dependency, consistent with `Docs/sprints/2026-08-01-onboarding-ui-redesign.md`'s
  same decision).
- Manual on-device verification of the new screen at minimum on the same axes prior UI sprints have
  used: default size, small device (iPhone SE class), and large accessibility text
  (`Docs/sprints/2026-08-01-screen-state-verification.md` precedent).
- Explicit confirmation, before implementation, of the `is_active` column's fate (§2.2): wire it up, or
  formally deprecate/remove it in a future migration-hygiene sprint (a database change, requiring its
  own engineer/owner approval per `CLAUDE.md`) — either is fine, silence is not.

---

## Validation performed in this sprint

| Check | Result |
|---|---|
| `npm run typecheck` | Pass, zero output (baseline confirmation only — no code changed) |
| `npm test -- --ci` | Pass — 115/115 tests, 10 suites (baseline confirmation only — no code changed) |
| Every file path and line citation above | Read directly from the working tree on `planning/workout-logging-v1`, branched from `main` at `de7a68a` (synced with `origin/main` before branching) |
| Schema claims (`workouts`, `workout_exercises`, `sets`, `routines.is_active`, RLS policies, triggers) | Read directly from `supabase/migrations/0001_init.sql` and `0002_security_hardening.sql` — no migration was applied or executed; no live database was used |
| No product code, dependency, schema, migration, RLS policy, native config, test, or CI file was modified | `git status`/`git diff --stat` show only this document as changed, confirmed before commit |

## Unresolved risks

- The in-memory-only active-session risk (§2.6, §5 Q2) is unresolved and, in this audit's judgment, the
  single most important finding to carry into the next decision point.
- `Docs/invariants.md` I-2 (non-atomic `saveWorkout`) remains open and is directly implicated by this
  feature; this plan does not resolve it.
- Whether "editable templates" means (a) or (b) in §5 Q1 is unresolved and changes the size of the
  future implementation sprint substantially.

## The exact next decision needed

The engineer/owner should answer §5's five open questions — at minimum questions 1 and 2, which
materially change scope — before an implementation sprint is opened for Workout Logging v1.
