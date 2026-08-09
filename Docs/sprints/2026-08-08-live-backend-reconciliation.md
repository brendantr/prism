# Sprint: live-backend documentation reconciliation

## Document status

- **Status:** Complete; hermetic validation green. Live/SQL evidence was reconciled from the owner
  handoff and not rerun without credentials.
- **Date opened:** 2026-08-08
- **Branch:** `docs/live-backend-reconciliation`
- **Base:** `feature/v1-first-run-routing` at `dc31412`, so the record and architecture can describe
  open PR #58's actual route graph and remove its `TODO(docs)` marker without inventing future state.
- **Labels:** `[fact]`, `[assumption]`, `[recommendation]`, `[open question]` — per
  `Docs/invariants.md` I-15.

---

## 1. Purpose and scope

`[fact]` The accepted implementation baseline still said the Supabase path, transactional workout
write, deletion/export and auth lifecycle had never executed against a hosted project. That became
false after the engineer created staging, applied migrations `0001`–`0007`, ran the app-owned
integration lane, and drove the first-run path on a cold-started simulator.

This sprint reconciles those claims. It changes documentation and removes stale documentation TODO
comments only. It does **not** change feature logic, schema, RLS, dependencies, EAS/Supabase settings,
or any production resource.

## 2. Evidence re-read before editing

`[fact]` Repository evidence inspected directly:

- `src/domain/routing.ts`, its truth-table/stability tests, `app/_layout.tsx`, the onboarding redirect,
  and `app/auth/index.tsx` — the post-PR-#58 gate and single routing authority.
- Migrations `0001`–`0007`, `supabase/tests/rls/run.sh`, and deletion suites 05/07 — including that
  suite 05's fixture workout has no exercise blocks.
- `eas.json` — `preview` and `production` explicitly set `EXPO_PUBLIC_DEMO_MODE: "false"`;
  `development` alone stays demo.
- The 19-test integration source/workflow, the seven named `TODO(docs)` markers, package scripts, and
  the four sprint records this work follows.
- Git history for PR #58 (`5f70f2c`, `dc31412`) and the local remote-tracking ref for PR #55
  (`0859448`).

`[fact, engineer/owner handoff]` External execution evidence supplied for reconciliation, not rerun by
this branch: integration **19/19** locally and in GitHub Actions against staging; local SQL
**154/154**; hermetic **456 tests / 26 suites** with clean typecheck; a cold-started simulator completed
sign-up → setup → Today → deletion, while sign-out and export were also exercised against staging.

## 3. Documentation changes

- `Docs/architecture.md` gains live-staging, `0007`, and PR #58 deltas; rewrites the first-run gate,
  live-project qualification, route map, current counts, G-1/G-2/G-7, and the startup diagram.
- `Docs/invariants.md` distinguishes staging from production for I-1/I-2, records live check-in and
  deletion/export evidence, adds the instructive `0007` failure chapter to I-10, and updates I-19's
  rendering evidence.
- `README.md` now requires every migration in order and points to the staging runbook; it no longer
  instructs a hand-built catalogue seed.
- `Docs/production-posture-v1.md` and `Docs/release-checklist.md` now treat `preview` as a real-backend
  profile whose remaining pre-build dependency is its two public Supabase EAS values. The mode flag
  remains per-profile in `eas.json` and is not one of those values.
- The four source sprint records gain dated follow-ups instead of silently rewriting their original
  pre-run evidence.
- ADR-0004 and I-8 now record the closed auth-failure taxonomy and its one-code/one-sentence boundary,
  allowing all seven now-satisfied `TODO(docs)` comments to be removed.

### 3.1 Changed files — exact list

- `Docs/architecture.md`
- `Docs/decisions/ADR-0004-authentication-and-session.md`
- `Docs/invariants.md`
- `Docs/production-posture-v1.md`
- `Docs/release-checklist.md`
- `Docs/sprints/2026-08-07-library-seed.md`
- `Docs/sprints/2026-08-07-staging-supabase-verification.md`
- `Docs/sprints/2026-08-08-account-deletion-fk-fix.md`
- `Docs/sprints/2026-08-08-first-run-routing-fix.md`
- `Docs/sprints/2026-08-08-live-backend-reconciliation.md`
- `README.md`
- `app/auth/index.tsx`
- `src/content/onboarding.ts`
- `src/data/supabase/client.ts`
- `src/domain/authErrors.ts`
- `src/domain/routing.ts`
- `src/store/authActions.ts`
- `src/store/sessionStore.ts`

## 4. PR #55 carry item

`[fact, local remote-tracking ref origin/fix/deletion-outcome-honesty at 0859448]` The change to
`supabase/migrations/0005_account_deletion.sql` is **comment-only**: eight header lines correct the
claim that `delete_my_account` is the only `security definer` function (`handle_new_user` is also one;
deletion is the only destructive definer). It changes no DDL, function body, grant, policy, constraint,
or executable SQL. **Staging does not need `0005` re-applied for PR #55.**

The PR is not documentation-only overall: it also changes deletion teardown/error handling, copy and
tests. It remains open and unmerged; this sprint neither cherry-picks nor evaluates those implementation
changes beyond the migration question the handoff required.

## 5. Validation

`[fact]` Commands run in this worktree:

| Command | Actual result |
|---|---|
| `npm ci --prefer-offline --no-audit` | **Passed**; installed the locked 872-package tree in this worktree. No dependency file changed. |
| `npm run verify` | **Passed**; TypeScript clean, **26/26 suites and 456/456 tests**. |
| `npm run test:integration` with no `PRISM_INTEGRATION_*` values | **Skipped cleanly**; 2 suites, **19/19 tests skipped**, zero failures. This is not live-backend validation. |
| `git diff --check` | **Passed**, no whitespace errors. |
| `rg -n 'TODO\\(docs\\)' app src` | **No matches**; all seven satisfied source markers are removed. |

**Not rerun:** `supabase/tests/rls/run.sh`, because `PSQL_URI` is absent, and the live 19-test lane,
because both `PRISM_INTEGRATION_*` values are absent. Per the handoff, this branch did not search for
them. No EAS config/build, cloud mutation, migration application, production check, or device run was
performed. The **154/154 SQL**, **19/19 staging**, and cold-started device results are explicitly
owner-supplied prior evidence, not commands run by this sprint.

## 6. Unresolved risks and exact next decision

- The recovery-email `{{ .Token }}` template edit is owner-side and still unverified.
- Deep-link session capture does not exist.
- `app/` and `src/components/` still have no automated rendering coverage; the deletion path still emits
  the recorded dev-only navigation-during-render warning.
- A create-exercise flow still does not exist, so testers remain limited to the 43 seeded movements.
- The EAS `preview` environment still needs its two public Supabase values before an artifact is cut.

**Exact next decision:** after validation, **will the engineer merge PR #58 first so this stacked
documentation branch can be reviewed against its intended base, while keeping PR #55 separate?**
