# Sprint: v1 partial check-in schema

## 1. Document status

- **Date:** 2026-08-06
- **Branch:** `feature/v1-checkin-partial-schema`, based on
  `feature/v1-workout-write-integrity` (`33a32ef`). It has to be: `0004` follows `0003`, and both
  edit `supabase/tests/rls/run.sh`.
- **Owner:** Engineer/owner.
- **Labelling** per I-15: `[fact]` / `[decision]` / `[assumption]` / `[open question]`.
- **Why this sprint exists now** `[fact]`: the engineer/owner set a direction — move off demo mode and
  collect real user data. This is the one item found that turns a **working** feature into a **broken**
  one at the moment that flag flips, so it was taken first.

---

## 2. Scope

Close the limitation `Docs/invariants.md` I-7 records against itself: partial check-ins work against
`DemoRepository` and throw against Supabase.

**Approved before starting** `[decision]`: a database migration, per `CLAUDE.md` § Scope discipline.

---

## 3. The defect, and why it was worse than "a missing migration"

I-7 makes optionality a hard product boundary — sleep, energy, soreness and stress are each answerable
on their own, and a field left alone is stored as null rather than defaulted. The invariant records the
gap in its own evidence section: *"partial check-ins work against `DemoRepository` only… a
nullable-column migration is required before partial check-ins reach Postgres, and none is made by this
sprint."*

Three facts make that more than a to-do `[fact]`:

1. **It is reachable on the first tap.** `CheckInPrompt` enables submit as soon as *any* one scale is
   answered (`anyAnswered`). A lifter answering only "slept badly" and nothing else is the ordinary
   case, not an edge case.
2. **It fails invisibly.** `SupabaseRepository.saveCheckIn` called `assertCompleteCheckIn`, which threw.
   `CheckInPrompt`'s catch deliberately keeps the underlying error out of the UI — correctly, since it
   can carry schema detail — so the lifter saw a generic failure with no explanation and no recourse.
3. **No build anyone has run would catch it.** Dev is demo mode (`__DEV__`), where it works perfectly.
   It appears only in a build pointed at a real backend.

`Docs/production-posture-v1.md` — the document that sequences going live — **does not mention check-ins
anywhere** `[fact]`. This was not on the path to production; it was underneath it.

---

## 4. The part that was not just nullability

Relaxing four `not null` constraints was the easy half. The hard half is that `DemoRepository`
implements **three-way per-field semantics**, and `src/domain/types.ts` says outright why they matter:

> Collapsing null into "absent" would make an erased answer come back on the next read.

| Patch contains | Means | Stored result |
|---|---|---|
| key absent | "leave my earlier answer alone" | unchanged |
| key present, value `null` | "erase that answer" | null |
| key present, value 1–5 | "this is my answer" | the value |

**A plain `upsert` cannot express this** `[fact]`. It sends a row, so every column is present, and
"not mentioned" collapses into "explicitly cleared". That is why `0004` adds a function taking `jsonb`:
`p_patch ? 'energy'` is true only when the client actually sent the key. `SupabaseRepository.saveCheckIn`
now builds its payload with `field in checkIn` rather than by value, so an explicit null survives the
trip as a present key.

### 4.1 A second defect found on the way

The old client upserted on the **primary key**. A second submission the same day carrying a *new* id
would therefore have inserted a second row and violated `check_ins_one_per_day` `[fact]`. It only ever
worked because `CheckInPrompt` happens to reuse `checkIn?.id` from the store when today's record is
already loaded — i.e. it depended on a cache being warm.

`save_check_in` resolves the day server-side and merges into whatever row exists, so the write is
correct whether or not the client knows that id. Asserted directly: the merge test deliberately submits
with a different id and checks that exactly one row exists and it kept its **original** id.

### 4.2 Two decisions worth stating

**No at-least-one-answered constraint** `[decision]`. Tempting — an all-null check-in carries no
information and the UI will not submit one. Rejected because `DemoRepository` permits clearing every
field (`repository.test.ts` asserts a cleared field stays cleared), so a constraint here would make
Postgres reject a state demo mode accepts. A demo/real divergence is worse than an empty row: it is the
class of bug that only appears in production, which is the exact thing this sprint exists to remove. The
UI stays the gate, and assertion set 5 pins the decision so it is visible rather than implicit.

