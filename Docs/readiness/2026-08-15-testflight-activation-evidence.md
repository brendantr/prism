# TestFlight activation evidence — 2026-08-15

## 1. Document status

- **Status:** In progress.
- **Scope:** Redacted evidence record for owner-performed checks already completed for the free-first
  iOS TestFlight path.
- **Evidence classes:** Repository facts, observed owner checks, and pending owner-only gates are kept
  separate below.
- **Redaction:** This record intentionally contains no project names or references, URLs, keys, DSNs,
  tokens, credentials, Apple identifiers, user identifiers, emails, exports, raw function logs, or
  screenshots.

This document does not claim that the effective production configuration, build, TestFlight artifact,
device behavior, privacy publication, store metadata, or reviewer access is complete.

## 2. Intended first binary

`[decision, owner]` The intended first binary is:

- iOS-first;
- non-demo;
- free-first;
- explicitly intended to set monetization to false; and
- explicitly intended to set email recovery to false.

These are intended declarations, not evidence that the effective EAS production configuration already
contains them. RevenueCat activation and password-recovery delivery are not part of this binary.

## 3. Repository baseline

`[fact, repository]`

- PR #70 merged to `main` at `e9e011d`.
- The current branch is `release/v1-testflight-activation`.
- This record adds documentation only. It does not validate an EAS environment, hosted runtime, signed
  binary, TestFlight upload, physical device, or App Store Connect state.

## 4. Owner external checks

### Observed owner checks

`[fact, owner-observed; values withheld]`

| Check | Result | Evidence boundary |
|---|---|---|
| Selected Supabase project reviewed before SQL | Completed | The selected project was privately reviewed. No identifying dashboard value is recorded here. |
| Read-only migration/object probe | Passed | Every result for migrations `0001` through `0009` was `true`. No user row or configuration value was queried or copied into this record. |
| `delete-account` deployment presence | Confirmed | The function exists on the selected project. No deployment identifier or raw log is recorded. |
| `delete-account` JWT setting | Confirmed enabled | This records the observed setting only. |

### Evidence limitation

`[open question, owner]` Anonymous gateway rejection was not independently exercised. The observed JWT
setting must not be described as independent runtime proof of the gateway rejection path.

## 5. Build and device evidence

`[pending, owner]` No production iOS build has been produced or uploaded to TestFlight for this record.
No physical-device acceptance result exists yet.

The exact TestFlight build must complete the following matrix on a physical iPhone from a fresh install
and cold launch. Every item is currently **Pending**.

| Order | Test | Required acceptance evidence | Status |
|---:|---|---|---|
| 1 | Authoritative backend and authentication | Non-demo launch; onboarding and account creation/sign-in work against the privately verified target; no demo or backend-misconfiguration state appears. | Pending |
| 2 | Cross-account isolation and local teardown | Account B never sees Account A's server data or in-progress draft after sign-out/account switching. | Pending |
| 3 | Account deletion | A disposable account with a custom exercise used in a completed workout deletes successfully, returns to signed-out state, and cannot sign in again. | Pending |
| 4 | Core workout durability | An in-progress workout survives force-quit; the finished workout survives relaunch and is neither lost nor duplicated. | Pending |
| 5 | Free-first surfaces | Progress, Body recovery, and longer Insights windows are open; no paywall, purchase, restore, price, or locked-analysis control appears. | Pending |
| 6 | Export completeness | The disposable account export contains the expected profile, preference, custom-exercise, workout/set, check-in, measurement, and access categories, with no other account's data. The export itself is not retained as evidence. | Pending |
| 7 | Authentication lifecycle | Sign-out/sign-in preserves server data, clears prior local user state, and exposes no password-reset control. | Pending |
| 8 | User-data writes | Profile/unit changes, custom exercise, body measurement, and local-date check-in persist after relaunch and re-authentication. | Pending |
| 9 | Offline and error recovery | Network loss produces an honest retryable error, never demo fallback or false success; reconnecting recovers without lost or duplicate data. | Pending |
| 10 | Conditional diagnostics | App behavior and App Privacy match the final Sentry decision: no PRism diagnostics when absent, or approved restricted release evidence when configured. | Pending |

## 6. Remaining owner gates

All items below remain pending and must not be inferred from the checks in §4:

1. Verify the effective EAS production declarations without recording their values here: non-demo,
   monetization false, and email recovery false.
2. Privately verify equality between the EAS production Supabase target and the selected project checked
   in §4.
3. Decide the first binary's Sentry posture. App Privacy must match the exact submitted binary. If
   diagnostics are configured, their release delivery and privacy restrictions require separate
   evidence; if absent, Diagnostics must be declared accordingly.
4. Produce the production iOS build from the accepted repository baseline and upload that exact artifact
   to TestFlight.
5. Complete and accept all ten physical-device tests in §5.
6. Publish and verify the final public privacy-policy URL.
7. Complete accurate App Privacy answers, listing content, and review notes for the exact accepted binary.
8. Provide and privately verify working reviewer access without placing credentials in this record or
   the repository.

Anonymous gateway rejection also remains unverified as noted in §4.

## 7. Go/no-go

- **TestFlight build:** **NO-GO.** Do not build or upload until the effective EAS declarations and
  EAS-to-Supabase target equality are verified and the Sentry posture is decided.
- **TestFlight acceptance:** **NO-GO.** No production build, upload, or physical-device matrix has been
  completed.
- **App Review:** **NO-GO.** App Review remains blocked until TestFlight acceptance, a reachable public
  privacy policy, accurate store disclosures/listing for the exact binary, and working reviewer access
  are complete.

## 8. External changes

`[fact]` No database migration, Edge Function deployment, EAS mutation, build, store submission,
RevenueCat setup, Sentry setup, credential change, or other external mutation was performed as part of
the checks recorded here or the creation of this document.
