# PRism release checklist

## Document status

- **Status:** Draft for engineer/owner review.
- **Date:** 2026-08-09; reconciled 2026-08-11 for the free-first iOS binary
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
| `supabase/tests/rls/run.sh` | Applies migrations `0001`–`0009` and runs 191 database assertions on a disposable Postgres 16, including 17 entitlement/RLS/idempotency assertions `[fact]` | CI `rls` job |
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

App identity, from `app.json` `[fact]`: `app.prism.trainer` on both platforms, `version` **1.0.0**,
`ios.supportsTablet: false`, `ITSAppUsesNonExemptEncryption: false`, EAS project id present under
`extra.eas`.

**The version open question is closed** `[decision, 2026-08-09]`. This section previously said
"`version` is still 0.1.0" and left the first public version number as an unmade product decision.
It is now **1.0.0** — the submission this checklist gates is the first public release, and shipping a
store build numbered 0.1.0 misdescribes it to every user who reads the listing.

`submit.production` is **no longer empty** `[fact]`. Android remains staged on the `internal` track
with `releaseStatus: "draft"`. Commit `3c09ea9` also pins the account-specific `ascAppId` and
`appleTeamId` under `submit.production.ios`; their values are not credentials and are not repeated in
this document. Submission credentials remain external and must never be committed.

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

**What the intended first production binary does** `[decision, owner, 2026-08-11; behavior traced
through source/configuration]`:

- `eas.json`'s `build.production.env` sets `EXPO_PUBLIC_DEMO_MODE` to **`"false"`** explicitly. It is
  not unset, and it is not inherited from the EAS environment.
- Even without that, an unset flag would still resolve to non-demo: `DEMO_MODE` falls back to
  `__DEV__`, which is false in any EAS/release bundle (`client.ts`).
- So a production build runs **against the real backend**, and needs `EXPO_PUBLIC_SUPABASE_URL` and
  `EXPO_PUBLIC_SUPABASE_ANON_KEY` to be present to function at all.
- `EXPO_PUBLIC_MONETIZATION_ENABLED=false` explicitly selects the free-first path. Entitlement
  initialization returns before RevenueCat SDK configuration/customer alignment, analysis surfaces
  remain open, and paywall/purchase/restore controls are absent. No RevenueCat key is required.
- `EXPO_PUBLIC_EMAIL_RECOVERY_ENABLED=false` hides "Forgot password?"; custom SMTP and the recovery
  template are deferred until a future v1.x binary explicitly enables recovery.
- Sentry diagnostics are enabled only if the exact release, non-demo binary resolves a non-empty
  `EXPO_PUBLIC_SENTRY_DSN`; the store disclosure must match that candidate.
- If the Supabase values are absent, `isSupabaseConfigured` is false with demo off. That state **fails loudly by
  design** — it does not fall back to demo. A silent fallback would ship a build that claims to be
  live while writing every logged session to local storage only.

**Therefore the pre-submission check is a positive one, not an absence check** `[decision]`:

1. Confirm the `production` profile resolves both Supabase variables plus the three intended
   declarations: demo, monetization and email recovery all false
   (`npx eas config --platform ios --profile production`). Confirm whether a Sentry DSN is present
   without publishing its value. A missing Supabase variable or mismatched declaration is a blocker.
2. Confirm the Supabase project those variables point at has had every migration in
   `supabase/migrations/` applied — including `0003_workout_write_integrity.sql`, without which
   `save_workout_graph` does not exist and **every workout save fails**.
3. Confirm migration `0009_entitlements.sql` is applied and the `delete-account` Edge Function is
   deployed. The current export path reads the entitlement shape, and in-app deletion depends on the
   function even with RevenueCat disabled. Never place privileged values in EAS or any
   `EXPO_PUBLIC_*` variable.
4. Confirm sign-in works against that project on a real build. Authentication exists now
   (`Docs/decisions/ADR-0004-authentication-and-session.md`); the older G-1 framing of this document,
   which assumed no auth path existed, no longer applies.
5. Confirm the free-first candidate exposes no paywall, purchase, restore or locked analysis surface.
   RevenueCat products, offerings, webhook, purchase validation and sandbox acceptance are v1.x gates
   only after a future binary explicitly enables monetization.

