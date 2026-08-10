# PRism UI/UX Foundation v1

## 1. Document status

- **Status:** Draft for engineer/owner review. Not yet accepted.
- **Date:** 2026-08-05
- **Intended branch:** `docs/ui-ux-foundation-v1` (documentation only, per `Docs/invariants.md` I-14).
- **Owner:** Engineer/owner.
- **Purpose:** One durable UI/UX baseline for PRism v1 across onboarding, logging, continuity,
  history, and Today — consolidating decisions that currently exist only as prose scattered across
  seven sprint records, and closing three questions those records left explicitly open.

**Labelling contract (`Docs/invariants.md` I-15).** Every nontrivial statement below carries one of
four inline labels. They are not decoration — a future reader (human or agent) must be able to tell
what is checked-in reality from what is a choice or a guess.

| Label | Meaning |
|---|---|
| `[fact]` | Verified against the repository or an accepted document, with the evidence named. |
| `[decision]` | A choice made by or for this document. Carries a rationale and a reversal condition. |
| `[assumption]` | Believed true, not directly verified. Names what would confirm it. |
| `[open question]` | Undecided. Names who decides and what it blocks. |

**Relationship to other documents.** `Docs/architecture.md` remains the implementation baseline; where
this document and the architecture audit disagree about what exists, the audit wins and this document
is wrong `[fact]`. `Docs/decisions/ADR-0001-product-position.md` and `ADR-0002-readiness-suggestion-safety.md`
govern product position and readiness-suggestion boundaries and are not reopened here `[fact]`. This
document consolidates and, where noted, closes open items from:
`2026-07-29-ui-ux-foundation-expansion.md`, `2026-08-01-onboarding-ui-redesign.md`,
`2026-08-02-workout-logging-v1-planning.md`, `2026-08-02-workout-session-continuity-v1.md`,
`2026-08-03-workout-history-v1.md`, `2026-08-03-today-insights-cohesion.md`,
`2026-08-04-logger-ux-polish.md`.

**Scope.** Onboarding, Today, template choice, the logger, the exercise picker, the post-finish
summary, History, and Insights *only in its role as the second door to the deeper surfaces*.

**Out of scope.** The internals of Exercises, Plans, Social, Progress, and Body; anything under
`src/data/`, `supabase/`, or `src/domain/calc/`; the readiness *suggestion* feature (ADR-0002 Phase B
onward); native/build configuration. This document changes no code `[fact]`.

---

## 2. What v1 is

PRism v1 is a readiness-aware strength-training logger: fast set-by-set logging plus transparent,
advisory-only derived numbers the lifter can inspect and override, per ADR-0001 `[fact]`. Nothing in
this document introduces an automatic adjustment, a medical or diagnostic claim, or an input beyond
RPE (`Docs/invariants.md` I-8, I-11, I-16) `[fact]`.

**Navigation model** `[fact, verified in `app/(tabs)/_layout.tsx` and `app/_layout.tsx`]`

- A five-tab bottom bar — Today, Exercises, Insights, Social, Plans — each with an icon *and* a text
  label, `minHeight: 44`.
- Progress and Body are real routes carrying `href: null`: reachable, deliberately not bar items.
- The session flow and History live on the **root stack**, above the tab navigator, so the logger
  covers the bar rather than sitting inside it. Logging is a mode, not a tab.

**Screen inventory**

| Surface | Route | Job in v1 | Status |
|---|---|---|---|
| Onboarding | `onboarding/{index,features,auth,steps,complete}` | Welcome → 3-slide carousel → account → 4 skippable questions → completion summary. **Updated 2026-08-06:** `auth` is now a `<Redirect>`, not a screen — it resolves to `/auth` where accounts exist and skips to `steps` where they do not (D2a) | Built `[fact]` |
| Auth | `auth/index` | Sign-in / sign-up / **password reset**. The only route to any data surface in a build with credentials; absent entirely in one without. Reset is a **mode of this screen, not a route** — no route was added for it (added 2026-08-06, reset 2026-08-09; D2a, §4.9) | Built `[fact]` |
| Account | `account` (modal) | Identity, sign out, one explanatory line. The only sign-out entry point; reached from Today's header, and only where accounts exist (added 2026-08-08, D2a, §4.10) | Built `[fact]` |
| Today | `(tabs)/index` | The launch surface: where you stand, one action, then depth on scroll | Built, including D9 |
| Template choice | `workout/templates` (modal) | "Choose a workout": every `RoutineDay`, grouped, plus "Start empty" | Built `[fact]` |
| Logger | `workout/active` (slide-from-bottom, gestures disabled) | Set-by-set logging, the highest-frequency screen | Built `[fact]` |
| Exercise picker | `workout/picker` (modal) | Search/filter → add a lift to the active session | Built `[fact]` |
| Summary | `workout/summary` | One-time post-finish capture: stats, records, optional rating/reflection | Built `[fact]` |
| History list | `history/index` | Completed sessions, newest first, grouped by month | Built `[fact]` |
| History detail | `history/[id]` | Read-only record of one session, set by set | Built `[fact]` |
| Insights | `(tabs)/insights` | Analytics hub; second door to Progress / Body / History | Built `[fact]` |

**The three flows v1 has to carry**

1. **First run.** Onboarding → Today, populated by the deterministic 8-week demo seed so no screen
   opens empty `[fact, `src/data/demoSeed.ts`]`. The completion screen echoes the lifter's answers back
   and states plainly that they are stored on-device and not applied to the training profile
   `[fact, `COMPLETE.summaryNote` in `src/content/onboarding.ts`]`.
2. **Log a session.** Today → *Start session* (auto-resolved) or *Choose a workout* → logger →
   Finish → summary → Today. Interruption is first-class: minimising returns via the "Session in
   progress" banner; a killed process returns via the "Recovered session" card; a save failure keeps
   every set on screen behind a retry banner `[fact, `workout-session-continuity-v1` §5]`.
3. **Review.** Today or Insights → "Go deeper" → History list → session detail, where warm-ups and
   unticked sets are shown and marked as not counting toward volume `[fact, `workout-history-v1`
   Decision 4]`.

**What v1 is not.** ~~v1 ships against demo mode, the only mode a real user can currently reach
(`Docs/architecture.md` G-1).~~ **Updated 2026-08-06** `[fact]`: demo is no longer the only reachable
mode. An authentication path exists, so a build with credentials can sign a real lifter in and read their
own rows through RLS (D2a, §4.9). That is a change of what is *possible*, not a claim of readiness —
nothing here has run against a live Supabase project, and §8's other gates (I-2, I-10, G-4) are untouched.
This document defines a UI baseline; it does **not** claim launch readiness — see §8 and §9.

---

## 3. Decisions

### D1 — Navigation is frozen for v1: five tabs, session and History on the root stack

**Statement** `[decision]` No tab is added, removed, renamed, or reordered in v1. Progress and Body
stay reachable-but-hidden. New surfaces go on the root stack, not into the bar.

**Rationale** The bar's own contract sets five as the ceiling: a sixth label stops being legible at
this font size on a compact device, and dropping labels is not a trade PRism will make
`[fact, `app/(tabs)/_layout.tsx` header comment]`. A root-stack push is also the only honest back
behaviour — the assumption that `router.back()` from a hidden tab returns to the tab you came from was
tested and **falsified** on device 2026-07-29, so Progress and Body navigate explicitly to Insights and
say "Back to Insights" `[fact, `ui-ux-foundation-expansion` §"Information architecture change"]`.
History was put on the root stack for exactly this reason `[fact, `workout-history-v1` Decision 2]`.

**Evidence** `app/(tabs)/_layout.tsx`; `app/_layout.tsx` (registers `workout/active`, `workout/picker`,
`workout/templates`, `workout/summary`, `history/index`, `history/[id]`).

**Reversal** Real-user feedback showing a v1 surface is undiscoverable. Reversal means an IA sprint
with on-device verification of every back path, not a one-line `href` change.

