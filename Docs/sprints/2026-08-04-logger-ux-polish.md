# Sprint: logger-ux-polish

## 1. Status and intent

- **Status:** Implemented and validated — typecheck clean, 177/177 tests passing (+14), manual
  verification on iPhone 16e (default and `accessibility-extra-large`) and iPhone SE (375pt). One
  defect was found on device and fixed; one of this sprint's own tests asserted the wrong thing and
  was corrected against the store's real behaviour. See §5 and §6.
- **Date:** 2026-08-04
- **Branch:** `feature/logger-ux-polish`, branched from `feature/today-insights-cohesion` at
  `1fbdb96`, which is itself stacked on `feature/workout-history-v1`. Neither parent is merged.
  **Merge order: #27 (History) → #28 (cohesion) → this.**
- **Mission:** Make the logger — the highest-frequency screen in the app — feel finished, and make
  the handoff into and out of it intentional. Layout, hierarchy, copy, state handling, controls.
- **This sprint is for local/demo evaluation.** Demo mode, single user.

### Explicitly out of scope, and untouched

- **Auth, multi-user, cloud-scale.** No file in those paths was opened.
- **Backend / schema / repository.** Zero changes under `src/data/` or `supabase/`.
- **History edit/delete.** Still not built; History remains read-only.
- **New dependencies.** None.
- **Broad redesign.** No screen was restructured. The logger's layout, chrome and navigation are
  unchanged; every change below is a control, a label, or a confirmation.
- **`Docs/invariants.md` I-2 (non-atomic `saveWorkout`).** Untouched and unaffected — this sprint
  changes no write path. The existing save-failure banner and retry behaviour are unmodified.
  Restated per I-2's own exception process.

---

## 2. The audit

Three read-only subagents inventoried the logger surface (every string, alert and render branch;
every primitive, touch target and hardcoded value; every store action and its test coverage).

**Structurally the logger is in good shape** — touch targets all meet 44pt or carry `hitSlop`,
theme tokens are respected, and the bespoke chrome (fixed header, docked footer) is justified by
the screen's job. So the real seams were behavioural and lexical, which is where the patch went.

**A. Destructive actions with no confirmation and no undo — the headline finding.**
The session-level Discard has always confirmed. But:
- `ExerciseBlock.tsx:97` removed an exercise **and every set logged under it** on a single tap,
  with no prompt.
- `SetRow.tsx:62` removed a set on long press, instantly — and the gesture was undiscoverable: the
  row's accessibility label said only *"Tap to switch type."*

There is no undo anywhere in the logger, so both were irreversible. One subagent reported that no
unconfirmed destructive actions existed; that was wrong, and checking the call sites directly is
what caught it.

**B. The logger and the summary disagreed about "sets".**
The logger header read `Sets 2/20`, counting every ticked set **including warm-ups**. The summary
and History report `Working sets`, which **excludes** warm-ups, exactly as volume does. The same
session therefore said `2` on one screen and `1` on the next, under labels that look equivalent —
verified concretely during Workout History v1, where a logged warm-up plus one working set showed
`Sets 2/20` in the logger and `Working sets 1` on the summary.

**C. Set types were named in three places and agreed in none.**
`SET_TYPE_LABEL` sat in `activeWorkoutStore` with **zero consumers**; `SetRow` wrote its own
"warm-up"/"working set" strings inline; and the History detail screen carried a third set of labels
(added last sprint — my own duplication). Copy in a store is also the wrong home for it.

**D. Two dialogs asked the same question.** Finishing with nothing logged raised *"Nothing logged
yet"*, whose Discard action called `handleDiscard`, which raised *"Discard this session?"* on top of
it. Nothing was logged, so there was nothing to lose and nothing to confirm.

**E. A blank-screen branch.** `if (!workout || !profile) return null` renders nothing at all — no
header, no control, no way out — and the redirect effect only covered the missing-workout half. The
screen does not branch on `trainingStore.status` (a known consideration carried from the Workout
Logging v1 planning doc, §2.9).

**F. Store capabilities with no UI.** `reorderExercise` and `setExerciseNotes` have zero call sites
anywhere. Recorded, not built — reordering and per-exercise notes are features, not polish.

---

## 3. What changed

