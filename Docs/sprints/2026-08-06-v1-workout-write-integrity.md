# Sprint: v1 workout write integrity

## 1. Document status

- **Date:** 2026-08-06
- **Branch:** `feature/v1-workout-write-integrity`, based on `feature/v1-password-reset` (`7d89bf1`)
  with `main` (`58608d1`) merged in — **not** branched from `main`. One branch, one purpose, per
  `Docs/invariants.md` I-14.
- **Owner:** Engineer/owner.
- **Labelling** per I-15: `[fact]` / `[decision]` / `[assumption]` / `[open question]`.
- **Naming** `[fact]`: the record is named for its branch with the `feature/` prefix dropped, per
  `Docs/agents.md` § Sprint record naming. The date is the day the record was opened, which is why it
  sorts *before* the auth-chain records (dated 2026-08-06 → 2026-08-09) that this branch is based on.
  That ordering is a pre-existing property of those records' dates, not a divergence introduced here.
- **Provenance** `[fact]`: this branch sits on top of the unmerged auth chain
  `5c18d93` → `0af00cd` → `d8c206d` → `0029a7f` → `954d075`, with `main` merged in to pick up
  `Docs/release-checklist.md`, `Docs/ui-ux-foundation-v1.md`, `app/workout/summary.tsx` and
  `package.json` (four files added to `main` after the chain forked). The merge was clean — no
  conflicts.

---

## 2. Scope

This sprint came out of a read-only multi-agent review of the repository. That review produced four
recommendations. **One of them — an authentication path — turned out to already be built** on the
unmerged auth chain above, so it was dropped from this sprint rather than reimplemented; discovering
that is why this branch is based on that chain instead of on `main`.

The remaining three, all approved by the engineer/owner before any edit:

1. **Close I-2 / G-2** — make the multi-record workout write atomic, with the mid-sequence-failure test
   I-2 names as its expected validation.
2. **Fix the draft-write race** in `activeWorkoutStore`, and stop the logger from being navigable
   mid-save.
3. **Correct the documentation** that contradicts the code — `Docs/release-checklist.md` §3 and four
   stale claims in `Docs/architecture.md`.

**Explicitly approved before starting** `[decision]`, per `CLAUDE.md` § Scope discipline and
`Docs/agents.md` § Categories of change: a **database migration**. No Supabase project setting, EAS
variable, or `eas.json` value was changed.

---

## 3. What the audit actually found: G-2 was three defects, not one

`Docs/architecture.md` G-2 and `Docs/invariants.md` I-2 both described a single problem — three
sequential, non-transactional upserts in `SupabaseRepository.saveWorkout`. That was accurate but
incomplete `[fact]`. Reading the write path against the schema found two more, each independently
capable of corrupting a lifter's history:

**1. Non-atomic** (the recorded gap). `workouts`, then `workout_exercises`, then `sets`, each
`if (error) throw`. A failure at the second left a workout row with no children; at the third, exercise
blocks with no sets. The lifter saw "could not save this session" over a session that was half in the
database.

**2. Additive only** (not recorded). The write upserted what it was given and deleted nothing. Remove
an exercise in the logger, save, and the removed exercise stayed in Postgres — `listWorkouts()` read it
straight back. The positional unique constraints do not provide replacement semantics; they only reject
a duplicate `(workout_id, order_index)`. The docstring said the method persisted "the whole object
graph", which is exactly what it did not do.

**3. Personal records could duplicate** (not recorded). Records were inserted *after* the workout save,
in a separate round trip, with freshly minted ids on every attempt. `personal_records` had no
uniqueness beyond its primary key. So: the insert commits, the response is lost, the lifter retries,
and the same PR is written a second time under a new id.

The third is the one that made "wrap it in a transaction" insufficient on its own. Finishing a session
is **one user action**, and the records are derived from the same set of sets — so they belong in the
same transaction, and the operation has to be idempotent rather than merely atomic.

---

## 4. The decision that shaped the migration: `security invoker`

`supabase/migrations/0003_workout_write_integrity.sql` defines `save_workout_graph(jsonb, jsonb)` as
**`security invoker`** — the default, stated explicitly because it is the load-bearing choice here
`[decision]`.

A `security definer` function would have been shorter. It would also have run every statement as the
function owner, **bypassing row level security entirely** — and RLS is not one control among several in
PRism, it is the whole authorization boundary (`README.md` security model, I-1, I-6). Moving the
workout write behind a definer function would have made that function the single hole in it, reachable
by any authenticated caller, forever, and it would have looked like a performance improvement in the
diff.

