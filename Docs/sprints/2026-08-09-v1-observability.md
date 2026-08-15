# Sprint: v1 observability

## 1. Document status

- **Date:** 2026-08-09
- **Branch:** `feature/v1-observability`, based on `main` at `6d8e4d9`.
- **Owner:** Engineer/owner.
- **Status:** Implemented and validated locally; external release delivery remains owner-gated.
- **Labelling:** `[fact]` / `[decision]` / `[assumption]` / `[open question]`, per I-15.

## 2. Approved scope

`[decision, engineer/owner]` Close the crash-reporting half of architecture gap G-4 before store
submission:

- Add `@sentry/react-native` through Expo's supported config-plugin path; do not generate or edit
  `ios/` or `android/`.
- Initialise it before the first app render and add a root render-error boundary.
- Send handled failures from the existing user-facing catch sites while retaining their development
  console warnings.
- Keep default PII, screenshots, view hierarchy, session replay, performance tracing, failed-request
  capture, auto session tracking, and product analytics off.
- Scrub identity, request bodies, state/response dumps, console breadcrumbs, email addresses, UUIDs,
  tokens, and URL query/fragment values before an event leaves the device.
- Update `.env.example`, the privacy data inventory, privacy-policy draft, architecture baseline, and
  deterministic tests in the same branch.

The Sentry DSN is a client-public project identifier and may be referenced only by the blank
`EXPO_PUBLIC_SENTRY_DSN` variable. No real value, dashboard action, production environment change,
native regeneration, or release build is approved here.

## 3. Branch-first recovery note

`[fact]` The preceding agent created this branch/worktree and left uncommitted domain/copy/telemetry
files without the sprint record required by `Docs/agents.md`. It did not yet edit dependency/config,
wire the app, update privacy documents, or add the boundary. `main` remained clean. This record restores
the audit trail before continuation.

## 4. Data and privacy boundary

- Crash diagnostics are not product analytics. This sprint records failures only; it does not track
  screens, taps, workouts, purchases, sessions, or user behaviour.
- PRism stores health-adjacent and free-text training data (I-7). Event payload fields that could carry
  those values are dropped structurally, with string redaction as a second layer.
- No Supabase identity is attached to Sentry. Device/OS/app version and code stack frames may remain
  because they describe the failing build rather than the lifter.
- Demo and development builds stay silent even if a DSN exists. A release non-demo build also stays
  silent when the DSN is absent.

## 5. Validation plan

- Confirm the currently supported Expo/Sentry setup against official primary documentation before
  selecting/installing a package version or config-plugin shape.
- `npm run verify` — typecheck and full hermetic Jest suite with no network transmission.
- `npx expo-doctor` — dependency/config compatibility.
- `npx expo config --type public` — config plugin resolves without exposing a credential value.
- `git diff --check` and a secret-name/value review.
- A release/non-demo test event and cold-start render-boundary exercise require owner-provided external
  configuration after merge; neither is performed with a real DSN in this branch.

## 6. Out of scope

- Product analytics, dashboards/alerts, session replay, performance tracing, user identity, release
  upload credentials, Sentry dashboard/project creation, source-map upload secrets, hosted-resource
  changes, native regeneration, or store submission.

## 7. Handoff status

### Implemented `[fact]`

- Installed Expo SDK 57's compatible Sentry package (`@sentry/react-native@7.11.0`) and added its
  config plugin. `metro.config.js` uses the Sentry Expo serializer for debug ids/source maps while
  excluding web replay and development source-context middleware.
- `src/observability/telemetry.ts` is the only Sentry SDK boundary. It initialises before root render
  only in a release, non-demo build with a DSN. PII, screenshots, view hierarchy, replay, performance
  tracing, automatic sessions, failed-request capture and client reports are disabled. Initialisation
  failure cannot prevent app startup.
- `src/domain/telemetry.ts` rebuilds outbound JavaScript events from an allowlist. Exception text,
  identity, request/response bodies, state, local variables, unknown SDK fields, and arbitrary tags or
  contexts are excluded. Breadcrumbs retain only request method/path/status; console, navigation and
  click trails are dropped before they can reach native crash state. Pattern redaction remains a
  second layer for email, UUID, token and URL query/fragment values.
- A root `AppErrorBoundary` reports the fixed render surface and presents a dependency-light retry
  screen whose copy does not expose internals or claim guaranteed delivery. The six existing handled
  failures now use `reportHandledError` and retain their exact local warning convention.
- The data inventory, privacy-policy draft, architecture baseline, production posture and release
  checklist now distinguish failure-only diagnostics from analytics and state the remaining store and
  external-project work.

Official setup references checked before installation: Expo's Sentry guide
(`https://docs.expo.dev/guides/using-sentry/`) and the installed SDK's config-plugin/Metro sources.
Expo's compatibility resolver selected `~7.11.0`; the current upstream major was not forced over that
SDK-specific result.

### Changed files