---

### D2 — ~~Onboarding keeps its five-screen path; the account screen stays presentation-only and says so~~

> **Superseded 2026-08-06 by `feature/v1-auth-and-session` (see D2a below).** Retained in full per I-15:
> what was decided, and why it was reversed, is itself evidence. D2's own reversal clause named the
> trigger — "an authentication sprint lands" — and required copy, skip semantics, the completion gate and
> the autofill attributes to change **as one unit**. They did.

**Statement** `[decision]` Route order `index → features → auth → steps → complete` is unchanged.
`complete.tsx` remains the only screen that writes anything. The auth screen keeps hand-rolled
validation and creates no account.

**Rationale** No authentication path exists anywhere in the repository; `SupabaseRepository.uid()`
throws without a session `[fact, `Docs/architecture.md` G-1]`. A sign-up screen that implied an account
existed would be the single dishonest surface in an app whose entire posture is stating what it does
not know (I-8, I-15). The existing flow already reconciles this correctly: the final slide's "Get
started" is a relabelled Continue with the same handler, not a new completion path
`[fact, `onboarding-ui-redesign` §"Completion semantics"]`.

**Evidence** `app/onboarding/_layout.tsx`; `src/store/onboardingStore.ts` (AsyncStorage only);
`src/domain/authValidation.ts`.

**Reversal** An authentication sprint lands. At that point the auth screen becomes real and D2 is
superseded rather than amended — the copy, the skip semantics, and the completion gate all change
together.

---

### D2a — The account screen is real, and appears only where accounts exist

**Statement** `[decision, 2026-08-06, `feature/v1-auth-and-session`]` The account screen creates accounts
and signs people in. In a build with credentials it is the only route to any data surface. In a build
without them it does not appear at all.

**What changed together**, as D2's reversal clause required:

- **The placeholder notice is deleted.** It said accounts were not connected; they are. Leaving it would
  have made a working form the one dishonest surface in the app — the exact failure D2 existed to prevent,
  pointing the other way.
- **The "Later" skip is deleted.** Its stated purpose was "the way past this screen without an account",
  and there is no longer anywhere to go: every data screen requires a session.
- **AutoFill is restored.** `autoComplete="email"` / `textContentType="emailAddress"`, and mode-specific
  `new-password`/`newPassword` on sign-up and `current-password`/`password` on sign-in. The suppression
  these replace existed solely because iOS was offering to save a credential for an account the screen
  could not create; that objection is gone, and the file's own comment anticipated this ("restore these
  the moment sign-up actually creates an account, and not before").
- **The screen moved** to `app/auth/index.tsx` on the root stack, gestures disabled. A returning lifter on
  a fresh install has already onboarded, and routing them through the first-run stack to sign in would
  give them a back gesture into a form they finished months ago. `app/onboarding/auth.tsx` remains as a
  `<Redirect>`, so the onboarding route graph, its `_layout` registration and its back paths are unchanged.
- **Demo builds skip it.** `resolveOnboardingAuthHref(isAuthEnabled())` routes them straight to
  `/onboarding/steps`. See §9 Q1, which this closes.

**The way back in, added 2026-08-09** `[decision, `feature/v1-password-reset`]`. A "Forgot password?"
control sits under the password field **in sign-in mode only** — on sign-up there is no password to have
forgotten, and offering a reset there would be a second way to ask the server whether an address is
registered. Reset is a **third mode of this same screen**, not a route: `app/auth/index.tsx` goes from
two modes to three, the route map is unchanged, and §4.9's state list grows rather than a §4.11 being
added. It is **code-based, not link-based** — the lifter reads six digits out of the email and types
them in — because nothing in the app captures a deep link, so a "follow the link" instruction would send
them somewhere the app cannot receive them. The copy says "code" and never "link"; a test pins that.

**The way out, added 2026-08-08** `[decision, `feature/v1-signout-surface`]`. Signing in needed a
counterpart, and it lives on the same condition as the screen above. Today renders an **Account control
in `Screen`'s `headerRight` slot**, beside the lifter's own name, gated by
`canOfferSignOut({ authEnabled: isAuthEnabled(), sessionPhase })` — so it appears only for an
authenticated session in a build with credentials, and is **absent** (not disabled) in demo and
misconfigured builds, for D2a's own reason: a greyed control implies an account that could have existed.
It opens `app/account` (§4.10), which is **the only sign-out entry point in v1**. No tab was added —
D1 freezes the bar — and no new layout primitive was needed, because `headerRight` already existed and
had no consumers.

**Rationale** The honesty argument is D2's, unchanged; only its direction reverses. A screen that says
accounts do not work while collecting credentials, and a screen that collects credentials in a build with
no accounts, are the same defect.

**Evidence** `app/auth/index.tsx`; `app/onboarding/auth.tsx`; `src/domain/routing.ts`;
`src/store/sessionStore.ts`; `src/content/onboarding.ts`. `src/content/__tests__/authCopy.test.ts`
asserts `AUTH.placeholderNotice` and `AUTH.skipLabel` no longer exist — a **partial** reversal is the real
risk, so their absence is pinned rather than trusted.

**Reversal** Real-user evidence that a session-gated first run costs more than it protects.

---

### D3 — Today shows exactly one dominant filled button

**Statement** `[decision]` `TodayHero` states position and carries no CTA. The `SessionCard` directly
beneath it owns the screen's only filled button.

**Rationale** Two start buttons on one screen is the specific failure mode a summary block invites,
and PRism already committed to one dominant action per screen
`[fact, `ui-ux-foundation-expansion` §"Design decisions"]`. Readiness deliberately appears twice — a
compact number in the hero, the full ring and factor breakdown further down — because that repetition
*is* the progressive-disclosure pattern, not a duplication bug `[fact, same]`.

**Evidence** `src/components/today/TodayHero.tsx`; `app/(tabs)/index.tsx` section-order comment.

**Reversal** Only as part of a deliberate Today restructure, which would need its own sprint.

---

### D4 — Three entry points into a session, and never two sessions at once

**Statement** `[decision]` (1) The auto-resolved suggestion on Today via `resolveTodaySession`; (2) the
explicit "Choose a workout" modal, which also contains "Start empty"; (3) Exercises' "log this lift",
which starts an **open session only** — never a template session — and adds the chosen lift to it. All
three guard on `if (!activeWorkout)` before creating anything, so no path can produce a second
concurrent session. No fourth path in v1.

**Corrected 2026-08-05** `[fact]` This decision previously read "exactly two entry points… no third path
in v1" and named Exercises as a hypothetical *future* addition. That was wrong about this repository:
`app/(tabs)/exercises.tsx`'s `logExercise` already created sessions and had done since
`ui-ux-foundation-expansion`, whose in-scope item 4 is "a low-friction 'log this lift' path"
`[fact, `2026-07-29-ui-ux-foundation-expansion.md` §In scope]`. **This is a correction of the document to
match shipped reality, not a change of product direction** — no entry point was added, removed, or
re-scoped to make D4 true.

**Rationale** One algorithmic path plus one deliberate path covers both "tell me what's next" and "I know
what I'm doing"; the third serves the different job of "I know the lift, not the session", and reaches
the logger through the same `start`/`addExercise` store calls rather than a parallel session builder
`[fact, `app/(tabs)/exercises.tsx` header comment]`. Before `workout-session-continuity-v1`, template
choice was not a real choice at all — an algorithm's suggestion plus a manual escape hatch
`[fact, `workout-logging-v1-planning` §2.1]`. That sprint added the choice without removing the
suggestion. Resuming into an existing session rather than permitting a second one is pre-existing
correct behaviour and is preserved `[fact, `workout-logging-v1-planning` §2.1]`.

**Evidence** `app/(tabs)/index.tsx` (`handleStart`, which returns early into an existing session);
`app/workout/templates.tsx` (`handleDay`/`handleEmpty`) with `src/domain/schedule.ts`
(`listTemplateChoices`); `app/(tabs)/exercises.tsx` (`logExercise`). `app/workout/picker.tsx` is **not** an
entry point — it only adds to a session that already exists `[fact]`.

