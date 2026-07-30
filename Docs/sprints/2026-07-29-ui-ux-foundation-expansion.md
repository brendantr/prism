# Sprint: ui-ux-foundation-expansion

- **Status:** Implemented, rendered, and tap-verified on a simulator; pending review. Typing was not
  verified — see "Still not verified" under Validation.
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
whose content is not part of this sprint.

**Assumption stated here before code, and since FALSIFIED:** "a bar item hidden this way is still
navigable and `router.back()` returns to the previous tab." The first half held. The second did not —
tap-verification (T9b, `d7a9846`) showed `router.back()` pops to the tab navigator's *initial* route,
so back from Progress landed on Today whether the user arrived from Today or from Insights. Both
screens now navigate explicitly to Insights, the hub they hang off, and the control announces "Back to
Insights" rather than promising history it cannot honour.

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

Fifteen commits on `ui-ux-foundation`, after `791d19a`:

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
| `3bde4c0` | — | This record's first validation write-up |
| `f31f56f` | — | Social placeholder feed cut (owner decision) |
| `d59f8f1` | — | Two layout fixes found by rendering on a simulator |
| `84a9e1f` | — | Record renamed; sprint-naming rule added to `Docs/agents.md` |
| `dec9544` | — | Working simulator launch sequence added to the README |
| `d7a9846` | — | Three fixes found by driving the UI with real taps |

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
6. **The Social placeholder feed was cut after the sprint was first reported done** (`f31f56f`),
   resolving what had been logged as follow-up 6. See "Design decisions".
7. **Two layout fixes landed after simulator rendering** (`d59f8f1`), and one of them touches a
   pre-existing defect on Progress. Neither was in the planned scope; both were defects in this
   sprint's own output that only a rendered screen could expose. See "Validation".
8. **Three more fixes landed after tap-verification** (`d7a9846`), one of which — the missing "Later"
   control on the auth screen — is a predecessor-sprint defect, not this sprint's. It is fixed here
   because it was also what blocked tap-verifying the setup steps.

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
- **Social shows no invented activity at all.** A first draft carried a placeholder feed with
  self-describing placeholder identities, labelled at the section level and again per row. It was cut
  (owner decision, 2026-07-29, commit `f31f56f`): needing three disclaimers to make rows honest was
  the argument that the rows were the problem, and this is the position PRism already took in
  `PhasePanel`. What remains is the "nothing here is live" notice, the three intent rows, and a
  shareable-card layout preview built from a record the lifter actually set and marked "Not posted" —
  so the only data on the screen is their own.
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

### Rendered verification (2026-07-29, iPhone 17 Pro simulator, iOS 26.4)

The screens **were** rendered, which the first version of this section said had not happened. Setup:
a debug build of the existing `ios/` project installed on a freshly created simulator; navigation
driven by `xcrun simctl openurl` deep links against the `prism` scheme; every screenshot taken with
`xcrun simctl io … screenshot`, which reads the device framebuffer directly.

**Simulator launch, fixed.** `expo run:ios` built and installed cleanly and then failed at the launch
step. Three causes, in order:

1. `expo run:ios` opens a dev-client deep link pointing at the LAN address of a Metro server. A Metro
   instance was already bound to port 8081 from an earlier session, so the CLI's own server never
   started and `simctl openurl` timed out — `NSPOSIXErrorDomain code 60`, not the reported 115.
2. The device had been booted with `simctl boot` without waiting on `simctl bootstatus`, so
   SpringBoard was still initialising. Its app icons were rendering as grey placeholders.
3. `CoreSimulatorService` itself was wedged: after a full boot, both `simctl launch` and
   `simctl openurl` still hung indefinitely on a freshly created device.

The sequence that works, and was used for everything below: `killall -9
com.apple.CoreSimulator.CoreSimulatorService` → boot → **`simctl bootstatus` and wait** → `simctl
install` → `simctl launch`. Launch then returned a PID immediately.

**What was observed:**

