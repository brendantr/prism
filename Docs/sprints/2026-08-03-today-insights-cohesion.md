# Sprint: today-insights-cohesion

## 1. Status and intent

- **Status:** Implemented and validated — typecheck clean, 163/163 tests passing (+10), manual
  verification on iPhone 16e and iPhone SE including large accessibility text. Three defects were
  found on device and fixed, one of them a flaw in this sprint's own test. Two verification
  artifacts were investigated and disproved rather than reported. See §6.
- **Date:** 2026-08-03
- **Branch:** `feature/today-insights-cohesion`, branched from `feature/workout-history-v1` at
  `9716da5` — **not** from `main`. Workout History v1 is shipped but its PR (#27) is not merged, so
  `main` does not yet contain the History screens this sprint's cohesion work is about. Same
  precedent as `workout-session-continuity-v1`, which branched from the unmerged
  `planning/workout-logging-v1` for the same reason. **This branch must merge after #27.**
- **Mission:** Make Today and Insights read as one hub around the surfaces now built (onboarding,
  template selection, active-workout recovery, post-finish summary, History) rather than two
  separate slices — navigation clarity, information hierarchy, copy consistency, card/CTA cohesion.
- **This sprint is for local/demo evaluation.** Demo mode only, single user.

### Explicitly out of scope, and untouched

- **Auth. Out of scope.** No file in the auth or session path was opened.
- **Multi-user / cloud-scale.** Out of scope. No data-layer change of any kind.
- **Workout History edit/delete.** Still not built. History remains read-only, as shipped.
- **Broad redesign.** No screen was restructured; no new visual language, no new primitive.
- **New dependencies.** None added.
- **Backend / schema.** Untouched. `src/data/` and `supabase/` have zero changes.
- **`Docs/invariants.md` I-2 (non-atomic `saveWorkout`).** Not touched and not affected: this
  sprint changes presentation only and adds no write path. Restated per I-2's own exception process.

---

## 2. The audit

Three read-only subagents inventoried the two screens (every user-visible string with line numbers;
every card, gutter, stat row and navigation affordance; the test surface). Findings, in the order
they matter:

**A. The same "Go deeper" row existed twice, and disagreed with itself.** Today and Insights both
offer the same three destinations — Progress, Body, History — and did it with different components,
a different order, different captions, and a different section eyebrow over the same title:

| | Today (before) | Insights (before) |
|---|---|---|
| Heading | `More detail` / Go deeper | `Detail screens` / Go deeper |
| Order | Progress, Body, History | History, Progress, Body |
| History caption | "Sessions you finished" | "Every session you have finished, newest first" |

A lifter moving between the two screens met the same three surfaces described as if they were
different things. This is the sprint's root finding; most of the rest follows from it.

**B. Today's hero named no period for numbers that cover different ones.** Its three stats span
three different windows — readiness is *now*, sessions are the *calendar week*, volume is a
*rolling seven days* — and only sessions said so. Insights' own header comment states the rule this
breaks: *"Every number states the span it covers, in words, next to the number itself."* Both
Insights' summary card and History's totals card carry a prose line under the stats doing exactly
that. Today's hero was the only one of the three raised/spectral stat cards without one.

**C. History described itself with a word the app does not mean.** Its eyebrow read "Every session
you have **logged**", but the list is completed sessions only — a draft that was logged and then
discarded never appears. The app's own word for what qualifies is *finished* (`finish()`, "Session
complete"). Three surfaces used three different phrasings for one concept.

**D. Insights' empty state was a dead end.** `EmptyState`'s own contract says an empty state
"always names the reason and offers the way out, because 'no results' with no next step reads as a
broken screen". Insights passed no action. History's equivalent already offered one.

**E. Observed and deliberately left alone.** Insights spaces stacked cards at `space.md` where
Today and History use `space.base`. Real, but 4pt on a screen that stacks three or more cards in a
run is a defensible local choice, and changing it is churn without a product argument. Recorded
rather than silently unified.

---

## 3. What changed

**New files**
- `src/content/deeperSurfaces.ts` — one list, one order, one voice for Progress/Body/History,
  consumed by both screens. Each surface carries a **short tile caption and a long row subtitle**,
  because a ~75pt tile and a full-width row cannot honestly share one string (writing one for both
  is what produced "Every finished s…" on an iPhone SE last sprint). Order is narrative: what you
  did, how it is trending, how recovered you are. Lives in `src/content/` alongside the existing
  `onboarding.ts` / `social.ts` copy modules.
- `src/content/__tests__/deeperSurfaces.test.ts` — 10 content-invariant tests pinning the property
  the module exists for: the two screens cannot drift apart again.

**Modified**
- `app/(tabs)/index.tsx` — Today's `QuickAccess` row is now built from `DEEPER_SURFACES`; heading
  from `DEEPER_SECTION`. Passes the hero's new span note.
- `app/(tabs)/insights.tsx` — "Go deeper" card built from the same list; heading unified to
  `More detail`; empty state now offers "Choose a workout" and says *finished* rather than *logged*.
- `src/components/today/TodayHero.tsx` — new **required** `spanNote` prop, rendered as a prose line
  under the stats, matching Insights' and History's stat cards. Required rather than optional
  because the whole point is that the card cannot show these three numbers without saying what
  periods they cover. Also **dropped the `unit` from the Sessions stat** (see §6.1.1 defect 3).
- `src/components/today/SessionCard.tsx` — the lifts/sets/time meta line now shrinks and truncates
  inside the card instead of overflowing it (§6.1.1 defect 1).
- `app/history/index.tsx` — eyebrow and empty-state copy moved to *finished*.

**Net effect on the two screens:** identical heading, identical order, identical vocabulary for the
same three destinations; every number on Today's hero now names its period; and one shared module
that a future edit cannot desynchronise without failing a test.

---

## 4. Validation performed

| Check | Result |
|---|---|
| `npm run typecheck` | **Pass, zero output** |
| `npx jest src/content` (targeted, run first) | **Pass — 22/22** |
| `npm test -- --ci` (full) | **Pass — 163/163, 13 suites** (+10 over the 153 this branch started from) |
| `git diff --check` | **Clean** |
| Manual, iPhone 16e / iOS 26.0 | §5 |
| Manual, iPhone SE (375pt) / iOS 17.4, default and `accessibility-extra-large` | §5 |

Targeted tests were run before the full suite, per the sprint's cost discipline. The screens
themselves have no automated coverage — the repository has no component-test tooling, so
`npm test` cannot catch a layout or copy regression on Today or Insights. That is precisely why the
new invariants live in a content module a test *can* reach.

## 5. Manual verification

Driven with `idb`, captured with `xcrun simctl io screenshot` (device framebuffer only).

**iPhone 16e, iOS 26.0, default text**

| Step | Result |
|---|---|
| Today hero | **Pass.** Span note renders on one line: "Sessions this week · volume, last 7 days". |
| Today "Go deeper" | **Pass.** `More detail` / Go deeper; tiles read History, Progress, Body in that order. |
| Insights "Go deeper" | **Pass.** Same heading, same order, long-form subtitles, chevrons, dividers between rows only. |
| Insights → History | **Pass.** Opens the list; its eyebrow now reads "EVERY SESSION YOU HAVE FINISHED". |
| Insights roadmap panel | **Pass.** "Roadmap / Coming next" `PhasePanel` still present below the card — confirmed not displaced by the rewrite. |

**iPhone SE, 375pt, default text**

| Step | Result |
|---|---|
| Today hero | **Pass.** Span note fits one line at 375pt; SessionCard meta truncates inside the card. |
| Today tiles | **Pass** after a caption fix — all three captions render in full ("Finished / sessions", "Key lifts / over time", "Recovery / by muscle"), visually parallel. |

**iPhone SE, `accessibility-extra-large`** *(all claims below from a cold-started app — see §6.2)*

| Step | Result |
|---|---|
| Today hero | **Pass.** Span note wraps to two lines, fully legible. "0/4" now renders at full size — previously the "this week" unit squeezed it to near-invisibility (§6.1.1 defect 3). |
| `StatBlock` labels | Wrap ("READIN/ESS", "SESSIO/NS"). **Pre-existing shared-component behaviour**, identical on Insights and History, not introduced here and not fixed here. |
| Today tiles | **Truncate** ("Finishe/d ses…", "Progr…"). Pre-existing `QuickAccess` behaviour at 1.6× on a 375pt device; it affected Progress and Body identically before this sprint. Left alone deliberately — see §7. |

### 6.1.1 Defects found on device, and fixed

1. **Today's primary card clipped its own stat line.** "6 LIFTS · 20 SETS · ~49M" overflowed the
   `SessionCard` header and was cut mid-word at the card edge on a 390pt screen. Fixed with
   `flexShrink` + `numberOfLines`, so it truncates inside the card; the same figure is stated in
   full in the hero's "up next" line directly above, so nothing is lost.
2. **A tile caption still clipped — and this sprint's own test had passed it.** The first version of
   `deeperSurfaces.test.ts` asserted a 22-character budget. "Sessions you finished" is 21
   characters, passed, and clipped to "Sessions / you finis…" on the SE anyway, because the real
   constraint is not total length but how words pack into ~10 characters a line across two lines.
   Fixed the caption ("Finished sessions") **and the test**, which now models greedy word wrap and
   carries a case asserting the old caption would have failed it.
3. **"0/4" was almost invisible at accessibility text sizes.** `StatBlock` deliberately lets the
   unit hold its width and shrinks the value into what is left — right for "kg", wrong for a phrase,
   and Today was passing "this week" / "on target" into that slot. Since the new span note now says
   "Sessions this week" once for the whole card, the unit was redundant; removing it fixed the
   layout and the duplication together. Being on target is carried by the cyan tone, as before.

### 6.2 Two artifacts investigated and disproved

Recorded because both would have been wrong to report as findings:

- **A "Open debugger to view warnings" banner** appeared on the SE. It was absent from the previous
  sprint's SE screenshots, so it could not be assumed pre-existing. A cold restart cleared it, and
  it never appeared on the 16e running the same bundle — a stale hot-reloaded instance, not this
  patch.
- **Whole-screen glyph clipping on the SE at large text** — every line cut mid-glyph, stat values
  missing entirely. Reproduced across two captures a minute apart, which is what made it look real.
  A cold restart at the same text size rendered everything correctly. Same cause: an instance that
  had absorbed many Fast Refreshes. **Every large-text claim in §5 comes from a cold-started run.**

### 6.3 What was NOT verified

- **Insights' empty state was not verified on device.** Same limitation as History's: `DemoRepository`
  always regenerates the 8-week seed, so neither screen can reach its empty state in demo mode. The
  copy and the new action are covered by typecheck only.
- **Insights at large accessibility text was not re-verified** this sprint. Its "Go deeper" rows use
  `ListRow`, which was verified at that size during Workout History v1 and is unchanged here.
- **Android was not run.** No platform-specific code is involved.
- **No component-render tests exist**, so no automated check covers either screen's layout.

---

## 7. Unresolved risks / carried-forward gaps

- **`QuickAccess` tiles truncate at accessibility text sizes.** Pre-existing and unfixed. Three
  fixed-width flex tiles cannot hold two lines of 1.6×-scaled text at 375pt. Not fixed here because
  the remedy is a layout change to a shared component (stacking at large sizes), which is a
  different sprint. Mitigations that already exist: each tile's accessibility label carries the full
  "History. Finished sessions" string, and Insights' rows state all three surfaces in full and do
  scale correctly — so a legible path to every destination survives at any text size.
- **Today's mid-screen cards were not audited at large text.** `ReadinessCard`, `CheckInPrompt` and
  `WeekCard` are untouched by this sprint; the one capture suggesting problems there was from the
  corrupted instance (§6.2) and is therefore not evidence either way. Genuinely unknown, not clean.
- **`Docs/invariants.md` I-2** remains open, untouched, and unaffected.
- **`Docs/architecture.md` G-1 (no auth path)** remains open and out of scope.
- **Progress and Body still return to Insights** via `router.replace('/(tabs)/insights')` with the
  label "Back to Insights", even when reached from Today's tiles. This is a deliberate, documented
  choice (a tab navigator pops to its initial route, verified on device 2026-07-29), and the label
  is honest about where it goes. Now that Today links to the same screens it is worth revisiting,
  but changing it is riskier than the value and was left alone.
- **This branch must merge after PR #27** (§1).

## The exact next decision needed

**Should `QuickAccess` reflow at accessibility text sizes, or should Today's tile row be replaced by
the same `ListRow` card Insights uses?** The two screens now agree on the words and the order, but
not yet on the container — and the container is the part that fails at large text. Replacing the
tiles with rows would make the two screens identical and fix the truncation in one move, at the cost
of Today's compact end-of-scroll treatment and roughly 120pt of extra height. Reflowing the tiles
keeps the compact look but adds a size-dependent layout branch to a shared component. This is a
product-appearance call, not an engineering one, and it is the last real inconsistency left between
the two screens.
