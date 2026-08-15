# Sprint: reconcile the free-first v1 release record

## Document status

- **Status:** Documentation reconciliation for the first free-first iOS binary. No runtime or external
  configuration change.
- **Date:** 2026-08-11
- **Branch:** `claude/prism-app-store-submission-fae97a`
- **Commit tail:** `d6c4006` through `b1a3eef`, inclusive. The final reconciliation includes the
  free-first declarations (`c59c8f6`), privacy/release rewrites (`74832ca`, `9cbfc8b`, `f32f3bd`,
  `b1a3eef`) and iOS submit-configuration pinning (`3c09ea9`).
- **Labels** follow `Docs/invariants.md` I-15.

`[fact]` This record covers the final integration/reconciliation tail. It supplements the earlier
sprint records for entitlements, observability, user-data writes and bounded workout reads; it does
not replace them or claim their implementation work as part of this documentation sprint.

---

## 1. Binary being prepared

The intended first submitted iOS binary makes these declarations `[decision, owner, 2026-08-11]`:

```text
EXPO_PUBLIC_DEMO_MODE=false
EXPO_PUBLIC_MONETIZATION_ENABLED=false
EXPO_PUBLIC_EMAIL_RECOVERY_ENABLED=false
```

`[fact, source/configuration]` With demo mode false and valid public Supabase configuration, the app
uses Supabase-backed authentication and training data. A missing Supabase URL or anon key fails
loudly; it does not fall back to local demo storage (`eas.json`, `src/data/supabase/client.ts`,
`src/data/repository.ts`).

`[fact, source/configuration]` With monetization explicitly false, `isEntitlementDisabled()` returns
before purchase identity alignment or SDK configuration. RevenueCat is not initialized, no customer
is created, and no purchase network call or purchase-data processing occurs. The disabled entitlement
phase leaves Progress, Body analysis and the longer Insights windows open, and the paywall, purchase
and restore controls are absent (`src/data/purchases.ts`, `src/store/entitlementStore.ts`,
`src/domain/entitlements.ts`). This is an explicit free-first declaration, not an inference from a
missing RevenueCat key.

`[fact, source/configuration]` The first binary therefore has no paywall, purchase, restore,
locked analysis surface or purchase-history collection. RevenueCat products, offerings, webhooks and
purchase validation are future v1.x activation work, not prerequisites for this binary.

`[fact, source/configuration]` With email recovery explicitly false, the sign-in screen does not show
"Forgot password?" and cannot request a recovery email. Custom SMTP plus a recovery template exposing
`{{ .Token }}` must be configured and verified before a future binary explicitly enables the flow
(`src/data/supabase/auth.ts`, `app/auth/index.tsx`). Sign-up confirmation remains a separate
owner-controlled Supabase setting.

`[fact, source/configuration]` Sentry initializes only in a release, non-demo build whose effective
`EXPO_PUBLIC_SENTRY_DSN` is non-empty (`src/observability/telemetry.ts`). Diagnostics belong in the
store disclosure only if that condition holds in the exact submitted binary.

---

## 2. Submission configuration reconciliation

`[fact, repository]` Commit `3c09ea9` added account-specific `ascAppId` and `appleTeamId` fields under
the iOS production submit profile in `eas.json`. That repository fact supersedes earlier prose saying
iOS submit configuration was absent and `eas submit` would prompt for those identifiers. The values
are identifiers, not credentials; no credential is committed, and this record intentionally does not
repeat their values.

`[open question, owner]` Repository configuration does not prove the values resolve to the intended
App Store Connect application or that submission credentials are available. The effective production
configuration remains an owner verification gate before a build or submission.

---

## 3. Owner-only gates that remain open

None of these is presented as complete `[open question, owner]`:

1. Capture effective EAS production configuration evidence for the exact iOS candidate without
   publishing secrets.
2. Verify the authoritative production Supabase target with the read-only migration probe, including
   migration `0009` required by the current export/entitlement read path.
3. Verify the deployed `delete-account` function and complete deletion against that target.
4. Decide whether the exact submitted binary carries a Sentry DSN, then align the privacy forms and
   verify a restricted diagnostic event only if it does.
5. Complete the physical-device TestFlight matrix, including persistence, export, deletion,
   cross-account isolation and the free-first analysis surfaces.
6. Publish and verify the final public privacy-policy URL.
7. Complete App Privacy answers, listing content, App Review notes and working reviewer credentials.

RevenueCat activation and custom SMTP/password-reset delivery remain deferred v1.x work. They become
gates only for a later binary that explicitly enables their corresponding build declaration.

---

## 4. Scope and evidence

`[fact]` This sprint changes documentation only. It does not access or change Supabase, EAS,
RevenueCat, Sentry, App Store Connect, credentials, builds, migrations, Edge Functions or store
listings. It does not activate monetization, recovery delivery or diagnostics.

`[fact, owner-reported]` PR #70 was reported open and mergeable at `b1a3eef`, with exact-head
"Typecheck and test" and "RLS isolation suite" checks green. This sprint does not independently query
GitHub or treat those checks as proof of a hosted runtime, physical device or submitted binary.

`[recommendation]` Re-run the repository validation named in the release handoff after these Markdown
changes, then complete the owner-only gates above in order. No executable test suite is required solely
for this documentation diff.

---

## 5. Changed files and validation

`[fact]` Documentation changed by this reconciliation:

- `Docs/sprints/2026-08-11-free-first-release-reconciliation.md` (new)
- `Docs/store-submission-runbook.md`
- `Docs/release-checklist.md`
- `Docs/privacy-data-inventory.md`
- `Docs/privacy-policy-draft.md`
- `Docs/production-posture-v1.md`

`[fact]` Repository-safe validation completed after the reconciliation:

- `git diff --check` — exit 0, no output.
- `git diff --name-only` — the five modified tracked release documents above. Git does not include
  the new untracked sprint record in this command's output; `git status` does.
- `git diff --stat` — reported the five tracked release-document changes; as above, the untracked
  sprint record is not counted by this command until added to the Git index.
- `git status --short --branch` — remained on
  `claude/prism-app-store-submission-fae97a`; five modified authorized files and this one new
  authorized file, with no other worktree changes.

No executable tests were run: every changed file is Markdown, and no runtime claim changed in source.
The exact-head PR checks are owner-reported separately in §4 rather than claimed as a command run by
this sprint.
