# Sprint: supabase-rls-ci

## 1. Status and intent

- **Status:** Implemented, merged, and validated with a real observed CI run (not just a valid-looking diff). Merged to `main` as `e30eb55` (PR #31), on top of `46218a9`.
- **Date:** 2026-08-04
- **Branch:** `feature/supabase-rls-ci`, branched fresh from `main` at `85cfe8d` — deliberately not from `feature/supabase-config-infra-v1` (the broader planning branch), since that branch's own document states it is implemented by a separate branch, and it remains local-only, unpushed, and undecided (see §6).
- **Mission:** The smallest safe first step of the broader Supabase config-infra plan (`Docs/sprints/2026-08-03-supabase-config-infra-v1.md`, planning-only): wire the existing `supabase/tests/rls/run.sh` isolation suite into CI, so a row-level-security regression in `supabase/migrations/*.sql` fails a check instead of shipping silently.

## 2. Explicit non-fixes / out of scope

Named explicitly, per this repository's convention of stating what a sprint does not do rather than leaving it to be inferred:

- **No real Supabase project linking.** No `supabase/config.toml`, no `supabase link`, no project ref anywhere. The `rls` CI job's Postgres is an ephemeral GitHub Actions service container (`postgres:16`), torn down when the job ends — not the hosted project this repository has (per `Docs/architecture.md`) never been confirmed to have run against at all.
- **No seed data.** `supabase/seed/` was not created; the exercise-library seed step from the broader plan is untouched.
- **No README changes.** The "Connecting Supabase" section's manual dashboard-paste instructions (and the fact that they never mention applying `0002_security_hardening.sql` — a real, separately-noted gap) are unchanged.
- **No app/runtime code changes.** `src/data/supabase/`, `src/data/repository.ts`, and every domain/UI file are untouched.
- **`supabase/tests/rls/run.sh` and every SQL file under `supabase/tests/rls/` and `supabase/migrations/` are unmodified.** This sprint wires an existing, already-correct suite into CI; it does not touch what the suite tests or how.

## 3. What changed

**Modified:**
- `.github/workflows/ci.yml` — one new job, `rls` ("RLS isolation suite"), added after the existing `verify` job. Purely additive: +43 lines, 0 deletions, confirmed by diff before committing. Runs in parallel with `verify`, not nested inside it, so a failure is unambiguously attributable and a Node/npm-only regression can never mask an RLS regression or vice versa.
  - `postgres:16` as a `services:` container — pinned to match the Postgres major version this suite's own prior disposable-instance verification used (`Docs/sprints/2026-08-01-rls-migration-fix.md`), not any particular hosted project's version.
  - `postgresql-client-16` installed explicitly via `apt-get`, even though it was verified already present on `ubuntu-latest` (cross-referenced GitHub's `actions/runner-images` manifest against Ubuntu's own package archive at `packages.ubuntu.com/noble/postgresql-16`, confirming a hard `dep:` on `postgresql-client-16` from the pre-installed `postgresql-16` package) — so this job does not depend on that staying true if GitHub's runner image changes.
  - `run.sh` invoked directly (`supabase/tests/rls/run.sh`), using its existing executable bit (`100755` in git) and its own `PSQL_URI` contract.
- `Docs/architecture.md` — two small, surgical corrections to close out language that PR #31 made stale the moment it merged (not a rewrite): the CI-coverage paragraph now describes both jobs, and the `G-3` Known Gaps row's "wire into CI" recommendation — which named this exact action — is marked resolved with a pointer here, rather than left asserting a follow-up that had already happened.

**Not modified:** everything else, per §2.

## 4. Validation performed

| Check | Result |
|---|---|
| YAML structural validation (`js-yaml`, already present transitively — no new dependency) | Parsed cleanly; confirmed the `verify` job's parsed structure identical to before, `rls` job shaped correctly |
| `git diff --check` | Clean |
| `git diff --stat` before commit | One file, `.github/workflows/ci.yml`, +43/−0 |
| **Actual GitHub Actions run on PR #31** | **Both jobs passed.** `Typecheck and test`: 33s. `RLS isolation suite`: 43s — every step green, including `Install postgresql-client-16` and `Run RLS isolation suite` itself. |
| PR mergeability | `MERGEABLE` / `CLEAN`, re-confirmed immediately before merging |

The `psql`-availability claim was checked against evidence (GitHub's runner-images manifest cross-referenced with Ubuntu's package archive), not asserted from memory — see §3.

**One thing observed but not this sprint's to fix:** the run carried a pre-existing deprecation annotation about `actions/checkout@v4`/`actions/setup-node@v4` being forced onto Node 24 as GitHub deprecates Node 20 runners. This is unrelated to this change (the same action versions were already pinned in the `verify` job beforehand) and out of scope for "wire the RLS suite into CI."

## 5. Unresolved risks / carried-forward gaps

- **The rest of the broader Supabase config-infra plan remains undone**, by design: no project linking, no seed script, no README rewrite, no reconciliation of the `EXPO_PUBLIC_SUPABASE_*` vs. `PRISM_INTEGRATION_SUPABASE_*` env-var split. All named in `Docs/sprints/2026-08-03-supabase-config-infra-v1.md`.
- **`README.md`'s "Connecting Supabase" instructions still never mention applying `supabase/migrations/0002_security_hardening.sql`** — found during the planning pass for this work, not fixed here (explicitly out of scope, §2), and not yet tracked as its own gap row anywhere.
- **The RLS check is not (yet) a required status check on branch protection.** This repository has no branch protection configured on `main` at all (confirmed via the GitHub API during the branch-audit work earlier this session), so a red `rls` job is visible but not currently blocking. Whether to add branch protection is a separate decision, not addressed here.
- **`feature/supabase-config-infra-v1`** — the local-only, unpushed planning branch — remains untouched and its disposition (push it, open a PR from it, or keep it as a private planning artifact) is still the owner's open decision from the earlier branch audit, not resolved or acted on by this sprint.

## The exact next decision needed

**Which piece of the remaining Supabase config-infra plan should be scoped next — project linking, the seed script, or the README rewrite — and is there already a real hosted Supabase project to link to, or does this work also need to provision one?** `Docs/architecture.md` finds no evidence a live project has ever been used from this repository; that's the one question in the broader plan that is squarely an owner/cloud-resource decision (`CLAUDE.md`'s explicit approval gate) rather than something resolvable by further reading.