| Check | Result |
| --- | --- |
| S-1 tab bar | Exactly five items, in order — Today, Exercises, Insights, Social, Plans — each with a glyph *and* an uppercase label, the active one violet with the cyan dot. Progress and Body absent. |
| S-2 `href: null` | Deep-linking to `/progress` and `/body` renders both screens **with no tab highlighted**, because neither has a bar item. Both draw the `Screen` back chevron at the top left. |
| S-4 Today hierarchy | The first screenful is `TodayHero` (readiness 75 · Good, sessions 2/4, volume 43.4k kg ↑81%, "Lower — Hinge · 5 lifts · ~39m") immediately followed by the session card with the only filled button. No section rule between them. |
| S-7 Exercises | Search, `MUSCLE / KIT / A–Z` segmented control, both chip rows, "43 exercises", `FAVOURITES 4` and `CHEST 6` section headers with counts, rows with cue chevron and violet star. |
| S-11 Insights | `7 DAYS / 4 WEEKS / 12 WEEKS` with 4 weeks selected; the period restated in prose as "LAST 4 WEEKS" on the card, the section eyebrow, and the highlight sentence ("Volume up 6% on the 4 weeks before"). |
| S-13 Social | Notice, three intent rows, and the record card — `ESTIMATED 1RM`, `NOT POSTED` chip, `101 kg`, `Barbell Row`, `9 reps · Yesterday`. No placeholder feed, confirming `f31f56f`. |
| S-19 44pt target | **Measured**, not eyeballed. In the 3× framebuffer the selected segment spans rows 481–612 = 132px = **exactly 44.0pt**; the track spans 474–619 = 146px = 48.67pt (48pt plus two hairline borders), with the 2pt padding measuring exactly 6px per side. Commit `9b4a767` is confirmed in the rendered build. |
| `FadeIn` reduce-motion | With `com.apple.Accessibility ReduceMotionEnabled` set true and the app relaunched, the welcome screen renders fully — content at full opacity, no stuck-invisible state, which is the failure mode the `progress.setValue(1)` branch could have introduced. The app process independently confirmed it read the setting, via a Reanimated reduced-motion notice in the JS log that appears only when it is on. |

**Two defects found and fixed** (`d59f8f1`) — both invisible to typecheck and to `expo export`:

- **Exercises:** the two filter chip rows were vertically clipped. A horizontal `ScrollView` in a
  column flex parent competes with the list below it for vertical space and loses.
- **`StatBlock`:** a long value wrapped — "143.7k" broke after "143.7" in the Insights three-column
  summary. The value now scales rather than wraps, and the unit holds its width. The same change
  fixes a **pre-existing** clip on Progress, where "35.9k kg/wk" rendered as "35.9k kg/w"; fixed in
  the shared primitive with `progress.tsx` untouched.

Both were re-rendered after the fix and confirmed: chip rows fully visible, "143.7k kg" and
"35.9k kg/wk" each complete on one line.

### Tap-driven verification (2026-07-29, same simulator, via idb)

`idb` was installed (`brew install idb-companion` after `brew trust --formula`, plus `pip install
fb-idb`) and every interaction listed as unexercised above was tapped for real. Targets were located
from `idb ui describe-all` by the accessibility labels this sprint wrote, so no coordinate was
guessed. Reaching the tab shell still used an AsyncStorage fixture writing `prism.onboarding.v1` —
exactly what `onboardingStore.persist()` writes — so a returning user's state could be set up without
tapping through onboarding first.

