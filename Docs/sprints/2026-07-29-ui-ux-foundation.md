# Sprint: ui-ux-foundation

- **Status:** Implemented, pending review
- **Date:** 2026-07-29
- **Branch:** `ui-ux-foundation`
- **Type:** UI foundation. No business logic, schema, or calculation change.

## Goal

Establish the first-run experience and the UI primitives it needs, so later
product work has a consistent surface to build on: a splash, a value
proposition, a feature preview, an account screen, a four-step setup, and a
completion hand-off into the app shell.

## What already existed (verified 2026-07-29, not re-created)

An audit of the repository before any code was written found the following
already present and in use, contrary to the initial scope estimate:

- **A complete, centralised token module.** `src/theme/tokens.ts` defines
  semantic colour, `space`, `radius`, `elevation` (tinted glow rather than grey
  drop-shadow), `duration`, `opacity`, `a11y` and `border`;
  `src/theme/typography.ts` defines the type scale. **No token changes were
  needed or made.**
- **Four of the eight listed primitives.** `Button`, `Card`, `Chip` and
  `Screen` already existed in `src/components/ui/` and are imported by every
  current screen.

**Decision (owner, 2026-07-29):** extend the existing unprefixed components
rather than introduce a parallel `Prism*`-prefixed set. Duplicating them would
have left two names for one component and contradicted the repository's own
convention (`Text.tsx`: "The only text component in PRism"). Only the genuinely
missing primitives were built.

## In scope (delivered)

- New primitives: `Input`, `ProgressHeader`, `OptionRow`, `CarouselPagination`.
- Onboarding stack at `app/onboarding/`, separate from the `(tabs)` app shell.
- Screens: splash, welcome, feature carousel, auth, four-step setup, completion.
- First-launch gating in `app/_layout.tsx`, driven by a persisted flag.
- All onboarding copy centralised in `src/content/onboarding.ts`.

## Explicitly out of scope

- Account creation, sign-in, or any auth backend. The auth screen is
  presentation only and says so on screen; wiring it is gated behind verified
  RLS (`Docs/invariants.md` I-1, I-6).
- Applying onboarding selections to the user's `Profile`. Selections are
  persisted in `onboardingStore` but deliberately not written through
  `trainingStore.updateProfile`, which would change data the rest of the app
  already reads. See "Follow-ups".
- Any change to calculations, schema, migrations, tests, or dependencies.
- Final production copy. Everything in `src/content/onboarding.ts` is
  first-pass and expected to be rewritten.

## Design decisions

- **Violet is the single dominant accent** across onboarding. PRism's spectral
  gradient remains reserved for data and the brand mark, per `tokens.ts`
  ("never as a large filled area"), so the flow reads as one accent while the
  product identity survives.
- **One dominant action per screen.** Secondary routes out (skip, sign-in
  toggle, "later") are ghost or text buttons, never a second filled CTA.
- **Progress is segmented, not fractional** — one bar per step, so remaining
  commitment is countable rather than estimated.
- **Steps live behind one route** with local step state. Four routes would let
  the navigation stack and the progress indicator disagree after a gesture-back.

## Reference research

No third-party product name, asset, screenshot, layout, wording, or measurement
entered this repository, per [ADR-0003](../decisions/ADR-0003-reference-research-policy.md).
Sanitised observation, recorded in the required form:

- **User problem:** a lifter opening a training app for the first time has no
  data, so an empty app shell gives them no reason to stay.
- **General pattern:** first-run flows commonly state a value proposition,
  preview capability, then collect the minimum needed to personalise.
- **PRism decision:** an original flow using PRism's existing token system and
  type scale, with copy written to PRism's stated posture — estimates are
  labelled as estimates, and no clinical or preventive claim is made (I-8).
- **Explicitly excluded:** the reference product's layout, visual hierarchy,
  spacing, iconography, colour system, microcopy, and screen sequence. None was
  reproduced, measured, or referenced in code.

## Validation

| Command | Result |
| --- | --- |
| `npm run typecheck` | Pass, exit 0 |
| `npm test` | Pass — 65/65, 3 suites (unchanged by this sprint) |
| `npx expo export --platform ios` | Pass |

Not verified: no screen was rendered in a simulator or on device as part of this
sprint, and no component test framework exists (deliberately — see the
readiness sprint's Decision 6). Layout correctness on iPhone-sized screens is
manual-only and outstanding.

## Follow-ups

1. Apply the persisted onboarding selections to `Profile` via `updateProfile`,
   including what happens to demo-mode seed data when `trainingDaysPerWeek`
   changes (it feeds the readiness consistency factor).
2. Replace first-pass copy in `src/content/onboarding.ts` with reviewed copy.
3. Wire the auth screen once authenticated, RLS-verified persistence exists.
4. Decide whether onboarding should offer a "use sample data" path distinct from
   creating an account.