`security invoker` keeps every statement subject to the same policies the three individual upserts were
subject to. Ownership still comes from `auth.uid()` inside the function and never from the payload —
`fromWorkoutGraph` deliberately does not emit `profile_id` at all, which is a stronger property than
the old code's "stamp the right one client-side".

`set search_path = ''` is applied and every object is schema-qualified, matching the posture
`0002_security_hardening.sql` established for its own function.

### 4.1 Three schema changes the function needed

- **`personal_records` unique index** on `(profile_id, workout_id, exercise_id, kind)`. This is what
  makes record persistence idempotent. `workout_id` is nullable and Postgres treats NULLs as distinct,
  which is the behaviour wanted: a record orphaned by a deleted workout keeps its history and never
  collides. Pre-existing duplicates are deleted first, or the index cannot be built.
- **Deferred positional uniqueness** on `workout_exercises (workout_id, order_index)` and
  `sets (workout_exercise_id, set_index)`. `finish()` re-indexes — it drops blocks where nothing was
  completed and renumbers the rest — so re-saving a workout can swap two `order_index` values in one
  statement. A non-deferrable unique constraint is checked per row as the statement walks them, so the
  swap collides transiently and the entire save fails having changed nothing. Deferring to commit makes
  the intermediate states legal without weakening the constraint where it matters. The primary keys are
  untouched and stay non-deferrable, because `on conflict (id)` needs them as arbiters.
- **Nothing else.** `0001` and `0002` are not edited. An applied migration is never rewritten.

---

## 5. Implementation summary

**Data layer.** `Repository` gains `completeWorkout(workout, records)` alongside `saveWorkout`.
`SupabaseRepository` routes both through `save_workout_graph` via a private `saveGraph`.
`DemoRepository.completeWorkout` holds the same two properties in memory: one `multiSet` for both keys,
and the in-memory arrays replaced **only after** it resolves — the old demo writes mutated the array
first and awaited afterwards, so a storage rejection left the process believing it had saved something a
relaunch would not find. Records are keyed by `(workout, exercise, kind)`, matching the new index.

**Mappers.** `fromWorkoutGraph` (nested graph, no `profile_id`) and `fromPersonalRecord`.

**Store.** `trainingStore.completeWorkout` updates workouts and records in **one** `set`, so the read
model cannot show a finished workout without the records it set. Records merge by id rather than
append, so a retry does not grow the array.

**Logger** (`app/workout/active.tsx`). One `completeWorkout` call replaces the `upsertWorkout` →
`addPersonalRecords` pair. Three navigation fixes alongside it:
- Android hardware back is consumed while `saving` is true. `gestureEnabled: false` already stopped the
  iOS swipe and the header control now disables itself, but neither touched the hardware button — so on
  Android the one irreversible moment in the logger was also the one you could walk out of mid-write.
- The header minimise control is `disabled` while saving, with `accessibilityState` and a hint.
- A `mounted` ref guards the post-await work. If the screen went away anyway, the save still counts and
  the session is still cleared, but the redirect and the `setState` calls are skipped rather than
  yanking the lifter off wherever they navigated to.

**Draft persistence** (`src/store/activeWorkoutStore.ts`). Writes go through a revision-checked promise
queue instead of an unawaited `setItem` per mutation. See §6.2 for why this is not a theoretical fix.
`flushDraftWrites()` is exported, and `src/store/authActions.ts` awaits it before removing the key —
previously an in-flight `setItem` could land *after* sign-out's `removeItem` and leave one lifter's
session on disk for the next.

---

## 6. Testing

### 6.1 The SQL suite caught a real defect in the migration

`supabase/tests/rls/03_run_write_integrity_tests.sql` — 31 assertions, run as the non-owning
`authenticated` role with `request.jwt.claim.sub` set, exactly as PostgREST drives a real request.
Running it as the table owner would bypass the RLS these assertions depend on and prove nothing.

On its first run, **assertion 83 failed** `[fact]`: a cross-tenant write *succeeded*. Submitting another
lifter's workout id conflicted with a row RLS hides, the `where w.profile_id = v_profile` guard on the
`on conflict do update` evaluated false, and the statement simply did nothing. No error. RLS still
protected the data — every subsequent statement matched zero rows, and the assertions confirming the
other lifter's session was untouched all passed — but **the client was told the save worked when
nothing had been written**. A save that quietly writes nothing is the precise failure this migration
exists to remove. It is now an explicit ownership check raising `42501`.

