# Sprint: ui-ux-expansion

- **Status:** Implemented, pending review. Simulator/device rendering not done — see Validation.
- **Date:** 2026-07-29
- **Branch:** `ui-ux-foundation` (continues the branch; see "Why the same branch")
- **Type:** UI/UX expansion. Frontend only. No schema, migration, RLS, repository,
  entitlement, or calculation change.
- **Predecessor:** [`2026-07-29-ui-ux-foundation`](2026-07-29-ui-ux-foundation.md)
- **Research input:** [R-001](../research/R-001-primary-surface-information-architecture.md)

## Goal

Take PRism's primary product surfaces from "each tab is honest about what it computes" to "the app
reads as one deliberate product." Concretely: give Today a real summary→action→detail hierarchy,
promote exercise browsing to a top-level destination, layer Insights instead of flattening it,
commit a Social slot in the navigation, and finish the first-run flow's escape hatches.

The functional and structural target comes from R-001 — a sanitised reading of how mature
strength-training loggers organise their top-level destinations. Every visual, textual, and
implementation decision is PRism's own, built on the token system and primitives that already exist.

## Why the same branch

`ui-ux-foundation` is the UI/UX branch and this is the same body of work continued, so `I-14`'s
"one branch, one purpose" is satisfied by the branch as a whole rather than by opening a second UI
branch that would need the first merged before it could be reviewed. The predecessor sprint's record
is left untouched as a historical account; this document is the target for everything after commit
`791d19a`.

## UX principles for this sprint

Fixed up front so scope creep is visible when it happens:

1. **Today is summary-first.** A compact state block at the top, one dominant action immediately
   under it, then progressively deeper context on scroll.
2. **Exercises is browse-first.** Fast text search, composable filters, explicit grouping, and low
   friction from "found it" to "doing it".
3. **Insights is layered.** A short motivating summary, then PRism's derived highlights, then
   per-muscle detail, then links into the deeper analytics surfaces.
4. **Social exists as a shell.** A real destination with a real information architecture, and an
   unambiguous on-screen statement that nothing in it is live.
5. **Structure is borrowed; expression is not.** Information architecture and content ordering are
   informed by R-001. Layout, spacing, type, colour, iconography, wording, and transitions are
   PRism's, per [ADR-0003](../decisions/ADR-0003-reference-research-policy.md) and `I-13`.
6. **Onboarding keeps its short path to first value.** Guided, every question skippable, choices
   echoed back, persistence local/demo only.
7. **Tokens and primitives first.** No screen hardcodes a colour, font size, or raw gap. Anything
   needed by two or more screens becomes a primitive in `src/components/ui/`.
8. **Incremental polish over rewrite.** Existing screens are restructured, not replaced; existing
   calculations are consumed, not modified.

## Information architecture change

**Current (verified in `app/(tabs)/_layout.tsx` at `791d19a`):** five visible tabs — Today,
Progress, Body, Insights, Plans.

**Target:** five visible tabs — Today, Exercises, Insights, Social, Plans. Progress and Body stay as
routes and stay reachable, but leave the tab bar.

| Destination | Before | After | Note |
| --- | --- | --- | --- |
| Today | Tab 1 | Tab 1 | Restructured |
| Exercises | — | Tab 2 | New |
| Insights | Tab 4 | Tab 3 | Restructured; becomes the analytics hub |
| Social | — | Tab 4 | New shell |
| Plans | Tab 5 | Tab 5 | Unchanged this sprint |
| Progress | Tab 2 | Route, linked from Insights | Screen body unchanged apart from a back affordance |
| Body | Tab 3 | Route, linked from Insights | Screen body unchanged apart from a back affordance |

**Decision:** hide Progress and Body from the bar with `href: null` rather than moving their files.
This keeps the diff small and reviewable, keeps their URLs stable, and avoids touching two screens
whose content is not part of this sprint. **Assumption to verify in a simulator:** a bar item hidden
this way is still navigable and `router.back()` returns to the previous tab; the back affordance
falls back to an explicit `replace` into Insights if `canGoBack()` is false, so a failure of that
assumption degrades to a working button rather than a trap.

**Rejected:** a six- or seven-tab bar (labels stop being legible on a compact device, and PRism's
bar deliberately keeps text labels — `_layout.tsx` comment); and folding Progress/Body *into*
Insights as sections (a genuine rewrite of two screens, out of scope, and R-001 open question 2
records it as undecided).

## In scope

Ordered as the intended commit sequence.

