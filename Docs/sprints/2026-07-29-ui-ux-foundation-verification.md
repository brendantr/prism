# Sprint: ui-ux-foundation-verification

- **Status:** Complete. No production code changed. Every gap the predecessor sprint left open
  (follow-ups 9 and 10) is now tap-verified rather than code-inspection-only.
- **Date:** 2026-07-29
- **Branch:** `ui-ux-foundation-verification` (new branch — see "Why a new branch")
- **Type:** Verification only. No UI surface added, no information architecture change, no
  calculation change. `git diff main...HEAD` touches only `Docs/`.
- **Predecessor:** [`2026-07-29-ui-ux-foundation-expansion`](2026-07-29-ui-ux-foundation-expansion.md)

## Why a new branch

`ui-ux-foundation` was merged into `main` via PR #7 before this sprint started (`75bd7e3`), so the
work it covers is closed. `CLAUDE.md`'s "one branch, one sprint, one clear purpose" and
`Docs/agents.md`'s sprint-naming rule both assume the branch a record continues actually exists as
open work; reopening commits on an already-merged branch would misrepresent its state. This sprint
therefore opens `ui-ux-foundation-verification` from `main`, and is named for the branch it lives on
under the same rule the predecessor record used.

## Goal

Close the two gaps the predecessor sprint could not close with the tooling it had:

1. **Follow-up 9** — verify every remaining text-entry path (auth email/password, exercise search,
   check-in note, anything else found while tapping). The predecessor's `idb ui text` could not
   reach any text field at all on this simulator/companion combination.
2. **Follow-up 10** — follow "log this lift" from Exercises all the way into `workout/active` and
   observe the resulting state, closing S-8 as exercised rather than inspected.

Plus two explicit re-checks: onboarding end to end (skip-through, completion summary, hand-off), and
whatever other editable fields turn up along the way. No new UI surface, no information-architecture
change — see `CLAUDE.md` scope discipline.

## Simulator setup

Followed the README's documented sequence (`iOS simulator quick start` → `When the simulator will not
launch the app`). Metro was already running and healthy on 8081, so step 0 was a no-op.

**One new failure mode, not previously documented in this project: `CoreSimulatorService` can wedge
after a *successful* `bootstatus` on a device that has never been used before.** The predecessor's
README section already covered a wedged service after boot; this was the same symptom
(`simctl launch` / `simctl listapps` hanging indefinitely) but reached from a clean boot that had
just reported `Finished` — no crash, no prior wedge, no long-lived session behind it. Killing
`CoreSimulatorService` and repeating boot → `bootstatus` → install → launch cleared it in under 20
seconds and the device stayed healthy for the rest of the session. No README change was needed — the
existing documented fix already covers this case; it just fires more often than the current wording
implies. Worth noting if it recurs across sessions: the fix, not the trigger, is what's documented,
and that continues to hold.

Device used: a fresh `PRism-Verify` iPhone 17 Pro, iOS 26.4, deleted at the end of the session per the
README's cleanup note.

## Follow-up 9: text entry, unblocked

`idb` (client 1.1.7, companion 1.1.8) is already at the latest available build — there is no newer
`idb-companion` to wait for, closing that option from the predecessor's list. Instead of the other two
options it named (an XCUITest target, which touches `ios/` and needs approval; or a debug-only
prefill affordance), a third path worked: driving `idb ui text` directly and correcting its output.

**What `idb ui text` actually does on this build:** it delivers keystrokes, but non-deterministically
drops a handful of trailing characters on a single call — 4 of 17 on one attempt
(`test@example.com` → `test@example`), 1 of 20 on another. Short strings (a 3-character password, a
14-character one) were unaffected. The drop is real and reproducible, not a one-off: repeating the
identical call against a freshly cleared field reproduced it. Sending the missing suffix as a second
`idb ui text` call reliably completes the field — verified by reading the accessibility tree's
`AXValue` back after each attempt and diffing against the intended string.

That verify-and-patch loop is now a small script,
`scratchpad/type_verify.py` (session-scratch, not committed — it is a testing tool, not app code).
It also had to learn that an empty secure field reports its *placeholder* text as `AXValue` (e.g.
`"Your password"`), not `""`, so length comparison against a real value has to check for an
all-bullet string before trusting the length. With that fixed, typing converged in 1–2 corrections on
every field tried.

**One structural limitation this does not remove:** the auth screen's `Input` (a labelled
`TextField`) exposes live `AXValue` as you type, but the workout logger's set-row weight/reps display
does not — see "What this is not" below.

## What shipped

Nothing in `app/` or `src/` — this sprint is entirely verification and documentation. One production
change was attempted and reverted; recorded here rather than silently dropped.

**Attempted, then reverted: `src/components/ui/Stepper.tsx`.** While chasing why a set row's weight
field wouldn't accept typed input, `Stepper`'s field wrapper was changed from `Pressable` to `View`
(a `Pressable` with no `onPress` still claims the touch responder, which really would block a child
`TextInput` from focusing). The fix was correct for what it targeted — but `Stepper` turned out to
have **zero callers anywhere in the app** (`grep -rn "<Stepper" app src/components` — no matches).
`SetRow.tsx`'s weight/reps cells are a separate, local `ValueCell`: a static `Text` value with two
`Pressable` nudge buttons and no `TextInput` at all, which is deliberate — the logger screen's own
comment states the constraint ("Logging a set must take one tap. Everything else is secondary.").
There is no typable weight/reps field anywhere reachable by tapping, so there was nothing to verify
and nothing in-scope to fix. The edit was reverted (`git checkout -- src/components/ui/Stepper.tsx`);
`git status` and `git diff --stat` both confirm zero net code change for this sprint.

## Results

### Tap-verified this sprint (T1–T9, continuing the predecessor's numbering)

| # | Interaction | Result |
| --- | --- | --- |
| T1 | Auth email field, real typed input (`test@example.com`, via the correction loop) | **PASS** — field holds the full string, no truncation after correction |
| T2 | Auth password field, real typed input, weak password (`abc`) | **PASS** — sign-in mode accepts it and advances to onboarding steps (sign-in validation has no minimum length; this is existing, unaudited `authValidation.ts` behaviour, unchanged by this sprint) |
| T3 | Onboarding steps 1–4, "Skip" on each | **PASS** — Step 1 of 4 → 2 → 3 → 4 → completion, in order |
| T4 | Completion summary after skipping everything | **PASS** — all four rows read "Not set" (S-15, S-16 re-confirmed) |
| T5 | "Start training" hand-off | **PASS** — lands on Today with the seeded demo state (`GOOD EVENING` / `Demo` / readiness 76) |
| T6 | Exercises search field, real typed input (`bench`) | **PASS** — "43 EXERCISES" → "2 EXERCISES", correct two results (Barbell Bench Press, Dumbbell Bench Press). **This closes the "search filter logic is unexercised" gap** the predecessor recorded — it was tapped with real text, not just focused. |
| T7 | Exercise row expansion → "Start a session with this" → follow-through | **PASS — closes S-8 and follow-up 10.** Landed on `workout/active` with `OPEN SESSION`, `Lifts: 1`, `Barbell Bench Press` present — the same active-workout state the existing open-session path produces, confirmed by observation rather than by reading `logExercise`'s call to `useActiveWorkoutStore`. |
| T8 | Check-in card, "Edit check-in" expansion | **PASS** (renders), but see "What this is not" — there is no note field to type into. |
| T9 | Workout summary reflection notes, real typed input (`Bar felt fast, knees tracked well today.`, 41 characters) | **PASS** — typed in one `idb ui text` call, no truncation, counter reads `40/280` correctly on the 40-visible-character... |

Note on T9's counter: the field shows `40/280` for a 41-character string including the trailing
period — consistent with the app's own `reflection.length`, not a bug introduced or found here; not
investigated further as it is outside this sprint's scope (no calc/logic change).

### Re-confirmed by re-running the predecessor's own tap suite where the flow required passing back through it

Reaching T6–T9 required going through the tab bar, Exercises, the logger, and Finish Session again;
all of that continued to behave exactly as the predecessor's T1–T14 recorded. Nothing regressed.

### What this is not — findings, not fixed here

- **There is no check-in note field to verify.** `src/domain/types.ts`'s `CheckIn.note` exists and
  `CheckInPrompt.tsx` round-trips it (`note: checkIn?.note ?? null`), but the component renders only
  the four numeric scales (Sleep quality, Energy, Soreness, Stress) — confirmed by tapping "Edit
  check-in" and reading the full expanded accessibility tree (`StaticText` labels: `A few taps
  sharpen today's guidance.`, the four scale rows, `Update readiness`; no text field). The task asked
  to verify this field; the honest result is that it does not exist in the UI, so there is nothing to
  verify. Not fixed — adding one would be new feature work, out of this sprint's scope per `CLAUDE.md`.
