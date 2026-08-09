# PRism release checklist

## Document status

- **Status:** Draft for engineer/owner review.
- **Date:** 2026-08-06
- **Purpose:** One place naming the commands that gate a release, what each actually covers, and the
  release-configuration facts a build inherits today. It records state; it does not grant approval for
  any release step.
- **Labelling** follows `Docs/invariants.md` I-15: `[fact]` / `[decision]` / `[assumption]` /
  `[open question]`.

**This document does not make PRism releasable.** The blocking gates live in
`Docs/ui-ux-foundation-v1.md` §8 and are unchanged by it — see §4 below.

---

## 1. Verification commands

| Command | Covers | Gate |
|---|---|---|
| `npm run verify` | `typecheck` then `test -- --ci`, in that order — the same two steps CI runs, in one command `[fact]` | Every branch, before opening a PR |
| `npm run typecheck` | `tsc --noEmit`, `strict: true` across `app/` and `src/` `[fact]` | CI `verify` job |
| `npm test -- --ci` | Hermetic Jest: the calc engine, `src/domain/history.ts`, both stores, the repository contract, the content modules `[fact]` | CI `verify` job |
| `supabase/tests/rls/run.sh` | **154 SQL assertions** across migrations `0001`–`0007` on disposable Postgres 16.14: RLS, write integrity, partial check-ins, deletion, library seed and exercise-reference constraints `[fact]` | CI `rls` job |
| `npx expo-doctor` | Expo SDK/dependency drift `[fact]` | Before a release build; not in CI |
| `npx eas config --platform <ios\|android> --profile <profile>` | Resolves and prints the effective build config without building `[fact]` | Before a release build |

**What no command covers** `[fact]`: there is no lint (no script, no config in this repository), no
component-render tests (a standing decision — the repo has no such framework), and no E2E. Every UI
claim in this project rests on cold-started manual verification per
`Docs/ui-ux-foundation-v1.md` §6, not on `npm test`.

---

## 2. EAS build profiles

`eas.json` `[fact, verified with `npx eas config`]`:

| Profile | Distribution | Notes |
|---|---|---|
| `development` | internal | `developmentClient: true` |
| `preview` | internal | Ad-hoc / internal testers |
| `production` | store (default) | `autoIncrement: true`; `cli.appVersionSource: "remote"` |

App identity, from `app.json` `[fact]`: `app.prism.trainer` on both platforms, `version` **0.1.0**,
`ios.supportsTablet: false`, `ITSAppUsesNonExemptEncryption: false`, EAS project id present under
`extra.eas`.

**`version` is still 0.1.0** `[open question]` — a 1.0.0 release presumably wants a version bump, but
what PRism calls its first public version is a product decision and is not made here.

---

## 3. The environments real-backend builds currently inherit

> **Corrected 2026-08-06** `[fact]`. This section previously stated the opposite of what the code
> does — that an unset flag defaults to demo and that "a production EAS build today ships in demo
> mode." Both were true when written and are false now: `feature/v1-production-posture` inverted the
> default, and `eas.json` sets the flag explicitly. The original text is not preserved here, because
> a release checklist that has to be read historically is not a checklist. Its reasoning survives in
> `Docs/production-posture-v1.md` and in the commit that changed the default (`5c18d93`).
>
> The correction matters more than the wording: an operator following the old §3 would have expected
> a safe, self-contained demo build and produced one that opens into a permanent data-load failure.

**What `preview` and `production` do today** `[fact, traced through `eas.json` and
`src/data/supabase/client.ts`]`:

- `eas.json` sets `EXPO_PUBLIC_DEMO_MODE` to **`"false"`** explicitly in both profiles. `preview` is no
  longer a demo build; PR #57 flipped it to the staging/real-backend path.
- Even without that, an unset flag would still resolve to non-demo: `DEMO_MODE` falls back to
  `__DEV__`, which is false in any EAS/release bundle (`client.ts`).
- So both builds run **against a real backend**, and each EAS environment needs
  `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` to function at all.
- If those are absent, `isSupabaseConfigured` is false with demo off. That state **fails loudly by
  design** — it does not fall back to demo. A silent fallback would ship a build that claims to be
  live while writing every logged session to local storage only.

**Therefore the pre-build check is a positive one, not an absence check** `[decision]`:

1. Confirm the target profile resolves both Supabase variables. Absent variables are a blocker, not a
   fallback into demo. **Current preview blocker:** the engineer is adding this pair; do not cut the
   artifact until both are present.
2. Confirm the target project has every migration in `supabase/migrations/` applied in order. Staging
   currently has `0001`–`0007`; production application remains unverified.
3. Confirm the real build can sign in and save a workout. The repository-level staging lane is 19/19
   and the simulator first-run is green, but neither is the EAS artifact.

**Not changed by this branch** `[fact]`: no EAS environment variable was created or inspected and
`eas.json` was not edited. `EXPO_PUBLIC_DEMO_MODE` remains per-profile in that file and is not one of
the two EAS environment values.

**Secrets posture** `[fact]`: only `EXPO_PUBLIC_*` variables are ever referenced, and those are inlined
into the client bundle by design — RLS is the authorization boundary, not variable secrecy
(`Docs/invariants.md` I-4, I-6). No service-role key, RevenueCat secret, or store credential appears
anywhere in this repository, and none may (I-4, I-5).

---

## 4. Blocking gates before a store submission

Restated from `Docs/ui-ux-foundation-v1.md` §8 so this checklist cannot be read as a complete
pre-flight. **None is closed by this branch** `[fact]`.

| Gate | Status |
|---|---|
| ~~**G-1 — no authentication path**~~ | **Closed in the client and staging.** The 19-test lane and cold-started first run exercise real sessions. Recovery-template verification and deep-link capture remain separate. |
| **I-10 — account deletion + data export** | **Closed in the client and staging.** Both ran in the integration lane; deletion also ran on device. A privacy policy remains a separate submission requirement. |
| **I-2 / G-2 — non-atomic `saveWorkout`** | **Closed.** `save_workout_graph` is transactional, reconciles children and is retry-idempotent; local and staging evidence exist. |
| **G-4 — no observability** | Open. No crash reporting or analytics; user feedback would arrive with no telemetry behind it. |
| **G-7 — release tooling** | **Partially closed.** `preview` is a real-backend profile and staging is ready; its only remaining pre-build blocker is the two EAS `preview` variables. No artifact has been proved. |
| **I-1 / I-6 — RLS** | Met for the committed schema and staging: 154/154 local SQL assertions plus two-account PostgREST integration coverage. Production remains unverified. |

---

## 5. What was verified for this document, and what was not

**Verified** `[fact]`: `npm run typecheck` clean; `npm test -- --ci` green; `npx eas config` resolves
both the ios `production` profile and `app.json` as printed above.

**Not verified** `[fact]`, and not claimed:

- **No EAS build was run** — not `build`, not `build --local`, not `submit`. Cloud builds consume
  quota and produce artifacts, which is an outward-facing action outside this branch's scope. The
  profiles are therefore *syntactically resolved*, not *proven to build*.
- **No store submission was attempted or configured**; `submit.production` is an empty object.
- **Android was not exercised** — `eas config` was run for ios only; no platform-specific
  configuration differs, which is a reason to expect parity, not evidence of it.