1. **Documentation** — this record, plus research note R-001 and its index entry.
2. **Shared UI primitives** (`src/components/ui/`) — new: `SegmentedControl`, `SearchField`,
   `ListRow`, `EmptyState`. Changed: `Screen` gains an optional back affordance. The existing
   mid-session exercise picker adopts `SearchField` so the primitive has two real callers rather
   than one.
3. **Today** (`app/(tabs)/index.tsx`, `src/components/today/`) — new `TodayHero` summary block;
   re-ordered sections; a quick-access row into the other destinations.
4. **Exercises** (`app/(tabs)/exercises.tsx`, new) — search, region/equipment/favourite filters,
   selectable grouping, sectioned list, inline expansion showing PRism's own coaching cue, and a
   low-friction "log this lift" path.
5. **Insights** (`app/(tabs)/insights.tsx`) — headline summary with a selectable window, existing
   highlights retained, new per-muscle volume-versus-target section, links into Progress and Body.
6. **Social** (`app/(tabs)/social.tsx`, new; `src/content/social.ts`, new) — shell with an explicit
   "not live" notice and clearly labelled local sample items.
7. **Onboarding polish** (`app/onboarding/`) — skip affordance on every setup step, a choices
   summary on the completion screen, entrance transitions.
8. **Tab bar** (`app/(tabs)/_layout.tsx`) — new order, new icons, Progress/Body hidden.

## Explicitly out of scope

- **Anything backend.** No Supabase work, no migration, no RLS policy, no repository change, no
  change to the auth contract. The onboarding auth screen stays presentation-only.
- **Calculations.** `src/domain/calc/` is consumed as-is. No readiness weight, threshold, recovery
  window, or PR rule is touched. The unaudited pre-ADR-0002 status of `readiness.ts` and
  `loadRecommendation.ts` is unchanged by this sprint and not improved by it.
- **The readiness feature itself.** No suggestion UI, no dismissal control (`I-17` stays unmet), no
  rule versioning or audit persistence (`I-12` stays unmet).
- **Clinical, diagnostic, recovery-measurement, or injury-prevention claims** — none added anywhere,
  per `I-8`. New copy about muscle volume describes training volume against the user's own target
  and says nothing about health, risk, or injury.
- **Real social features.** No account, no network call, no follow graph, no feed backend, no
  fabricated activity presented as genuine.
- **Progress and Body screen content.** They gain a back affordance and nothing else.
- **Plans screen content**, the workout logger, and the workout summary screen.
- **Applying onboarding selections to `Profile`.** Still deferred (predecessor sprint follow-up 1).
- **Dependencies.** No package added, removed, or upgraded. Animation uses React Native's own
  `Animated`; no `reanimated` dependency is introduced.
- **Native project files**, app config, and production configuration.

## Success criteria

Reviewable at the branch level. A criterion is met only with evidence.

### Structure

- **S-1.** The tab bar shows exactly Today, Exercises, Insights, Social, Plans, in that order, each
  with an icon *and* a text label. Evidence: `app/(tabs)/_layout.tsx` diff.
- **S-2.** Progress and Body are absent from the bar and still reachable from Insights, and each has
  a working way back. Evidence: the `href: null` options, the Insights link rows, and the
  `canGoBack()`-guarded back handler.
- **S-3.** No route is orphaned: every file under `app/` is reachable from the tab bar in at most two
  taps. Evidence: reviewer walk-through of the route list.

### Today hierarchy

- **S-4.** Today's first screenful contains the state summary *and* the single dominant action,
  with no second filled CTA anywhere on the screen. Evidence: the section order in the diff.
- **S-5.** Every number in the summary block traces to an existing selector or calculation — nothing
  is invented for display. Evidence: the imports in `TodayHero`'s call site.
- **S-6.** The insufficient-readiness state (`score === null`) renders as an explicit absence in the
  summary block, never as `0`. Evidence: the null branch in `TodayHero`, consistent with `I-18` and
  with `ReadinessCard`'s existing treatment.

### Exercises

- **S-7.** Text search, region filter, equipment filter, and favourites filter compose rather than
  replace each other, and grouping is user-selectable across at least two axes.
- **S-8.** A result row reaches a logging action in at most two taps, and starting a session from
  Exercises produces the same active-workout state as the existing open-session path — no new
  workout-creation code path. Evidence: both call `useActiveWorkoutStore.start` / `addExercise`.
- **S-9.** The no-results state is a real empty state with a way out, not a blank list.

### Insights

- **S-10.** Insights opens with a summary that fits above the fold, and per-muscle detail sits below
  the existing highlights.
