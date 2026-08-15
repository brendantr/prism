# Sprint: bound the startup reads

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

`[fact]` **All three of the unbounded reads are now bounded.** The first pass covered `listWorkouts`
alone and left `listCheckIns` and `listPersonalRecords` open as a stated follow-up; this record covers
both passes. `listMeasurements` is still unbounded — see §5.

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

### 2.5 Records and sessions are one coverage concept, not two `[decision]`

`CHECK_IN_LIMIT = 120` and `PERSONAL_RECORD_LIMIT = 400`, and the two are bounded for different reasons.

**Check-ins are the easy case.** One row per device-local day, and nothing in the app browses their
history — Today reads the latest and today's, and that is all. 120 rows is roughly four months, well
past both readiness's 36-hour staleness cutoff and the 84-day analysis window. The headroom is
deliberate: a bound sized to exactly today's callers is the one that silently truncates the first
readiness-trend surface anyone builds.

**Records are the dangerous case, and the number is not what makes them safe.** History matches records
to sessions — a count on each row, and which sets are marked on a session's detail. So a record window
narrower than the loaded session window does not hide a row; it prints **"0 PRs" on a session that set
three**. A wrong number is a worse failure than a missing one, because nothing about it looks broken.

What prevents it is the *coupling*, not the constant:

- `historyComplete` is **one flag for both**. Two independent flags would have made the broken state
  representable. It is also false when *either* window hit its cap, so a capped record set forces a
  top-up even when the session list came back short.
- `loadFullHistory()` loads the full session archive and the full record set **together**, in one step.

`historyComplete` replaced `workoutsComplete` in the same change, because a name claiming to describe
sessions while governing records too is the kind of drift that gets one of them dropped later.

### 2.6 The sort inversion lives in one place `[decision]`

All three bounded reads need the same subtle trick, so `readWindow` in `src/data/repository.ts` holds
it once rather than three call sites re-deriving — and eventually mis-deriving — it. `newestWindow` is
its trivial demo-side counterpart, named so the parity test has something to point at.

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
- `src/data/repository.ts` — `{ limit }` on `listWorkouts`, `listCheckIns` and `listPersonalRecords`
  across the interface and both implementations, plus the shared `readWindow` / `newestWindow` helpers
- `src/data/__tests__/workoutWindow.test.ts` (new) — Supabase query shape and export completeness
- `src/data/__tests__/repository.test.ts` — demo/Supabase parity for the window
- `src/store/trainingStore.ts` — three bounded startup reads, `historyComplete` (was
  `workoutsComplete`), `loadFullHistory` loading sessions and records together, and the two redundant
  reads removed
- `src/store/__tests__/trainingStore.test.ts`
- `app/history/index.tsx`, `app/history/[id].tsx` — top-up on entry / on a missed lookup

---

## 5. Evidence

`[fact]` Commands run and their actual results:

- `npx tsc --noEmit` — clean.
- `npm run verify` — **665/665 tests across 48 suites** (from 642/46 before this work).
- Reads at startup: **10 → 8**, and three of them are now bounded (sessions, check-ins, records).
- Jest still reports its pre-existing worker-force-exit warning after a green run; unchanged by this
  sprint and noted so it is not read as new.

`[fact]` **Not** done, and not claimed:

- No hosted project was touched, and no measurement of a real payload was taken. The improvement is
  argued from the query shape, not from a benchmark against a large real account.
- No device run. The two History screens changed and there is no component-test tooling, so their
  behaviour is covered only through the store and the pure predicates beneath them.
- **`listMeasurements` is still unbounded**, and is now the only one. It was left out because the
  request was for the check-in and record reads specifically, and widening scope unasked is how a
  bounded change stops being reviewable. It is the same one-line change as the other two.
  `[open question]` Worth doing, and cheap.
- The record limit is **headroom, not a derived ceiling**. The schema permits four `pr_kind` values
  per exercise per session, so a bound derived from it would be enormous and useless. Correctness does
  not rest on the number — it rests on §2.5's coupling — but the number has not been checked against a
  real long-tenured account.

---

## 6. Follow-ups

`[recommendation]`

1. Re-run the cold-start walkthrough (`Docs/tester-readiness-runbook.md` §6) and specifically open
   History, which is the one surface whose data now arrives in two stages.
2. Measure a real account before tuning the limit. 120 was chosen to be comfortably safe, not tight.
3. Consider cursor pagination in History itself. `loadFullHistory` is an unbounded read; it is now
   behind an explicit user action on the screen whose purpose is browsing everything, which is a very
   different cost profile from every cold start — but it is not a bound.
