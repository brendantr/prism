# Sprint: dependency-hygiene

- **Status:** Complete. D2 and D3 fully met. D1 partially met (1 of 12 vulnerabilities fixed; the
  remaining 11 are confirmed unfixable from this repository today and accepted as residual risk — see
  "Results").
- **Date:** 2026-08-01
- **Branch:** `dependency-hygiene` (new branch off `main`)
- **Type:** Dependency maintenance only. No app behavior, schema, or migration change.
- **Part of:** [`2026-07-31-closure-inventory.md`](../readiness/2026-07-31-closure-inventory.md) items
  D1, D2, D3. Engineer/owner approved all three before this sprint began (dependency upgrades are
  gated by `CLAUDE.md`).

## Goal

Close three dependency-hygiene findings from the closure inventory:

1. **D1 — `npm audit`: 12 vulnerabilities** (11 moderate, 1 high), all in `@expo/config`/
   `@expo/config-plugins` transitives.
2. **D2 — `expo-doctor`: 7 packages** with patch-version drift from what the installed Expo SDK expects
   (`expo`, `expo-asset`, `expo-constants`, `expo-router`, `expo-system-ui`, `react-native`,
   `jest-expo`).
3. **D3 — three unused declared dependencies**: `react-hook-form`, `zod`, `@hookform/resolvers`
   (`Docs/architecture.md` G-6) — confirmed zero imports anywhere in `app/`/`src/` this session, and no
   form work since has claimed them (the auth screen and check-in form both use hand-rolled
   validation).

## Success outcomes

1. `npx expo install --fix` brings the 7 drifted packages to the versions the installed Expo SDK
   expects; `npx expo-doctor` reaches 20/20.
2. `npm audit fix` (non-forcing) resolves what it safely can; remaining vulnerabilities, if any, are
   recorded with their exact count and source, not silently dropped.
3. `react-hook-form`, `zod`, `@hookform/resolvers` are removed from `package.json` and
   `package-lock.json`; nothing else changes.
4. `npm run typecheck`, `npm test`, and `npx expo export --platform ios` all pass after every step.
5. `git diff` touches only `package.json`, `package-lock.json`, and this record — no application code.

## Explicitly out of scope

- Any major-version dependency upgrade beyond what `expo install --fix` and `npm audit fix`
  (non-forcing) apply on their own.
- `npm audit fix --force`, which can apply breaking changes — not used without a separate, explicit
  approval if the non-forcing pass leaves vulnerabilities unresolved.
- Any change to `app/`, `src/`, `supabase/`, native config, or CI.

## Results

**D2 — version drift: resolved, 20/20.** `npx expo install --fix` updated `package.json` (`expo`
`^57.0.8→~57.0.9`, `expo-router` `~57.0.8→~57.0.9`, `expo-system-ui` `~57.0.1→~57.0.2`, `react-native`
`0.86.0→0.86.2`) but `npm install` failed on a self-referential `ERESOLVE` conflict: `react-native@0.86.2`
declares `@react-native/jest-preset@0.86.2` as a `peerOptional` dependency, and npm's strict resolver
flagged that as unresolvable even though it is explicitly optional. **Deviation, recorded rather than
worked around silently:** resolved with `npm install --legacy-peer-deps`, narrowly, for this one
already-optional peer — not a blanket relaxation kept in place afterward (no `.npmrc` change; the flag
was used only for this install). `jest-expo` needed one further explicit bump (`~57.0.2→~57.0.3`) that
`expo install --fix` did not catch on its own. Final state: `npx expo-doctor` → **20/20 checks passed.**

**D1 — audit: 1 high fixed, 11 moderate confirmed unfixable here.** `npm audit fix` (non-forcing)
resolved the one high-severity finding, taking the count from 12 (11 moderate/1 high) to 11 moderate.
`npm audit fix --force --dry-run` was run to preview, without applying, what a forcing fix would do —
it reported the **same 11 vulnerabilities, unchanged**. Inspecting `npm audit --json` shows why: the
only named CVE (the rest are inherited, title-less entries) is `uuid: Missing buffer bounds check in
v3/v5/v6 when buf is provided` (`GHSA-w5hq-g745-h8pq`, moderate), reached transitively through `xcode`
→ `@expo/config-plugins`, and npm's own suggested fix is downgrading `expo` to `46.0.21` — a major
regression, not a real fix. `xcode`/`@expo/config-plugins` are `expo prebuild`-time native-project
tooling, not code shipped in the app's JS bundle. **Accepted as a residual, tracked risk**: no safe fix
exists in this dependency tree today; resolving it requires an upstream Expo SDK release, not action
available in this repository.

**D3 — unused dependencies: removed.** `react-hook-form`, `zod`, `@hookform/resolvers` uninstalled.
Confirmed zero references anywhere in `app/`/`src/` before removal (unchanged from the finding in
`Docs/architecture.md` G-6).

## Validation

| Command | Result |
|---|---|
| `npx expo-doctor` | **20/20** (was 19/20 at branch point) |
| `npm audit` | **11 moderate** (was 12: 11 moderate, 1 high) — residual risk accepted, see above |
| `npm run typecheck` | Pass, exit 0 |
| `npm test -- --ci` | Pass — 103/103, 9 suites, unchanged |
| `npx expo export --platform ios` | Pass — single iOS bundle, 5.1 MB |
| `git diff --name-only` | `package.json`, `package-lock.json`, this record — no application code touched |

## What remains open

- **The 11 moderate `xcode`/`@expo/config-plugins` advisories are not fixable from this repository.**
  Revisit when a newer Expo SDK release addresses them upstream; do not attempt `--force` again without
  re-checking whether a real (non-major-downgrade) fix has since become available.
- **`--legacy-peer-deps` was needed once, for one narrowly-scoped conflict.** If a future `npm install`
  hits the same `@react-native/jest-preset` self-referential peerOptional conflict, this is the known,
  reproducible cause — not a new defect.