**New files**
- `src/content/setTypes.ts` — one vocabulary for the five set types, in three forms: a one-character
  `mark` for the index cell, a short `label`, and a `spoken` phrase for screen readers (announcing
  "W" tells a lifter nothing). Lives in `src/content/` alongside `deeperSurfaces.ts` and
  `onboarding.ts`.
- `src/content/__tests__/setTypes.test.ts` — 6 tests pinning coverage of the domain union, mark
  length, and `setTypeMark`'s position-vs-mark rule.

**Modified**
- `app/workout/active.tsx`
  - `confirmRemoveExercise` / `confirmRemoveSet`: removals now confirm **when logged work would be
    lost, and only then**. An untouched exercise or an unticked set is a plan, not a record, and
    interrupting to ask about one is friction mid-session. Copy matches the existing alerts.
  - The nothing-logged alert discards directly instead of chaining a second confirmation.
  - The header metric is now **"Sets done"**, which stops it colliding with the summary's
    "Working sets" (§2 B).
  - The redirect effect covers a missing profile too, so the blank-screen branch is unreachable.
    Defensive: the profile is only null before the first successful load and the logger is not
    reachable until Today has loaded, so this is not expected to fire.
- `src/components/workout/SetRow.tsx` — set-type wording from `SET_TYPE_COPY`; the accessibility
  label now names the long-press-to-remove gesture.
- `src/components/workout/ExerciseBlock.tsx` — set-table column headings shrink to fit rather than
  wrap (§5.1 defect).
- `app/history/[id].tsx` — drops its own two set-type maps in favour of the shared module.
- `src/store/activeWorkoutStore.ts` — dead `SET_TYPE_LABEL` removed, with a note pointing at its
  replacement.
- `src/store/__tests__/activeWorkoutStore.test.ts` — 8 tests for `addSet`, `removeSet` and
  `removeExercise`, which had **no coverage at all** and are the actions the new confirmations gate.
  They pin re-indexing in particular: the logger displays `setIndex + 1`, so a gap left by a removal
  would misnumber every row beneath it.

---

## 4. Validation performed

| Check | Result |
|---|---|
| `npm run typecheck` | **Pass, zero output** |
| `npx jest src/content` (targeted, first) | **Pass — 28/28** |
| `npx jest src/store` (targeted) | **Pass — 27/27** |
| `npm test -- --ci` (full) | **Pass — 177/177, 14 suites** (+14: 6 content, 8 store) |
| `git diff --check` | **Clean** |
| Manual | §5 |

Targeted suites were run before the full suite, per the sprint's cost discipline. Neither the logger
nor any component under it has render-test coverage — the repository has no component-test tooling —
so `npm test` cannot catch a layout or copy regression on these screens. That is why the new
invariants went into a content module and the store, both of which a test can reach.

## 5. Manual verification

Driven with `idb`, captured with `xcrun simctl io screenshot` (device framebuffer only).

**iPhone 16e, iOS 26.0, default text**

| Step | Result |
|---|---|
| Header metric | **Pass.** Reads "SETS DONE 0/20". |
| Finish with nothing logged | **Pass.** One dialog ("Nothing logged yet"); Discard lands straight on Today with no second prompt. |
| Remove an untouched exercise | **Pass.** Removed immediately, no dialog — Lifts went 6 → 5. |
| Remove an exercise holding a logged set | **Pass.** "Remove Barbell Bench Press?" / "1 logged set goes with it. This cannot be undone." Singular grammar correct. |
| Cancel that removal | **Pass.** Exercise and its logged set both still present (Lifts 5, Sets done 1/16). |
| Long-press a logged set | **Pass.** "Remove this set?" / "You have already logged it. This cannot be undone." Cancel preserved it. |
| Long-press an unlogged set | **Pass.** Removed immediately, no dialog — set rows 16 → 15. |
| History detail after the set-type refactor | **Pass.** Marks and spoken forms unchanged: "Set 1, warm-up set…", "Set 2, working set…"; table layout intact. |

**iPhone 16e, `accessibility-extra-large`** *(cold-started — see §5.2)*

| Step | Result |
|---|---|
| Header metrics | **Pass.** "SETS DONE", "VOLUME", "LIFTS" all render in full. |
| Set-table column headings | **Pass** after the fix in §5.1 — "SET / LAST / KG / REPS / RPE" on one line, aligned with the columns beneath. |

**iPhone SE, 375pt, default text** *(fresh bundle — see §5.3)*

