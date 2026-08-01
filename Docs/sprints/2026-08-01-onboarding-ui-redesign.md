# Sprint: onboarding-ui-redesign

- **Status:** Planned — this document is written before any implementation, per `CLAUDE.md`.
- **Date:** 2026-08-01
- **Branch:** `feature/onboarding-ui-redesign` (local only — not pushed, no PR opened, per explicit instruction)
- **Type:** Frontend/UI only. No auth, Supabase/database, migration, RLS, or onboarding-completion
  *persistence* semantics change. No unrelated screen touched.
- **Reference design brief:** supplied directly in-conversation as a written product/visual direction
  (Log / Progress / Readiness, "serious, calm, intelligent strength-training tool"). **No external
  reference images are used, copied, imported, or committed** — the brief is interpreted into an
  original PRism-native design using the repository's existing token/component system. This keeps the
  work outside `Docs/decisions/ADR-0003-reference-research-policy.md`'s concern entirely: there is no
  third-party asset in scope, so there is nothing to sanitize or exclude.

## Current onboarding architecture (verified by reading, 2026-08-01)

**Route stack** (`app/onboarding/_layout.tsx`): `index` (welcome, gestures disabled) → `features` →
`auth` → `steps` → `complete` (gestures disabled, fades in rather than slides). Every screen but the
first can navigate back; `complete` is the only screen that writes anything.

**The screen this sprint redesigns is `app/onboarding/features.tsx`.** It is *already* a three-slide
horizontal carousel — `FEATURE_SLIDES` from `src/content/onboarding.ts`, ids `log` / `progress` /
`readiness` — rendered via a paging `FlatList`, with a top-right "Skip" button (routes straight to
`/onboarding/auth`), `CarouselPagination` dots, and a fixed-bottom `Button` labelled "Continue" that
advances one slide at a time and, on the last slide, also routes to `/onboarding/auth`. **This is the
existing "three-screen onboarding flow"** the brief refers to — there are three pieces of content, not
three route files. The existing slide copy already has the right shape (`eyebrow`/`title`/`body` per
slide) but generic, sparse content (one icon, one paragraph) rather than the evidence-led, data-shaped
screens this brief asks for.

**Completion semantics, unchanged by this sprint:** `onboardingStore.complete()` (the only call site,
`app/onboarding/complete.tsx`) is what actually marks onboarding finished and flips `app/_layout.tsx`'s
routing gate. `features.tsx` has never called it and will not start now — its job is to get the user to
`/onboarding/auth`, which is itself presentation-only pending a real auth backend
(`Docs/architecture.md` G-1). **Reconciling the brief's wording with this:** the brief describes the
Readiness screen's "Get started" action as completing onboarding and reaching "the established
post-onboarding destination." Read literally that would mean skipping `auth`/`steps`/`complete`
entirely — which would change onboarding-completion semantics, exactly what the brief separately says
not to do. The two instructions are reconciled by treating "the established post-onboarding
destination" as *the next screen the existing flow already goes to*, i.e. `/onboarding/auth` — identical
to what the current last-slide "Continue" already does. **Decision, stated rather than silently
resolved:** "Get started" is a relabelled `Continue` for the final slide only (same handler,
`router.push('/onboarding/auth')`), not a new completion path.