**Reversal** A fourth entry point (e.g. repeat-last-session, or a widget/deep link) is v2 work and must
state how it stays consistent with these three — specifically, how it guards against a second session and
what it does when a recovered draft is pending review.

---

### D5 — Continuity has three states on Today, mutually exclusive; the rest timer is never restored

**Statement** `[decision]` (a) no session, (b) "Session in progress" one-line banner, (c) "Recovered
session" card with **Resume workout** and a confirmed **Discard draft**. Exactly one renders at a time.
The rest timer is excluded from the persisted draft. **Entering the logger *is* resuming**: whatever
route reaches `workout/active`, `draftPendingReview` is cleared on arrival, so state (c) can never
outlive the moment the lifter is already logging in that session.

**Rationale** A wall-clock countdown surviving an arbitrary kill-to-relaunch gap is misleading UI
state, not workout data `[fact, `workout-session-continuity-v1` §3]`. Recovery is an explicit user
decision rather than a silent restore because the alternative — dropping a lifter back into a session
they may have abandoned days ago — is the same class of dishonesty as a confident readiness score built
on absent data (I-18).

**Evidence** `src/store/activeWorkoutStore.ts` (`hydrate`, `resumeDraft`, `draftPendingReview`,
AsyncStorage key `prism.activeWorkout.draft.v1`, module-level `subscribe`); `app/(tabs)/index.tsx`;
`app/_layout.tsx` (calls `hydrate()` once on mount); `app/workout/active.tsx` (clears
`draftPendingReview` on entry, so the flag does not depend on which route got the lifter there).

