# Sprint: v1 Repello App Review resubmission

## Document status

- **Status:** Implementation and owner handoff for review.
- **Date:** 2026-08-21
- **Branch:** `release/v1-repello-app-review-resubmission`
- **Base:** `main`
- **Scope:** Client-side review-build configuration, customer-facing rename, tests, and release
  documentation parity only.
- **Related decisions:** ADR-0005, ADR-0006, and
  `Docs/sprints/2026-08-11-free-first-release-reconciliation.md`.
- **Labels:** `[fact]`, `[decision]`, `[assumption]`, and `[open question]` follow invariant I-15.

## 1. Review context and owner decisions

`[fact, owner-provided]` Apple App Review submission
`d7191021-eaec-4774-a2d3-21a93017c679`, version **1.0**, build **11**, received Guideline 2.1(b)
questions about paid digital content or services.

`[decision, owner, 2026-08-21]` The resubmission is free-first. It must expose no active paid digital
content, subscription, purchase flow, restore flow, external checkout or payment link, or non-IAP
entitlement unlock. A future optional non-consumable analysis unlock remains documentation-only; if
activated in a later iOS version, it must use Apple In-App Purchase.

`[decision, owner, 2026-08-21]` The customer-facing product name changes from PRism to **Repello**.
Repello is owner-selected and is not represented here or in product copy as legally trademark-cleared.

## 2. Exact free-first repository claim

For source built from this sprint's accepted commit with the `production` profile:

- `[fact, repository]` `eas.json` pins `EXPO_PUBLIC_MONETIZATION_ENABLED` to the string `false` in
  both `preview` and `production`.
- `[fact, source]` `isMonetizationEnabled()` enables the feature only for the literal string `true`;
  unset and all other values resolve disabled.
- `[fact, source]` the entitlement store resolves disabled mode synchronously before the first render,
  initializes no purchase SDK or repository entitlement read, resolves no price, and makes purchase
  and restore actions return `false`.
- `[fact, source]` disabled mode opens all analysis surfaces and direct `/paywall` navigation
  redirects without rendering paywall, price, purchase, or restore content. Account restore is absent
  because its phase is already disabled on the first render.
- `[fact, repository search]` the client contains no external checkout or payment URL. The only
  reachable external URL found is the privacy-policy URL.
- `[fact, scope]` the future RevenueCat/entitlement architecture remains in the repository but is not
  activated or expanded by this sprint.

This evidence supports the repository claim: **the intended resubmission is a free app with all
currently reachable analysis available and no active payment or paid-entitlement path.**

### What Git cannot prove

Repository source cannot prove that an EAS artifact was built from the accepted commit, which remote
environment and credentials EAS resolved, that App Store Connect received that exact artifact, or
what a signed binary does on a physical device. It also cannot prove App Store metadata, screenshots,
review notes, public legal/support deployments, reviewer credentials, or the state of store products.

The owner must retain non-secret evidence for the exact candidate: accepted commit SHA, EAS profile,
app version/build number, resolved declaration names and redacted values, artifact identifier, upload
record, and completed device matrix. Never copy secret values, credentials, reviewer credentials,
raw exports, or private dashboard content into Git.

### Source versus artifact display-name verification

`[fact, source/artifact boundary]` Expo prebuild derives the generated iOS display name from
`expo.name`. The tracked `app.json` sets `expo.name` to `Repello` and has no
`ios.infoPlist.CFBundleDisplayName` override. The local ignored `ios/PRism.xcodeproj` may therefore
retain `CFBundleDisplayName = PRism` and emit `PRism.app`; that stale generated project is
non-authoritative and is not evidence for the EAS artifact.

Do not run `expo prebuild` locally in this sprint without separate owner approval. A clean local
simulator verification requires an owner-approved fresh prebuild; otherwise, verify the display name
and `CFBundleDisplayName` from the exact EAS artifact. The owner must later confirm
`CFBundleDisplayName = Repello` in that artifact.

## 3. Rename inventory and disposition

