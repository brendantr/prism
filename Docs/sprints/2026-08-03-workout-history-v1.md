# Sprint: workout-history-v1

## 1. Status and intent

- **Status:** Implemented and validated — typecheck clean, 153/153 tests passing, and manual
  verification on iOS Simulator across three axes (iPhone 16e default, iPhone SE compact width,
  and SE at `accessibility-extra-large`). Five defects were found on device and fixed; two things
  were deliberately **not** verified. Both are itemised in §6 — read §6.1.1 and §6.2 rather than
  this line.
- **Date:** 2026-08-03
- **Branch:** `feature/workout-history-v1`, branched from `main` at `9574bb0`
  (the merge of `feature/workout-session-continuity-v1`, PR #26).
- **Mission:** "Workout History v1" — a lifter can review the sessions they have already finished:
  a chronological list of completed workouts, and a detail view of any one of them showing the
  exercises, sets, load, reps and RPE as logged, plus the summary stats the domain already computes.
- **This sprint is for local/demo evaluation.** It is built and verified against demo mode
  (`EXPO_PUBLIC_DEMO_MODE` default), which is the only mode a real user can currently reach
  (`Docs/architecture.md` G-1). Nothing here is claimed as production-ready.

### Scope boundaries treated as binding (from the mission brief)

**Built:**
- A chronological list of **completed** workouts only, grouped by month, newest first.
- A read-only session detail view for a selected completed workout.
- Enough on each list row to make scanning useful: title, date, lifts, working sets, duration,
  records, volume.
- Enough in detail to judge whether the workout model is useful retrospectively: every exercise,
  every set as logged (load, reps, RPE, set type, whether it counted), per-exercise volume and top
  set, session totals, records banked, and the session's own rating/reflection when present.

**Explicitly not built — each named because silence would be read as an oversight:**
- **Auth. Out of scope.** No sign-in/sign-up/session concept is touched. History reads
  `trainingStore`, which reads the `Repository` interface, exactly as every other screen does; it
  makes no assumption about who the user is beyond the single profile the store already holds.
- **Multi-user / account concepts. Out of scope.** No profile switching, no per-user partitioning,
  no ownership logic. `profile_id` scoping stays entirely where it already lives — the repository
  and RLS layers (`Docs/invariants.md` I-6).
- **Multi-user scaling / cloud query patterns. Out of scope.** History derives from the workouts
  already in memory rather than introducing a paged or filtered query. See §5 for why that is the
  right call now and what the seam is when it stops being.
- Sharing, social, subscriptions, coaching, wearables — none touched.
- **Reopening a completed workout for editing.** Not supported today and not made so here; the
  detail view is deliberately read-only (§4).
- **Deleting a workout from History.** `Repository.deleteWorkout` exists and is tested but still has
  zero UI call sites, exactly as `Docs/sprints/2026-08-02-workout-logging-v1-planning.md` §2.5
  found. This sprint does not add one — a destructive action on training data deserves its own
  scoping, not a chevron added in passing.
- Trend dashboards or analytics expansion beyond the per-session stats already computed.

### Explicit non-fixes (per each rule's own exception process)

- **`Docs/invariants.md` I-2 (non-atomic `SupabaseRepository.saveWorkout`) is not fixed by this
  sprint, and remains a separate follow-up lane.** History is a **read** surface: it adds no write
  path of any kind. `src/data/repository.ts` is untouched, and nothing here depends on, worsens, or
  disguises I-2. Stated explicitly per I-2's own exception process ("any interim non-atomic write
  path must be explicitly called out in the relevant sprint document until fixed"). One honest
  consequence worth naming rather than burying: **if a partial write ever did occur, History is now
  the surface where a lifter would see it** — a session with missing exercises or sets would render
  as exactly that, because the detail view shows what is stored rather than what should have been.
  That is the correct behaviour for a review screen, and it is an argument for closing I-2, not for
  softening History.
- **`routines.is_active`** (planning doc §2.2 — fetched but never read or written) remains untouched.
- **`Docs/architecture.md` G-1 (no auth path)** is unchanged and unaddressed, by design.

---

## 2. Current-state audit (what History had to build on)

Read directly from the working tree on this branch before any code was written.

**Where completed workouts already live:**

| Concern | Current state | Evidence |
|---|---|---|
| Storage, demo mode | `AsyncStorage` key `prism.demo.workouts.v1`, merged on read with the generated 8-week seed | `src/data/repository.ts` (`DemoRepository.listWorkouts`/`saveWorkout`) |
| Storage, Supabase mode | Three sequential non-transactional upserts (I-2) | `src/data/repository.ts` (`SupabaseRepository.saveWorkout`) |
| In-memory read model | `trainingStore.workouts`, loaded once by `refresh()` and updated in place by `upsertWorkout` | `src/store/trainingStore.ts` |
| "Completed only" filter | `selectCompletedWorkouts` — `status === 'completed'`, oldest first | `src/store/trainingStore.ts` |
| Per-session stats | `workoutVolume`, `workoutWorkingSetCount`, `workoutRepCount`, `muscleDistribution` | `src/domain/calc/volume.ts` |
| Records per session | `PersonalRecord.workoutId` is populated on save and in the demo seed | `app/workout/active.tsx`, `src/data/demoSeed.ts` |

**How they were surfaced before this sprint:** only once, at the moment of finishing.
`app/workout/summary.tsx` already takes an `id` param and looks the workout up in the store, but it
is a *capture* screen — "Session complete", a 1–5 rating, a reflection field, "Save and finish" —
reached exactly once via `router.replace` from the logger. It shows no set-level data at all. There
was no list of past sessions anywhere in `app/` (confirmed: zero matches for a history route or
screen), which matches the planning doc's §2.5 finding.

**Conclusion that shaped the work:** the data and the maths were already there and correct; what was
missing was a *derivation layer* turning stored sessions into list/detail view models, two screens,
and a way in. No schema change, no repository change, no store change was required — and none was
made.

---

## 3. Decisions taken in this sprint

Recorded as decisions, with the alternative considered, per `Docs/agents.md` "Labeling ambiguity".

1. **A new pure module, `src/domain/history.ts`, rather than logic in the screens.** Keeps
   `src/domain` the only place the rules live, keeps them unit-testable without a component test
   framework (which this repository deliberately does not have —
   `Docs/sprints/2026-07-27-readiness-inputs-and-confidence-foundation.md` Decision 6), and keeps the
   screens to composition. *Alternative:* `useMemo` in each screen — rejected, it would have put
   ordering, grouping and volume-attribution rules beyond the reach of any test.
2. **Root-stack routes `app/history/index.tsx` and `app/history/[id].tsx`, both registered
   explicitly in `app/_layout.tsx`.** The planning doc (§2.5, point 2) asked that a future History
   sprint "register the route family properly rather than accreting more file-convention routing";
   this does that, and registers the previously-unregistered `workout/summary` in the same pass —
   a one-line addition with no options and therefore no behavioural change, closing a gap flagged in
   `Docs/architecture.md` §Runtime Architecture item 1. *Alternative:* a hidden tab
   (`href: null`, as Progress/Body use) — rejected, because those screens have to fake a back
   affordance (`router.replace('/(tabs)/insights')`) precisely because a tab navigator pops to its
   initial route rather than to the tab you came from (`app/(tabs)/progress.tsx`, verified on device
   2026-07-29). A root-stack push makes plain `router.back()` honest, from either entry point.
3. **Read-only detail.** Editing a finished session changes volume, records and readiness after the
   fact; that is a product decision with data-integrity consequences, not a screen affordance. The
   mission brief scopes reopening out unless "clearly already supported and trivial" — it is neither
   (nothing in the app can currently reopen a completed workout).
4. **Warm-ups and unticked sets are shown, marked as not counting.** Hiding them would make the
   review screen show a tidier session than the one that happened. This also puts raw set-level rows
   in front of the user for the first time, which is the spirit of `Docs/invariants.md` I-3.
5. **Two entry points: Insights → "Go deeper", and Today → "Go deeper".** On Today, History **takes
   the tile Plans held** rather than becoming a fourth tile. Two reasons: `QuickAccess`'s own stated
   contract is "the deeper surfaces that are not in the tab bar" (`src/components/today/QuickAccess.tsx`)
   and Plans **is** a tab-bar destination while History is not; and four flex tiles in that row are
   ~75pt wide on an iPhone SE, which truncates the labels. Plans remains one tap away in the tab bar,
   so nothing became unreachable. *This is the one existing-UI change in the sprint and it is
   trivially reversible* — if the engineer/owner would rather keep the Plans tile, the alternative is
   a fourth tile at reduced legibility, or dropping the Today entry point and reaching History only
   through Insights.
6. **Month grouping is computed in local time, not UTC.** The date on each row renders in local time
   via `formatDate`, so a UTC month key could file a session under "March" directly above a row
   reading "Sat, 28 Feb". Noted because `volumeByDay` in `src/domain/calc/volume.ts` uses a UTC
   date key (`startedAt.slice(0, 10)`) — a pre-existing inconsistency this sprint neither introduces
   nor fixes.

---

## 4. What changed

**New files:**
- `src/domain/history.ts` — the whole derivation layer. Pure, no React, no I/O.
  - `HistoryEntry` + `summariseWorkout` / `listWorkoutHistory` — completed-only, newest first, with
    a stable id tie-break so two same-instant sessions cannot swap places between renders, and a
    record count joined from `PersonalRecord.workoutId`.
  - `workoutDurationMinutes` — null for both "never ended" and "ended before it started", rather
    than rendering a negative duration.
  - `monthKey` / `groupHistoryByMonth` — consecutive month *runs*, so the caller's ordering is
    preserved exactly and an unsorted list produces more sections rather than being silently
    reordered.
  - `historyTotals` — sessions/volume/working sets for the list header.
  - `SessionDetail` + `buildSessionDetail` — exercises sorted by `orderIndex`, sets by `setIndex`
    and renumbered from 1, `countsTowardVolume` per set (delegating to `isVolumeSet`, so History
    can never disagree with the volume engine), per-exercise volume/working sets/top set, records
    filtered to this session, and a named fallback when an exercise id no longer resolves.
- `src/domain/__tests__/history.test.ts` — 26 tests over the above.
- `app/history/index.tsx` — the list. `SectionList` inside the shared `Screen` chrome, month
  headers, a spectral totals card, `ListRow` per session (glyph switches to a cyan `flash` when the
  session banked a record), `ScreenState` for loading/error, and an `EmptyState` with a real way out
  ("Choose a workout" → the existing template picker).
- `app/history/[id].tsx` — the detail. Headline stats matching the post-session summary's four
  numbers, records set, then one card per exercise with a `Set / Load / Reps / RPE` table, the
  session's rating and reflection when present, and a not-found state for an id that no longer
  resolves. The set table's column headings carry a tighter font-scaling cap than body text
  (1.2× vs the app-wide 1.6×) because they label fixed-width columns — see §6.1.1 defect 1.

**Modified files:**
- `app/_layout.tsx` — registers `history/index`, `history/[id]` and (previously unregistered)
  `workout/summary` as `Stack.Screen`s; comment updated to say why History lives on the root stack.
- `app/(tabs)/insights.tsx` — a "History" row added at the top of the existing "Go deeper" card,
  using the same `ListRow` pattern as Progress and Body (Progress gains `divided`, the hairline the
  pattern already uses between stacked rows).
- `app/(tabs)/index.tsx` — Today's `QuickAccess` tile "Plans" → "History" (Decision 5), captioned
  "Sessions you finished" so it fits the tile's two-line cap on a compact device (§6.1.1 defect 3).
- `app/workout/summary.tsx` — now calls the shared `workoutDurationMinutes` instead of computing the
  same subtraction inline, so a session's duration is measured one way only. Behaviour is identical
  except that a workout whose `endedAt` precedes its `startedAt` now shows "—" instead of a negative
  duration.
- `src/utils/format.ts` — `formatMonthLabel` ("March 2026" from a `YYYY-MM` key) and
  `formatTimeOfDay`, both used by the new screens.

**Not changed, deliberately:** `src/data/repository.ts`, `src/store/*`, `supabase/migrations/*`,
`src/domain/types.ts`, `package.json`. No new dependency, no schema churn, no new domain type
persisted anywhere.

---

## 5. Architectural note: the seam for larger-scale storage

Recorded because the mission asked for a preserved path to scale without premature optimisation.

History reads `trainingStore.workouts` — every workout, already in memory — and derives its list on
render. That is correct at the demo/local scale this sprint targets (the seed is 8 weeks, ~30
sessions) and matches how every other derived screen in the app already works
(`Docs/invariants.md` I-3: derived values are recomputed, never cached).

It stops being correct when a real account holds years of sessions. The seam for that is already in
the right place and was left untouched: `Repository.listWorkouts()` is the only source of workouts,
and `listWorkoutHistory(workouts, personalRecords)` is a pure function of its arguments. Paging
therefore becomes a change to *what the repository returns* plus a call-site change in the store —
not a rewrite of either screen, and not a change to any derivation rule, because the rules never
learn where the rows came from. **No paging, cursor, or windowed query is implemented or implied by
this sprint.**

---

## 6. Validation performed

| Check | Result |
|---|---|
| `npm run typecheck` (baseline, before changes) | Pass, zero output |
| `npm test -- --ci` (baseline, before changes) | Pass — 127/127 tests, 11 suites |
| `npm run typecheck` (after changes) | **Pass, zero output** |
| `npm test -- --ci` (after changes) | **Pass — 153/153 tests, 12 suites** (+26, all in the new `history.test.ts`) |
| `git diff --check` | **Clean** — no whitespace or conflict-marker issues |
| Manual verification, iOS Simulator | See §6.1 |

Expo Router's typed-route definitions (`.expo/types/router.d.ts`, git-ignored) were regenerated by
briefly starting the dev server, so `/history` and `/history/[id]` typecheck as real routes rather
than falling back to loose strings.

### 6.1 Manual on-device verification

Native build via `npx expo run:ios` (compiled with 0 errors), demo mode, driven with `idb`
device-coordinate touch injection and verified visually with `xcrun simctl io screenshot` — which
captures the simulated device's own framebuffer only, never this machine's display.

**iPhone 16e, iOS 26.0, default text size**

| Step | Result |
|---|---|
| Today → "Go deeper" → History tile | **Pass.** Three legible tiles (Progress / Body / History); tile opens the list. |
| History list renders | **Pass.** Totals card reads Sessions 26 · Volume 253.0k kg · Working sets 492, over "Everything you have finished since Mon, Jun 15, newest first." |
| Month grouping | **Pass.** Two sections — "JULY 2026 · 16 SESSIONS" and "JUNE 2026 · 10 SESSIONS" (26 total), newest first, oldest row Mon Jun 15 matching the header line. |
| Row content and PR glyph | **Pass.** e.g. "Upper — Pull · Fri, Jul 31 · 6 lifts · 20 sets · 1h 17m · 6 PR" with 6,502 kg trailing; sessions with records carry the cyan `flash` glyph, others the violet barbell. |
| Open a session (Fri Jun 19, 11 records) | **Pass.** Eyebrow "FRI, JUN 19 · 6:25 PM", four headline stats (6,106 kg / 20 / 210 / 1h 9m), then the records list with per-record context lines. |
| Per-exercise set tables | **Pass.** Name + volume, "TOP 105 KG × 6" / "4 WORKING" chips, `Set / Load (kg) / Reps / RPE` columns with a per-set status tick. |
| Warm-up handling (Mon Jun 22 squat session) | **Pass.** The warm-up renders as a faint "W" row (62.5 × 5, RPE "—") with a faint tick, working sets 2–5 in full contrast with violet ticks; card volume 2,520 kg = 105 × 6 × 4, i.e. the warm-up is excluded. The "Warm-ups and sets you did not tick off…" legend appears only on sessions that have one. |
| Reflection / rating | **Pass.** "How it felt" card shows the stored 1–5 rating as read-only dots plus the reflection text; absent entirely on sessions with neither. |
| Back navigation | **Pass.** Detail → list (list keeps its scroll position) → Today. |
| Insights → "Go deeper" → History | **Pass.** New row sits above Progress and Body in the existing card; back from History returns to **Insights**, not Today — the behaviour the root-stack route was chosen for (Decision 2). |
| End-to-end: log → finish → History | **Pass.** Logged a real session (set 1 switched to warm-up and completed, set 2 completed at 20 kg × 5, remaining sets left untouched), finished, skipped the rating. History then showed a new "AUGUST 2026 · 1 SESSION" section with "Lower — Squat · Mon, Aug 3 · 1 lift · 1 set · 2m · 100 kg", totals updated 26→27 sessions / 492→493 working sets, and the detail matched the post-finish summary exactly (100 kg, 1 working set, 5 reps). |

**iPhone SE (3rd generation), iOS 17.4, 375pt — compact width**

| Step | Result |
|---|---|
| Today "Go deeper" tiles | **Pass** after a copy fix — see §6.1.1. |
| History list | **Pass.** Totals card, month headers and rows all legible; row subtitles wrap to the `ListRow` two-line cap. |
| Session detail set tables | **Pass.** Columns hold their alignment at 375pt with no truncation. |

**iPhone SE, `content_size accessibility-extra-large`**

| Step | Result |
|---|---|
| History list | **Pass.** Header, totals and the "since…" line scale and stay readable. `StatBlock`'s labels wrap ("SESSIO/NS", "WORKIN/G SETS") — pre-existing shared-component behaviour, identical on the existing Insights summary card, not introduced here. Row subtitles truncate at two lines; the full text remains in the accessibility label. |
| Session detail set tables | **Pass** after two fixes — see §6.1.1. |

#### 6.1.1 Defects found by manual verification, and fixed

Recorded because they were found on device and would not have been caught by typecheck or the unit
tests:

1. **Column headings broke apart at accessibility text sizes.** At `accessibility-extra-large` on a
   375pt device the `Set / Reps / RPE` headings wrapped to "SE/T", "REP/S", "RP/E" while the numbers
   beneath them stayed on one line. Fixed by pinning the headings — and only the headings — to a
   1.2× scaling cap with `numberOfLines={1}`; the values still scale to the app-wide 1.6×.
2. **"SET" then truncated to "S…"** against the 26pt set column. Fixed by widening that column to
   36pt (it holds two characters of data at most, so nothing else had to move).
3. **Today's History tile caption clipped** to "Every finished s…" on the SE. Reworded to "Sessions
   you finished", which fits the tile's two-line cap.
4. **A bodyweight lift read "TOP 0 KG × 12".** An unloaded set is not a set with no load; the chip
   now reads "Top set 12 reps" when the top set carries no external load.
5. **Spoken set descriptions were mid-sentence lowercase** ("RPE 7.5. counted toward volume"). Now
   capitalised, and "completed, not counted" spelled out as "Completed, not counted toward volume".

Typecheck and the full suite were re-run after these fixes (both still clean/153 passing) and each
fix was re-verified on device.

### 6.2 What was NOT verified, and why

- **The empty state was not verified on device.** It cannot be reached in demo mode:
  `DemoRepository.listWorkouts` always merges the regenerated 8-week seed, so History is never
  empty there. Its behaviour is covered by unit tests (`listWorkoutHistory` and `historyTotals` on
  an empty input) and by typecheck only. Reaching it on device would require either a code change
  or a repository mode that does not exist yet.
- **The "not completed" set row is unreachable through the normal finish flow.** Confirmed by
  reading `activeWorkoutStore.finish()`, which filters each exercise's sets down to
  `completed` ones before the workout is ever saved — so a workout written by this app never
  contains an unticked set. The branch is kept deliberately (and unit-tested): it is what would
  make an externally-written or partially-written row visible rather than silently absent. It was
  not exercised on device because no supported user action can produce it.
- **The Supabase path was not exercised at all** — there is no auth UI to reach it
  (`Docs/architecture.md` G-1). Demo mode only.
- **No component-render tests were added**, consistent with this repository's standing decision not
  to introduce a component test framework.
- **Android was not run.** No Android-specific code is involved, but that is a reason to expect it
  to work, not evidence that it does.

---

## 7. Unresolved risks / carried-forward gaps

- **`Docs/invariants.md` I-2 (non-atomic `saveWorkout`) remains open**, unchanged by this sprint and
  still a separate follow-up lane (§1). History does not write, but it is now the surface on which a
  partial write would become visible.
- **`Docs/architecture.md` G-1 (no auth path) remains open.** Everything here is verified against
  demo mode only; the Supabase path is unreachable by any UI in this repository, so History's
  behaviour against real Postgres is **unknown** — as it is for every other screen.
- **No component-render tests.** The screens themselves are covered only by typecheck and manual
  verification, consistent with this repository's standing decision not to add a component test
  framework. The derivation logic underneath them is unit-tested.
- **`deleteWorkout` still has no UI call site** — unchanged, and now visibly adjacent to a surface
  where a user might reasonably expect it (§1).
- **Scale.** In-memory derivation over the full workout list is a deliberate demo-scale choice (§5),
  not a claim that it holds for a large real account.
- **The Plans tile on Today was replaced, not supplemented** (Decision 5) — reversible, and flagged
  as the one existing-UI change in the sprint.

## The exact next decision needed

**Should a completed session be editable or deletable from History, and if so, which one first?**
The detail view is read-only by design (Decision 3) and `deleteWorkout` remains unwired. Both are
now one screen away from a user who has just been given a reason to look at old sessions, and both
have consequences the read-only surface does not: an edit silently rewrites volume, records and
readiness history; a delete is destructive and irreversible. Neither should be added by inference
from this sprint — they need to be scoped, and their interaction with `Docs/invariants.md` I-2
decided, before either is built.

Secondary, and non-blocking: **keep or revert the Today tile swap** (Decision 5).