**Entry-path independence** `[fact, added 2026-08-05]` `resumeDraft()` used to be called from exactly one
place — Today's Recovered card — so any other route into the logger left `draftPendingReview` set and
Today kept rendering state (c) for a session the lifter was already logging in. The logger now clears it
itself. The two session-creating paths that could previously reach an unreviewed draft
(`workout/templates`, Exercises' "log this lift") no longer act on one silently — see §4.3 and D4.
Exercises has no §4 subsection of its own: its internals are out of scope per §1, and only its role as
D4's third entry point is governed here.

**Note** `[fact]` `hydrate()` guards the race where a stale on-disk draft would overwrite a session
started while its read was in flight; this is covered by a deterministic unit test, not by manual
verification, and that is the correct instrument for a sub-tens-of-milliseconds window
(`workout-session-continuity-v1` §4).

**Reversal** A staleness policy (e.g. auto-discarding a draft older than N hours) would change (c) and
needs its own decision — it is v2.

---

### D6 — Confirmation is v1's answer to destruction; undo is not in v1

**Statement** `[decision]` Destructive actions in the logger confirm **only when logged work would be
lost**. An untouched exercise or an unticked set is removed immediately. No undo affordance ships in v1.

**Rationale** Interrupting mid-session to confirm the removal of a plan the lifter never touched is
friction with nothing behind it; interrupting to confirm the loss of logged sets is the whole point
`[fact, `logger-ux-polish` §3]`. Before that sprint, removing an exercise took every set under it on a
single unprompted tap, and set removal was an undiscoverable long-press `[fact, `logger-ux-polish` §2 A]`.
This closes `logger-ux-polish`'s stated next decision in the direction that ships: undo is a larger
design that interacts directly with the draft-persistence mechanism from D5, and would replace these
confirmations rather than sit beside them.

**Evidence** `app/workout/active.tsx` (`confirmRemoveExercise`, `confirmRemoveSet`);
`src/components/workout/SetRow.tsx` (accessibility label now names the long-press gesture);
`src/store/__tests__/activeWorkoutStore.test.ts` (8 tests pinning re-indexing after removal).

**Reversal** Real-user reports of accidental irreversible removals. Reversal is an undo sprint that
*removes* both confirmations; adding undo on top of them would make the screen chattier, which is the
opposite of the intent.

---

### D7 — History is read-only in v1: no edit, no delete

**Statement** `[decision]` The session detail view has no edit affordance, and `Repository.deleteWorkout`
gains no UI call site in v1.

**Rationale** This closes `workout-history-v1`'s stated next decision. An edit silently rewrites volume,
records, and readiness history after the fact; a delete is irreversible and entangled with the still-open
non-atomic write path (I-2 / G-2) `[fact, `workout-history-v1` §7]`. Neither should arrive by inference
from a review screen. Read-only History is also the surface on which a partial write would become
*visible* to the lifter — an argument for closing I-2, not for softening History
`[fact, `workout-history-v1` §1]`.

**Evidence** `app/history/[id].tsx`; `src/data/repository.ts` (`deleteWorkout` exists, tested, zero UI
call sites).

**Reversal** Both become available for v2 scoping once I-2 is closed. Order matters: delete is simpler
but destructive; edit is non-destructive but silently rewrites derived history. `[open question]` Which
lands first is not decided here — engineer/owner call, blocking neither v1 nor the other.

---

### D8 — The summary captures once; History detail is the re-readable record

**Statement** `[decision]` `workout/summary` stays reachable exactly once, at finish. It gains no
"view later" entry point in v1.

**Rationale** The 1–5 rating and the 280-character reflection only make sense in the minutes after a
session; a capture prompt reopened weeks later is a different screen with a different job. History
detail already renders the stored rating, the reflection, and every set as logged
`[fact, `workout-history-v1` §4]`. Two surfaces both claiming "review your workout" is worse than one of
each.

**Evidence** `app/workout/summary.tsx` (reached only via `router.replace` from the logger);
`app/history/[id].tsx` ("How it felt" card).

**Reversal** If feedback shows lifters hunting for the summary specifically, the cheap fix is a link
from History detail to a read-only summary view — not making the capture screen re-enterable.

---

### D9 — Today's "Go deeper" tiles become the same `ListRow` card Insights uses

**Statement** `[decision]` `QuickAccess`'s three-tile row on Today is replaced by the `ListRow` card
pattern Insights already renders, both continuing to read from `src/content/deeperSurfaces.ts`. This is
the one existing-UI change this document introduces. **Status: implemented, `feature/today-v1-alignment`**
`[fact]`.

**Rationale** This closes `today-insights-cohesion`'s stated next decision. The two screens already
agree on order, wording, and captions via one shared module; the container is the last thing they
disagree on, and it is the part that fails: three fixed-width flex tiles cannot hold two lines of
1.6×-scaled text at 375pt, truncating to "Finishe/d ses…" and "Progr…"
`[fact, `today-insights-cohesion` §7]`. Rows fix the truncation, remove the need for a separate short
tile caption and long row subtitle, and make the two screens identical. The cost is roughly 120pt of
extra height at the very bottom of Today's scroll — the cheapest place in the app to spend it
`[assumption; the 120pt figure is that sprint's estimate, not a measurement]`.

**Evidence** `app/(tabs)/index.tsx` (the `ListRow` card, field-for-field identical to Insights');
`app/(tabs)/insights.tsx`; `src/content/deeperSurfaces.ts` and its 10 content-invariant tests, unchanged.

**Reversal** If the extra height measurably hurts Today, the alternative is reflowing the tiles at large
text sizes — a size-dependent branch inside a shared component, which is why it was not chosen first.

**Follow-on, resolved** `[fact]` `QuickAccess` was retired outright rather than kept as a wrapper --
`grep -rn "QuickAccess"` showed exactly one consumer (`app/(tabs)/index.tsx`) before this change, so
nothing else depended on it. `tileCaption`/`tileIcon`/`TILE_CAPTION_MAX_LINE_CHARS`/`_LINES` in
`src/content/deeperSurfaces.ts` are kept, unused, for any future compact layout -- deleting them would
have meant rewriting `deeperSurfaces.test.ts`'s pinning tests for a data shape the module's own
comment calls deliberate, which is churn beyond this decision's scope.

---

### D10 — The accessibility floor is a shipping gate, not a polish pass

**Statement** `[decision]` A surface is not done until it has been verified on a **cold-started**
simulator at iPhone SE width (375pt) and at `accessibility-extra-large`, in addition to a default-size
device.

**Rationale** Three consecutive sprints found real defects that typecheck and Jest could not see —
clipped record names, headings breaking into "SE/T", captions truncating, a chart rendering at zero
height `[fact, `workout-history-v1` §6.1.1, `today-insights-cohesion` §6.1.1, `logger-ux-polish` §5.1,
`onboarding-ui-redesign` §"Defects found"]`. The same period produced three *phantom* defects from
long-lived hot-reloaded instances and one stale-bundle trap, each of which would have been wrong to
report `[fact, `today-insights-cohesion` §6.2, `logger-ux-polish` §5.2–5.3]`. Both halves are why the
method, not just the target, is fixed here.

**Evidence** `src/components/ui/Text.tsx` (`maxFontSizeMultiplier` 1.6); `Input.tsx`/`SearchField.tsx`
(1.4); `a11y.minTouch`; `app/(tabs)/_layout.tsx` (`minHeight: 44`).

**Reversal** None. This is a gate, not a preference.

---

### D11 — User-facing vocabulary lives in `src/content/`, never in a screen or a store

**Statement** `[decision]` Any string appearing on two or more surfaces, or naming a domain concept,
lives in a module under `src/content/` with a test pinning its invariants.

**Rationale** This repository has no component-test framework, by a standing decision reconfirmed by
every UI sprint since `2026-07-27` `[fact]`. `src/content/` is therefore the only layer a test can
actually reach for copy. It has already caught real drift: the same "Go deeper" row existed twice with
different order, captions, and headings; set types were named in three places and agreed in none; and
copy had been left sitting in `activeWorkoutStore` with zero consumers
`[fact, `today-insights-cohesion` §2 A, `logger-ux-polish` §2 C]`.

**Evidence** `src/content/{deeperSurfaces,setTypes,onboarding,social}.ts` and
`src/content/__tests__/`.

**Caveat** `[fact]` A content test pins wording, not layout. `deeperSurfaces.test.ts`'s first version
asserted a 22-character budget, passed a 21-character caption, and that caption clipped on device
anyway — the real constraint was word packing, not length. The test now models greedy word wrap. A
content test is not a substitute for D10.

---

## 4. Surface-by-surface behaviour

Each subsection ends with the four states every surface must answer for: **loading · error · empty ·
interrupted**.

### 4.1 Onboarding

- **Routes** `index` (welcome, gestures disabled) → `features` (3-slide horizontal carousel:
  `01 / LOG`, `02 / PROGRESS`, `03 / READINESS`) → `auth` → `steps` (goal, experience, days, equipment)
  → `complete` (gestures disabled, fades in) `[fact]`.
- **Skip semantics** Every setup question is skippable; a skipped answer stays unset, never defaulted,
  and renders as "Not set" in the completion summary `[fact, `STEPS.skipLabel`, `COMPLETE.notSet`]`.
- **Writes** `complete.tsx` alone calls `onboardingStore.complete()`, which flips the routing gate in
  `app/_layout.tsx`. `features.tsx` has never written and must not start `[fact]`.
- **Demo content** The Log/Progress/Readiness previews use fixed presentation-only data, with every
  derived figure computed through the real `estimateOneRepMax` rather than typed by hand, so the preview
  cannot drift from the formula it claims to demonstrate `[fact, `src/content/onboarding.ts`]`. It is
  never read from `trainingStore` or any repository, and must never be wired to either `[decision]`.
- **Readiness slide honesty** The "NOT ENOUGH INPUT" chip is `tone="neutral"`, never coral/critical, and
  the disclaimer states readiness is a planning estimate, never a diagnosis and never medical advice
  (I-8) `[fact]`.
- **States** Loading: n/a, no data dependency. Error: n/a. Empty: n/a. Interrupted: the flow is
  re-enterable from the start; nothing is written until `complete`. *(Still true of the four onboarding
  screens; the `auth` step is no longer one of them — see §4.9.)*
- **Updated 2026-08-06** `auth` is no longer a screen in this flow. It is a `<Redirect>` that resolves to
  `/auth` in a build with credentials and to `/onboarding/steps` in one without, so the demo first-run is
  four screens and the credentialed first-run is five `[fact, `src/domain/routing.ts`]`.
- ~~`[open question]` Should the `auth` step be visible at all in a demo-only 1.0?~~ **Resolved
  2026-08-06** — see §9 Q1.

### 4.2 Today

- **Section order** `[fact, `app/(tabs)/index.tsx` header comment]`: `TodayHero` → `SessionCard` →
  Readiness (ring + full reasoning + `CheckInPrompt`) → consistency (`WeekCard`) → recovery / recent PRs
  → "Go deeper".
- **Hero** Carries a **required** `spanNote` prop — the card cannot render three numbers spanning three
  different windows (readiness now, sessions this calendar week, volume rolling 7 days) without saying
  which is which `[fact, `today-insights-cohesion` §3]`. The Sessions stat carries no unit; being on
  target is signalled by tone `[fact, §6.1.1 defect 3]`.
- **Continuity states** Per D5. The recovered-session card shows title, relative start time, and set
  count, with Discard behind `Alert.alert("Discard this draft?", "Nothing you logged will be saved.")`
  `[fact]`.
- **Entry points** `SessionCard` primary = "Start session" (auto-resolved); secondary = "Choose a
  workout" → `/workout/templates`. The no-active-routine empty state routes to the same modal `[fact]`.
- **Header, added 2026-08-08** `[fact, `feature/v1-signout-surface`]` The header block's `headerRight`
  slot now carries the **Account** control — an icon-only 44pt target with
  `accessibilityLabel="Account"`, routing to the `account` modal (§4.10). It renders only when
  `canOfferSignOut({ authEnabled: isAuthEnabled(), sessionPhase })` is true, so demo and misconfigured
  builds show a header identical to before. This is the only change to Today in that sprint: no section
  moved, no card changed, and the "Demo data" chip is untouched.
- **States** Loading/error: via the shared `ScreenState` primitive, branching on `trainingStore.status`
  `[fact, G-5 resolved]`. Empty: "No plan is active yet…" with a route into template choice.
  Interrupted: see D5. The Account control sits in the header block, which `ScreenState` does not
  replace — but on a misconfigured build (the case where the error state is most likely) the control is
  already absent for the reason above, so it cannot appear over an error `[fact]`.

### 4.3 Template choice (`workout/templates`)

- Full-screen modal, matching the established `workout/picker` precedent rather than introducing a
  bottom-sheet primitive `[fact, `workout-logging-v1-planning` §2.11]`.
- Lists every `RoutineDay` across `trainingStore.routines`, grouped by routine, each showing lift count
  and estimated time, plus a separated "Start empty" option, built from `OptionRow`/`SectionHeader`
  `[fact]`.
- **"Editable" means session-scoped in v1** `[decision, ratified from `workout-session-continuity-v1`
  §1]`: starting from a template seeds a session that is freely editable in the logger; the reusable
  template definition is never written back. `activeWorkoutStore.start()` only ever *reads* the
  `RoutineDay` `[fact, §3]`.
- **A session already in progress is surfaced, not overridden** `[decision, 2026-08-05]`. Picking a day
  (or "Start empty") while `activeWorkout` is non-null used to `router.replace` straight into the
  *existing* session — the lifter's choice silently discarded, and a recovered draft acted on before they
  had reviewed it. Both handlers now raise an `Alert` naming the session already in progress, offering to
  open it or cancel. Cancel writes nothing. This preserves D4's "never two sessions" guard while making
  its effect visible `[fact]`.
- **States** Loading/error: inherits Today's, since the modal is only reachable after a successful load
  `[assumption; this screen does not itself branch on `trainingStore.status`]`. Empty: not reachable —
  two templates ship in `src/data/routineTemplates.ts`. Interrupted: dismissing writes nothing; picking
  anything while a session exists writes nothing either, per the bullet above.

### 4.4 Logger (`workout/active`)

- **Chrome** Fixed header, docked footer, slide-from-bottom presentation with gestures disabled — bespoke
  chrome justified by the screen's job `[fact, `logger-ux-polish` §2]`. Keeps the device awake
  (`expo-keep-awake`) `[fact]`.
- **Header metrics** "Sets done" / "Volume" / "Lifts". "Sets done" counts every ticked set including
  warm-ups; the summary's "Working sets" excludes them. The relabel exists precisely so the two stop
  looking equivalent while disagreeing `[fact, `logger-ux-polish` §2 B]`.
- **Set row grammar** Equipment-aware nudge steppers for load and reps (`loadIncrementKg`), `RpeSelector`
  at half-steps 5–10, tap the index cell to change set type, long-press to remove, one-tap copy-previous,
  complete/incomplete toggle with haptics and a rest timer `[fact]`.
- **Set-type vocabulary** One source: `src/content/setTypes.ts`, with a one-character `mark`, a short
  `label`, and a `spoken` phrase for screen readers — announcing "W" tells a lifter nothing `[fact]`.
- **Destructive actions** Per D6.
- **Suggestions** One `recommendNextLoad` per exercise with an expandable rationale and an explicit
  "Apply to all sets" that only fires on a deliberate tap — this is what satisfies I-11 and must not
  regress `[fact]`. `[fact]` No dismissal control exists; I-17 remains unmet and is ADR-0002 Phase B work,
  out of v1 scope.
- **Finish** Refuses with zero completed sets (one dialog, which discards directly — it does not chain a
  second confirmation) → confirms with set count and elapsed time → `finish()` builds the completed
  workout **without clearing the store** → persist → detect and persist PRs → only then route to the
  summary and discard `[fact]`.
- **Entering the logger resumes a recovered draft** `[decision, 2026-08-05]`. On mount, if a workout is
  present and `draftPendingReview` is set, the screen calls `resumeDraft()`. Landing here *is* the
  decision D5's Recovered card asks for, whichever route arrived — so Today cannot go on offering
  Resume/Discard for a session already being logged. `resumeDraft()` is idempotent, so Today's own Resume
  button (which already calls it before navigating) is unaffected `[fact]`.
- **States** Loading: does not branch on `trainingStore.status` — carried-forward gap
  `[fact, `logger-ux-polish` §7]`. Error: save failure keeps every set on screen behind a visible retry
  banner with `accessibilityRole="alert"`; nothing is discarded until a save succeeds `[fact]`. Empty:
  an empty session opens the picker directly. Interrupted: back minimises (never discards); a process
  kill is recovered per D5.

### 4.5 Exercise picker (`workout/picker`)

- Full-screen modal: `SearchField` text search, region and equipment `Chip` filters, a favourites toggle;
  tapping a lift calls `addExercise(id, { sets: 3, reps: 8, rest: 120 })` `[fact]`.
- **States** Loading/error: does not branch on `trainingStore.status`, same carried-forward gap as the
  logger `[fact, `workout-logging-v1-planning` §2.9]`. Empty: `EmptyState`, which by its own contract
  names the reason and offers a way out. Interrupted: dismissing writes nothing.

### 4.6 Summary (`workout/summary`)

- Four headline stats (volume, working sets, reps, duration), a "New records" list, a muscle-distribution
  breakdown, then an optional 1–5 session rating and a 280-character reflection `[fact]`.
- Duration comes from the shared `workoutDurationMinutes`, so a session is measured one way only; a
  workout whose `endedAt` precedes its `startedAt` renders "—", never a negative number `[fact,
  `workout-history-v1` §4]`.
- "Save and finish" and "Skip for now" both `router.replace('/')`; skipping discards nothing already
  saved `[fact]`.
- **The rating/reflection write is guarded and honest** `[decision, 2026-08-06]`. It is the same
  `upsertWorkout` the logger's finish path makes, so it gets the same treatment as §4.4: a single-flight
  guard (a second tap while a write is in flight is ignored), `loading`/`disabled` on both actions, and
  on failure a coral banner with `accessibilityRole="alert"` plus a "Try again" primary. Previously the
  `await` had no `catch`, so a rejected write produced an unhandled rejection, no navigation and no
  message — the button appeared to do nothing. The single-flight guard also matters for I-2: two racing
  `saveWorkout` calls are exactly the duplicate write that invariant is about `[fact]`.
- **The failure copy is scoped to the note, not the session** `[decision]`. The workout is persisted by
  the logger *before* this screen renders, so a failure here can only lose the rating and reflection. The
  banner says that, and does not imply the session is at risk.
- **Summary is a capture screen, not an editor** `[fact]`. It writes exactly two fields onto an
  already-completed workout (`sessionRating`, `reflection`) and touches no exercise or set. D7's
  read-only rule and D8's capture-once rule both hold unchanged.
- Per D8, reachable once.
- **States** Loading/error: n/a for the workout itself — reached with it already in the store; the
  *rating write* has its own loading and error states, above. The not-found branch (an `id` that no
  longer resolves) announces itself with `accessibilityRole="alert"` and offers a way back to Today.
  Empty: unreachable, the finish path refuses a session with no completed sets. Interrupted: the workout
  is already persisted before this screen renders; only the rating/reflection would be lost.
- **Text scaling** The reflection field caps at 1.4×, matching the `Input`/`SearchField` primitives
  rather than the app-wide 1.6× — it is a fixed-height box, and text scaled further scrolls out of a
  field the lifter is mid-sentence in `[decision, §6]`.

### 4.7 History (`history/index`, `history/[id]`)

- **Derivation layer** `src/domain/history.ts` — pure, no React, no I/O, 26 unit tests. Screens compose;
  they do not derive `[fact, `workout-history-v1` Decision 1]`.
- **List** `SectionList` inside the shared `Screen` chrome: a spectral totals card, month headers, one
  `ListRow` per session (glyph switches to a cyan `flash` when the session banked a record). Completed
  workouts only, newest first, with a stable id tie-break so two same-instant sessions cannot swap places
  between renders `[fact]`.
- **Month grouping is local time**, matching the dates rendered on each row; `volumeByDay` uses a UTC key,
  a pre-existing inconsistency this baseline neither introduces nor fixes `[fact, Decision 6]`.
- **Detail** Headline stats matching the summary's four numbers, records banked, then one card per
  exercise with a `Set / Load / Reps / RPE` table, per-set `countsTowardVolume`, per-exercise volume and
  top set, and the stored rating/reflection when present `[fact]`.
- **Warm-ups and unticked sets are shown and marked as not counting** — hiding them would show a tidier
  session than the one that happened, and this is what puts raw set-level rows in front of the lifter for
  the first time (I-3) `[fact, Decision 4]`.
- Per D7, read-only.
- **States** Loading/error: `ScreenState`. Empty: `EmptyState` with a real way out ("Choose a workout").
  `[fact]` The empty state is **unverified on device** — `DemoRepository` always merges the regenerated
  8-week seed, so it is unreachable in demo mode; it is covered by unit tests and typecheck only.
  Interrupted: read-only, nothing to interrupt.

### 4.8 Insights (only as the second door)

- The "Go deeper" card is built from `DEEPER_SURFACES` — same order, same headings, same vocabulary as
  Today `[fact]`. Order is narrative: what you did (History), how it is trending (Progress), how recovered
  you are (Body) `[fact]`.
- Its empty state offers "Choose a workout" rather than dead-ending `[fact]`; also unverified on device,
  for the same demo-seed reason as History's.
- Progress and Body return to Insights via `router.replace('/(tabs)/insights')` labelled "Back to
  Insights" — honest about where it goes, and deliberately unchanged `[fact, `today-insights-cohesion` §7]`.
  `[open question]` Now that Today links to the same screens, this is worth revisiting; it was judged
  riskier than the value and left alone.

### 4.9 Auth (`app/auth`)

Added 2026-08-06 by `feature/v1-auth-and-session`. Governed by D2a.

- **Route** `auth/index`, root stack, `gestureEnabled: false` — there is nothing behind sign-in to return
  to `[fact]`. Reachable two ways: the onboarding redirect during first run, and the route gate whenever
  the session phase is `'unauthenticated'`.
- **Modes** One screen, **three** modes (sign-up / sign-in / reset), toggled in place. Validation rules
  differ between them — sign-up enforces `PASSWORD_MIN_LENGTH`, sign-in accepts whatever an existing
  account has, reset enforces the sign-up floor on the *new* password — so switching clears field errors
  and the submitted flag rather than leaving misleading ones on screen
  `[fact, `src/domain/authValidation.ts`, `src/domain/authReset.ts`]`.
- **Reset, added 2026-08-09** `[fact, `feature/v1-password-reset`]` Reached from "Forgot password?" in
  sign-in mode only. Three stages inside the mode, driven by a pure machine (`nextResetStage`):
  - **Request** — email field alone, CTA "Send code". A password field here would be the confusion the
    mode exists to remove.
  - **Sent** — "Check your email", then "I have the code". Worded so it says nothing about whether the
    address has an account.
  - **Code** — six-digit field (`autoComplete="one-time-code"`, so iOS offers it from the notification)
    plus the new password, submitted together. A rejected code returns **here**, with the code still on
    screen: a mistyped digit costs a correction, not a whole new email. "Send a new code" is the escape
    hatch for a genuinely expired one.
  - **Done** — back to sign-in with the address pre-filled and a one-visit notice, "Password updated.
    Sign in with your new password." The lifter is deliberately **not** signed in: the reset hands its
    session straight back, so the next thing they do is prove the new password works.
- **Reset outcome tones** `resetSent` is a **notice** — it is a success, and the error tone would say
  the send had failed. `invalidCode` is an **error**, and covers wrong *and* expired in one sentence,
  because "expired" would confirm a code had been issued and therefore that the account exists.
- **States**
  - **Loading:** `sessionStore.pending` disables both fields and the CTA and drives the button's spinner.
  - **Error:** a form-level card above the CTA, visually distinct from the per-field validation errors
    below the inputs, rendering exactly one of six reviewed sentences from `AUTH_OUTCOME_COPY`. Never a
    raw error — `toAuthFailure` collapses every server shape into a closed set, mapping anything
    unrecognised to `unknown` rather than passing a message through `[fact, `src/domain/authErrors.ts`]`.
  - **Empty:** n/a.
  - **Interrupted:** `pending` and the last outcome live in the **store**, not component state, so a
    request that resolves while this screen is unmounted — a backgrounded app, a redirect landing first —
    cannot strand a spinner on remount. This is the §4 "interrupted" question answered for a surface whose
    interruption is a network round trip rather than a killed process.
- **Check-email** Sign-up resolves to a **distinct full-screen state**, not a message under the CTA. It is
  the end of the flow — there is nothing more to do here until the link is opened — and leaving the form
  live underneath would invite a second submit that can only fail. It states outright that confirmation
  ends in a **manual sign-in**, because no deep-link capture exists (`detectSessionInUrl` is false and
  nothing in the repo handles an incoming link; see `Docs/production-posture-v1.md` §4.1).
- **Copy rules, all pinned by `src/content/__tests__/authCopy.test.ts`:** one message for a wrong password
  and for an address with no account, so the form is not an account-enumeration oracle for a product that
  stores sleep, soreness and bodyweight; no environment variable or internal identifier anywhere on the
  surface; nothing diagnostic or clinical (I-8). `checkEmail` and `sessionExpired` render in a *notice*
  tone rather than an error tone — the first is a success, and the second is not the lifter's fault.
- **Not covered by tests** This screen's rendering. No component-test tooling exists (D-note:
  `onboarding-ui-redesign` Decision 6), so the states above are verified at the store and content layer
  only, and have **not** been verified on device.

### 4.10 Account (`app/account`)

Added 2026-08-08 by `feature/v1-signout-surface`. Governed by D2a.

- **Route** `account`, root stack, `presentation: 'modal'` `[fact]`. A detour, not a destination.
  Reached only from Today's `headerRight` control (§4.2), which is itself gated — so there is no path to
  this screen in a build without accounts.
- **Contents — three things, deliberately** `[decision]`: an identity line ("Signed in as {email}",
  falling back to the profile's display name when Supabase returns no email, and to a bare "Signed in"
  when neither is known); a destructive-toned `ListRow` labelled "Sign out"; and one explanatory
  sentence. **A fourth item would make this the settings surface the sprint was scoped not to build** —
  no preferences, no units, no theme, no dev affordances.
- **Confirmation** Per **D6**, and this is the whole reason the rule is restated here: sign-out discards
  the in-progress draft, so it is destructive whenever there is work in it. `shouldConfirmSignOut`
  returns true when any set is completed — **warm-ups included**, because "counts toward volume" and "is
  logged work" are different questions and this is the second one. The `Alert` then names the count and
  the session title, mirroring Today's existing "Discard this draft?" wording. An untouched session
  signs out with no prompt: confirming the loss of a plan nobody touched is friction with nothing behind
  it.
- **States** **Loading:** none — everything rendered is already in the stores. **Error:** none; teardown
  cannot fail in a way the lifter can act on, and it completes even when the server sign-out rejects.
  **Empty:** n/a. **Interrupted:** if the phase stops being `'authenticated'` while the sheet is open —
  a revoked token, or a sign-out completing — the screen pops rather than leaving a "Sign out" button
  over a session that no longer exists.
- **After sign-out** A silent redirect to `/auth`, with no confirmation message `[decision]`. The
  teardown flips the phase last, the route gate redirects, and the modal unmounts with it. Someone who
  just tapped Sign out does not need to be told they signed out; the *involuntary* case
  (`sessionExpired`) is the one that gets a line on the auth screen. The asymmetry is deliberate.
- **Copy constraints, all pinned by `src/content/__tests__/accountCopy.test.ts`:** no environment
  variable or internal identifier (I-4/I-5); nothing diagnostic or clinical (I-8); and **no claim of
  deletion or export**, because neither exists (I-10, open). The explanation must state both halves —
  what leaves the device, and what does not leave the account — since "signing out" is precisely the
  phrase a worried person misreads as erasure.
- **Not covered by tests** This screen's rendering, the modal presentation, and the `Alert`. Verified
  through the pure predicates (`src/domain/account.ts`) and the copy module only; **not** verified on
  device.

---

## 5. Interaction and copy rules

1. **One dominant action per screen** `[decision, D3]`.
2. **Destructive actions confirm when logged work would be lost, and only then** `[decision, D6]`. There
   is no undo in v1; a confirmed removal is final.
3. **Every number states the span it covers, in words, next to the number** `[fact, established rule,
   `app/(tabs)/insights.tsx` header comment; enforced on Today by the required `spanNote`]`.
4. **Empty states name the reason and offer the way out.** "No results" with no next step reads as a
   broken screen `[fact, `EmptyState` contract]`.
5. **One vocabulary, one home** `[decision, D11]`. Registry: *finished* (not "logged") for completed
   sessions; *Working sets* excludes warm-ups; *Sets done* includes them; set-type names come from
   `setTypes.ts`; the three deeper surfaces come from `deeperSurfaces.ts`.
6. **Colour semantics** `[fact, `src/theme/tokens.ts` header comment + `onboarding-ui-redesign`]`: violet
   is the interface accent (CTAs, pagination, eyebrow badges); cyan is reserved for data signals; the
   spectral gradient (`LinearSpectrum`) is hard-capped to a thin band by its own contract and is never a
   background or a large filled area.
7. **No hardcoded colour, font size, or raw gap.** Anything needed by two or more screens becomes a
   primitive in `src/components/ui/` `[fact, `ui-ux-foundation-expansion` UX principle 7]`.
8. **Grouping is a segmented control; filtering is chips.** One-of-N changes a list's shape; many-of-N
   changes its contents; the same control for both would make them look interchangeable
   `[fact, same sprint, "Design decisions"]`.
9. **Never a clinical, diagnostic, recovery-measurement, or injury-prevention claim** (I-8). The existing
   `RECOVERY_MODEL_EXPLANATION` / `READINESS_EXPLANATION` framing is the tone baseline for any new copy
   `[fact]`.
10. **Never present absent data as a confident result** (I-18). "Not enough input yet" is a first-class
    state, rendered without a numeric ring `[fact]`.
11. **A number in a narrow column shrinks; prose wraps.** Letting a value wrap is worse than letting it
    clip — "1.0" breaking across two lines reads as a different, wrong number
    `[fact, pattern established by `StatBlock`]`.

---

## 6. Accessibility baseline

**Targets** `[fact]` Every touch target ≥44pt via `a11y.minTouch`, `hitSlop` on visually small controls,
`minHeight: 44` on tab bar items.

**Text scaling** `[fact]` `maxFontSizeMultiplier` 1.6 app-wide via the single `Text` component; 1.4 on
`Input`/`SearchField`; **1.2 plus shrink-to-fit for fixed-width column headings only** — an eyebrow label
over a 26pt column is the one case where full scaling produces "SE/T" while the numbers beneath stay on
one line.

**Screen readers** `[fact]` Composed read-only cards are exposed as one `accessible` unit with an
assembled label rather than as orphaned focusable fragments; charts carry one summarising label, since a
screen reader cannot usefully interrogate path geometry; gestures that are the only way to do something
(long-press to remove a set) must be named in the accessibility label.

**States** `[decision]` Every data-driven screen branches through `ScreenState`; every empty state uses
`EmptyState` with an action.

**Required verification matrix** `[decision, D10]`

| Axis | Device | Text size |
|---|---|---|
| Default | iPhone 16e class | default |
| Compact width | iPhone SE, 375pt | default |
| Large text | iPhone SE, 375pt | `accessibility-extra-large` |

**Standing method** `[fact, promoted to a rule by `logger-ux-polish` §5.2]` Never claim a layout defect
from an instance that has absorbed hot reloads without reproducing it cold; restart a simulator that has
been idle across sprints before claiming anything from it. Capture via `xcrun simctl io screenshot`
(device framebuffer only), never a host-display capture.

**Known unclosed items** `[fact]` Android has not been run for any recent UI sprint. Vertical scrolling on
the taller onboarding slides could not be verified end-to-end — `idb`'s synthetic swipe does not produce
gestures this runtime recognises as a scroll, proven by the same failure on untouched screens
(`onboarding-ui-redesign` §"What remains open"). Today's mid-screen cards (`ReadinessCard`,
`CheckInPrompt`, `WeekCard`) have not been audited at large text: genuinely unknown, not clean.