**`security invoker`, as with `save_workout_graph`** `[decision]`. RLS applies to every statement inside
the function and ownership comes from `auth.uid()`. The client now sends **no owner at all** for a
check-in, which is stronger than sending the right one.

---

## 5. The divergence this sprint did NOT resolve

`[open question]` — **what is a training day?**

- `DemoRepository.sameCalendarDay` uses the **device's local** calendar day
  (`Date.getFullYear/getMonth/getDate`).
- `check_ins_one_per_day` and therefore `save_check_in` use **UTC**
  (`timezone('utc', checked_in_at)::date`).

For a lifter west of UTC, check-ins at 23:30 and 00:30 local are **two days** to demo mode and **one
day** to Postgres. This was flagged in the review that opened this branch series and is not fixed here.

Why not `[decision]`: the function had no choice — the unique index is what would reject a second row,
so any other definition inside `save_check_in` would merge into one day and then be rejected for
colliding with another. Making the two agree means either changing demo mode's behaviour (user-visible)
or changing the index (schema, and wrong for anyone not on UTC). That is a product decision about what a
training day *is*, and settling it quietly inside a migration would be exactly the scope creep
`CLAUDE.md` prohibits. Recorded in the migration comment, here, and left for the owner.

**Practical impact today:** low. It changes which day a late-evening check-in lands on, not whether it
saves. It should be settled before real users are in multiple time zones.

---

## 6. Validation evidence

```
npx tsc --noEmit                          → clean, no output
npx jest --ci                             → 376 passed, 24 suites, 0 failed
PSQL_URI=... supabase/tests/rls/run.sh    → 57/57 RLS
  (clean database, Postgres 16.14)          31/31 write integrity
                                            23/23 partial check-in
                                            111 assertions total
0004 applied 3× to the same database      → no error; 04 still 23/23 after
```

The 23 assertions map one-for-one onto the demo-mode tests in
`src/data/__tests__/repository.test.ts` wherever an equivalent exists — the suite header names them —
because parity with demo is the property under test, not merely "the function works".

**Changed files:**

```
supabase/migrations/0004_partial_check_ins.sql        (new)
supabase/tests/rls/04_run_check_in_tests.sql          (new)
supabase/tests/rls/run.sh
src/data/repository.ts
src/data/__tests__/ownership.test.ts
Docs/sprints/2026-08-06-v1-checkin-partial-schema.md  (new)
```

---

## 7. Known incompleteness

- **Not run against a live Supabase project** `[fact]`. Local Postgres 16.14 only, as with every sprint
  in this chain. The integration lane remains gated and skipped.
- **`0004` is not applied anywhere real** `[fact]`. Until it is, `save_check_in` does not exist and
  **every check-in fails** — where previously only *partial* ones did. This narrows the window of
  brokenness but does not remove it until the migration is applied.
- **The day-boundary divergence is open** (§5).
- **No on-device verification** `[fact]`. The client change is type-checked and unit-tested; it has not
  been exercised in a running app, and could not be meaningfully — demo mode does not execute this path.

---

## 8. The exact next decision

**Two, in order:**

1. **Which Supabase project, and applied when?** `0001` → `0002` → `0003` → `0004`, in that order, on a
   project that is not the free-tier `prism-rls-verification` instance if it is going to hold real
   training history (no backups, no PITR, auto-pauses when idle). This now gates check-ins as well as
   workouts.
2. **What is a training day — local or UTC?** (§5). Not urgent, cheap to answer, and it gets more
   expensive to change once real check-ins exist.

Still outstanding from the wider go-live sequence and **not** advanced here: **I-10** (account deletion
and export), which the direction to collect real user data promotes from "blocking for store
submission" to the most exposed remaining gap — accounts can be created, signed into, and filled with
health-adjacent data, and still not deleted or exported.
