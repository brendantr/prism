# Sprint: ui-ux-product-polish

- **Status:** **Complete on code and static validation; simulator validation BLOCKED.** All three
  tasks met their success criteria. The changed screens were **not** rendered on a device — see
  "Simulator validation, blocked" — so no visual claim is made about them. Criteria were written
  before any code changed.
- **Date:** 2026-07-30
- **Branch:** `ui-ux-product-polish` (new branch off `main` at `c4c3e68`; no earlier UI branch reused)
- **Type:** UI/UX. Frontend only. No schema, migration, RLS, or repository-contract change.
- **Predecessors:** [`2026-07-29-ui-ux-foundation-verification`](2026-07-29-ui-ux-foundation-verification.md)
  (UI), [`2026-07-30-security-backend-foundation`](2026-07-30-security-backend-foundation.md)
  (backend, merged PR #10)

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

## Simulator validation, blocked

**The changed screens were not rendered on a device this sprint, and nothing here claims they were.**

The app was rebuilt-free (no native change, so the existing build applies) and launched on the
iPhone 17 Pro simulator, but never loaded a JS bundle: the dev client showed its splash, Metro logged
no bundle request, and `idb ui describe-all` returned a single `Application` node throughout. The
documented recovery from `README.md` was applied in full — `simctl shutdown all`, killing
`CoreSimulatorService`, a clean boot waited out with `bootstatus`, then relaunch, then the dev-client
deep link (`app.prism.trainer://expo-development-client/?url=…`). None of it produced a bundle
request.

This is **environment instability, not a code fault**, and it is the same class of problem the two
previous sprints hit and documented. It was not worth more of the sprint's time, and it is recorded
rather than worked around or quietly dropped.

**What this means for confidence:**

- **UX-1 is well covered without a device.** Its behaviour change is in the store and is asserted by
  5 unit tests, including the finish-twice retry path.
- **UX-3 changed no runtime behaviour**, so there is nothing to see.
- **UX-2 is the exposure.** Its ready-path edits are structural (`<Screen eyebrow= title=>` became
  `<Screen {...header}>`, which is equivalent) and typecheck plus a clean iOS bundle cover the
  mechanics — but *how the new loading and error states actually look* is unverified. The centred
  layout inside `Screen`'s non-scrolling branch in particular deserves eyes before this is trusted.

**To close it:** launch via `npx expo run:ios` — which is what has reliably worked in this repo, since
it owns the Metro handshake — then visit each of the seven screens, and force the error branch by
temporarily throwing inside `trainingStore.load`.

## Final validation

| Check | Result |
| --- | --- |
| `npm run typecheck` | Pass, exit 0 |
| `npm test` | Pass — **103/103, 9 suites** (was 98/8 at branch point) |
| `npx expo export --platform ios` | Pass — single iOS bundle, 5.1 MB |
| No client-side ownership gate | `grep` returns nothing |
| Render the changed screens | **Blocked** — see above |
| Working tree | Clean |

## What remains open

1. **Simulator validation of UX-2** — the one real gap this sprint leaves. See above.
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
