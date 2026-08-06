# Sprint: accessibility-hardening-batch (PRs #33–#36)

## 1. Status and intent

- **Status:** Implemented and merged. All four PRs are on `main`; this record is a **retrospective
  consolidation written 2026-08-05**, after the fact.
- **Date of the work:** 2026-08-04. **Date of this record:** 2026-08-05.
- **Branches:** `feature/exercises-filter-row-accessibility` (#33),
  `feature/social-plans-accessibility-audit` (#34), `feature/ui-hardening-round2` (#35),
  `feature/today-sessioncard-truncation` (#36). All four merged; all four safe to delete once this
  record is on `main`.
- **Mission:** Sweep every tab screen at `accessibility-extra-large` text and on a compact device,
  find where real content was being hidden, and fix it — without expanding into redesign.

### Why this record exists, and why it did not before

**Fact.** Each of the four PRs deliberately shipped **without** a sprint record. PR #33 states the
reasoning in its own description: *"sprint docs are point-in-time evidence, not a place to restate a
one-line CSS property change; the commit message and this description carry the full record."* That was
a defensible call per PR, and it is not being reversed retroactively as wrong.

**Decision.** It is nonetheless insufficient under the completion rule this repository now works to — a
sprint is complete when its PR is merged **and** the decisions it introduces are reflected in `Docs/`.
Four PRs that together changed a **shared primitive used by five screens** amount to more than four
independent CSS tweaks: they established a repeatable pattern. This document records that pattern once,
so it survives the deletion of the four branches.

**Assumption, stated plainly.** Every on-device result in §4 is transcribed from the four PR
descriptions and their commit messages. **No verification was re-run while writing this record**, and
none is claimed. What *was* independently re-checked on 2026-08-05 is that the code changes are present
in `main` as described (§3, "Landed state verified").

---

## 2. Scope

**In scope, and done:**
- Audit of all five tab screens (Today, Exercises, Insights, Social, Plans) plus Progress and Body at
  `accessibility-extra-large` text, on both a standard-width and a compact (375pt) device.
- Fixes for every case where a `numberOfLines` cap or a fixed `height` hid content that had no other
  route to being read.

**Explicitly not in scope, and untouched** — each named because silence reads as an oversight:
- **Backend, Supabase, schema, migrations, RLS, repository.** Zero changes under `src/data/` or
  `supabase/` across all four PRs `[fact, stated in every PR's "Scope" section]`.
- **Redesign.** No screen restructured, no new primitive, no new token, no new dependency.
- **`Docs/invariants.md` I-2** (non-atomic `saveWorkout`). Untouched and unaffected — these are
  presentation-only changes adding no write path. Restated per I-2's own exception process.
- **`Docs/architecture.md` G-1** (no auth path). Unchanged and out of scope.

---

## 3. What changed

| PR | Branch | Files | Change |
|---|---|---|---|
| #33 | `feature/exercises-filter-row-accessibility` | `app/(tabs)/exercises.tsx` (+12/−3) | Filter-chip rows: `height: 26 + space.md` → `minHeight`. `flexShrink: 0` was already what prevented the squeeze the fixed height was written for; the fixed value was only ever the 1× floor. |
| #34 | `feature/social-plans-accessibility-audit` | `src/components/ui/ListRow.tsx`, `app/(tabs)/plans.tsx` (+31/−3) | `ListRow` **title** cap `1` → `2` (shared by five consumers). Plans: exercise-list cap **removed entirely**; day-name cap `1` → `2`. |
| #35 | `feature/ui-hardening-round2` | `src/components/ui/ListRow.tsx`, `app/(tabs)/progress.tsx` (+18/−2) | `ListRow` **subtitle** cap **removed entirely** (deferred boundary from #34, re-checked and still clipping). Progress key-lifts: lift-name cap `1` → `2`. |
| #36 | `feature/today-sessioncard-truncation` | `src/components/today/SessionCard.tsx` (+11/−1) | Exercise-preview name cap `1` → `2`. The row already used `minHeight`, so it grows without further change. |

**Landed state verified 2026-08-05** `[fact]` — read directly from `main` at `8caedc0`:
`src/components/ui/ListRow.tsx:78` carries `numberOfLines={2}` on the title and **no** cap on the
subtitle; `app/(tabs)/exercises.tsx:434` reads `minHeight: 26 + space.md`;
`src/components/today/SessionCard.tsx:89` caps `rowName` at `2`.

---

## 4. On-device evidence

`[assumption — transcribed from the PR descriptions, not re-run for this record]`

All four PRs were verified **cold-started**, per the standing rule in `Docs/agents.md`. Each fix was
confirmed **broken before** and **fixed after**, and each was regression-checked at default text size.

| Fix | Screen(s) | Before | After |
|---|---|---|---|
| Filter-chip row height (#33) | Exercises | "FAVOURITES", "PUSH", "PULL", "BARBELL", "DUMBBELL", "MACHINE" cut off mid-letter | All render in full; row grows to fit |
| `ListRow` title (#34) | Social | "A short list, not a follo…" — loses the sentence's point | "A short list, not a / following count" |
| `ListRow` title (#34) | Exercises | "Single-Arm Dumbbell R…" — loses which exercise | "Single-Arm Dumbbell / Row" |
| Plans exercise list (#34) | Plans | "…Seated Leg Curl · St…" on **every day of every routine** | Full list, all four days |
| Plans day name (#34) | Plans | "Lower — Hin…" — **compact device only** (fine at 430pt) | Full name |
| `ListRow` subtitle (#35) | Social | "…whose consistency you actually se…" | Complete sentence |
| Progress lift name (#35) | Progress | "Barbell Bench Pre…" | "Barbell Bench / Press" |
| `SessionCard` name (#36) | Today | "Dumbbell Should…" | "Dumbbell / Shoulder Press" |

**Devices:** iPhone 17 Pro and iPhone SE (375pt) for #33–#35; iPhone 16e and a freshly-rebooted iPhone
SE for #36 — the simulator's CoreSimulator service restarted mid-session and dropped the earlier two
devices. PR #36 records this substitution explicitly rather than silently `[fact]`.

**Genuine negative result, recorded rather than omitted** `[fact, PR #35]`: Body's full muscle-recovery
list was swept at `accessibility-extra-large` — "Front Delts", "Side Delts", "Rear Delts", "Upper Back"
all render in full. **No change was made.** This is a checked-and-clean result, not an unchecked screen.

**Automated validation, identical across all four PRs** `[fact]`: `npm run typecheck` clean;
`npm test -- --ci` 177/177 across 14 suites (unchanged — these are presentation-only diffs, so the suite
is a sanity check, not coverage of the fixes); `git diff --check` clean.

**Not covered by any automated check** `[fact]`: this repository has no component-render test framework,
a standing decision reconfirmed by every UI sprint. Nothing in `npm test` could have caught any of these
eight defects, and nothing in it would catch a regression of them. On-device verification is the only
instrument that exists here.

---

## 5. Decisions established

Recorded as decisions because they are reusable rules, not one-off edits.

1. **A `numberOfLines` cap is a content-loss risk, not a layout preference** `[decision]`. Cap a title or
   label only where the clipped text is recoverable elsewhere on screen. Where there is no drill-down —
   Plans' cards have none — the cap is removed outright, not raised.
2. **`minHeight`, never `height`, on any row containing scalable text** `[decision]`. A fixed height has
   no room to grow; the accompanying `flexShrink: 0` is what actually resists being squeezed. This same
   reasoning was applied independently to `Button` in the release-and-summary-hardening lane, which is
   evidence the rule generalises.
3. **Fix at the shared primitive when the pattern is shared** `[decision]`. `ListRow`'s two caps were
   fixed once each in `src/components/ui/`, not per consumer — five screens inherited both fixes. The
   cost is that a change there is invisible in any single screen's diff, which is why it is written down
   here.
4. **A raised cap needs a regression check, not just a fix check** `[decision]`. #34 re-checked Insights'
   "Go deeper" card and #35 re-checked History's dense joined subtitle, both at default text, to confirm
   raising a cap changes nothing for strings that never needed the extra line.
5. **Out-of-scope findings are reported, not fixed mid-round** `[decision, demonstrated twice]`. #35 found
   `SessionCard` clipping while navigating Today to reach Insights, and reported it instead of widening
   its own scope; #36 then fixed it as its own narrow change. #34 likewise left Exercises' filter rows to
   the already-open #33 because the root cause differed (fixed `height` vs. `numberOfLines`).

---

## 6. Relationship to `Docs/ui-ux-foundation-v1.md`

This batch is the empirical basis for two sections of the v1 baseline; that document states the rules,
this one records the evidence they came from.

**§5 — Interaction and copy rules**
- **Rule 11** ("a number in a narrow column shrinks; prose wraps") is the direct generalisation of
  decisions 1 and 2 above. The eight defects here are all the *prose* half — a name sharing a row with a
  trailing value. The *number* half was established separately in the summary-screen hardening lane.
- **Rule 5** (one vocabulary, one home) is reinforced by decision 3: `ListRow` is the shared container,
  and `src/content/deeperSurfaces.ts` supplies its strings — fixing the container once is what keeps
  Today and Insights from diverging again.

**§6 — Accessibility baseline**
- The **required verification matrix** (default · compact 375pt · compact at `accessibility-extra-large`)
  is exactly the axis set these four PRs ran. #34's Plans day-name defect — visible at 375pt, invisible
  at 430pt — is the concrete reason compact width is a separate required axis rather than an optional one.
- The **standing cold-start method** (`Docs/agents.md`) was applied throughout, and #36's device
  substitution is the kind of deviation §6 expects to be recorded rather than smoothed over.
- **D10** ("the accessibility floor is a shipping gate, not a polish pass") cites three sprints for
  device-only defects. This batch adds eight more, all invisible to typecheck and Jest — the strongest
  available argument that the gate is doing real work.

**No decision in `ui-ux-foundation-v1.md` is changed, reopened, or contradicted by this record**
`[fact]`.

---

## 7. Unresolved risks / carried-forward gaps

- **No component-render tests.** All eight fixes are protected by nothing but manual re-verification.
  Unchanged standing gap.
- **Android was not run** for any of the four PRs. No platform-specific code is involved, which is a
  reason to expect parity, not evidence of it.
- **Today's mid-screen cards** (`ReadinessCard`, `CheckInPrompt`, `WeekCard`) remain un-audited at large
  text — carried forward from `today-insights-cohesion` §7 and **not** closed by this batch. #36 touched
  `SessionCard` only.
- **`QuickAccess` tiles still truncate** at 1.6× on a 375pt device. Not fixed here; addressed by
  **D9** in `ui-ux-foundation-v1.md`, which is a decision awaiting its own implementation sprint.
- **`Docs/invariants.md` I-2** and **`Docs/architecture.md` G-1** remain open, untouched, unaffected.

## The exact next decision needed

**None blocking.** With this record on `main`, all four branches satisfy the completion rule and can be
deleted. The nearest live accessibility question is D9's implementation sprint (Today's tiles →
`ListRow`), which would retire the last known truncation on Today and is already decided in principle.