This is worth recording because the defect was mine, introduced in the fix, and the only reason it is
not in the branch is that the suite existed before the migration was called done.

### 6.2 The draft-ordering tests were verified to fail without the fix

Four new cases in `src/store/__tests__/activeWorkoutStore.test.ts` hold a write pending on purpose —
something the existing tests in that file deliberately avoided (their own `beforeEach` explains that a
pending fire-and-forget write could pollute the next test, which is a workaround for the bug rather
than a test of it).

Reverting the subscriber to the old unordered `setItem` and re-running: **3 of the 4 fail** `[fact]` —
"does not start a write while an older one is still in flight", "coalesces a burst of edits in one tick
into a single write", and "never resurrects a discarded session with a write that was still in flight".
The fourth ("writes the newest state last") passes either way under the mock, because the mock resolves
in order; it is kept as a correctness regression test for the coalescing, not claimed as a
discriminating one.

### 6.3 Full results

| Suite | Result |
|---|---|
| `npx tsc --noEmit` | clean |
| `npx jest --ci` | **375 passed, 24 suites** |
| `supabase/tests/rls/run.sh` — RLS isolation (`02`) | **57 / 57** |
| `supabase/tests/rls/run.sh` — write integrity (`03`) | **31 / 31** |

The SQL suites were run against a disposable local **Postgres 16.14**, created with `initdb` and
destroyed after, with `00_setup_auth_emulation.sql` → `0001` → `0002` → `0003` → seed → `02` → `03`
applied in order from an empty database. `run.sh` is updated to include `0003` and `03`.

`0003` was additionally applied **three times in succession** against the same database with no error,
and `03` re-run afterwards still passing 31/31, confirming the "safe to run more than once" claim in its
header. `0001` is *not* re-runnable (`type "muscle_group" already exists`) — that is pre-existing and
consistent with the suite's documented "re-runnable from a clean database" contract, not something this
sprint introduced or fixed.

---

## 7. Documentation corrected

Three documents made claims the code contradicts. All three are things `CLAUDE.md` instructs agents to
trust over the code, which is what makes them worth a sprint rather than a footnote.

**`Docs/release-checklist.md` §3** stated the **opposite** of current behaviour, in the section it
itself labels "the most consequential one in this document": that an unset `EXPO_PUBLIC_DEMO_MODE`
"defaults to `true`" and that "a production EAS build today ships in demo mode". Both were true when
written and were inverted by `feature/v1-production-posture` (`5c18d93`). Today `eas.json` sets the
flag to `"false"` explicitly for the production profile, and even unset it would resolve to `__DEV__`,
which is false in any release bundle. **An operator following the old §3 would have expected a safe
self-contained demo build and produced one that opens into a permanent data-load failure.** Rewritten
as a positive pre-submission check, including "confirm every migration is applied to the target
project" — without `0003`, every workout save fails.

**`Docs/architecture.md`** — four corrections, each marked inline `Corrected 2026-08-06`:
- The `src/store` responsibility entry and the **Active workout** glossary entry both said an
  in-progress session "is not persisted until `finish()`". Untrue since the session-continuity sprint.
  Rewritten to describe the two distinct persistence layers.
- The **Tests** entry said tests existed "only for `src/domain/calc` ... No tests found for `src/data`,
  `src/store`". Actual: 24 suites, 375 tests. Still genuinely true: nothing under `app/` or
  `src/components` has a test.
- The component-layer entry stated an absolute "do not call the repository or stores directly", hedged
  only with "verified for the files read". An exhaustive grep finds **two** standing exceptions
  (`today/CheckInPrompt.tsx`, `workout/RestTimerBar.tsx`) and confirms no component reaches `src/data`.
- Plus a new dated delta entry, the G-2 row closed, and risk #2 struck.

**`Docs/invariants.md` I-2** — moved from "confirmed gap, not yet met" to **met**, with the evidence
above and both limits stated (local Postgres only; `security invoker` deliberate).

---

## 8. Explicitly out of scope

Named because the review that produced this sprint surfaced them and they were **not** fixed here
`[fact]`:

- **`trainingStore.refresh()` can overwrite a successful mutation** with a stale in-flight snapshot.
  High severity, independent of this sprint's write path, needs a refresh generation token.
