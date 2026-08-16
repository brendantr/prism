# Sprint: Expo SDK 57 patch alignment

## 1. Document status

- **Date:** 2026-08-16.
- **Branch:** `fix/v1-expo-sdk57-patch-alignment`, based on `release/v1-testflight-activation` at
  `209fd15`.
- **Owner:** Engineer/owner.
- **Status:** Dependency change applied, provenance-audited, and locally validated. Not yet committed,
  reviewed, or merged.
- **Labels:** `[fact]` / `[decision]` / `[open question]`, per I-15.

## 2. Approved scope

`[decision, owner]` Close the Expo SDK 57 patch-version alignment gate (`Docs/release-checklist.md`
G-12) before a normal store-distribution iOS candidate is built. The gate is `npx expo-doctor`'s
"packages match versions required by installed Expo SDK" check, previously failing for five packages.

The sprint changes only the resolved versions of Expo-family packages already declared as direct
dependencies. It does not touch React, React Native, Sentry, Supabase, Zustand, RevenueCat,
TypeScript, Jest, or any non-Expo native/runtime dependency; it does not change application source,
EAS/app configuration, native project files, CI, Supabase/RLS/auth, Sentry configuration, payments, or
any external service state.

## 3. Direct dependency change

`[fact, source]` One dependency-resolving command, `npx expo install --fix`, was run. Resolved
(installed) versions moved:

| Package | Before | After |
|---|---|---|
| `expo` | 57.0.12 | 57.0.13 |
| `expo-asset` | 57.0.10 | 57.0.11 |
| `expo-constants` | 57.0.10 | 57.0.11 |
| `expo-linking` | 57.0.5 | 57.0.6 |
| `expo-router` | 57.0.12 | 57.0.13 |

`package.json` range changes:

| Package | Before | After |
|---|---|---|
| `expo` | `~57.0.12` | `~57.0.13` |
| `expo-linking` | `~57.0.5` | `~57.0.6` |
| `expo-router` | `~57.0.12` | `~57.0.13` |

`expo-asset` and `expo-constants` ranges are unchanged (`~57.0.7`) because that range already permits
the resolved patch version under ordinary tilde semver (`>=57.0.7 <57.1.0`); no edit was needed for the
range to remain correct.

`[fact]` The resulting dependency graph remains SDK 57 patch-only. No package outside the five above
changed at the direct-dependency level, and no `dependencies`/`devDependencies` key was added or
removed in `package.json`.

## 4. Lockfile collateral — reviewed and accepted

`[fact, provenance-audited]` The lockfile diff also contains two packages outside the Expo-publisher
family: one newly introduced and one pre-existing package receiving a patch update. Both trace through
`expo` → `@expo/cli` — i.e., both are Expo CLI-only transitive dependencies pulled in by the `expo`
package's own tooling dependency, not by application code.

`[fact, provenance-audited]` For both: neither is reachable from the mobile runtime bundle (no
reference exists in `app/` or `src/`, and `@expo/cli` itself is referenced only from `expo`'s own CLI
shim, never from `expo`'s runtime entry tree); neither declares an install-time lifecycle hook
(`preinstall`/`install`/`postinstall`/`prepare`); and a full source read of both found no network,
filesystem, `child_process`, `eval`, or dynamic-code-execution calls in shipped code. Package integrity
values, registry URLs, and full audit output are deliberately not reproduced here, per this record's
own redaction boundary and I-5.

`[decision, owner]` This collateral is accepted as an expected consequence of the SDK alignment, not a
separate dependency addition requiring its own approval — it is confined to Expo's own CLI/build
tooling, not the shipped application.

## 5. Validation

`[fact]` All planned local validation is complete, independently re-run and confirmed rather than
taken on report:

- `npx expo install --check` — non-writing, exit 0, reported dependencies up to date. It resolved
  against a bundled/offline dependency map and warned that offline validation was unreliable. Recorded
  here as a non-writing check only; it is **not** treated as the authoritative compatibility result.
- `npx expo-doctor@latest` — the **authoritative** result. Exit 0, **21/21 checks passed, no issues
  detected** (up from 20/21 at branch point). "Packages match versions required by installed Expo SDK"
  now passes; this, not the offline check above, is what closes the gate this sprint exists for.
- `npm run typecheck` — **clean**, exit 0, no errors.
- `npm run verify` (typecheck + full Jest suite) — exit 0. **49/49 test suites passed, 688/688 tests
  passed**, no snapshot failures.
- `npx expo config --json >/dev/null` — **resolves cleanly**, exit 0, no secret-bearing value surfaced.
- Final `git diff --check` / `git diff --stat` / `git diff --name-only` / `git status --short --branch`
  — confirm the diff remains exactly `package.json` and `package-lock.json`, with this record as the
  only untracked addition. No whitespace/formatting issue, no unexpected file.

`[open question, owner]` Local validation passing is not a merge decision. Commit, review, and merge
into `release/v1-testflight-activation` remain the owner's to authorize.

## 6. Scope

`[fact]` In-scope files for this sprint: `package.json`, `package-lock.json`, and this record. No other
file was created or modified.

`[fact]` Out of scope, and unchanged: application source (`app/`, `src/`), EAS/app configuration
(`eas.json`, `app.json`), native project files (`ios/`, `android/` — gitignored and regenerated), CI
workflows, Supabase/RLS/auth, Sentry configuration, payments/entitlements, and any external service or
hosted resource.

## 7. What this does not establish

`[fact]` No EAS build, TestFlight upload, Supabase/Sentry/Apple configuration change, migration,
deployment, or other external-state change occurred as part of this sprint. This record does not imply
a final production candidate has been built, evidenced, or accepted, and does not imply TestFlight
acceptance — both remain governed exclusively by
`Docs/readiness/2026-08-15-testflight-activation-evidence.md`, which this record does not amend.

`[decision, owner]` A fresh internal `sentry-verification` artifact is required after this branch is
validated (§5), committed, reviewed, and merged back into `release/v1-testflight-activation` — and it
must pass before a normal `production`-profile candidate is built. The `sentry-verification` artifact
result already recorded in the readiness document was built from a dependency snapshot that predates
this change and does not carry over to a build made after it, consistent with that document's own
evidence boundary (verification-artifact evidence proves the mechanism for the build it was run
against, not any other build).

## 8. Exact next owner decision

All validations in §5 have passed and the diff scope matches exactly the three files named in §6.
**Will the owner commit this branch and open it for review against `release/v1-testflight-activation`?**
Merge should be followed by the fresh internal `sentry-verification` artifact required in §7 before any
normal `production`-profile candidate is built.