- **S-11.** The window selector changes the summary and the muscle breakdown, and the selected
  window is stated in the copy so a number is never ambiguous about its period.
- **S-12.** The muscle breakdown states the basis of its target and makes no health, risk, or injury
  claim.

  > **Criterion corrected during implementation (2026-07-29).** As written before code, S-12 said
  > "states its target as the user's own weekly set target." That was wrong about the code:
  > `MUSCLE_META[m].weeklySetTarget` is a fixed per-muscle reference midpoint for an intermediate
  > lifter, not a value the user sets. Meeting the criterion as originally worded would have required
  > shipping false copy. The delivered copy names the target's actual basis and adds that it is a
  > volume-planning reference, not a health threshold and not a figure that must be hit.

### Social

- **S-13.** The Social tab states on screen, above any sample content, that nothing in it is live
  and that the items are local samples; every sample item is individually labelled.
- **S-14.** No network call, no credential field, and no persisted social state. Evidence: the
  file's import list — content comes from a static module under `src/content/`.

### Onboarding

- **S-15.** Every setup question can be skipped, and skipping leaves the answer unset rather than
  defaulting it.
- **S-16.** The completion screen echoes back what the user chose, including "not set" for anything
  skipped.
- **S-17.** Onboarding still persists only to `AsyncStorage` via `onboardingStore`, and still writes
  nothing to `Profile` or any repository.

### Design system and hygiene

- **S-18.** No new hex value, font size, or raw pixel gap outside `src/theme/`. Evidence: grep for
  `#`-prefixed literals and `fontSize:` in the diff returns nothing outside the theme directory
  (existing `rgba(...)` token-derived values in pre-existing files excepted where untouched).
- **S-19.** Every new interactive element has an accessible label and a target of at least
  `a11y.minTouch`.
- **S-20.** `npm run typecheck` passes, `npm test` passes with no suite removed or weakened, and
  `npx expo export --platform ios` succeeds.
- **S-21.** The branch reads as small, single-purpose commits matching the eight groups above, each
  with a message naming its surface.
- **S-22.** `git diff main...HEAD -- supabase/ src/data/ src/domain/calc/` is empty for this
  sprint's commits.

## What shipped

Nine commits on `ui-ux-foundation`, after `791d19a`:

| Commit | Group | Surface |
| --- | --- | --- |
| `68dc882` | 1 | This record and research note R-001 |
| `c4ffaeb` | 2 | `SegmentedControl`, `SearchField`, `ListRow`, `EmptyState`; `Screen.onBack`; picker adopts `SearchField` |
| `5426146` | 3 | Today restructured; `TodayHero`, `QuickAccess`; `WeekCard` reports the four-week average |
| `b7cc874` | 4 | `app/(tabs)/exercises.tsx` |
| `5f0f135` | 5 | Insights layered; period selector, muscle balance, links into Progress and Body |
| `0a66546` | 6 | `app/(tabs)/social.tsx`, `src/content/social.ts` |
| `0fb665d` | 8 | Five-destination tab bar; Progress and Body hidden with a back affordance |
| `4ecd400` | 7 | Skippable setup steps, choices summary, `FadeIn` |
| `9b4a767` | — | Touch-target fix found by the S-19 audit |

### Deviations from the planned sequence

Recorded rather than quietly absorbed:

1. **Each new screen registers its own tab in the same commit.** Planned group 8 was going to do all
   tab-bar work at once, but expo-router auto-registers any file under `app/(tabs)/`, so a screen
   committed without a `Tabs.Screen` entry would have shown up as an unlabelled lowercase route name.
   Groups 4 and 6 therefore each add their own bar item, and group 8 does the reorder, the icons, and
   the `href: null` hiding. Every commit leaves a working bar; the bar is briefly six and then seven
   items before group 8 sets it to five.
2. **Group 8 landed before group 7.** Both are independent; doing the bar first meant the seven-item
   intermediate state lasted one commit instead of two.
3. **`FadeIn` shipped in group 7, not group 2.** It is a shared primitive and lives in
   `src/components/ui/`, but it was written for the onboarding transitions and has no other caller
   yet, so it is committed with the work that needed it.
4. **`WeekCard`'s props changed** — `volumeThisWeek`/`volumeDelta` became `volumeAverage`. Not listed
   in scope, but the alternative was showing the same week-volume figure twice on one screen. It has
   one caller.
5. **S-12 was corrected mid-sprint** because the criterion as written described the code incorrectly.
   See the criterion for the full note.

## Design decisions