| Step | Result |
|---|---|
| Header metrics | **Pass.** All three fit comfortably at 375pt. |
| Set table | **Pass.** Columns and steppers unaffected by the shrink-to-fit change. |

### 5.1 Defect found on device, and fixed

**The set table's "Set" heading broke across two lines as "SE / T"** at the accessibility text
sizes, while the numbers beneath it stayed on one — the same defect, and the same cause, as the one
fixed in History's detail table during the previous sprint: an eyebrow label over a 26pt fixed-width
column. The fix here had to differ, though: `ExerciseBlock` and `SetRow` draw **one shared grid**, so
widening the column would have meant changing both and squeezing the weight and reps steppers on a
compact device. The headings now shrink to fit instead, using the pattern `StatBlock` already
establishes for a number too wide for its column. The values still scale to the full 1.6×.

### 5.2 A verification artifact, investigated and disproved

A capture of the logger at `accessibility-extra-large` showed catastrophic clipping — every label
cut mid-glyph, stat values reduced to fragments. A cold restart at the same text size rendered
everything correctly. This is the **second** time this session that a long-lived, repeatedly
hot-reloaded simulator instance has produced a convincing phantom defect (the previous sprint
recorded the same thing twice). **Every large-text claim above comes from a cold-started run**, and
that is now the standing method for this repository: do not report a layout defect seen on an
instance that has absorbed hot reloads without reproducing it cold.

### 5.3 A stale-bundle trap worth recording

The first SE capture showed the header reading "SETS", not "SETS DONE" — the device was serving a
cached bundle from a previous session, so the screenshot was evidence about old code. Terminating
and relaunching fetched the current bundle. A simulator that has been idle across sprints should be
restarted before anything is claimed from it.

### 5.4 What was NOT verified

- **The save-failure banner and retry path.** Unchanged by this sprint, and not reachable in demo
  mode without forcing a write to fail. Its behaviour is asserted by the existing `finish()` store
  tests, not by anything observed here.
- **The confirmation dialogs on the SE.** Verified on the 16e only; they are `Alert.alert`, which is
  platform chrome, but that is a reason to expect them to work, not evidence.
- **The logger at large text on the SE** — the narrow and the large-text axes were each covered, but
  not together on this screen.
- **The summary screen was not re-verified.** Its "Working sets" wording is unchanged and was
  observed during Workout History v1; this sprint changed only the logger's side of that pairing.
- **Android.** No platform-specific code involved.

---

## 6. A test of mine that was wrong

The first version of the `addSet` test asserted that a new set inherits the **last completed** set's
load. It failed: the store inherits from the **last set in the list**, completed or not, which is
correct for the case it is built for ("same weight, one more set") and is documented as such in the
store. The test was rewritten to match real behaviour rather than the store being changed to match
the test. Recorded because the failure was a genuine misreading on my part, not a defect.

## 7. Unresolved risks / carried-forward gaps

- **No undo anywhere in the logger.** Confirmations now stand in front of the two destructive
  removals, but a confirmed removal is still final. Undo is a larger design question and was not
  attempted.
- **`reorderExercise` and `setExerciseNotes` remain unreachable** from any UI (§2 F). Unchanged.
- **The logger still does not branch on `trainingStore.status`.** The blank-screen branch is closed,
  but the screen assumes the store has loaded rather than checking. Carried forward from the Workout
  Logging v1 planning doc §2.9.
- **`Docs/invariants.md` I-2** remains open, untouched and unaffected.
- **`Docs/architecture.md` G-1 (no auth path)** remains open and out of scope.
- **Nine store actions still have no test coverage** (`reorderExercise`, `setExerciseNotes`,
  `adjustRest`, `setReflection`, `setRating` and others). This sprint covered the three its own
  changes depend on.
- **Merge order** (§1): this branch is third in a stack of three.

## The exact next decision needed

**Should a confirmed removal be undoable, or is confirmation the whole answer?** The logger now asks
before destroying logged work, which closes the immediate hole, but "Remove" is still permanent the
instant it is tapped. The alternative — an undo affordance on the removal, which would let both
confirmations go away entirely and make the screen quieter rather than chattier — is a different and
larger design, and it interacts with the draft-persistence mechanism added in
`workout-session-continuity-v1`. Worth deciding before any further destructive control is added to
this screen.
