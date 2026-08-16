# Sprint: v1 Sentry verification harness

## 1. Document status

- **Date:** 2026-08-15.
- **Branch:** `fix/v1-sentry-verification-harness`, based on
  `release/v1-testflight-activation` at `bdb2bcc`.
- **Owner:** Engineer/owner.
- **Status:** Implemented and validated locally; owner-controlled build and external verification remain
  pending and separate.
- **Labels:** `[fact]` / `[decision]` / `[open question]`, per I-15.

## 2. Approved scope

`[decision, owner]` Add the smallest verification-only mechanism that lets one dedicated internal iOS
artifact emit one fixed synthetic Sentry diagnostic on an explicit owner action. It exists solely to
verify delivery, source-map symbolication, and the already-defined privacy payload boundary.

The sprint does not change a hosted EAS environment, Sentry project, Supabase project, RevenueCat,
App Store Connect, credentials, dependencies, native projects, or the final candidate's production
posture. It does not build, upload, submit, deploy, or open an external dashboard.

## 3. Structural isolation

`[fact, source/config]` `src/domain/sentryVerification.ts` exposes the pure literal-`true` predicate
used by the root. `eas.json` pins its flag false in `development`, `preview`, and `production`; only
the internal-distribution `sentry-verification` profile sets it true. That profile extends production,
uses the production EAS environment, and explicitly keeps demo, monetization, and email recovery false.

`[fact, source]` `app/_layout.tsx` has two named roots. `SentryVerificationRoot` is a local-state-only
surface with one plainly labelled action. It mounts no Expo Router navigator, account/session hook,
training/profile store, Supabase load, or user-bound provider. `NormalAppRoot` retains the existing
application hooks, gate, providers, and route registrations. No verification route file,
`Stack.Screen`, deep link, hidden gesture, normal settings/account control, runtime menu, or automatic
send exists.

## 4. Diagnostic privacy boundary

`[fact, source]` `src/observability/telemetry.ts` remains the sole Sentry SDK boundary. The controlled
function accepts no arguments, checks the verification build flag and successful telemetry
initialisation, clears breadcrumbs inside an isolated scope, and captures one Error whose message is a
fixed non-sensitive literal. It supplies no tag, context, user, request, response, or capture options
and discards the SDK's event id. A process-local guard is set before capture, so repeated calls and SDK
failure cannot create a second attempt. It adds no logging.

The existing `beforeSend`, `beforeBreadcrumb`, allowlists, exception scrubbing, no-user posture,
screenshots/view-hierarchy/replay restrictions, automatic-session restriction, and performance/
failed-request controls are unchanged.

## 5. Evidence boundary

`[decision, owner]` A passing internal verification artifact proves only delivery, source-map
symbolication, and restricted payload for that artifact. Record only build number, timestamp,
pass/fail, and a redacted conclusion. Do not retain raw event contents, event ids, dashboard values,
logs, screenshots, URLs, project/account identifiers, or configuration values in repository evidence.

The final TestFlight/App Store candidate must independently prove its repository/build identity,
effective free-first declarations, enabled Sentry posture, absence of the verification root/action,
physical-device matrix, and matching App Privacy Diagnostics disclosure. Verification-artifact
evidence alone cannot sign off the final candidate.

## 6. Local validation

`[fact]` Completed without a build, network request, dashboard, or service mutation:

- `npm test -- --runInBand src/observability/__tests__/sentryVerification.test.ts
  src/domain/__tests__/telemetry.test.ts` — **passed: 2 suites, 17/17 tests**. This covers the exact
  root predicate/profile matrix, route absence, internal/free-first profile shape, static no-argument
  capture, isolated breadcrumb clearing, production/development inactivity, one-attempt behavior, and
  the existing event/breadcrumb allowlist and redaction cases.
- `npm run typecheck` — **passed against tracked source**. A clean checkout/CI does not contain the
  locally generated `.expo/types/router.d.ts`, so no route-type staleness applies there.
- `npm pkg get scripts.lint` — returned `{}`: this repository has no lint script, so no lint command
  exists to run.
- `npx expo config --json >/dev/null` — **passed with no output**.
- Tracked-file searches — **passed**: no verification route filename; no verification `Stack.Screen`,
  link, router navigation, long-press trigger, or Account/Settings reference. The only call search
  found the import, the plainly labelled local action handler, and the guarded function definition;
  no module-scope or automatic send exists.
- `git diff --check` — **passed**.

## 7. External state

`[fact]` No external action is authorized by this sprint. Local implementation and hermetic validation
must not be described as delivery, symbolication, payload inspection, build, TestFlight, or store
evidence; all remain owner-performed pending work.