---

## 7. v1 vs v2

| Item | v1 / v2 | Why | What unblocks it |
|---|---|---|---|
| Five-tab IA, root-stack session + History | **v1** | D1 | — |
| Onboarding flow, presentation-only auth | **v1** | D2 | — |
| Two session entry points, template choice | **v1** | D4 | — |
| Draft recovery with explicit Resume/Discard | **v1** | D5 | — |
| Confirm-on-loss destructive actions | **v1** | D6 | — |
| Read-only History | **v1** | D7 | — |
| Today tiles → `ListRow` | **v1**, implemented | D9 | — |
| Accessibility gate + cold-start method | **v1** | D10 | — |
| `src/content/` vocabulary modules | **v1** | D11 | — |
| Undo in the logger | v2 | Replaces D6's confirmations; interacts with D5's draft persistence | An undo design sprint |
| Edit or delete a completed session | v2 | D7 | I-2 closed; order decided |
| Persistent template editor, `routines.is_active` | v2 | Plans' own Phase 5; needs clone/ownership semantics | Schema + ownership design |
| Exercise reorder, per-exercise notes UI | v2 | Store actions exist with zero call sites — features, not polish | Product decision |
| Readiness suggestion surface + "Not now" (I-17) | v2 | ADR-0002 Phase B | ADR-0002 sequencing |
| Rule versioning + suggestion audit (I-12) | v2 | ADR-0002 Phase C; must not write into an unauthenticated path | Auth, then migration |
| ~~Onboarding answers applied to `Profile`~~ | **Shipped in v1, 2026-08-09** (`feature/v1-user-data-writes`) | The answers are now written to the server-side `profiles` row on completion, and `app/settings.tsx` can edit every one of them afterwards | — |
| Interactive Progress charts, body map, Insights trends | v2 | `PhasePanel` already states these as unbuilt | Phase 3–4 |
| Offline-specific UX (banner, queue, retry) | v2 | One generic retry banner is the honest posture until it can be tested | Auth + a test path (G-9) |
| History search, filtering, paging | v2 | In-memory derivation is correct at demo scale; the seam is already right | A real account with years of data |
| Re-enterable summary | v2 | D8 | Feedback showing lifters hunt for it |
| Real Social, sharing | v2 | ADR-0001 non-goals | Product decision |
| ~~Subscriptions~~ → **a one-time purchase, shipped in v1** | **Decision reversed 2026-08-09** by `Docs/decisions/ADR-0005-monetization.md` `[decision, owner, 2026-08-09]` | This row previously deferred *subscriptions* to v2 under ADR-0001's non-goals. What shipped is deliberately **not** a subscription: a single non-consumable unlock, with logging, history, custom movements, measurements and profile free forever, and only the analysis surfaces (28/84-day Insights, Progress, Body's recovery estimate) behind it. Recorded as a reversal rather than edited away, because a non-goal that quietly becomes a feature is how a product loses track of what it decided | — |
| Component-render test framework | v2 | Standing decision, reconfirmed by every UI sprint | Explicit approval |