| Occurrence class | Disposition | Acceptance evidence |
|---|---|---|
| App display name, routes/screens, onboarding/auth/account/support copy, accessibility-facing copy | Repello | `app.json`, `app/**`, `src/content/**`, focused tests and final search. |
| Public README and repository-controlled legal/support/release copy | Repello | README and current living release/privacy documents. |
| Seeded `Prism 3` data | Stored name/IDs retained; client displays “Repello 3” | Pure display-alias test and three presentation call sites. |
| Prior ADRs, sprints, research, architecture/build/review evidence | Preserve historical PRism wording | ADR-0006 provides the effective-date bridge. |
| Bundle/package, slug/scheme, EAS/App Store record, Supabase, storage, database, secrets, product ID | Intentionally unchanged | ADR-0006 identity table and final diff audit. |
| Public privacy URL containing `prism-legal` | Owner decision; unchanged until a replacement is published and verified | Owner checklist; no speculative URL in the client. |
| Source artwork filename/legacy wordmark | Technical source retained; compiled icon contains no old text | No icon redesign or native regeneration in this sprint. |

Acceptance requires no reviewer-visible PRism/Prism copy in the candidate, no accidental technical
identity migration, and parity across the compiled binary and every owner-controlled customer surface.

`[fact, data fidelity]` Exported JSON intentionally preserves the stored routine name `Prism 3` so
existing data remains faithful. The UI-only display mapper presents that same routine as “Repello 3”;
no database migration or export rewrite is implied.

## 4. Repository acceptance criteria

- [x] Display name and repository-controlled customer copy say Repello.
- [x] Existing-user technical identities listed in ADR-0006 are unchanged.
- [x] `preview` and `production` pin monetization false.
- [x] Disabled mode has no first-render lock, paywall, price, purchase, restore, SDK setup, entitlement
      read, or paid grant path.
- [x] Direct paywall routing redirects in disabled mode.
- [x] Focused branding and disabled-monetization tests pass.
- [x] Full typecheck/test and `git diff --check` pass.
- [x] No backend, migration, RLS, Edge Function, secret, dependency, native project, or external state
      changes are present.

## 5. Owner-only EAS and App Store Connect checklist

### Build and effective configuration

- [ ] Select the accepted commit from this branch after review; record its SHA.
- [ ] Run `npx eas config --platform ios --profile production` from that exact commit. Verify, without
      publishing values, non-demo, monetization false, email recovery false, the intended Supabase
      target, Sentry posture, bundle ID, display name Repello, and version/build inputs.
- [ ] Verify the exact artifact's `CFBundleDisplayName` is `Repello`. Do not use the ignored local
      `ios/PRism.xcodeproj` or a locally emitted `PRism.app` as release evidence; a local simulator
      check requires a separately owner-approved fresh prebuild.
- [ ] Stop if any environment source overrides or contradicts the pinned free-first declaration.
- [ ] Build the production iOS candidate; record EAS build/artifact identity and the resulting build
      number. Do not reuse build 11 as proof of the changed source.
- [ ] Install the exact artifact used for acceptance testing and upload that same artifact only after
      the matrix below passes.

### App Store Connect and public surfaces

- [ ] Keep the existing App Store Connect app record, SKU, and bundle identifier.
- [ ] Change the customer-facing app name to Repello and align subtitle, description, promotional
      text, keywords, category wording, version notes, and support responses.
- [ ] Replace every screenshot/device frame showing PRism with screenshots of the accepted Repello
      candidate. Verify iPhone and any required iPad/compatibility presentation.
- [ ] Set price/availability to Free and ensure the submitted version has no attached subscription,
      IAP promotion, purchase instruction, external checkout, or paid-feature claim.
- [ ] Align App Privacy answers with the exact candidate, including the verified Sentry posture.
- [ ] Publish and verify final Repello legal/support copy. Decide whether to retain or replace the
      existing `prism-legal` URL; if replaced, update the in-app constant in a separately verified
      repository change before submission.
- [ ] Provide working reviewer credentials privately and verify them immediately before submission.
- [ ] Paste the reviewed response below into Resolution Center only after replacing placeholders and
      confirming every statement against the uploaded build.

## 6. Clean-install and update matrix

Run every row against the exact candidate. `supportsTablet` remains false, so iPad testing means the
iPhone-compatible presentation unless the owner separately approves native/tablet scope.