- **The summary block carries no CTA.** Today's hero states where the lifter stands; the session card
  directly under it owns the one filled button. Two start buttons on one screen is the failure mode
  a summary block invites, and PRism already committed to one dominant action per screen
  (predecessor sprint, "Design decisions").
- **Readiness appears twice, deliberately.** A compact number in the summary, the full ring and
  factor breakdown further down. That repetition *is* the progressive-disclosure pattern from R-001
  O-1; collapsing it would either bury the score or force the explanation above the fold.
- **Grouping is a segmented control, filters are chips.** Grouping is one-of-N and changes the
  list's shape; filtering is many-of-N and changes its contents. Giving them the same control would
  make them look interchangeable.
- **Sample social content is labelled twice** — once at the section level and once per item. One
  label is a caption someone scrolls past; the pattern PRism already rejected in `PhasePanel` is
  content that *looks* real, and a label only prevents that if it travels with the item.
- **The window selector states its period in the copy**, not just in the control. A number read
  aloud by a screen reader, or glanced at after the control has scrolled away, has to carry its own
  period.
- **Progress/Body keep their files.** Their route paths and screen bodies are not this sprint's
  subject; hiding a bar item is a one-line option change, whereas moving the files would rewrite two
  screens' imports for no user-visible gain.

## Validation

Commands actually run on the final commit of this sprint, with their actual results.

| Command | Result |
| --- | --- |
| `npm run typecheck` | Pass, exit 0 |
| `npm test` | Pass — 78/78, 4 suites. No suite added, removed, or weakened |
| `npx expo export --platform ios` | Pass — single iOS bundle, 5.1 MB |
| `git diff --cached --check` | Clean on every commit in this sprint |
| `git diff 791d19a..HEAD --stat -- supabase/ src/data/ src/domain/` | Empty — S-22 holds, and no domain file was touched either |

**Design-system audit (S-18).** Grepping every `.ts`/`.tsx` file changed in this sprint, excluding
`src/theme/`, for hex literals and `fontSize:` returns exactly one hit: the pre-existing
`fontSize: 9.5` tab-label override in `app/(tabs)/_layout.tsx`, which predates this sprint and was
not introduced or moved by it. No new hardcoded colour or font size was added.

**Accessibility audit (S-19).** One real defect found and fixed (`9b4a767`): `SegmentedControl`
subtracted the track's padding from the segment's `minHeight`, leaving each choice 40pt tall against
the 44pt floor. All other new interactive elements meet it — `ListRow` at 56pt, `QuickAccess` tiles
at 108pt, `SearchField`'s clear control at 32pt plus 10pt `hitSlop`, and every `Button` at `size="sm"`
or larger.

**Not verified, and not claimed:**

- **No screen was rendered in a simulator or on a device.** No component-test framework exists —
  deliberately, per the readiness sprint's Decision 6 — so layout correctness at iPhone sizes,
  scroll behaviour on the restructured screens, and the appearance of the five-item tab bar are
  unverified.
- **The `href: null` navigation assumption** stated in the IA section above is unverified at runtime.
  The bundle builds and the option is typed, but "a hidden bar item is still navigable and
  `router.back()` returns to the previous destination" has not been observed. The
  `canGoBack()` fallback means a failure degrades to a button that lands on Insights.
- **The reduce-motion path in `FadeIn`** has not been exercised with the setting enabled.
- **Nothing about originality is independently audited.** As `Docs/architecture.md` already notes,
  the originality position is stated, not verified. This sprint added the R-001 exclusion list and
  the reasoning behind each decision; it did not run a comparison against any product.

## Follow-ups

1. Answer R-001 open question 1: is Social part of PRism's product, or a held slot? Until it is
   answered the tab stays a labelled shell.
2. Decide whether Insights absorbs Progress and Body as sections (R-001 open question 2).
3. Per-exercise detail screen — history, best sets, rep-range breakdown — once Progress grows its
   per-exercise view (R-001 open question 3).
4. Carry forward the predecessor sprint's four follow-ups; none is addressed here.
5. Render the restructured screens on a device and record the result, closing the gap this sprint's
   validation section leaves open. Specifically: the five-item bar at 9.5pt labels on the narrowest
   supported device, the `href: null` navigation assumption, `FadeIn` with reduce-motion enabled, and
   the Exercises section list at large accessibility text sizes.
6. Decide whether the Social tab's placeholder feed earns its place, or whether the shell should be
   the notice, the intent rows, and the real-data card preview alone. It is the one piece of this
   sprint that shows content resembling activity that never happened, and it is labelled three ways
   because of it.
