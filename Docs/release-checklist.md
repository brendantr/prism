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

**Finding, and the most consequential one in this document** `[fact, observed 2026-08-06 via
`npx eas config --platform ios --profile production`]`:

> `No environment variables with visibility "Plain text" and "Sensitive" found for the "production"
> environment on EAS.`

Consequences, traced through `src/data/supabase/client.ts` `[fact]`:

- `EXPO_PUBLIC_DEMO_MODE` is unset, and the code **defaults it to `true`**.
- `EXPO_PUBLIC_SUPABASE_URL` / `..._ANON_KEY` are absent, so `isSupabaseConfigured` is false regardless.
- **A production EAS build today ships in demo mode**: deterministic seeded data, zero network calls,
  everything written to `AsyncStorage` on that one device.

**This is not currently wrong.** It is the *only* mode a real user can reach, because no
authentication path exists (`Docs/architecture.md` G-1), and shipping a build that pointed at Supabase
without a way to sign in would be worse. What matters is that it becomes **deliberate rather than
incidental** `[decision]`: the demo-mode default must be a stated release position, not something a
future reader discovers by decompiling a build.

**Not changed by this branch** `[fact]`: no EAS environment variable was created, and `eas.json` was not
edited. Both are production configuration and are gated behind explicit engineer/owner approval
(`CLAUDE.md` § Scope discipline). The two options, when someone is ready to decide:

1. Ship v1 explicitly demo-only — set `EXPO_PUBLIC_DEMO_MODE=true` on the EAS `production` environment
   so the intent is recorded rather than inferred from a default.
2. Hold the store build until auth lands (G-1), then configure the Supabase variables.

Either is defensible; silence is not.

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
| **G-1 — no authentication path** | Open. Supabase mode is unreachable by any UI. |
| **I-10 — account deletion + data export** | Open, and **blocking for store submission**, not negotiable. |
| **I-2 / G-2 — non-atomic `saveWorkout`** | Open. Three sequential non-transactional upserts. |
| **G-4 — no observability** | Open. No crash reporting or analytics; user feedback would arrive with no telemetry behind it. |
| **G-7 — release tooling** | **Partially closed.** `eas.json` and the EAS project id are committed and resolve; profiles are unverified by an actual build. |
| **I-1 / I-6 — RLS** | Met for the policies as committed, and wired into CI. Not the same as production being reachable. |

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
