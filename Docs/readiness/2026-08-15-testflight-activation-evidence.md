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
- **Updated 2026-08-16:** the internal `sentry-verification` artifact's delivery, symbolication, and
  restricted-payload review result is recorded (§5); §6 item 3 and §7's TestFlight-acceptance line are
  revised accordingly. §3 and §8 are also revised so they no longer read as contradicting that
  recorded result. No other gate changed status.
- **Further updated 2026-08-16:** a post-alignment re-verification result is recorded in §5, from a
  second internal artifact built after an accepted Expo SDK 57 patch alignment. No gate or Go/No-Go
  verdict changed as a result.

This document does not claim that the effective production configuration, build, TestFlight artifact,
device behavior, privacy publication, store metadata, or reviewer access is complete.

## 2. Intended first binary

`[decision, owner]` The intended first binary is:

- iOS-first;
- non-demo;
- free-first;
- explicitly intended to set monetization to false; and
- explicitly intended to set email recovery to false.

`[decision, owner]` Sentry is intentionally enabled for the first TestFlight/App Store candidate. Its
role is limited crash diagnostics, not product analytics. App Privacy Diagnostics disclosures must
match the exact submitted binary.

These are intended declarations, not evidence that the effective EAS production configuration already
contains them. RevenueCat activation and password-recovery delivery are not part of this binary.

## 3. Repository baseline

`[fact, repository]`

- PR #70 merged to `main` at `e9e011d`.
- The current branch is `release/v1-testflight-activation`.
- Creating or editing this record is itself documentation only and performs no build, upload, or
  external check. §5 separately records an owner-observed result for one internal verification
  artifact. Neither this record nor that result validates the final production candidate, the
  effective EAS environment, a TestFlight upload, physical-device behavior, or App Store Connect
  state.

## 4. Owner external checks

### Observed owner checks

`[fact, owner-observed; values withheld]`

| Check | Result | Evidence boundary |
|---|---|---|
| Selected Supabase project reviewed before SQL | Completed | The selected project was privately reviewed. No identifying dashboard value is recorded here. |
| Read-only migration/object probe | Passed | Every result for migrations `0001` through `0009` was `true`. No user row or configuration value was queried or copied into this record. |
| `delete-account` deployment presence | Confirmed | The function exists on the selected project. No deployment identifier or raw log is recorded. |
| `delete-account` JWT setting | Confirmed enabled | This records the observed setting only. |
| Production Sentry configuration | Confirmed present | Owner-observed presence only. No variable value, DSN, project or organization name, token, URL, identifier, screenshot, or event content is recorded. |

### Evidence limitation

`[open question, owner]` Anonymous gateway rejection was not independently exercised. The observed JWT
setting must not be described as independent runtime proof of the gateway rejection path.

~~`[pending, owner]` Sentry release-event delivery, source-map symbolication, and review of the
privacy-constrained event payload have not been verified. Configuration presence is not evidence that
any of those three properties work.~~

**Closed 2026-08-16** `[fact, owner-observed]`. All three properties were verified against the
replacement internal verification artifact; see §5 for the recorded result. This closes the
verification-artifact question only — it is not evidence about the final TestFlight/App Store
candidate's own diagnostics posture, which is tracked separately in §5's final-candidate row and §6
item 4.

## 5. Build and device evidence

`[pending, owner]` An existing TestFlight build is not accepted by this record as proof of the intended
free-first declarations, the current merged code, or Sentry delivery/privacy behavior. No exact
candidate build or physical-device acceptance result has been recorded yet.

### Verification-build evidence

`[fact, repository]` A dedicated internal-distribution `sentry-verification` artifact may be used only
to prove controlled-event delivery, source-map symbolication, and the restricted diagnostic payload.
Its plainly labelled action is selected by a build-time flag that is false in every normal profile;
it is not a route and is absent from the final TestFlight/App Store candidate.

Record only the verification build number, timestamp, pass/fail, and a redacted conclusion. Do not
retain or copy an event id, event contents, payload fields, dashboard values, raw logs, screenshots,
or any project/account identifier into this record or the repository. A passing verification artifact
does **not** prove the final candidate's commit, build identity, effective free-first declarations,
Sentry configuration, physical-device behavior, or App Privacy answers.

**Result, 2026-08-16 — PASS** `[fact, owner-observed; values withheld]`

| Field | Value |
|---|---|
| Build source | Commit `97449f1` |
| Profile | `sentry-verification` |
| App version | `1.0.0` |
| App build number | `7` |
| Build completion | `2026-08-16T06:03:09Z` |

This replacement artifact reran the previously unsuccessful internal symbolication check and passed.

Observed on this artifact `[fact, owner-observed; values withheld]`:

- The isolated verification surface appeared, and its single labelled action was tapped exactly once.
- Exactly one event was received; no unexpected behavior was observed.
- Release and distribution were consistent with the recorded build.
- A Debug ID / artifact-match association was visible on the event; the prior no-Debug-ID condition did
  not recur.
- JavaScript frames symbolicated to application source rather than numeric bundle offsets.
- Payload review passed: no user identity was attached, breadcrumbs were cleared before capture, and
  no replay/screenshot/request/response data was present.

No event id, event contents, payload field value, dashboard value, raw log, screenshot, or
project/account identifier is retained in this record, consistent with the boundary stated above.

