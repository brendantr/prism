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
| `supabase/tests/rls/run.sh` | 57 cross-tenant isolation assertions against both migrations on a disposable Postgres 16 `[fact, `2026-08-04-supabase-rls-ci.md`]` | CI `rls` job |
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

## 3. The environment a production build currently inherits

> **Corrected 2026-08-06** `[fact]`. This section previously stated the opposite of what the code
> does — that an unset flag defaults to demo and that "a production EAS build today ships in demo
> mode." Both were true when written and are false now: `feature/v1-production-posture` inverted the
> default, and `eas.json` sets the flag explicitly. The original text is not preserved here, because
> a release checklist that has to be read historically is not a checklist. Its reasoning survives in
> `Docs/production-posture-v1.md` and in the commit that changed the default (`5c18d93`).
>
> The correction matters more than the wording: an operator following the old §3 would have expected
> a safe, self-contained demo build and produced one that opens into a permanent data-load failure.

**What a production build does today** `[fact, traced through `eas.json` and
`src/data/supabase/client.ts`]`:

- `eas.json`'s `build.production.env` sets `EXPO_PUBLIC_DEMO_MODE` to **`"false"`** explicitly. It is
  not unset, and it is not inherited from the EAS environment.
- Even without that, an unset flag would still resolve to non-demo: `DEMO_MODE` falls back to
  `__DEV__`, which is false in any EAS/release bundle (`client.ts`).
- So a production build runs **against the real backend**, and needs `EXPO_PUBLIC_SUPABASE_URL` and
  `EXPO_PUBLIC_SUPABASE_ANON_KEY` to be present to function at all.
- If those are absent, `isSupabaseConfigured` is false with demo off. That state **fails loudly by
  design** — it does not fall back to demo. A silent fallback would ship a build that claims to be
  live while writing every logged session to local storage only.

**Therefore the pre-submission check is a positive one, not an absence check** `[decision]`:

1. Confirm the `production` profile actually resolves both Supabase variables
   (`npx eas config --platform ios --profile production`). Absent variables are now a release
   blocker, not a fallback into demo.
2. Confirm the Supabase project those variables point at has had every migration in
   `supabase/migrations/` applied — including `0003_workout_write_integrity.sql`, without which
   `save_workout_graph` does not exist and **every workout save fails**.
3. Confirm sign-in works against that project on a real build. Authentication exists now
   (`Docs/decisions/ADR-0004-authentication-and-session.md`); the older G-1 framing of this document,
   which assumed no auth path existed, no longer applies.

**Not changed by this branch** `[fact]`: no EAS environment variable was created and `eas.json` was
not edited. Both are production configuration, gated behind explicit engineer/owner approval
(`CLAUDE.md` § Scope discipline).

**Secrets posture** `[fact]`: only `EXPO_PUBLIC_*` variables are ever referenced, and those are inlined
into the client bundle by design — RLS is the authorization boundary, not variable secrecy
(`Docs/invariants.md` I-4, I-6). No service-role key, RevenueCat secret, or store credential appears
anywhere in this repository, and none may (I-4, I-5).

---

## 4. Blocking gates before a store submission

Restated from `Docs/ui-ux-foundation-v1.md` §8 so this checklist cannot be read as a complete
pre-flight.

**Refreshed 2026-08-09.** The table below said "**None is closed by this branch**" and listed five
open gates. That was accurate for the branch it was written on and false for months afterwards — a
pre-flight checklist that goes stale is worse than none, because it is read as current by whoever is
about to ship. Each row now carries the evidence that closed it, or says plainly that it is still
open.

| Gate | Status |
|---|---|
| **G-1 — no authentication path** | **Closed** 2026-08-06 (auth sprint) and repaired 2026-08-08 (#58, `feature/v1-first-run-routing`) after it was found that a real-backend build could neither sign up nor sign in. Verified on a cold-started simulator against staging `[fact, owner, 2026-08-09]`. |
| **I-10 — account deletion + data export** | **Closed.** `0005` (deletion RPC) and `0007` (the cascade-ordering defect that stopped a lifter with a custom movement deleting at all). Both applied to staging; export and deletion driven through the UI on device `[fact, owner, 2026-08-09]`. |
| **I-2 / G-2 — non-atomic `saveWorkout`** | **Closed** 2026-08-06. `save_workout_graph` (`0003`), one transaction, verified against a real project by the integration lane — whole-graph commit, ownership stamped over a forged payload, no-op on exact retry, removed children reconciled. |
| **G-4 — no observability** | **Partially closed on `feature/v1-observability`.** Privacy-filtered Sentry crash reporting, a root boundary, and six handled-error sites exist. It remains a release gate until an owner-configured non-demo artifact sends and symbolicates a test event on both platforms and its payload matches the privacy inventory. Product analytics remains deliberately absent. |
| **G-7 — release tooling** | **Closed for `preview`.** A preview build was produced end to end on 2026-08-09 (Android, ~22 min, commit `048114b`), with all three environment variables confirmed resolving into it. The `production` profile and store submission remain unexercised. |
| **I-1 / I-6 — RLS** | **Met, and now confirmed against a real project** — the integration lane checks isolation between two real accounts in both directions, which the unit suite had been taking on trust. |

`[fact]` Two gates outside this table now bind harder than anything in it: **no way to create a custom
exercise** (`Repository` has no exercise write methods, so a lifter is capped at the 43 seeded
movements) and **check-in days bucketed in UTC** (`feature/v1-local-training-day`, unlanded). Neither
blocks a store submission; both will be reported as bugs by the first cohort.

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
