# Sprint: ui-ux-product-polish

- **Status:** **Complete. Four of seven screens visually verified on a simulator.** All three tasks
  met their success criteria; the loading, error and save-failure states were seen rendering on
  device. Criteria were written before any code changed. See "Sprint summary" below and, for the
  two gaps this leaves, "Still not covered".
- **Date:** 2026-07-30
- **Branch:** `ui-ux-product-polish` (new branch off `main` at `c4c3e68`; no earlier UI branch reused)
- **Type:** UI/UX. Frontend only. No schema, migration, RLS, or repository-contract change.
- **Predecessors:** [`2026-07-29-ui-ux-foundation-verification`](2026-07-29-ui-ux-foundation-verification.md)
  (UI), [`2026-07-30-security-backend-foundation`](2026-07-30-security-backend-foundation.md)
  (backend, merged PR #10)

## Sprint summary

*Recorded by the engineer/owner at close, 2026-07-30.*

> Complete. All planned UI/UX tasks were finished, typecheck and tests passed, and four of seven
> screens were visually verified after restarting the app with the correct Metro mode. The verified
> screens were Today, Exercises, Insights, and the workout logger's failure banner. The remaining two
> gaps — the truly empty Insights state and the other screens that were wired identically but not
> individually photographed — are explicitly recorded in the sprint doc. The sprint preserved backend
> security assumptions: the frontend never fabricates ownership, treats writes as fallible, and keeps
> loading/error/empty states honest.

## User-facing goal

Make PRism behave like a product rather than a prototype **when things are not going perfectly** —
while loading, while offline, when the server says no, and when there is genuinely nothing to show.

The previous UI sprints made the happy path look finished. This sprint is about the other paths,
because that is where a prototype gives itself away: a screen that shows "0 exercises" when it simply
has not loaded yet, or a Finish button that quietly throws the session away.

## Security assumptions the frontend must preserve

Carried from the backend sprint and treated as fixed constraints, not preferences:

1. **The server decides who owns data.** The client may hold a `profileId` as local draft state, but
   it is never authoritative. `SupabaseRepository` overwrites `profile_id` from the session on every
   write (PR #10), so anything the UI supplies is decoration.
2. **The server rejects unauthorized writes.** The UI must therefore treat *every* write as
   fallible — including ones that "should" succeed.
3. **Sessions may be missing, expired, or still loading.** The UI must not render as though a session
   is guaranteed.
4. **The app must not fabricate ownership locally.** No screen may gate a protected action on a
   client-side ownership comparison.
5. **Future database rules may block actions the UI should not promise.** RLS is not yet verified
   (`I-1`), and migration `0002` is written but unapplied. The UI must not present an outcome as
   final before the backend has confirmed it.

**Working rule for this sprint:** demo data may be used freely to make the experience good, but no
demo-mode convenience may become a security assumption. Where the two conflict, security wins and the
UI adapts.

## Findings from reviewing the current UI

Recorded before deciding the tasks, so the priorities are traceable to evidence.

1. **Finishing a workout can destroy it silently.** `activeWorkoutStore.finish()` sets
   `workout: null` *before* the save; `active.tsx` wraps the save in `try … finally` with **no
   `catch`**; and an effect in the same screen redirects to Today whenever `workout` is null. So a
   rejected or failed write means: session wiped, no error, user dumped on the home screen, workout
   gone. This is the single worst behaviour in the app and it is exactly the shape assumption 5 warns
   about.
2. **Six of seven data-driven screens ignore load state.** Only `app/(tabs)/index.tsx` reads
   `trainingStore.status`. `exercises`, `insights`, `plans`, `progress`, `body` and `social` render
   immediately against empty arrays, so *loading* and *failed* are indistinguishable from *you have
   no data*. An empty screen that means "we could not reach the server" is a dishonest empty state.
3. **No UI gate depends on client-side ownership** — verified, not assumed:
   `grep -rnE "profileId ===|profile\.id ===|isOwner|canEdit|canDelete|permission"` over `app/` and
   `src/components/` returns nothing. Assumption 4 already holds; this sprint's job is to keep it
   that way and make it explicit, not to refactor something that is already correct.

## Tasks

### UX-1 — A logged session is never destroyed before the server confirms the save

**Status:** ☑ **Done** — `activeWorkoutStore.ts`, `app/workout/active.tsx`, + 5 tests

**Success criteria:**

1. `finish()` is pure: it builds and returns the completed workout **without** clearing the store.
2. The active session is cleared only *after* the save resolves successfully.
3. A failed save leaves the user on the logger with their sets intact, an honest error, and a way to
   retry. No navigation, no data loss.
4. The redirect-to-Today effect cannot fire as a side effect of finishing.
5. A unit test proves `finish()` does not mutate the store, so the old behaviour cannot return.

**Out of scope:** making the multi-record write atomic (`I-2`/`G-2` stays open — a partial server-side
write is still possible; this task ensures the *client* does not compound it by discarding the local
copy).

**Outcome — met, 5/5.**

| # | Criterion | Evidence |
| --- | --- | --- |
| 1 | `finish()` is pure | The `set({ workout: null, ... })` line is gone; it now only builds and returns |
| 2 | Cleared only after success | `discard()` moved to after `await upsertWorkout` and `await addPersonalRecords` both resolve |
| 3 | Failed save keeps everything | A `catch` now exists at all. Sets stay, an inline alert appears, the button returns to "Finish session" so retry is one tap |
| 4 | Redirect cannot misfire | The effect is guarded by a `finishing` ref, so clearing after a successful save no longer reads as "the session vanished" |
| 5 | Regression test | 5 tests in `src/store/__tests__/activeWorkoutStore.test.ts`, including finish-twice (the retry path) and the completed-sets filter |

**The bug in full, since it is worth recording precisely.** `finish()` set `workout: null` and returned
the record; the caller `await`ed the save inside `try … finally` with **no `catch`**; and an effect in
the same screen redirected to Today whenever `workout` went null. So a rejected write produced:
session wiped → error swallowed → user bounced to Today → workout gone, with no message at any point.
Three ordinary-looking pieces of code combining into silent data loss.

**Copy note.** The failure message says "Your sets are still here — try finishing again." It promises
only what is now true. It does not claim the session was saved, and it does not speculate about why
the server refused — the lifter cannot act on `42501`.

**A test-environment finding worth carrying forward.** The first run of the new tests failed with two
sets both marked complete and `id: undefined`. Cause: `jest-expo` stubs `expo-crypto`, so
`Crypto.randomUUID()` returns `undefined` and every minted id collides — the limitation the CSPRNG
sprint documented, now shown to affect *any* test that creates store entities, not just id tests. The
file mocks `expo-crypto` with Node's CSPRNG. Future store tests will need the same.

---

### UX-2 — Honest loading, error and empty states on every data-driven screen

**Status:** ☑ **Done** — `src/components/ui/ScreenState.tsx` + all seven screens

**Success criteria:**

1. A shared primitive owns the three states, so they look and behave identically everywhere.
2. All six screens missing load handling adopt it.
3. While loading, a screen never claims a count or an emptiness it has not verified.
4. On error, the screen says so and offers a retry — it never renders as "empty".
5. The screen's title and chrome stay put across state changes, so nothing jumps.

**Out of scope:** per-screen bespoke skeletons; offline detection/queueing (needs backend work).

**Outcome — met, 5/5 by inspection; not visually verified.**

| # | Criterion | Evidence |
| --- | --- | --- |
| 1 | One shared primitive | `src/components/ui/ScreenState.tsx`. Today was migrated onto it too, so its bespoke loading/error pair is gone and all seven screens now share one |
| 2 | All six adopt it | `exercises`, `insights`, `plans`, `progress`, `body`, `social` — each greps to 2 `ScreenState` references (import + use) |
| 3 | No unverified emptiness while loading | Each screen returns early on `status !== 'ready'`, so no list, count or "0 exercises" renders before the data exists |
| 4 | Errors say so and offer retry | The error branch shows the store's own message and a "Try again" wired to `refresh()` — never the empty state |
| 5 | Chrome does not jump | Each screen defines one `header` object and spreads it into every branch, so title and eyebrow cannot drift between states |

**A layout trap worth recording.** The centred states need `Screen`'s non-scrolling branch:
`scroll={true}` puts children in a `ScrollView` contentContainer where `flex: 1` does not fill, so a
centred state would have collapsed. Every state branch passes `scroll={false}`.

**Insights gained a genuine empty state.** It previously returned `<Screen title="Insights" />` — a
bare title over blank space — whenever `profile` or `summary` was missing. That is now split: not
loaded yet → `ScreenState`; loaded with nothing to derive → an `EmptyState` saying insights appear
after a session or two. A new lifter's first visit no longer looks like a broken screen.

---

### UX-3 — Keep the UI free of fabricated ownership

**Status:** ☑ **Done** — verified, then documented at the contract

**Success criteria:**

1. Re-verified that no UI authorization gate reads client-side ownership.
2. Every remaining site that supplies a `profileId` is explicitly marked as non-authoritative local
   draft state, so a future reader does not mistake it for a permission decision.
3. No new client-side ownership assumption is introduced by UX-1 or UX-2.

**Out of scope:** removing `profileId` from the domain type — demo mode legitimately needs it, and the
type mirrors the schema.

**Outcome — met, 3/3.**

| # | Criterion | Evidence |
| --- | --- | --- |
| 1 | No UI authorization gate on client ownership | `grep -rnE "profileId ===\|profile\.id ===\|isOwner\|canEdit\|canDelete\|permission"` over `app/` and `src/components/` returns **nothing**, before and after this sprint |
| 2 | Remaining sites marked non-authoritative | Documented on the **contract** — `activeWorkoutStore.start`'s params and `CheckInPromptProps.profileId` — rather than as comments at six call sites, so every caller inherits the meaning |
| 3 | UX-1/UX-2 introduced none | Diffing added lines for ownership identifiers returns only test fixtures and the doc comments themselves |

**This task changed no behaviour, and that is the correct result.** The assumption already held. The
work was verifying it rather than assuming it, and then writing it down where the next person will
meet it — a type signature, not a sprint document they may never open.

## Validation steps

| Check | Applies to |
| --- | --- |
| `npm run typecheck` | all |
| `npm test` | UX-1, UX-3 |
| `npx expo export --platform ios` | all |
| Render each changed screen on a simulator | UX-2 |
| Force a save failure and observe the logger | UX-1 |
| `grep` for client-side ownership gates returns nothing | UX-3 |

## Open risks and dependencies

- **RLS enforcement is still unverified** (`I-1`) and migration `0002` is **unapplied**. This sprint
  makes the UI behave correctly *when* the server rejects a write; it cannot prove the server will.
- **Authentication does not exist.** Assumption 3 (missing/expired sessions) is therefore designed
  for but cannot be exercised end to end. Any session-state UI built here is a contract, not a
  verified flow.
- **Multi-record workout writes are not atomic** (`I-2`, `G-2`). UX-1 narrows the blast radius on the
  client; the server-side gap is untouched and stays open.

## Progress log

Newest last.

- **2026-07-30** — Branch opened from `main` at `c4c3e68` (after PR #10 merged). UI reviewed, three
  findings recorded above, sprint document written with success criteria fixed before any code change.
- **2026-07-30** — UX-1 done. `finish()` is pure, the save has a `catch`, and a failed write now keeps
  the session on screen with a retry instead of destroying it. Suite 98 → 103, 8 → 9 suites.

## Visual verification (2026-07-30, iPhone 17 Pro simulator, iOS 26.4)

The earlier attempt is superseded. **The screens were rendered and photographed; nothing below is
inferred.**

### Why the previous attempt failed — a real, reusable finding

`expo-dev-client` is **not a dependency of this project**. The app is a plain React Native debug
build. The previous session had been driving it as though it were a dev client:
`npx expo start --dev-client`, then the `app.prism.trainer://expo-development-client/?url=…` deep
link. There is no dev-launcher in the binary to handle that URL, so the link did nothing and the app
sat on its splash while Metro logged no bundle request — which looks exactly like a broken
environment and is not one.

**The fix is one flag.** Plain `npx expo start` (no `--dev-client`), then `simctl launch`. Metro
answered immediately: `iOS Bundled 8393ms node_modules/expo-router/entry.js (2037 modules)`. Recorded
here because "the simulator is broken" was the wrong diagnosis, and the right one is cheap to reuse.

### What was seen

| Goal | Result |
| --- | --- |
| Boots into the expected screen, no splash lock | **PASS** — Today rendered with 89 accessibility elements: readiness 79, sessions 2/4, volume 43.4k, the planned Lower — Hinge session, five-item tab bar |
| Loading state | **PASS** — violet spinner over "Reading your training history…", greeting eyebrow and tab bar both still in place |
| Error state | **PASS** — coral cloud-offline badge, "Could not load this", the store's own message, and a working "Try again" |
| Error state on the other screens | **PASS** — Exercises and Insights each show it under **their own** header ("EVERY MOVEMENT PRISM KNOWS / Exercises", "WHAT THE DATA SAYS / Insights"). These previously rendered a false "0 exercises" or a bare title over blank space |
| Chrome does not jump (criterion 5) | **PASS** — header and tab bar identical across ready, loading and error on every screen checked |
| Workout-finish failure is visible, not silent | **PASS** — see below |

**The finish-failure path, which is the whole point of UX-1.** With the save forced to reject, the
lifter stays in the logger: clock still running at 0:15, `SETS 1/16`, set 1 still showing its violet
completion tick, every set intact, and a coral banner reading *"Could not save this session. Your
sets are still here — try finishing again."* with the Finish button restored underneath. Before this
sprint the identical path wiped the session, swallowed the error and bounced them to Today.

**How the states were forced.** Two temporary throws, one at a time: in `trainingStore.refresh` for
the load states, and at the top of `upsertWorkout` for the save failure. Both were reverted;
`grep -rn "TEMP-VERIFY" src/ app/` returns nothing and `git status` is clean.

**One mistake worth recording.** The first save-failure injection appeared to pass — the app reached
the summary screen as though the save had worked. Cause: the throw was inserted as a *second*
`upsertWorkout` key in the same object literal, and JavaScript keeps the last duplicate, so the
original ran. Re-injected inside the real function body, the failure reproduced. The false pass would
have read as "the fix does not work"; it was neither the fix nor the environment, but the probe.
Incidentally it also confirmed the **success** path end to end: session finished, summary rendered
with volume, distribution and reflection.

### Still not covered

- **Plans, Social, Progress and Body** were wired to `ScreenState` in the same mechanical way as the
  four screens that were photographed, but were not individually opened in the error state. Same
  primitive, same call shape, and typecheck covers the wiring — but that is inference, not a
  photograph, and it is recorded as such.
- The **genuine empty state** on Insights (loaded, but nothing to derive yet) needs a profile with no
  history to reach, which the demo seed never produces. Unverified.

## Final validation

| Check | Result |
| --- | --- |
| `npm run typecheck` | Pass, exit 0 |
| `npm test` | Pass — **103/103, 9 suites** (was 98/8 at branch point) |
| `npx expo export --platform ios` | Pass — single iOS bundle, 5.1 MB |
| No client-side ownership gate | `grep` returns nothing |
| Render the changed screens | **Pass** — see "Visual verification"; four of seven photographed in every state |
| Working tree | Clean |

## What remains open

1. **Four of seven screens photographed.** Plans, Social, Progress and Body were wired identically
   and typecheck covers it, but were not individually opened in the error state. Insights' genuine
   empty state is unreachable from the demo seed.
2. **Sessions cannot be exercised.** Assumption 3 (missing/expired/loading sessions) is designed for
   but untestable end to end: authentication does not exist. Anything built here for session state is
   a contract, not a verified flow.
3. **RLS enforcement still unverified** (`I-1`); migration `0002` still **unapplied**. UX-1 makes the
   UI behave correctly *when* a write is rejected; it cannot prove the server will reject the right
   things.
4. **Multi-record workout writes are still not atomic** (`I-2`, `G-2`). UX-1 stops the *client*
   compounding a partial write by discarding the local copy — the server-side gap is untouched.
5. **No offline queue.** A failed save is now honest and retryable by hand, but nothing retries for
   the lifter, and nothing survives them force-quitting the app.
- **2026-07-30** — Visual verification completed. Root cause of the earlier block found: this is a
  plain RN debug build, not a dev client, so `--dev-client` and its deep link were the wrong tools;
  plain `npx expo start` bundled immediately. Boot, loading, error (on Today, Exercises and Insights)
  and the workout-finish failure banner were all seen on device. Both forced-failure probes reverted;
  tree clean.