| Device | Install path | Required result | Status |
|---|---|---|---|
| Supported iPhone | Clean install, cold launch | Home-screen/app title and all reachable copy say Repello; onboarding/auth work; no PRism wording. | Pending owner |
| Supported iPhone | Update over build 11/existing install | Update succeeds under the same bundle ID; session/local draft/onboarding continuity behaves per existing rules; display name becomes Repello. | Pending owner |
| Supported iPhone | Signed-in route sweep | Progress, Body, 7/28/84-day Insights, Account, Settings, plans/templates, support/legal paths expose no lock, paywall, price, purchase, restore, subscription, or payment link. | Pending owner |
| Supported iPhone | Direct/deep-link attempts | `/paywall` cannot render monetization content; retained `prism` scheme still routes supported paths without changing identity. | Pending owner |
| Supported iPad | Clean install in compatibility presentation | Launch, authentication, core logging, branding, layout, and free-first route sweep pass without clipped controls or old copy. | Pending owner |
| Supported iPad | Update over an existing compatible install | Update continuity and Repello display-name change pass; no data/account identity reset. | Pending owner |
| iPhone and iPad | Offline/relaunch/account switching | No stale paid state, locked state, SDK error, or other account's local state appears. | Pending owner |

## 7. Draft App Review response — owner review/send only

> Hello App Review,
>
> Thank you for the Guideline 2.1(b) questions regarding submission
> `d7191021-eaec-4774-a2d3-21a93017c679`, version 1.0 build 11.
>
> We have prepared a new build, **[BUILD NUMBER]**, under the customer-facing name **Repello**. This
> submitted version is free and contains no paid digital content or services. It has no subscription,
> paywall, price, purchase button, restore-purchases control, external checkout or payment link, and
> no entitlement-based unlock. All analysis currently available in the app is available without
> payment.
>
> The app contains no active purchase mechanism in this version. If we introduce the separately
> deferred optional analysis unlock in a future iOS version, it will be submitted through Apple
> In-App Purchase for review before activation.
>
> Reviewer access: **[PROVIDE CREDENTIALS PRIVATELY IN APP REVIEW INFORMATION]**.
> Steps to verify the free-first behavior: **[INSERT TESTED ROUTE STEPS FOR THE EXACT BUILD]**.
>
> Thank you for reviewing the updated build.

Do not send this draft until the owner has verified the exact uploaded build and removed every
placeholder. The repository does not authorize or perform that external communication.

## 8. External actions and unresolved risks

This sprint performs no App Store Connect, EAS cloud build, Supabase, RevenueCat, GitHub PR, domain,
DNS, or legal-site write. Build 11 is historical context, not evidence for the future candidate.

Open owner risks are: effective EAS/artifact provenance, App Store metadata and screenshots, public
legal/support reachability, reviewer access, physical-device clean/update behavior, and independent
name/legal review if desired. Any failure or mismatch is a resubmission blocker.

## 9. Repository validation evidence

`[fact, local, 2026-08-21]`

- `npm ci` — passed; installed 890 packages from the lockfile. Deprecation warnings were emitted; no
  dependency was upgraded or edited.
- `npm run typecheck` — passed (`tsc --noEmit`).
- First full `npm test -- --runInBand` — failed 1 of 696 tests because the controlled Sentry fixture
  still expected the former product name. The fixture was updated in scope.
- Final full `npm test -- --runInBand` — passed, 53 suites and 699 tests.
- Prior focused changed tests — passed, 7 suites and 53 tests covering configuration declaration,
  disabled store/transport/paywall policy, branding copy/routine alias/export name, and the renamed
  verification fixture.
- Corrective-pass focused tests — passed, 2 suites and 4 tests covering recursive literal/function
  branding collection and stable app/EAS identity declarations.
- A read-only JSON assertion verified display name `Repello`, the retained slug/scheme and platform
  identifiers, and `false` monetization declarations in both `preview` and `production`.
- `git diff --check` — passed with no output.

No EAS cloud build/config resolution, signed artifact inspection, App Store upload, simulator/device
run, external dashboard inspection, public-site verification, or reviewer login was performed. Those
remain owner-only gates in §§5–6.
