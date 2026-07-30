# Sprint: ui-ux-product-polish

- **Status:** In progress. Success criteria below were written before any code changed.
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

**Status:** ☐ Not started

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

---

### UX-2 — Honest loading, error and empty states on every data-driven screen

**Status:** ☐ Not started

**Success criteria:**

1. A shared primitive owns the three states, so they look and behave identically everywhere.
2. All six screens missing load handling adopt it.
3. While loading, a screen never claims a count or an emptiness it has not verified.
4. On error, the screen says so and offers a retry — it never renders as "empty".
5. The screen's title and chrome stay put across state changes, so nothing jumps.

**Out of scope:** per-screen bespoke skeletons; offline detection//queueing (needs backend work).

---

### UX-3 — Keep the UI free of fabricated ownership

**Status:** ☐ Not started

**Success criteria:**

1. Re-verified that no UI authorization gate reads client-side ownership.
2. Every remaining site that supplies a `profileId` is explicitly marked as non-authoritative local
   draft state, so a future reader does not mistake it for a permission decision.
3. No new client-side ownership assumption is introduced by UX-1 or UX-2.

**Out of scope:** removing `profileId` from the domain type — demo mode legitimately needs it, and the
type mirrors the schema.

---

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
