# Sprint: bound the startup workout read

## Document status

- **Status:** Complete, verified locally. Not exercised against a hosted project or on a device.
- **Date:** 2026-08-10
- **Branch:** `claude/prism-app-store-submission-fae97a`
- **Labels** follow `Docs/invariants.md` I-15.

---

## 1. The problem

`[fact]` `trainingStore.refresh()` called `listWorkouts()` with no bound, and the Supabase read selects
three levels deep:

```
workouts → workout_exercises → sets
```

There was no `.limit()`, no `.range()` and no pagination anywhere in `src/data/repository.ts`. The same
was true of `listCheckIns`, `listPersonalRecords` and `listMeasurements`.

`[fact]` The cost therefore grew with a lifter's tenure. At roughly four sessions a week — six
movements, four sets each — an account accumulates on the order of a hundred set rows a week, so two
years in, a cold start fetched, transferred and JSON-parsed something like ten thousand nested rows
before the first frame. **The most committed users got the slowest app**, which is the wrong way round.

`[fact]` A second, smaller waste sat next to it: `refresh()` ran **ten** reads, two of them redundant.
`getActiveRoutine()` is defined in both implementations as `selectActiveRoutine(routines, profile)`,
and `refresh()` was already fetching `routines` and `profile` separately in the same `Promise.all`.

---

## 2. What was decided

### 2.1 A row count, not a date window `[decision]`

A date window is the obvious bound and it is wrong here. A lifter returning after an injury, a move, or
a busy quarter has no sessions inside any recent window, and a date-bounded load would hand them an app
that looks like it lost their training. A row count always returns the newest sessions, however old
they are.

`WORKING_SET_WORKOUT_LIMIT = 120` (`src/domain/workingSet.ts`). It is chosen against the longest window
any analysis surface asks for — Insights' 84 days — and covers it for anyone training up to about ten
sessions a week. `coversLongestAnalysisWindow` asserts that relationship, so raising an analysis window
without raising the limit fails a test instead of silently truncating whatever the window measured.

### 2.2 Bounded is opt-in, not the default `[decision]`

`listWorkouts()` with no argument still returns everything. Two callers depend on that and **both would
have broken silently** under a bounded default:

- `exportAccountData()` — I-10 requires the export to be complete, and the privacy policy says "export
  everything".
- `DemoRepository.deleteExercise()` — refuses to delete a movement any logged session references, and a
  session from three years ago still counts.

### 2.3 History tops up; every other surface is unaffected `[decision]`

Every analysis surface works inside a window shorter than the bound (Insights 84 days, key lifts 56,
readiness 28). History is the exception — it is the archive — so it calls `loadFullHistory()` on entry.
`history/[id]` does the same, but only when its lookup actually missed, which is the deep-link case.

`loadFullHistory` deliberately does **not** touch `status`. The bounded window is a prefix of the full
list, not a different list, so flipping the shared status to `'loading'` would blank every screen bound
to the store in order to extend one of them. A failure is swallowed and leaves the set marked
incomplete: the lifter keeps the sessions already on screen and the next mount retries, which beats
replacing a partial history with an error state.

### 2.4 The ambiguous coverage case resolves toward re-fetching `[decision]`

`isCompleteWorkingSet(loaded)` is `loaded < limit`. Exactly the limit is ambiguous — the account may
have exactly that many or more — and is treated as incomplete. One unnecessary query is cheap; silently
hiding a logged session is not.

---

## 3. The bug this was written to avoid

`[fact]` The obvious implementation — adding `.limit()` to the existing ascending query — returns the
**oldest** N sessions, not the newest. It typechecks, it passes a "returns 120 rows" assertion, and it
would show a lifter their first month of training in place of their last. It is invisible until someone
has more history than the limit, which is exactly the population the change exists for.

The bounded read therefore inverts the sort, applies the limit, and reverses the window back to the
oldest-first contract. `workouts_profile_started_idx` is `(profile_id, started_at desc)`, so descending
is the index's own direction and the cheaper scan of the two.

`src/data/__tests__/workoutWindow.test.ts` pins this directly, including an assertion that the limit
reaches the query rather than being applied client-side — because slicing after the fetch would pass
every behavioural assertion and none of the cost ones.

---

## 4. Changed files

- `src/domain/workingSet.ts` (new) — the limit, its justification, and the coverage predicates
- `src/domain/__tests__/workingSet.test.ts` (new)
- `src/data/repository.ts` — `listWorkouts(options?: { limit?: number })` on the interface and both
  implementations
- `src/data/__tests__/workoutWindow.test.ts` (new) — Supabase query shape and export completeness
- `src/data/__tests__/repository.test.ts` — demo/Supabase parity for the window
- `src/store/trainingStore.ts` — bounded startup read, `workoutsComplete`, `loadFullHistory`, and the
  two redundant reads removed
- `src/store/__tests__/trainingStore.test.ts`
- `app/history/index.tsx`, `app/history/[id].tsx` — top-up on entry / on a missed lookup

---

## 5. Evidence

`[fact]` Commands run and their actual results:

- `npx tsc --noEmit` — clean.
- `npm run verify` — **661/661 tests across 48 suites** (from 642/46).
- Reads at startup: **10 → 8**, and the workout read is bounded.

`[fact]` **Not** done, and not claimed:

- No hosted project was touched, and no measurement of a real payload was taken. The improvement is
  argued from the query shape, not from a benchmark against a large real account.
- No device run. The two History screens changed and there is no component-test tooling, so their
  behaviour is covered only through the store and the pure predicates beneath them.
- `listCheckIns`, `listPersonalRecords` and `listMeasurements` are **still unbounded**. They are one
  row per day / per record rather than a three-level graph, so they grow far more slowly — but they do
  grow, and this sprint did not address them. `[open question]` Worth revisiting once there is a real
  account large enough to measure.

---

## 6. Follow-ups

`[recommendation]`

1. Re-run the cold-start walkthrough (`Docs/tester-readiness-runbook.md` §6) and specifically open
   History, which is the one surface whose data now arrives in two stages.
2. Measure a real account before tuning the limit. 120 was chosen to be comfortably safe, not tight.
3. Consider cursor pagination in History itself. `loadFullHistory` is an unbounded read; it is now
   behind an explicit user action on the screen whose purpose is browsing everything, which is a very
   different cost profile from every cold start — but it is not a bound.