---

## 8. Launch gates outside this document

`[fact]` These are not UI decisions and are not closed by this document. A UI baseline is not launch
readiness.

| Gate | Status | Source |
|---|---|---|
| ~~**G-1 — no authentication path**~~ | **Closed in the client 2026-08-06** (`feature/v1-auth-and-session`). `sessionStore` (phase machine), `authActions` (ordered sign-out teardown), `app/auth/` (the real surface), `routing.ts` (the gate), `authRequired.ts` (`AuthRequiredError`). Six new Jest suites; 287/287 passing. **Sign-out made reachable 2026-08-08** (`feature/v1-signout-surface`): Account control on Today's header → `app/account` → `signOutAndTearDown`, gated by `canOfferSignOut` and confirmed per D6 (§4.10). **Password reset added 2026-08-09** (`feature/v1-password-reset`): a code-based reset mode inside the auth screen (§4.9), closing the supportability gap where a forgotten password was recoverable only by hand in the Supabase dashboard. The client-side account lifecycle — sign up, sign in, sign out, recover — is complete. Suite now 367/367 across 24. **Three limits remain, none of them UI:** nothing has run against a live Supabase project (integration lane credential-gated and skipped); reset depends on an owner-side recovery-template edit; and **deep-link capture still does not exist**, which is why reset is code-based rather than link-based. | `Docs/architecture.md` G-1; the three auth sprint records under `Docs/sprints/` |
| **I-10 — account deletion + data export** | Open, and **blocking for store submission**, not negotiable scope. **Unchanged by the sign-out (2026-08-08) or reset (2026-08-09) sprints.** Both added surfaces whose names read like erasure to a worried person — "sign out", "reset" — and both deliberately claim neither capability; `accountCopy.test.ts` and `authCopy.test.ts` assert their copy never promises deletion or export, so neither surface can quietly imply a gate it does not close. A complete account *lifecycle* is not account *control*. | `Docs/invariants.md` I-10; §4.9, §4.10 |
| **I-2 / G-2 — non-atomic `saveWorkout`** | Open. Three sequential non-transactional upserts. Restated here per I-2's own exception process: v1 ships against this path with the risk stated, not hidden. | I-2, G-2 |
| **G-4 — no observability** | Open. No crash reporting, analytics, or logging pipeline — real user feedback would arrive with no telemetry behind it. | G-4 |
| **G-7 — release tooling** | Open. ~~An `eas.json` exists uncommitted in a working tree on `feature/logger-summary-hardening` and is not merged.~~ **Corrected 2026-08-06:** that text is stale — `eas.json` is committed, with all three profiles setting `EXPO_PUBLIC_DEMO_MODE` explicitly. The gate stays open for different reasons: no build has been run, and the `preview` flip now depends on owner-only EAS variables for **both** `preview` and `production`, on the migrations actually being applied, and on the project's email-confirmation setting. Separately worth recording — `feature/release-and-summary-hardening` merged to `main` **without** delivering `Docs/release-checklist.md` or an `npm run verify` script; both are absent repo-wide and neither has any git history. | G-7; `Docs/production-posture-v1.md` §3–§4 |
| **I-1 / I-6 — RLS** | **Met** for the policies as committed (57/57 assertions, wired into CI 2026-08-04). Not the same as production being reachable. | I-1, `2026-08-04-supabase-rls-ci.md` |