**External state remains unverified** `[fact]`: commit `3c09ea9` changed repository submit metadata,
but this reconciliation did not inspect or change any EAS environment variable, credential or
external account. Those remain behind explicit engineer/owner control (`CLAUDE.md` § Scope discipline).

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
| **G-4 — no observability** | **Conditional for the first binary.** Privacy-filtered Sentry reporting exists, but initializes only when the exact release, non-demo candidate has a non-empty DSN. If the submitted binary includes one, a symbolicated restricted test event and matching disclosure are gates; if it does not, Diagnostics must be declared No. Product analytics remains deliberately absent. |
| **G-7 — release tooling** | **Closed for `preview`.** A preview build was produced end to end on 2026-08-09 (Android, ~22 min, commit `048114b`), with all three environment variables confirmed resolving into it. The `production` profile and store submission remain unexercised. |
| **I-1 / I-6 — RLS** | **Met, and now confirmed against a real project** — the integration lane checks isolation between two real accounts in both directions, which the unit suite had been taking on trust. |
| **I-9 / G-11 — payment and entitlement operations** | **Deferred to v1.x.** The first binary explicitly sets monetization false, initializes no RevenueCat customer or SDK, collects no purchase history, and keeps analysis surfaces open. Products, offerings, webhook, purchase validation, restore/refund/transfer testing and processor erasure become gates only before enabling monetization. Migration `0009` and the deployed `delete-account` function remain current v1 requirements for export/deletion. |

| **G-12 — Expo SDK patch drift** | **Open, and it gates a release build.** `npx expo-doctor` is 19/20: five SDK-57 packages are one patch behind. `npm run fix-deps`, then re-run `npm run verify` and `expo-doctor`. A dependency change, so it needs owner approval. |

**Corrected 2026-08-09** `[fact]`. This section previously ended: *"Two gates outside this table now
bind harder than anything in it: **no way to create a custom exercise** … and **check-in days
bucketed in UTC** … Neither blocks a store submission; both will be reported as bugs by the first
cohort."* **Both are now closed**, and the paragraph is replaced rather than annotated because a
pre-flight checklist read historically is not a checklist.

- *Custom exercises.* `feature/v1-user-data-writes` added `createExercise`/`updateExercise`/
  `deleteExercise` to the `Repository` interface and both implementations, reachable from the
  Exercises tab and the mid-session picker. The 43-movement ceiling is gone. That sprint also closed
  three gaps the old paragraph did not name: **no body-measurement writer**, **no profile editing at
  all** (units, bodyweight and training preferences were frozen at the server defaults for every
  account), and onboarding answers being collected and discarded.
- *UTC check-in days.* `0008_local_training_day.sql` is committed and covered by 20 SQL assertions.

`[fact]` What binds the free-first v1 now is operational rather than payment activation: **G-4 only
if the exact candidate includes a Sentry DSN**, **G-12**, effective EAS configuration proof, the
authoritative production Supabase migration probe (including `0009`), deployed deletion verification,
and physical-device/store evidence. `Docs/store-submission-runbook.md` is the procedure.

---

## 5. What was verified for this document, and what was not

**Verified** `[fact]`: `npm run verify` is green (**36 suites, 532/532 tests**); the disposable
Postgres 16 run is green (**191/191 assertions**, including 17 entitlement assertions);
`npx expo config --type public` resolves both platform identities; and local Expo exports produce an
iOS bundle (6.7 MB) and an Android bundle (6.8 MB). `npm run test:integration` discovers both suites
and skips all 19 credential-gated tests with zero failures.

**Known local-tool findings** `[fact]`: `npx expo-doctor` completes **19/20 checks**; its one failed
check is the pre-existing patch drift in five Expo packages (`expo`, `expo-asset`, `expo-constants`,
`expo-linking`, `expo-router`). No version change was approved or made. `npm audit --omit=dev` reports
26 transitive findings (18 high, 8 moderate); no automatic or forced fix was run. See G-10 in
`Docs/architecture.md`.

**Not verified** `[fact]`, and not claimed:

- **No EAS build was run** — not `build`, not `build --local`, not `submit`. Cloud builds consume
  quota and produce artifacts, which is an outward-facing action outside this branch's scope. The
  profiles are therefore *syntactically resolved*, not *proven to build*.
- **No store submission was attempted.** Repository submit configuration now includes pinned iOS
  identifiers (`3c09ea9`), but that does not prove credentials, external account state or a successful
  submission.
- **No RevenueCat, App Store Connect, Play Console, hosted Supabase function/migration, or EAS
  variable was created or changed.** No purchase, restore, refund, transfer, or charge occurred.
- **Neither platform was exercised on a device or simulator with the native purchase SDK.** Local
  JavaScript exports passed for both; no signed native build, store sandbox sheet, webhook delivery,
  restore, refund, transfer, or account-deletion processor call was run.
