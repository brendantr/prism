# Sprint: v1 entitlements

## 1. Document status

- **Date:** 2026-08-09
- **Branch:** `feature/v1-entitlements`, based on `main` at `6d8e4d9`.
- **Owner:** Engineer/owner.
- **Status:** Complete on the sprint branch; not integrated, deployed, or externally configured.
- **Labelling:** `[fact]` / `[decision]` / `[assumption]` / `[open question]`, per I-15.

## 2. Approved scope

`[decision, engineer/owner]` Implement a one-time, non-consumable PRism unlock using RevenueCat.
Logging, history, custom exercises, measurements, profile/settings, and seven-day Insights remain
free. The unlock gates 28/84-day Insights windows, Progress trends, and Body recovery.

- Install `react-native-purchases` through the supported Expo/CNG path; do not hand-edit or commit
  generated `ios/` or `android/` projects.
- Client configuration uses only the public platform SDK keys. No RevenueCat secret/API key or
  service-role credential may enter the client, repository, logs, or generated output (I-4/I-5).
- Add `supabase/migrations/0009_entitlements.sql`: the owner may select their row; client roles get no
  insert/update/delete path. Entitlement truth is server-established only (I-9).
- Add a RevenueCat webhook Edge Function that verifies a dedicated Authorization value and performs
  the server-side entitlement write. Prepare deploy/config documentation without linking, deploying,
  changing a hosted project, or creating external resources.
- Add entitlement state, purchase/restore transport, the paywall, mandatory restore access, and
  per-surface gating. Purchase/restore SDK success triggers a server refresh; it never directly grants
  access.
- Join ordered local teardown before the final unauthenticated phase (I-19).
- Add `Docs/decisions/ADR-0005-monetization.md`, privacy/store-form deltas, architecture delta,
  deterministic tests, SQL/RLS tests, and an exact owner runbook.

No RevenueCat dashboard change, IAP creation, Supabase link/deploy, hosted migration application,
EAS variable creation, native regeneration, release build, purchase, or charge is approved in this
branch.

## 3. Branch-first recovery note

`[fact]` The preceding agent created this branch/worktree and left two modified and four untracked
source files. It did not install the SDK, add a config plugin, create a migration/function/ADR/sprint
record, wire teardown or screens, update privacy documents, or validate. `main` remained clean. This
record restores the audit trail before continuation.

## 4. Non-negotiable entitlement boundary

- RevenueCat/customer info and purchase/restore return values are transport signals, never access
  truth. Only a row read from Postgres may produce the entitled phase in a real build.
- Unknown, read failure, absent, expired/revoked, and stale identity all fail closed. Demo stays
  unlocked without creating a fake entitlement or showing a purchase surface.
- The webhook accepts only a configured authorization value, maps supported RevenueCat lifecycle
  events deterministically, and is idempotent under redelivery.
- Logging/history remain usable during entitlement resolution and failure. A paywall never blocks
  access to data the account already owns.

## 5. Validation plan

- Verify current RevenueCat React Native + Expo/CNG setup against official primary documentation.
- `npm run verify` for typecheck and hermetic Jest.
- Add migration assertions to the disposable Postgres RLS suite and run it from a clean database.
- `npx expo-doctor` and `npx expo config --type public` for dependency/plugin configuration.
- `npm run test:integration` will remain credential-gated unless the existing staging environment is
  explicitly supplied; no external service call is implied by this sprint.
- `git diff --check`, secret-name/value review, and exact changed-file inventory.

## 6. Required handoff

### Changed files

