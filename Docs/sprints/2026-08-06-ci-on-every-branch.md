# Sprint: CI on every branch

## 1. Document status

- **Date:** 2026-08-06
- **Branch:** `fix/ci-on-every-branch`, based on `main` (`82dff84`).
- **Owner:** Engineer/owner.
- **Labelling** per I-15: `[fact]` / `[decision]` / `[assumption]` / `[open question]`.

---

## 2. Scope

Answers the open question left by `Docs/sprints/2026-08-06-ci-node-and-websocket-in-tests.md` §7:
*should CI run on every branch, not just `main`?*

**Answer: yes** `[decision, engineer/owner, 2026-08-06]`. One change — the `pull_request` trigger in
`.github/workflows/ci.yml` loses its `branches: [main]` filter.

---

## 3. Why

`ci.yml` triggered only on `main`, so a pull request targeting any other branch never ran CI `[fact]`.

That is not hypothetical. On 2026-08-06 a six-PR stack (`#47`–`#52`) each reported `mergeStateStatus:
CLEAN` on GitHub **having never been tested** — the workflow simply never fired for them. `main` was
red at the same time, behind them, for an unrelated Node-version defect. The merges proceeded on
evidence that did not exist.

**A check that cannot run is worse than no check, because it reads as a pass.** "Clean" on a PR that
never ran CI is indistinguishable, in the UI and in a person's head, from "clean" on one that did.

Stacked pull requests are the normal shape of work in this repository — one sprint, one branch
(`Docs/invariants.md` I-14) — and a stack means most PRs target something other than `main` for most of
their life. So "targets `main`" was never a good proxy for "worth testing".

---

## 4. Cost, checked rather than assumed

This was previously deferred on the grounds that widening the trigger "changes CI spend, which is the
owner's call". That reasoning was wrong and is worth recording as wrong `[fact]`:

- **`brendantr/prism` is a public repository**, so GitHub-hosted runners are free. There is no spend.
- A run takes **~45 seconds** (four consecutive `main` runs on 2026-08-06 measured 40–48s).
- The existing `concurrency` block (`cancel-in-progress: true`) already cancels superseded runs, so a
  branch pushed repeatedly does not queue up.

The deferral was made on an assumption about repository visibility that nobody had checked.

---

## 5. Validation evidence

```
node -e <structural parse of ci.yml>   → `jobs:` intact; `pull_request` carries no branch filter
```

A bare `pull_request:` key means *all* branches, which is the intended behaviour.

**The real validation is this pull request itself** `[fact]`: it targets `main`, so it would have run
under the old configuration too — but every PR opened after it that targets a non-`main` branch is
proof the change works, and the first one that fails CI before landing is the change paying for itself.

**Changed files:**

```
.github/workflows/ci.yml
Docs/sprints/2026-08-06-ci-on-every-branch.md   (new)
```

---

## 6. Known incompleteness

- **`push` is still filtered to `main`** `[decision]`. Deliberate: with `pull_request` unfiltered, a
  branch with an open PR is already covered, and adding `push: ['**']` would double every run for no
  additional signal. A branch with no PR is not yet asking to be reviewed.
- **The SQL suites are still not in CI** `[fact]`. `supabase/tests/rls/run.sh` needs a live Postgres;
  132 assertions across four suites are run by hand.
  `Docs/sprints/2026-08-04-supabase-rls-ci.md` covers that work. **This is now the largest remaining
  hole in automated coverage** — every migration from `0003` on is verified only by a human choosing
  to run a script.

---

## 7. The exact next decision

None. The remaining CI question is the SQL suites (§6), which is its own sprint.
