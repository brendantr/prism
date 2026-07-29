# R-001: Information architecture of a mature strength-training logger

- **Reference ID:** R-001
- **Date:** 2026-07-29
- **Author:** Engineer/owner + AI agent
- **Protocol:** [`Docs/research/README.md`](README.md), policy [ADR-0003](../decisions/ADR-0003-reference-research-policy.md)
- **Status:** Hypothesis. Accepted as an input to sprint
  [`2026-07-29-ui-ux-foundation-expansion`](../sprints/2026-07-29-ui-ux-foundation-expansion.md); acceptance covers the
  PRism decisions recorded below and nothing further.

## Scope of this note

A private functional review of established strength-training apps (Liftly among them) looking at
one question only: **which top-level destinations a mature lifting logger commits to, and how each
one orders its content vertically.** Nothing about visual design, wording, or layout was recorded,
and no third-party file, screenshot, measurement, or string entered this repository — see
"Explicitly excluded" below.

## Observations

Each observation is written in PRism's own words as a general pattern, not a description of any one
product's screen.

### O-1. The home surface is summary-first, detail-second

- **User job:** "I have thirty seconds before I leave for the gym. Tell me where I stand and what
  I'm doing, and let me start."
- **General pattern:** Mature loggers open on a screen whose top region answers *state* and *next
  action* together in a compact block, and push explanatory or historical content below the fold.
  Depth is reached by scrolling, not by navigating.
- **Confidence:** High. This ordering is close to universal across the category, and it follows
  directly from the user job rather than from any one product's taste.
- **PRism decision:** Restructure Today as summary → single dominant action → progressive detail.
  PRism's own summary is composed of *its own* metrics (its readiness estimate, its session target,
  its volume figure) and keeps its existing rule that an estimate is labelled as one.

### O-2. The exercise catalogue is a first-class destination, not only a mid-session modal

- **User job:** "I want to look up how a movement is meant to be run, or find something that hits a
  muscle I'm neglecting, when I am *not* in the middle of a set."
- **General pattern:** Browsing the movement library is reachable without starting a workout, and
  the browse surface leans on grouping plus a small number of composable filters rather than one
  long flat list.
- **Confidence:** High.
- **PRism decision:** Promote exercise browsing to a top-level destination, grouped by axes PRism
  already models (`MUSCLE_META.region`, `Equipment`) and reusing PRism's own catalogue and coaching
  cues. The existing mid-session picker keeps its separate, add-to-session job.

### O-3. Statistics surfaces are layered, motivating first and analytic second

- **User job:** "Tell me whether the work is adding up before you show me the breakdown."
- **General pattern:** Analytics destinations open with a small, legible, encouraging summary and
  place per-metric or per-muscle detail further down or one level deeper, rather than opening on a
  dense grid of charts.
- **Confidence:** Medium. Widely observed, but the specific split between "summary" and "detail"
  varies enough that it is a shape rather than a rule.
- **PRism decision:** Make Insights the analytics hub: headline summary, then PRism's existing
  derived highlights, then a per-muscle volume-versus-target breakdown, then explicit links into
  the deeper Progress and Body surfaces. PRism's existing honesty constraints stay in force — a
  metric with insufficient input says so instead of publishing a confident number
  (`Docs/invariants.md` I-18).

### O-4. Community is a committed top-level destination even when thin

- **User job:** "Is anyone else doing this with me?" — motivation and accountability rather than
  data.
- **General pattern:** Social/community occupies its own top-level slot from early on, because
  retrofitting it later forces a rearrangement of the whole navigation bar.
- **Confidence:** Medium-low as a *requirement*; high as an *observation*. Whether social is a real
  differentiator for PRism is an open product question (see below), separate from whether the
  navigation slot should be reserved now.
- **PRism decision:** Ship the tab as a shell with an explicit, on-screen statement that nothing in
  it is live. No account, no network, and — as finally shipped — no depiction of activity that did
  not happen at all. The first draft included a labelled placeholder feed; it was cut (owner
  decision, 2026-07-29), because needing three layers of disclaimer to make invented rows honest was
  the argument that the rows were the problem. What holds the slot is the notice, three statements of
  intent, and a card layout built from a record the lifter actually set. This keeps PRism's existing
  anti-fake-skeleton posture (`src/components/ui/PhasePanel.tsx`) intact while reserving the slot.

### O-5. First-run is a guided sequence with a short path to something worth looking at

- **User job:** "Don't hand me an empty app."
- **General pattern:** First-run collects the minimum needed to personalise, offers escape hatches
  at every step, and ends by dropping the user somewhere that already has content.
- **Confidence:** High.
- **PRism decision:** Keep the flow built in the `ui-ux-foundation` sprint and make its escape
  hatches complete (every setup question skippable, choices echoed back before the hand-off).
  Persistence stays local, and the app still opens on PRism's own sample training data.

## Explicitly excluded

Deliberately **not** carried over, recorded, or referenced anywhere in this repository:

- Any third-party product's brand, name-as-a-label, icon set, illustration, or asset.
- Screen layouts, component arrangements, spacing or sizing values, type scales, colour systems,
  animation behaviour, and visual hierarchy.
- Microcopy, section titles, empty-state wording, metric names, exercise descriptions, coaching
  cues, and paywall copy.
- Screen sequences and navigation transitions, including tab order and tab labels.
- Any source code.

Everything PRism ships against these observations uses PRism's existing token system
(`src/theme/`), its existing primitives (`src/components/ui/`), its own catalogue and calculations,
and copy written for this note's purpose.

## Open questions

1. Is a social surface a real part of PRism's v1 differentiator, or a slot held open for later? The
   product position ([ADR-0001](../decisions/ADR-0001-product-position.md)) names readiness-aware
   progression, not community — so the tab is currently justified by navigation stability, not by
   product strategy. Needs an owner decision before any social feature is built.
2. Should the deeper analytics surfaces (Progress, Body) remain separate destinations reached from
   Insights, or eventually merge into it as sections? Deferred; the sprint keeps them separate and
   reachable.
3. Does exercise browsing want a per-exercise detail screen (full history, best sets) or is the
   inline expansion shipped in this sprint sufficient? Depends on whether Progress grows its own
   per-exercise view first.