- **The Epley 1RM contract contradicts itself** — `oneRepMax.ts` documents "at reps = 1 this returns
  the weight itself" and returns `weight * (1 + 1/30)`; the test asserting the buggy value is *named*
  for the documented behaviour. Product decision required on which is correct, so it is an
  `[open question]`, not an oversight.
- **`NaN` propagates** through every calculator unchecked.
- **RIR language in `loadRecommendation.ts`'s no-history rationale** ("could stop 10 reps into" for a
  target of 8), which reads against I-16's RPE-only boundary. Flagged for the readiness sprint that
  owns ADR-0002 compliance; changing suggestion copy incidentally during a data-integrity sprint would
  be exactly the scope creep `CLAUDE.md` prohibits.
- **Accessibility**: `SetRow`/`RpeSelector` at 38pt and `Chip` at 26pt against the documented 44pt
  target; `textFaint` at ~3.44:1 against the 4.5:1 requirement.
- **Deep-link blank states** on `workout/templates` and `workout/picker`.

---

## 9. Known incompleteness

- **Nothing here has run against a live Supabase project** `[fact]`. Local Postgres 16.14 only. The
  integration lane (`npm run test:integration`) remains gated on `PRISM_INTEGRATION_SUPABASE_*` and
  still reports 5 skipped.
- **The migration is not applied anywhere real** `[fact]`. Applying `supabase/migrations/` is a manual,
  documented step (G-4) with no automation. Until `0003` is applied to the production project,
  `save_workout_graph` does not exist there and **every workout save fails outright**. Loud, not
  silent — but a release blocker.
- **No cold-start on-device verification** `[fact]`. The logger's navigation guard and the disabled
  header control were not exercised on a simulator, so per `Docs/agents.md` § On-device verification
  they are **not claimed as verified** — they are claimed as implemented and type-checked.
- **The draft queue does not flush on app background** `[assumption]`. Ordering is guaranteed; a
  deliberate flush on `AppState` change would additionally bound how much is in flight when the OS
  suspends the process. Not added, to keep this sprint's surface to the race itself.

---

## 10. Validation evidence

Commands run, with actual results:

```
npx tsc --noEmit                                    → clean, no output
npx jest --ci                                       → 375 passed, 24 suites, 0 failed
PSQL_URI=... supabase/tests/rls/run.sh              → 57/57 RLS, 31/31 write integrity
  (from a clean database, Postgres 16.14)             "=== RLS isolation + write-integrity suites passed ==="
0003 applied 3× to the same database                → no error; 03 still 31/31 after
subscriber reverted to old fire-and-forget          → 3 of 4 new ordering tests fail (see §6.2)
git merge main                                      → clean, 4 files, no conflicts
```

**Changed files:**

```
supabase/migrations/0003_workout_write_integrity.sql   (new)
supabase/tests/rls/03_run_write_integrity_tests.sql    (new)
supabase/tests/rls/run.sh
src/data/repository.ts
src/data/supabase/mappers.ts
src/data/__tests__/ownership.test.ts
src/data/__tests__/repository.test.ts
src/store/activeWorkoutStore.ts
src/store/authActions.ts
src/store/trainingStore.ts
src/store/__tests__/activeWorkoutStore.test.ts
app/workout/active.tsx
Docs/architecture.md
Docs/invariants.md
Docs/release-checklist.md
Docs/sprints/2026-08-06-v1-workout-write-integrity.md  (new)
```

---

## 11. The exact next decision

**Does the auth chain merge to `main` before or after this branch?**

This branch is based on `feature/v1-password-reset`, so merging it to `main` merges the entire chain
beneath it — five sprints of auth work — in one go. That may be exactly what is wanted, or it may be
too large a single review. The alternatives:

1. **Merge the chain first, then this branch.** Five PRs (or one), then this one on top. Reviewable in
   the order the work happened.
2. **Merge this branch as-is**, accepting that its PR carries the auth chain with it.
3. **Rebase this branch onto `main`**, isolating it — at the cost of conflicts in `repository.ts`,
   `activeWorkoutStore.ts`, `trainingStore.ts` and `architecture.md`, which the chain also modifies.

Recommendation `[recommendation]`: option 1. Nothing in this branch depends on auth *code* — it depends
on auth having landed conceptually, because a real-backend write path is what makes I-2 cost anything.

**Second, smaller decision:** who applies `0003` to the production Supabase project, and when? It is a
release gate (§9), it needs privileged access an agent does not hold (I-4), and it must happen before
any build that talks to that project ships.