- `.env.example`
- `Docs/architecture.md`
- `Docs/decisions/ADR-0005-monetization.md`
- `Docs/invariants.md`
- `Docs/privacy-data-inventory.md`
- `Docs/privacy-policy-draft.md`
- `Docs/release-checklist.md`
- `Docs/revenuecat-release-runbook.md`
- `Docs/sprints/2026-08-09-v1-entitlements.md`
- `app/(tabs)/body.tsx`
- `app/(tabs)/index.tsx`
- `app/(tabs)/insights.tsx`
- `app/(tabs)/progress.tsx`
- `app/_layout.tsx`
- `app/account.tsx`
- `app/paywall.tsx`
- `package-lock.json`
- `package.json`
- `src/components/paywall/LockedProScreen.tsx`
- `src/content/__tests__/paywallCopy.test.ts`
- `src/content/account.ts`
- `src/content/deeperSurfaces.ts`
- `src/content/paywall.ts`
- `src/data/__tests__/accountDeletionTransport.test.ts`
- `src/data/__tests__/purchases.test.ts`
- `src/data/purchases.ts`
- `src/data/repository.ts`
- `src/domain/__tests__/accountExport.test.ts`
- `src/domain/__tests__/entitlements.test.ts`
- `src/domain/accountExport.ts`
- `src/domain/entitlements.ts`
- `src/store/__tests__/entitlementStore.test.ts`
- `src/store/authActions.ts`
- `src/store/entitlementStore.ts`
- `supabase/config.toml`
- `supabase/functions/delete-account/__tests__/contract.test.ts`
- `supabase/functions/delete-account/contract.ts`
- `supabase/functions/delete-account/index.ts`
- `supabase/functions/revenuecat-webhook/__tests__/event.test.ts`
- `supabase/functions/revenuecat-webhook/event.ts`
- `supabase/functions/revenuecat-webhook/index.ts`
- `supabase/migrations/0009_entitlements.sql`
- `supabase/tests/rls/09_run_entitlement_tests.sql`
- `supabase/tests/rls/run.sh`
- `tsconfig.json`

The accidental sandbox prompt changed no file; specifically, `README.md`, `.gitignore`, and
`hello.swift` were not created, overwritten, staged, or modified.

### Commands run and actual results

- `npx expo install react-native-purchases` — passed; installed `react-native-purchases@10.7.0`
  without native project generation.
- `npm run verify` — passed: TypeScript clean; **36/36 suites and 532/532 tests**.
- `supabase/tests/rls/run.sh` against disposable Postgres 16 — passed: **191/191 assertions**, of
  which **17/17** are the new entitlement/RLS/idempotency suite; the temporary server was stopped.
- `npm run test:integration` — zero failures; **19 tests skipped** because no staging credentials
  were supplied.
- `npx expo config --type public` — passed; iOS bundle id and Android package remain
  `app.prism.trainer`.
- `npx expo export --platform ios --output-dir /private/tmp/prism-s4-ios-export` — passed; one
  Hermes bundle, 1,933 modules, 6.7 MB.
- `npx expo export --platform android --output-dir /private/tmp/prism-s4-android-export` — passed;
  one Hermes bundle, 2,010 modules, 6.8 MB.
- `npx expo-doctor` — completed **19/20 checks**. The one failed check reports five pre-existing
  Expo patch mismatches: `expo` 57.0.9 vs ~57.0.11, `expo-asset` 57.0.8 vs ~57.0.9,
  `expo-constants` 57.0.8 vs ~57.0.9, `expo-linking` 57.0.4 vs ~57.0.5, and `expo-router` 57.0.9
  vs ~57.0.11. No dependency upgrade was approved or made.
- `npm audit --omit=dev` — audit completed and returned nonzero for **26 findings: 18 high and 8
  moderate**. No `audit fix` or forced/breaking dependency change was run.
- Final `git diff --check` and value-pattern secret scan — passed with no findings.

### Validated / not validated

Validated locally: server-only entitlement authority and client write denial; exact-product event
mapping; atomic/idempotent/ordered grant, revoke and transfer; deletion cascade; delayed-event
deletion race; fail-closed app state; custom-ID switching; permanent-deletion SDK detachment;
purchase/restore polling; localized-price requirement; paywall/gating rules; export format v3; both
platform JavaScript bundles.

Not validated: no hosted migration or function deploy, RevenueCat/App Store/Play product or offering,
EAS variable, signed native build, device/simulator UI, store sandbox transaction, live webhook,
restore/refund/transfer, or live processor-aware account deletion. Deno is not installed locally, so
the Edge handlers were not served as Deno functions; their pure payload/auth contracts are covered by
Jest and the database RPC is covered by Postgres.

### Unresolved risks

- Every owner-only operational gate in `Docs/revenuecat-release-runbook.md` remains open. A payment
  can be taken safely only after the exact product/offering, public keys, webhook, migration and both
  functions are configured and the full sandbox matrix passes.
- Expo Doctor's five package patch drifts and the 26 current audit advisories need their own approved
  dependency-hygiene sprint; neither was silently changed in S4.
- The repository has no component-render/E2E framework, and S4 was not cold-started on a native
  device. Layout, system purchase-sheet behavior and store review presentation remain manual gates.
- The privacy policy is still an engineering draft with owner/legal placeholders; it is not ready to
  publish as-is.

### Exact next owner decision

**Should the next sprint create an integration branch, combine S1–S4, resolve the known S1/S2 screen
conflicts, and run the consolidated S5 release verification before any owner-only RevenueCat or store
configuration begins?**
