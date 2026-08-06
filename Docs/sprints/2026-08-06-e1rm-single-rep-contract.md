# Sprint: e1RM single-rep contract

## 1. Document status

- **Date:** 2026-08-06
- **Branch:** `fix/e1rm-single-rep-contract`, based on `main` (`08c87dd`, i.e. after PR #45 merged).
  Deliberately **not** based on the `v1-workout-write-integrity` stack — it touches
  `src/domain/calc/oneRepMax.ts` and `calc.test.ts`, neither of which any open PR modifies, so it can
  land independently and in either order.
- **Owner:** Engineer/owner.
- **Labelling** per I-15: `[fact]` / `[decision]` / `[assumption]` / `[open question]`.

---

## 2. Scope

One decision, executed. `Docs/sprints/2026-08-06-v1-workout-write-integrity.md` §8 raised the
self-contradicting Epley contract as an `[open question]` and explicitly declined to resolve it,
because which answer is correct is a product judgement about what an e1RM PR means.

**Engineer/owner decision, 2026-08-06** `[decision]`: `estimateOneRepMax(w, 1)` returns `w`.

That open question in the write-integrity record is now answered; nothing else in this sprint.

---

## 3. What was wrong

`src/domain/calc/oneRepMax.ts` carried this comment from its first commit `[fact]`:

> At reps = 1 this returns the weight itself, which is the behaviour we want: a single is its own
> max, not an extrapolation.

The code did not do that. `estimateOneRepMax(100, 1)` returned `100 * (1 + 1/30)` = **103.33**.

The test was the interesting part. It was **named** `'returns the weight itself for a single'` and
asserted `toBeCloseTo(100 * (1 + 1 / 30), 6)` — restating the implementation under a heading that reads
as a guarantee against it. A reviewer scanning test names would have concluded the contract held. This
is the failure mode of a test that recomputes the formula instead of asserting a literal: it can only
ever agree with the code, including when the code is wrong.

**User-visible consequence** `[fact]`: a lifter completing a 100 kg single recorded an estimated-1RM of
103.33. Their e1RM PR therefore sat *above* a lift they had demonstrably just completed, and a later
genuine 103 kg single would not register as a PR at all. `bestsFromHistory`, `detectWorkoutPrs` and the
progress chart all read from this function, so the inflated figure propagated to every surface that
shows a best.

---

## 4. Change

- `estimateOneRepMax`: early return of `weightKg` when `reps === 1`, before the curve. Written as an
  early return rather than folded into the arithmetic so it reads as a stated rule.
- `weightForReps` (inverse Epley): the matching rule at `targetReps === 1`. **This side had to change
  too** `[fact]` — with only the forward function special-cased,
  `weightForReps(estimateOneRepMax(w, 1), 1)` returned `0.968 · w`, breaking the round trip, and
  `recommendNextLoad` would have suggested 96.8% of a lifter's e1RM for a single.
- Tests: the mis-named assertion now asserts the literal `100`. Three cases added — a single is never
  rated above a two-rep set at the same weight; a heavier single out-ranks a lighter one (the exact
  regression); and the inverse round-trips at one rep.

---

## 5. Blast radius checked, not assumed

`estimateOneRepMax` has five call sites outside its own module `[fact]`: `prs.ts` (×3),
`loadRecommendation.ts` (×2), and the onboarding e1RM card. Only sets with `reps === 1` change value;
every other input is untouched, so the change is strictly narrowing.

`src/content/__tests__/onboarding.test.ts` asserts eight **hardcoded literal** e1RM figures for the
onboarding progress chart. Those samples are all 5–6 rep sets, contain no single, and the assertions
still pass unchanged — confirming no onboarding or marketing surface moved.

**Not migrated** `[fact]`: any e1RM PR already stored in a real database from a single was computed
under the old behaviour and is 3.3% high. No data migration is included, because no production data
exists yet (`Docs/architecture.md` G-4 — the migrations have not been applied to a real project). **If
that stops being true before this ships, a recompute is required** — flagged here rather than
discovered later.

---

## 6. Validation evidence

```
npx tsc --noEmit   → clean, no output
npx jest --ci      → 290 passed, 20 suites, 0 failed
```

(20 suites rather than 24: this branch is off `main`, which currently carries only PR #45. The other
four suites arrive with PRs #46–#49.)

**Changed files:**

```
src/domain/calc/oneRepMax.ts
src/domain/calc/__tests__/calc.test.ts
Docs/sprints/2026-08-06-e1rm-single-rep-contract.md   (new)
```

---

## 7. The exact next decision

None outstanding for this change. The one thing to watch: **if real user data is written before this
merges**, e1RM PRs derived from singles need recomputing (§5). Whoever applies
`supabase/migrations/` to a live project should confirm this has landed first.