---

## 9. Open questions

1. ~~**Does the `auth` step ship visible in a demo-only 1.0?**~~ **Resolved 2026-08-06**
   (`feature/v1-auth-and-session`). The step is visible exactly where accounts exist:
   `resolveOnboardingAuthHref(isAuthEnabled())` sends demo builds straight to `/onboarding/steps` and
   credentialed builds to `/auth`. The reasoning is D2's own, pointed the other way — a working sign-up
   form in a build that cannot create an account is the same dishonesty the placeholder notice existed to
   prevent. Recorded as a rule in `src/domain/routing.ts` rather than as a screen-level condition, so it
   is testable. See D2a and §4.1.
2. **Edit or delete first, in v2?** (D7) Engineer/owner, after I-2 is closed.
3. **Do Progress and Body still return to Insights once Today also links to them?** (§4.8) Deliberately
   unchanged for now; revisit with evidence.
4. **What is v1's success metric?** Explicitly deferred by ADR-0001 and still undefined. This matters for a
   launch whose stated purpose is real user feedback: without a metric, feedback has nothing to move.
5. **Is a staleness policy needed for recovered drafts?** (D5) Not designed. A week-old draft currently
   presents identically to a five-minute-old one.

---

## 10. Change log

| Date | Change | Author |
|---|---|---|
| 2026-08-05 | Initial draft. Consolidates the UI/UX baseline across onboarding, Today, template choice, the logger, the picker, the summary, History, and Insights' deeper-surfaces role. Closes three previously-open next decisions: History stays read-only (D7, from `workout-history-v1`), confirmation rather than undo (D6, from `logger-ux-polish`), and Today's tiles become rows (D9, from `today-insights-cohesion`). No code changed. | Claude (agent), for engineer/owner review |
| 2026-08-06 | `feature/v1-release-readiness`. **Summary hardening:** the rating/reflection write gained a single-flight guard, loading/disabled states on both actions, and a failure banner with a "Try again" primary — it previously had no `catch` at all, so a rejected write silently did nothing (§4.6). Failure copy is scoped to the note, since the session is already saved by then. The not-found branch and the reflection field gained `accessibilityRole="alert"` and a 1.4× scaling cap respectively. Summary remains a capture screen, not an editor — D7 and D8 unchanged. **Release tooling:** added `npm run verify` (typecheck + test, mirroring CI) and `Docs/release-checklist.md`, which records the verification commands, the EAS profiles, and the finding that a production build currently inherits `EXPO_PUBLIC_DEMO_MODE=true` by default. `eas.json` and the EAS environment were **not** changed — production configuration is gated (`CLAUDE.md`). No v2 behaviour was added. | Claude (agent) |
| 2026-08-05 | `feature/logger-v1-alignment`. **D4 corrected** from "exactly two entry points… no third path in v1" to three, documenting Exercises' "log this lift" — which has created open sessions since `ui-ux-foundation-expansion` and which D4 had wrongly named as hypothetical v2 work. This is a correction of the document to match shipped reality, **not** a change of product direction: no entry point was added, removed, or re-scoped. **L1 fixed:** the logger now clears `draftPendingReview` on entry, so Today's "Recovered session" card can no longer outlive the moment the lifter is already logging in that session (previously only Today's own Resume button cleared it, leaving the flag set for every other route in). **L2 fixed:** `workout/templates` and Exercises' "log this lift" no longer act silently when a session already exists or a recovered draft is unreviewed — both now surface an `Alert` and leave the existing session untouched on cancel. D5's "never two sessions" guard is unchanged; only its silence was. | Claude (agent) |
| 2026-08-05 | `feature/today-v1-alignment` implements D9: Today's `QuickAccess` tile row replaced by the same `ListRow` card Insights renders, both still driven by `src/content/deeperSurfaces.ts`; `QuickAccess.tsx` retired (zero remaining consumers). Also fixes a duplicate-CTA bug found during D9's audit, not part of D9 itself: `SessionCard` previously rendered unconditionally, showing a filled "Start session" button alongside the "Resume workout" / "Session in progress" continuity affordances (D3, D5) whenever a session was already active or a draft pending review — now suppressed by an `!activeWorkout` guard. | Claude (agent) |
| 2026-08-06 | `feature/v1-auth-and-session` (implementation, commit `0af00cd`) and `feature/v1-auth-session-docs` (this pass). **D2 superseded by D2a** — the account screen is real, appears only in builds with credentials, and lost its placeholder notice and "Later" skip while regaining AutoFill; it moved to `app/auth/index.tsx`, with `app/onboarding/auth.tsx` left as a `<Redirect>` so the onboarding route graph is untouched. **§4.1 updated** — `auth` is no longer one of onboarding's screens, so demo first-run is four screens and credentialed first-run is five. **§4.9 added** — the auth surface's four states, its distinct check-email state, and the copy rules pinned by `authCopy.test.ts`. **§8 G-1 closed** in the client, with its two limits (never run against a live project; no sign-out affordance, because no settings screen exists). **§8 G-7 text corrected** — the claim that `eas.json` was uncommitted and unmerged was stale. **§9 Q1 resolved.** No visual or layout change to any existing screen. | Claude (agent), for engineer/owner review |
| 2026-08-08 | `feature/v1-signout-surface` (commit `0029a7f`). **D2a extended** — the auth screen gained its counterpart: an Account control in Today's `headerRight`, on the same `isAuthEnabled()` condition as the sign-in screen itself, absent rather than disabled where there are no accounts. **§4.10 added** — the Account modal: three items and deliberately no fourth, D6-conformant confirmation (warm-ups count as logged work), a silent redirect on success, and copy constrained by test against claiming deletion or export. **§4.2 Today** gains the header note; **§2 inventory** gains the route; **§8 G-1** drops its sign-out caveat and **§8 I-10** gains a sentence saying the new surface does not close it. No section moved, no card changed, no tab added — D1 is untouched. | Claude (agent), for engineer/owner review |
| 2026-08-09 | `feature/v1-password-reset` (commit `954d075`). **D2a extended** — a "Forgot password?" control in sign-in mode only, and reset as a third mode of the same screen rather than a route. **§4.9 extended** — three modes instead of two, plus the reset stages (request → sent → code → done), the rejected-code behaviour that keeps the typed code on screen, and the two new outcome tones (`resetSent` notice, `invalidCode` error). **§2 inventory** updated to say reset is a mode, not a route. **§8 G-1** records the account lifecycle as complete in the client with its three remaining non-UI limits; **§8 I-10** restated as untouched by both recent sprints. No new route, no new surface, no change to any existing screen outside `auth/index`. | Claude (agent), for engineer/owner review |
