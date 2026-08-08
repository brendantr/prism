# Sprint: account deletion for lifters with custom movements

## Document status

- **Status:** Fixed and verified against local Postgres 16.14. **Not yet applied to the staging
  project** — that is the owner's step, and the integration lane stays red until it is.
- **Date opened:** 2026-08-08
- **Branch:** `feature/v1-library-seed` (continues that branch; see §5)
- **Labels:** `[fact]`, `[assumption]`, `[recommendation]`, `[open question]`.

---

## 1. The defect

`[fact]` A lifter who created their own exercise and logged a session with it **could not delete their
account**. `delete_my_account()` raised:

```
update or delete on table "exercises" violates foreign key constraint
"workout_exercises_exercise_id_fkey" on table "workout_exercises"
```

Deleting the `auth.users` row cascades to `profiles`, and from there to **both** the lifter's
`exercises` and their `workouts`. Postgres does not define the order of those two cascade branches,
and `on delete restrict` is enforced immediately — so when the exercise branch runs first, a
`workout_exercises` row still references the movement and the entire delete aborts.

This is `Docs/invariants.md` **I-10**, the store-submission blocker, failing for an ordinary case.

`[fact]` **Not reachable by a lifter today**, because no create-exercise flow exists in the app
(`Repository` has no exercise write methods). It becomes reachable the moment that flow ships, which
is the next planned sprint. It is reachable now via the REST API, which is how it was found.

## 2. How it was found, and why nothing caught it

`[fact]` Found by `src/data/supabase/__tests__/repository.integration.test.ts` running against a real
Supabase project for the first time — by a test account creating a custom movement, logging a workout
with it, and deleting itself. Ordinary product behaviour, not a contrived probe.

`[fact]` `supabase/tests/rls/05_run_account_deletion_tests.sql` builds its fixture user with a workout
that has **no exercise blocks at all**, so the two cascade branches never collided. 21 assertions,
all green, none of them this.

`[fact]` `0002_security_hardening.sql` §2 saw *half* of it: it documents `restrict` permanently
blocking an owner's delete, but only in the **cross-tenant** case (your workout referencing someone
else's private exercise), and closed that with the `assert_exercise_visible` trigger. The same-tenant
case — your own workout blocking your own account — was never considered.

## 3. The fix

`supabase/migrations/0007_deletable_account_with_custom_exercises.sql` changes
`workout_exercises.exercise_id` and `routine_exercises.exercise_id` from
`on delete restrict` to `on delete no action deferrable initially deferred`.

**Not `on delete cascade`** `[recommendation, taken]`. That would be one word and it is wrong:
deleting a movement would silently delete the sets performed with it. The `restrict` is protecting
real training history and has to keep protecting it. `no action deferrable initially deferred` keeps
the same rule and moves *when* it is checked from statement time to commit time — inside the delete
transaction the referencing rows are gone too, so the check passes; outside it, they are not, so it
still fails. `restrict` cannot be deferred; `no action` is the deferrable form of the same constraint.

`personal_records.exercise_id` is untouched — already `on delete cascade`, so it can never block.

`routine_exercises` is fixed alongside even though routine editing does not exist yet: it is the
identical constraint, and fixing one without the other leaves a trap for whoever builds the plan
editor.

## 4. Validation

`[fact]` Reproduced first, then fixed, then both verified:

| Check | Result |
|---|---|
| Reproduction on local Postgres 16.14, all 6 migrations | Identical FK error to production |
| After `0007` — account with custom movement logged | **Deletes**, nothing of theirs left behind |
| After `0007` — deleting a movement a session references | **Still refused** |
| After `0007` — deleting an unreferenced movement | Still works |
| Seeded system catalogue after all of the above | 43, untouched |
| `supabase/tests/rls/run.sh`, clean database | **154/154** (57 + 31 + 23 + 21 + 14 + **8 new**), reproduced twice |

`supabase/tests/rls/07_run_exercise_reference_tests.sql` is deliberately built around the shape 05
was missing, and asserts the constraint's *catalogue shape* as well as its behaviour — a later
migration "tidying" these to `cascade` would pass every behavioural assertion while silently
destroying logged sets.

`[fact]` **Not verified:** `0007` has not been applied to the staging project. Until it is, the
integration lane's deletion test stays red, and every test account that created a custom movement
cannot be deleted — including the leftovers this investigation created.

## 5. Why the same branch

Per `Docs/agents.md`, a sprint that continues an existing branch says so. This lands on
`feature/v1-library-seed` because the defect is only reachable through the create-exercise capability
that branch's own record names as the next sprint, and because splitting a one-migration fix onto its
own branch would put `0007` behind `0006` in a way that makes the staging apply order harder to
follow, not easier.

## 6. The next decision

**Apply `0007` to the staging project**, then re-run `npm run test:integration` — 19/19 expected.

`[open question]` The leftover `prism-int-…@example.com` accounts in staging: those that created
custom movements will not delete until `0007` is applied. After it, they will. No manual cleanup
should be needed.