- `.env.example`
- `Docs/architecture.md`
- `Docs/privacy-data-inventory.md`
- `Docs/privacy-policy-draft.md`
- `Docs/production-posture-v1.md`
- `Docs/release-checklist.md`
- `Docs/sprints/2026-08-09-v1-observability.md`
- `Docs/tester-readiness-runbook.md`
- `app.json`
- `app/_layout.tsx`
- `app/account.tsx`
- `app/workout/active.tsx`
- `app/workout/summary.tsx`
- `metro.config.js`
- `package-lock.json`
- `package.json`
- `src/components/AppErrorBoundary.tsx`
- `src/components/today/CheckInPrompt.tsx`
- `src/content/__tests__/errorCopy.test.ts`
- `src/content/errors.ts`
- `src/domain/__tests__/telemetry.test.ts`
- `src/domain/telemetry.ts`
- `src/observability/telemetry.ts`

No `README.md`, `.gitignore`, native project, migration, EAS profile, hosted resource, or production
configuration changed.

### Commands run and actual results

- `npx expo install @sentry/react-native` — first sandbox run failed `ENOTFOUND`; approved network
  retry passed and installed exact `7.11.0`.
- `npm audit --omit=dev --json` (summarised without values) — **25 findings: 17 high, 8 moderate,
  0 critical**. None names Sentry; findings are Expo/React Native/Metro tool chains. npm proposes
  incompatible major downgrades, so no forced fix or dependency upgrade was made.
- Initial `npm run typecheck` — failed on three required `override` modifiers and one intentional-cast
  diagnostic in the new files. All four were corrected before further validation.
- `npm run typecheck` after correction — **passed**.
- `npm test -- --runInBand src/domain/__tests__/telemetry.test.ts src/content/__tests__/errorCopy.test.ts`
  — **2 suites, 14/14 passed**.
- `npx expo config --type public` — **passed**; Sentry plugin resolved and no credential value appeared.
  Expected warning: Sentry organization/project are not repository values and must come from build
  environment variables.
- `npx expo-doctor` — sandbox attempt failed `ENOTFOUND`; approved network retry completed **19/20**.
  Sentry passed compatibility checks. The failure is five pre-existing Expo patch drifts (`expo`,
  `expo-asset`, `expo-constants`, `expo-linking`, `expo-router`); dependency upgrades require their own
  approval/sprint.
- `npm run verify` — **passed**: typecheck clean; **31 suites, 502/502 tests**.
- `npm run test:integration` — **2 suites / 19 tests skipped**, because integration credentials were
  absent; no failure and no hosted request.
- `npx expo export --platform ios --source-maps --output-dir /private/tmp/prism-sentry-export-20260809-s3`
  — Metro started but produced no artifact or progress for roughly three minutes and was interrupted.
  This is **not build validation**; no `ios/` or `android/` directory was generated.
- `npm ls @sentry/react-native @sentry/cli --depth=1` — **passed**: Sentry `7.11.0`, CLI `2.58.4`.
- `git diff --check` — **passed**.
- Targeted secret-name scan — only the blank public DSN name and documentation references appeared;
  no Sentry upload credential or value is present.

### Validation results

Verified locally: telemetry mode gating, event/breadcrumb allowlists, identifier redaction, copy
constraints, six handled-error imports, root-boundary type safety, Expo plugin resolution, Metro
configuration loading, dependency tree, and the full hermetic suite. The realistic-event test proves
that account identity, free text and training numbers are absent while a code frame and network status
remain.

Not verified: delivery to a real Sentry project, native crash ingestion, source-map upload or
symbolication, Android/iOS release artifacts, dashboard retention/region, and cold-start retry UX. All
require owner-controlled external configuration or on-device release testing. The attempted local iOS
export did not complete and cannot be cited as build evidence.

### Unresolved risks

- `EXPO_PUBLIC_SENTRY_DSN`, `SENTRY_ORG`, `SENTRY_PROJECT`, and the secret `SENTRY_AUTH_TOKEN` are not
  configured here. A native release build can fail its upload step until the three build/upload values
  exist (or upload is explicitly disabled); this branch does neither silently.
- Sentry retention, hosting region, and data-processing terms are owner/legal decisions still marked
  in the privacy documents. Store disclosures remain draft until confirmed against the final binary
  and current forms.
- Expo Doctor's five patch drifts and npm audit's 25 transitive findings remain open; neither can be
  repaired safely without an explicitly approved dependency-hygiene sprint.
- The sibling user-data branch introduces additional caught-write failures after this branch point.
  Integration must route those new settings/profile/custom-exercise/body-measurement warnings through
  `reportHandledError` or explicitly document why they remain local-only.

### Exact next owner decision

**Will the owner create/select the Sentry project, choose its region/retention/data-processing terms,
and authorize configuring `EXPO_PUBLIC_SENTRY_DSN`, `SENTRY_ORG`, `SENTRY_PROJECT`, and the secret
`SENTRY_AUTH_TOKEN` in the EAS preview/production environments so one privacy-inspected, symbolicated
test failure can be exercised on each platform?**