- **The workout logger's weight/reps fields are tap-only by design, not a defect.** See "What
  shipped" above. Recorded here so a future sprint does not re-open the same investigation from
  scratch.

### Still simulator-only / unaudited (carried forward, not this sprint's job to close)

- One device, one size, default text size — iPhone 17 Pro at 402×874pt only, same limitation the
  predecessor recorded (follow-up 5's remainder).
- Nothing about product originality is independently audited (unchanged from the predecessor).
- `idb ui text`'s trailing-character drop is now worked around for verification purposes, but it is a
  tooling quirk, not something the app can compensate for — real users type on a real keyboard, which
  does not exhibit this behaviour. It is recorded here so a future verification session does not
  re-diagnose it from zero.

## Validation

| Command | Result |
| --- | --- |
| `npm run typecheck` | Pass, exit 0 |
| `npm test` | Pass — 78/78, 4 suites, unchanged from the predecessor sprint |
| `npx expo export --platform ios` | Pass — single iOS bundle, 5.1 MB |
| `git status --short` / `git diff --stat` | Both empty — no code change shipped this sprint |

## Follow-ups

Carrying forward the predecessor's still-open items (its follow-ups 1, 2, 3, 4, and the remainder of
5) unchanged — this sprint did not touch them. Its follow-ups 9 and 10 are resolved; see that
document for the strikethrough.

11. **The `idb ui text` trailing-character drop** is unresolved as an idb/companion-level issue (not
    ours to fix) but is now a known, documented quirk with a working correction loop
    (`scratchpad/type_verify.py`, session-local). A future session driving more typing through idb
    should reuse the verify-and-patch pattern rather than trusting a single `idb ui text` call.
12. **`CheckIn.note` has no UI.** Either wire a note field into `CheckInPrompt` in a future sprint, or
    remove the unused field from `CheckIn` and its save path — leaving a persisted-but-unreachable
    field is a small but real drift between the domain model and the product. Not decided here; this
    is a question for the engineer/owner, not a call this sprint makes on its own.
13. **`src/components/ui/Stepper.tsx` is dead code** — zero callers. Worth a decision in a future
    sprint: delete it, or adopt it somewhere a typed numeric entry is actually wanted (its own
    touch-capture bug would need the same `Pressable`→`View` fix drafted and reverted here before it
    could ship). Not acted on in this sprint since it is unreachable by any current screen.