**Design system already in place, reused as-is (no gaps found requiring new tokens):**
- `src/theme/tokens.ts` — `color.cyan`/`cyanBright`/`cyanSoft` already exist specifically for
  "the app is telling you something" data moments (the file's own header comment); `color.violet*` is
  documented and already used as onboarding's dominant accent
  (`2026-07-29-ui-ux-foundation.md`, "Design decisions": *"Violet is the single dominant accent across
  onboarding... the spectral gradient remains reserved for data"*). **Decision:** this redesign keeps
  that established rule — CTA buttons, pagination dots, and the eyebrow index badge stay violet;
  **cyan is used specifically for the data/evidence elements the brief calls out** (the progress chart,
  the estimated-1RM figure) — which is exactly the semantic split the token file's own comment already
  describes, not a new pattern.
- `src/theme/typography.ts` — `hero`/`display`/`title1`/`numeric`/`numericLg`/`eyebrow`/`label` cover
  every text role this brief needs (headline, section index, tabular data, disclaimers).
- `src/components/ui/`: `Card` (`variant="outline"` already gives the hairline "instrument panel" look
  the brief asks for, no glass/blur anywhere in its implementation), `Chip`, `ListRow`, `Button`,
  `CarouselPagination`, `FadeIn` (reduce-motion-aware entrance, already exactly what the brief's motion
  section asks for), `Text`.
- **Conclusion: no new design tokens are added.** The brief's "add a minimal token layer if the theme
  lacks what's needed" condition does not apply — everything needed already exists. What's added is a
  small shared *component* layer (below), not new primitives.

**Formulas/copy reused verbatim from the real app, not reinvented:**
- Epley formula: `src/domain/calc/oneRepMax.ts`'s `estimateOneRepMax(weightKg, reps)` — the demo card
  calls this real function on static demo inputs rather than hardcoding a result, so the number can
  never drift out of sync with the formula it claims to use.
- Formula notation: README's own "e1RM = weight × (1 + reps / 30)" wording, reused verbatim.
- Non-medical framing: `src/domain/calc/readiness.ts`'s `READINESS_EXPLANATION` / `INSUFFICIENT_COPY`
  establish the exact tone (`Docs/invariants.md` I-8) this screen's disclaimer must match.

**Testing architecture (verified, unchanged by this sprint):** hermetic Jest only, no
`@testing-library/react-native` or any component-rendering test tool installed — confirmed absent, and
a prior sprint (`2026-07-27-readiness-inputs-and-confidence-foundation.md`, Decision 6) explicitly
declined to add one. `app/` and `src/components/` have zero existing tests. **This sprint does not add
component/rendering tests** — it would require a new dependency, which the brief says to avoid without
approval. What the architecture *does* support, and what this sprint adds, is plain-Jest tests over the
new **pure data**: the demo dataset's internal consistency (its displayed 1RM figures actually equal
`estimateOneRepMax` applied to its own inputs) and content shape (three slides, correct ids/order,
non-empty strings). This is stated explicitly rather than silently skipping "new focused tests."

## Goals

1. Redesign the three `FEATURE_SLIDES` (Log / Progress / Readiness) to the brief's content and visual
   direction, at iPhone widths, using only the existing design system.
2. Preserve every existing interaction contract: Skip, horizontal paging, pagination dots, the fixed
   bottom CTA, and the route this screen hands off to.
3. Ship it as small, independently reviewable commits.

## Non-goals (explicit)

- No change to `app/onboarding/_layout.tsx`, `index.tsx`, `auth.tsx`, `steps.tsx`, or `complete.tsx`.
- No change to `onboardingStore.ts`'s persistence shape or `complete()` semantics.
- No new dependency. `react-native-svg` (`^15.15.4`) is already installed and is the only non-trivial
  dependency this sprint touches, for the Progress chart.
- No rename of `features.tsx` or its route. The file's content is now Log/Progress/Readiness rather than
  generic "features," but renaming it would also require editing `_layout.tsx`'s `Stack.Screen name`,
  `index.tsx`'s and `auth.tsx`'s back-link paths — more surface area than this UI-only sprint needs to
  touch. Flagged here as a conscious choice, not an oversight.
- No image assets. Typography, layout, existing token colour, and one `react-native-svg` line chart
  only, per the brief.
- No lint run — confirmed (again) that no lint script or config exists in this repository
  (`package.json`, repo root). Not silently skipped; there is nothing to run.

## Visual/design rules for this sprint

Restating the brief's direction as concrete constraints, cross-checked against what the existing token
system already enforces:

- Near-black canvas (`color.bg`), tonal surfaces (`color.card`/`cardRaised`/`inset`) — already how every
  `Card` renders; no new surface colour needed.
- No full-screen gradients, blobs, glow, or glassmorphism. Checked against what's available: `Card` has
  no blur/opacity-layer variant to misuse, and `LinearSpectrum` (the only gradient primitive in the
  codebase) is hard-capped to a thin band by its own component contract ("never as a large filled area"
  — its own doc comment). This sprint uses `LinearSpectrum` at most as the existing thin top-edge band
  on `Card variant="raised" spectral`, exactly as already used elsewhere, never as a background.
- 8pt-ish rhythm: already how `space` (`tokens.ts`) is scaled (4/8/12/16/20/24/32/44/64).
  Cards/rows/gaps use `space.md`/`base`/`lg`/`xl` throughout, nothing hand-typed.
- One eyebrow-styled section index per slide ("01 / LOG", "02 / PROGRESS", "03 / READINESS") — new
  copy, styled with the existing `eyebrow` type token, not a new component.
- Fixed bottom action area: already the existing `features.tsx` footer pattern (`View` outside the
  `FlatList`, not part of any per-slide scroll) — kept as-is.
- Page position indicator: the existing `CarouselPagination` — kept as-is, no visual change.

## Screen requirements → implementation mapping

### Shared shell (new)

- **`src/components/onboarding/OnboardingSlideHeader.tsx`** (new) — eyebrow index badge
  (`"01 / LOG"` etc., `Text variant="eyebrow" tone="violet"`) + headline (`Text variant="title1"`,
  matching the type scale `features.tsx` already used for slide titles) + supporting body copy
  (`Text variant="body" tone="secondary"`). One component, three slides, so headline treatment cannot
  drift between them.
- **`src/content/onboarding.ts`** (modified) — `FEATURE_SLIDES`' `eyebrow`/`title`/`body` fields
  updated to the brief's copy (below); the unused `icon` field is dropped from the two slides that no
  longer use a standalone decorative icon (see "Log," below) and from the type where no longer needed.
  Three new, explicitly-labelled **presentation-only** exports added: `ONBOARDING_LOG_DEMO`,
  `ONBOARDING_PROGRESS_DEMO`, `ONBOARDING_READINESS_DEMO` — static data for the three preview cards,
  each with a doc comment stating it is fixed onboarding demo content, not read from
  `trainingStore`/any repository, and must never be.

### 1. Log — `src/components/onboarding/LogPreviewCard.tsx` (new)

- Eyebrow/headline/body via `OnboardingSlideHeader`: `01 / LOG`, **"Log what happened."**, and body
  copy explaining that sets/reps/load become the evidence used later (exact copy below).
- **`LogPreviewCard`**: a `Card variant="outline"` "instrument panel" — exercise name (`Back Squat`,
  `title2`), a small `3 SETS` eyebrow tag, then three set rows, each showing `100 kg`/`× 5`/`RPE 8` in
  `numeric`/`numericSm` tabular type (the same type tokens the real logger's `SetRow` uses, so it reads
  as a real interface, not a mock), with a small `checkmark-circle` glyph (16px, `color.positive`) per
  row marking it recorded — this *is* the "recorded completion" cue the brief asks for, and doubles as
  the sprint's one allowed piece of iconography, used three small times for a real functional reason
  rather than once decoratively. **Decision:** no separate large "logging" icon is added anywhere on
  this slide — the preview card itself is the visual anchor, avoiding the "overly large icon" pattern
  the brief explicitly flags.
- The card is **not interactive** (no `onPress`, no `accessibilityRole="button"` on its rows) —
  per the brief, "not an interactive mini-app." It is still exposed to screen readers as one composed,
  read-only unit (`accessible` + one assembled `accessibilityLabel`, mirroring `ListRow`'s own pattern
  for non-pressable rows) rather than as three separate, confusingly-focusable dead controls.
- Bottom action: `Continue` (existing `FEATURES.primaryCta`, unchanged). Skip: existing, unchanged.

### 2. Progress — `src/components/onboarding/ProgressChart.tsx` + `EstimatedOneRepMaxCard.tsx` (new)

- Eyebrow/headline: `02 / PROGRESS`, **"Every number can be interrogated."** (already the exact
  existing copy — kept).
- **`EstimatedOneRepMaxCard`**: hero-style stat (`Text variant="hero" tone="cyan"`, cyan per the brief's
  "primary data signal") showing the estimated 1RM, computed as
  `estimateOneRepMax(ONBOARDING_PROGRESS_DEMO.currentSet.weightKg, ONBOARDING_PROGRESS_DEMO.currentSet.reps)`
  — **never a hardcoded number** — labelled `Estimated 1RM` / `Calculated from your logged work`
  (`eyebrow`/`bodySm`), plus an expandable **"How is this calculated?"** row using the exact
  expand/collapse `Pressable` + chevron pattern `src/components/today/ReadinessCard.tsx` already uses
  (same interaction the real app ships, not a new one), revealing `e1RM = weight × (1 + reps / 30)`
  (README's own notation, verbatim) and the concrete substitution for this demo's numbers.
  Uncertainty line: *"An estimate that improves with more logged sessions."* (brief's own wording, kept
  verbatim — it already matches PRism's existing voice).
- **`ProgressChart`**: `react-native-svg` `Svg`/`Polyline`/`Circle`/`Line`. Eight static weekly points,
  each itself computed via `estimateOneRepMax` from a plausible weekly (load, reps) pair — not eight
  independently-invented numbers — ending exactly at the same value `EstimatedOneRepMaxCard` shows, so
  the chart and the headline stat visibly agree (see "Static demo dataset" below for the exact numbers).
  Cyan stroke (`color.cyan`/`cyanBright`), a single thin baseline (`color.line`), two axis labels
  (`8 WEEKS AGO` / `TODAY`, `eyebrow` token) — restrained per the brief, structural rather than
  decorative, no fill/gradient/glow under the line.
- Bottom action: `Continue`.

### 3. Readiness — `src/components/onboarding/ReadinessInputRows.tsx` (new)

- Eyebrow/headline: `03 / READINESS`, **"Honest about what it cannot see."** (already the exact
  existing copy — kept).
- **`NOT ENOUGH INPUT`** rendered as the existing `Chip` primitive, `tone="neutral"` — explicitly *not*
  `coral`/`critical`, per the brief's "no red alert styling." Neutral is the same restrained grey
  treatment the real `ReadinessCard`/`INSUFFICIENT_COPY` state already uses for "not enough data,"
  reused rather than inventing a new severity colour.
- **`ReadinessInputRows`**: a `Card variant="outline"` holding three divided `ListRow`s — *Recent
  training* (trailing `Chip` reading `LOGGED`, tone `cyan`, subtitle `"3 sessions logged this week"`)
  and *Sleep* / *Recovery* (trailing `Chip` reading `NO INPUT`, tone `neutral`, subtitle
  `"No input yet"`) — reusing two existing primitives (`ListRow`, `Chip`) rather than building new row
  UI. This makes concrete the brief's required distinction (training may be logged; sleep/recovery
  currently are not) without inventing a new component just for it.
- Disclaimer (`bodySm`, `tone="faint"`, matching `ReadinessCard`'s own disclaimer treatment):
  *"Readiness is a planning estimate built from what you log — training, sleep, recovery. It is never a
  diagnosis, and it is never medical advice."* — deliberately close to, but not copy-pasted from,
  `READINESS_EXPLANATION` (that string references "your latest check-in," which does not yet exist at
  onboarding time; this one is scoped to what onboarding can honestly say).
- Bottom action label changes for this slide only: **`Get started`** — a new `FEATURES.finalCta`
  content constant, selected via `isLast ? FEATURES.finalCta : FEATURES.primaryCta`, mirroring the
  identical `isLast ? STEPS.finalCta : STEPS.primaryCta` pattern already used in `steps.tsx`. Handler
  unchanged (`router.push('/onboarding/auth')` — see "Completion semantics," above).

## Exact copy (final, used verbatim in implementation)

| Slide | Eyebrow | Headline | Body |
|---|---|---|---|
| Log | `01 / LOG` | `Log what happened.` | `Sets, reps, and load — recorded in seconds. That is the evidence every estimate PRism shows you later is built from.` |
| Progress | `02 / PROGRESS` | `Every number can be interrogated.` | `Estimated 1RM, volume, and load suggestions all show the rule that produced them, so you can disagree with one.` (existing body copy, kept — already fits) |
| Readiness | `03 / READINESS` | `Honest about what it cannot see.` | `A readiness estimate that says "not enough input yet" instead of inventing a confident-looking score.` (existing body copy, kept — already fits) |

## Static demo dataset (presentation-only, isolated from real domain state)

Defined once in `src/content/onboarding.ts`, computed through the real `estimateOneRepMax`, never
hand-typed as a result:

- **Log preview:** `Back Squat`, 3 sets, each `{ weightKg: 100, reps: 5, rpe: 8 }`.
- **Progress current point:** the same `{ weightKg: 100, reps: 5 }` → `estimateOneRepMax(100, 5)` =
  **116.7 kg** (one decimal, matching `formatWeight`'s own rounding convention) — chosen to equal the
  Log slide's set exactly, so a reader who looks at both slides sees one coherent story, not two
  disconnected mockups.
- **Progress chart, 8 weekly points**, each `estimateOneRepMax(weightKg, reps)`:
  `88×5→102.7`, `90×5→105.0`, `91×5→106.2`, `90×6→108.0`, `94×5→109.7`, `96×5→112.0`, `95×6→114.0`,
  `100×5→116.7` — monotonically increasing, ending at the same figure as the headline stat.
- **Readiness rows:** Recent training = logged (`"3 sessions logged this week"`); Sleep = no input;
  Recovery = no input.

## Accessibility requirements

- Every touch target ≥ 44pt: unchanged `Button`/`Chip`/`CarouselPagination` primitives already enforce
  this (`a11y.minTouch`); no new bespoke touch target is introduced.
- `maxFontSizeMultiplier={1.6}` is already enforced globally by the one `Text` component — nothing in
  this sprint bypasses it.
- Each slide's content sits inside its own vertical `ScrollView` (new — see "Layout note" below) so
  large accessibility text or a small device (iPhone SE width) makes a slide scroll rather than clip.
- The Log preview card is one `accessible` unit with an assembled label, not three orphaned
  sub-elements (see above).
- The Progress chart is `accessible` with one `accessibilityLabel` summarising the trend in words (e.g.
  *"Estimated one-rep max trending from 103 to 117 kilograms over 8 weeks"*) — the SVG shapes themselves
  are not individually focusable, since a screen reader cannot usefully interrogate raw path geometry.
- Readiness rows use `ListRow`'s existing accessibility pattern (one label per row, assembled from
  title/subtitle) plus the trailing `Chip`'s own label (`LOGGED`/`NO INPUT`).
- `FadeIn` (already reduce-motion-aware) wraps each slide's content for the entrance transition,
  reusing the existing primitive rather than adding new motion code.

## Layout note (small addition to `features.tsx`, not a new file)

The current `renderItem` puts a fixed, non-scrolling `Card` directly in each paged slide. This sprint's
slides are visually denser (header + preview card, or header + stat + chart), so each slide's
`renderItem` output is wrapped in a `ScrollView` (vertical only — the outer `FlatList` still owns
horizontal paging; opposite-axis nested scrolling is an established, unproblematic React Native
pattern, not new complexity). This is the one structural change to `features.tsx` itself, beyond
swapping in the three new content components.

## Commit plan

1. `chore: add onboarding redesign sprint plan` — this document.
2. `feat: add onboarding visual tokens and shared shell` — `OnboardingSlideHeader.tsx`; updated
   `FEATURE_SLIDES` copy and new demo-data exports in `src/content/onboarding.ts`.
3. `feat: redesign logging onboarding screen` — `LogPreviewCard.tsx`; wire into `features.tsx`.
4. `feat: redesign progress onboarding screen` — `ProgressChart.tsx`, `EstimatedOneRepMaxCard.tsx`;
   wire into `features.tsx`.
5. `feat: redesign readiness onboarding screen` — `ReadinessInputRows.tsx`; wire into `features.tsx`,
   including the `Get started` final-slide CTA and the `ScrollView` layout change.
6. `test: verify onboarding redesign behavior` — pure data tests (below).
7. `docs: record onboarding redesign verification` — this document updated with actual results.

Each commit's diff is inspected before committing to confirm it contains only its stated scope.

## Verification plan

| Check | Command / method |
|---|---|
| Typecheck | `npm run typecheck` |
| Lint | N/A — no lint script/config exists in this repository (confirmed, not skipped) |
| Existing unit tests | `npm test -- --ci` — must stay 100% passing, count only going up |
| New data tests | Same command; new file under `src/content/__tests__/` |
| iOS build/launch | `npx expo start`, then simulator launch via the README's documented sequence (this repo has no committed `ios/` — Metro serves the existing installed debug build; a fresh native rebuild is only needed if a native module changed, which it has not) |
| Android | Not attempted unless the iOS pass raises something Android-specific worth checking — this is a pure-JS/RN change with no native code, so parity is expected; recorded honestly either way, not assumed |
| Manual: all three slides render correctly | Screenshot each, on-device |
| Manual: Skip | Tap, confirm route to `/onboarding/auth` |
| Manual: Continue × 2, Get started | Tap through Log→Progress→Readiness→auth |
| Manual: pagination indicator | Confirm dot position matches slide index on both taps and swipes |
| Manual: small screen | iPhone SE-class simulator width |
| Manual: large accessibility text | `accessibility-extra-large` content size |
| No clipped/inaccessible controls | Visual check at both of the above |
| No external image/file dependency | `grep -rn "require(.*\.\(png\|jpg\|jpeg\)" src/components/onboarding app/onboarding` → expect no match beyond what already existed |
| No new gradients/glow/decorative effects | Diff review — only `LinearSpectrum` (existing, capped) and flat token colours used |

## Results

Filled in as work is completed — see the end of this document for the verification log.