| # | Interaction | Result |
| --- | --- | --- |
| T1–T5 | Tab bar: Today → Exercises → Insights → Social → Plans → Today | **PASS** — each tab's own content rendered; bar items measure 45.7pt |
| T6 | Today "Go deeper" → Progress | **PASS** |
| T7 | Back control on Progress (arrived from Today) | **PASS** — returns to Today |
| T8 | Today "Go deeper" → Body, then its back control | **PASS** |
| T9 | Insights "Go deeper" row → Progress | **PASS** |
| T9b | Back control on Progress (arrived from **Insights**) | **FAIL → fixed** (`d7a9846`) — landed on Today, not Insights. Retested after the fix: **PASS** |
| T10 | Insights period segment, 4 weeks → 7 days | **PASS** — summary, section eyebrow and highlight prose all re-read "last 7 days" |
| T11 | Exercises grouping segment, Muscle → Kit | **PASS** — 16 muscle section headers became 5 equipment headers, FAVOURITES pinned in both |
| T12 | Exercises "Push" filter chip | **PASS** — "43 EXERCISES" → "14 EXERCISES · 1 FILTER" |
| T13 | Exercises row expansion | **PASS** — cue, "Start a session with this", and the row's own label flips to "Collapse for details" |
| T14a | Dev "Reset onboarding" | **PASS** — app returns to the welcome screen |
| T14b | Auth → setup steps without an account | **FAIL → fixed** (`d7a9846`) — no skip control existed at all; see below. Retested: **PASS** |
| T14c | Skip on each of the four setup steps | **PASS** — 1→2→3→4, and no step 5 |
| T14d | Completion summary after skipping everything | **PASS** — all four rows read "Not set"; no default was written (S-15, S-16) |
| T14e | "Start training" hand-off | **PASS** — lands in the tab shell |
| — | Segmented-control group label | **FAIL → fixed** (`d7a9846`) — never reached the accessibility tree |
| — | Auth credential validation | **PASS**, incidentally — submitting a partly-filled field showed "That does not look like an email address." |

Two of those failures matter beyond their fix. **T9b falsified the assumption this record flagged in
"Information architecture change"**: `router.back()` does *not* return to the previous tab, it pops to
the tab navigator's initial route. And **T14b found the auth screen had no exit** — `AUTH.skipLabel`
had existed unrendered since the predecessor sprint, so the screen that says accounts do not work yet
was the only one a user without an account could not leave. It was also what blocked this
verification, which is why it is fixed here rather than logged.

Also confirmed independently of the pixel measurement: the accessibility tree reports each
segmented-control option as **44.0pt** tall.

**Still not verified, and not claimed:**

- **Typing was never verified.** `idb ui text` does not reach text fields on this iOS 26 simulator
  (the companion build is from 2022), so the auth fields, the exercise search box, and the check-in
  note were only ever tapped, never filled. The search *filter* logic is therefore unexercised, as is
  any keyboard-avoidance behaviour.
- **"Log this lift" was not followed into the logger.** The expanded row's action button renders and
  is labelled; tapping it through to `workout/active` was not done, so the claim in S-8 that it
  reuses the existing active-workout path rests on reading the code, not on running it.
- **One device, one size, default text size.** iPhone 17 Pro at 402×874pt only. The narrow-device
  case (iPhone SE) and large accessibility text sizes remain unchecked, and the tab bar's five 9.5pt
  labels are exactly what that check was for.
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
5. ~~Render the restructured screens on a device.~~ **Done, partially** — see "Rendered verification".
   What remains of it: the five-item bar on the narrowest supported device, the Exercises section list
   at large accessibility text sizes, and a real device rather than a simulator.
6. ~~Decide whether the Social placeholder feed earns its place.~~ **Resolved** — cut in `f31f56f`.
7. ~~Install a UI-driving tool and re-verify with taps.~~ **Done** — `idb` installed, fourteen
   interaction groups tapped, three defects found and fixed (`d7a9846`). What remains of it: text
   entry, which `idb ui text` cannot deliver to this iOS 26 simulator, and following "log this lift"
   through into the logger.
8. ~~Decide on the sprint-document naming collision.~~ **Resolved** (owner decision, 2026-07-29). This
   record was originally `2026-07-29-ui-ux-expansion.md`, naming a sprint whose branch has never
   existed — the work runs on `ui-ux-foundation`. It is now
   `2026-07-29-ui-ux-foundation-expansion.md`, and the sprint is `ui-ux-foundation-expansion`, so the
   name carries the branch it continues. The rule that was missing is now written down in
   `Docs/agents.md` ("Sprint record naming"). Commit messages made before the rename still cite the
   old path; Git history is not rewritten for a documentation rename.