**Post-alignment re-verification, 2026-08-16 — PASS** `[fact, owner-observed; values withheld]`

Re-verification was required because an accepted Expo SDK 57 patch alignment
(`Docs/sprints/2026-08-16-expo-sdk57-patch-alignment.md`) changed the dependency and build-toolchain
snapshot the artifact above was built from. That earlier pass does not carry over to a build made after
a dependency change, so a fresh internal artifact was built and exercised the same way.

| Field | Value |
|---|---|
| Build source | Commit `540b3ef` |
| Profile | `sentry-verification` |
| App version | `1.0.0` |
| App build number | `8` |
| Build completion | `2026-08-16T21:06:29Z` |

Observed on this artifact `[fact, owner-observed; values withheld]`:

- The isolated verification surface appeared, and its single labelled action was tapped exactly once.
- Exactly one event attributable to this build was received; no unexpected behavior was observed.
- Release and distribution were consistent with the recorded build.
- A Debug ID / artifact-match association was present, with no processing failure.
- JavaScript frames symbolicated to application source rather than numeric bundle offsets.
- Payload review passed: no user identity was attached, breadcrumbs were cleared before capture, and
  no replay/screenshot/request/response data was present.

No event id, event contents, payload field value, dashboard value, raw log, screenshot, source path,
filename, line number, release suffix, distribution number, issue count, or project/account identifier
is retained in this record, consistent with the boundary stated above.

**Both artifacts above prove only the verification mechanism for the exact snapshot each was built
from** — the first for commit `97449f1`, this one for commit `540b3ef`. Neither proves the normal
production candidate's effective configuration, that candidate's own absence of the verification root,
its diagnostics posture, TestFlight behavior, the physical-device matrix, App Privacy disclosures, or
App Review readiness — each remains tracked separately in §5's final-candidate row and §6.

### Final-candidate physical-device evidence

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
| 10 | Final-candidate diagnostics posture | The exact candidate has Sentry enabled and contains no verification root, action, route, deep link, hidden trigger, or automatic event. Its build identity and effective configuration are recorded separately from the internal verification artifact, and App Privacy Diagnostics disclosures match this exact candidate. The separately recorded verification-artifact pass supports delivery, symbolication, and payload restrictions only. | Pending |

## 6. Remaining owner gates

All items below remain pending and must not be inferred from the checks in §4:

1. Verify the effective EAS production declarations without recording their values here: non-demo,
   monetization false, and email recovery false.
2. Privately verify equality between the EAS production Supabase target and the selected project checked
   in §4.
3. ~~Build the dedicated internal `sentry-verification` artifact with the existing enabled Sentry
   posture. Invoke its plainly labelled action once and verify arrival, source-map symbolication, and
   the restricted payload. Record only pass/fail, verification build number, timestamp, and a redacted
   conclusion; retain no raw event contents or identifiers.~~ **Closed 2026-08-16** `[fact,
   owner-observed]`. A replacement verification artifact (build `7`, commit `97449f1`) passed on all
   three properties; recorded result in §5. This closes the verification-artifact gate only — it does
   not stand in for item 4 below, which the final candidate must still pass independently.
4. Produce the production iOS candidate from the accepted repository baseline with the verification
   flag false. Record its own build identity and effective configuration, confirm that no verification
   affordance exists, upload that exact artifact to TestFlight, and complete App Privacy Diagnostics
   disclosures consistent with that exact candidate. Verification-build evidence cannot substitute
   for any of these candidate checks.
5. Complete and accept all ten physical-device tests in §5.
6. Publish and verify the final public privacy-policy URL.
7. Complete accurate App Privacy answers, listing content, and review notes for the exact accepted binary.
8. Provide and privately verify working reviewer access without placing credentials in this record or
   the repository.

Anonymous gateway rejection also remains unverified as noted in §4.

## 7. Go/no-go

- **TestFlight build:** **NO-GO.** Do not build or upload until the effective EAS free-first
  declarations and EAS-to-Supabase target equality are verified. Sentry is enabled by owner decision
  and is no longer awaiting a posture decision.
- **TestFlight acceptance:** **NO-GO.** No exact candidate build or physical-device matrix has been
  accepted, and the final candidate has not independently passed its own diagnostics-posture check.
  **Updated 2026-08-16:** the internal verification-artifact's delivery, symbolication, and
  restricted-payload review has now passed (§5), resolving that clause of the prior reasoning; the
  other two clauses are unresolved, so the overall verdict is unchanged.
- **App Review:** **NO-GO.** App Review remains blocked until TestFlight acceptance, a reachable public
  privacy policy, accurate store disclosures/listing for the exact binary, working reviewer access,
  and an App Privacy Diagnostics disclosure matching the verified Sentry-enabled build are complete.

## 8. External changes

`[fact]` This documentation update performed no external mutation itself — no database migration, Edge
Function deployment, EAS mutation, build, store submission, RevenueCat setup, Sentry setup, or
credential change was made in the course of recording it.

`[fact, owner-observed]` Separately, §5 records the outcome of one owner-performed build and
installation of the internal `sentry-verification` verification artifact, and the owner's review of
its resulting event. That action was performed outside this repository and is recorded here only as
evidence; it does not imply, and this record does not claim, any other EAS, Sentry, Supabase, Apple,
or RevenueCat mutation beyond that one already-recorded verification artifact.
