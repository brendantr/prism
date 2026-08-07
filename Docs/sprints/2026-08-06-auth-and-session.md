# Sprint: v1 authentication and session

## 1. Document status

- **Date:** 2026-08-06
- **Branches:** `feature/v1-auth-and-session` (implementation, commit `0af00cd`), cut from
  `feature/v1-production-posture` rather than `main` so it would inherit the demo-fallback throw;
  `feature/v1-auth-session-docs` (this record and the guardrail updates). One branch, one purpose, per
  `Docs/invariants.md` I-14.
- **Owner:** Engineer/owner.
- **Labelling** per I-15: `[fact]` / `[decision]` / `[assumption]` / `[open question]`.
- **Provenance** `[fact]`: as of this writing `main` is at `ecfd1f1` and contains neither the
  production-posture commit (`5c18d93`) nor this sprint's commit (`0af00cd`). Everything below describes
  branch state.

---

## 2. Scope

Close `Docs/architecture.md` **G-1** — the absence of any authentication path — for v1: sign-up,
sign-in, session state, the route gate, and sign-out teardown.

**What was deliberately not in scope, because it already existed** `[fact]`. Session-at-rest was a solved
problem in this repository before the sprint started: `src/data/supabase/secureStorage.ts` is a chunked
Keychain/Keystore adapter that writes its chunk-count marker last as a commit marker, so a half-written
session reads as "signed out" rather than as a corrupt one; the client was already configured with
`storage: secureSessionStorage`, `persistSession: true` and `autoRefreshToken: true`; and two suites
already drove the real Supabase client through a real local session lifecycle. The missing piece was
narrower than "auth" — **token acquisition, app-level session state, a route gate, and sign-out** — and
the sprint was scoped to exactly that.

---

## 3. Guardrails that shaped the implementation

Each of these forced a specific design, not just a constraint to check afterwards.

- **Layering** (`Docs/architecture.md`: `app/` → stores → `src/data`, one direction). This is why
  `AuthRequiredError` lives in `src/data/authRequired.ts` and is *interpreted* by stores. The two
  alternatives both break something: passing a user id into repository methods makes the client assert
  ownership (I-6), and having a repository read `sessionStore` inverts the arrow.
- **I-6 — the client never asserts identity.** No repository signature changed. `sessionStore.userId`
  exists for display and test assertions and is never passed into a query.
- **I-1 — RLS is the authorization boundary.** No migration, no policy, no schema change; the
  57-assertion isolation suite is untouched and still runs in CI.
- **D2's reversal clause** (`Docs/ui-ux-foundation-v1.md`) required copy, skip semantics, the completion
  gate and the autofill attributes to change **as one unit**. A partial reversal — a working form still
  telling the lifter accounts are not connected — is the failure mode, so the absence of
  `AUTH.placeholderNotice` and `AUTH.skipLabel` is asserted by a test rather than trusted.
- **Production posture** (`Docs/production-posture-v1.md` §5) required the misconfigured build to stay
  loud. That is why the session phase resolves to `'disabled'` there rather than `'unauthenticated'`:
  the gate must not divert a build whose real problem is configuration.
- **No component-test tooling**, by decision (`2026-08-01-onboarding-ui-redesign.md` Decision 6). This is
  *why* the route gate is a pure function in `src/domain/routing.ts` rather than logic inside an effect —
  a rule left in a component would have had no coverage at all.

---

## 4. Implementation summary

**New**

| File | What it does |
|---|---|
| `src/store/sessionStore.ts` | Four-phase machine; `initialize`, `signIn`, `signUp`, `markAuthenticated`/`markUnauthenticated`; one process-lifetime `onAuthStateChange` subscription |
| `src/store/authActions.ts` | `signOutAndTearDown` — the ordered teardown, above all three stores so no import cycle forms |
| `src/data/authRequired.ts` | `AuthRequiredError` + `isAuthRequiredError`, with a discriminant field because `instanceof` is unreliable across Jest's module registry |
| `src/data/supabase/auth.ts` | The only caller of Supabase's auth API; `isAuthEnabled` gates everything else |
| `src/domain/authErrors.ts` | `AuthFailure` union and `toAuthFailure` — rules, no copy |
| `src/domain/routing.ts` | `resolveInitialRoute`, `resolveOnboardingAuthHref` — pure, enumerable |
| `app/auth/index.tsx` | The real sign-in/sign-up surface, promoted out of onboarding |

**Modified** — `app/_layout.tsx` (combined gate, phase-keyed load, single redirect effect),
`app/onboarding/auth.tsx` (now a `<Redirect>`), `src/data/repository.ts` (`uid()`, `resetRepository()`),
`src/store/trainingStore.ts` (`INITIAL_DATA`, `reset()`, auth-error discrimination),
`src/store/activeWorkoutStore.ts` (`DraftOwner`, ownership-checked `hydrate`),
`src/content/onboarding.ts` (D2 reversal, outcome copy and tone),
`src/data/supabase/client.ts` (`detectSessionInUrl` documented),
`src/data/__tests__/ownership.test.ts` (mock updated to `getSession`).

### 4.1 Four decisions worth their own note

**No `'error'` phase** `[decision]`. A failed session *restore* is behaviourally identical to having no
session — you show sign-in either way — so an error phase would be a state with no distinct UI and no
clear exit. It would also contradict the storage layer, which already fails closed. Transient operation
failures are form state (`lastFailure`), not app state.

**`'disabled'` is a first-class terminal state, not an absence** `[decision]`. It exists so the root gate
has one uniform condition to wait on. Leaving demo at `'unknown'` would hang the splash forever;
branching the gate on `DEMO_MODE` separately would put the mode check in two places.

**`getSession()` replaced `getUser()`** `[decision]`. `getUser()` round-trips to `/auth/v1/user` on every
call, and `uid()` is reached by six of the eight repository calls `refresh()` fires in parallel — six
requests before a single row is fetched. RLS evaluates the access token server-side regardless, so the
second client-side validation proved nothing the query would not.

**The phase flips last, by construction** `[decision]`. The route gate redirects on phase, so making it
the final step of teardown means navigation cannot precede an empty store. Moving it earlier silently
removes the guarantee, which is why a test observes the store's contents at the instant it flips rather
than trusting the comment.

---

## 5. Testing

`[fact]` **287 tests, 20 suites, all passing** (`npx jest`). `npx tsc --noEmit` exits 0.
`npm run test:integration` reports **5 tests skipped** — the lane is gated on
`PRISM_INTEGRATION_SUPABASE_*` and no credentials were created or invented.

| Suite | Covers |
|---|---|
| `src/domain/__tests__/authErrors.test.ts` | Code mapping; network preferred over the status-code branches so a dropped connection is never reported as a bad password; unrecognised shapes → `unknown`, never a passed-through message |
| `src/domain/__tests__/routing.test.ts` | Gate truth table across onboarding × phase × segment; both loop guards; a stability property proving re-running the gate on its own result never redirects again |
| `src/store/__tests__/sessionStore.test.ts` | Restore paths; half-written session → `'unauthenticated'`, not an error; `SIGNED_OUT` → `sessionExpired`; idempotent initialise; sign-up not authenticating under confirmation; demo constructing no client |
| `src/store/__tests__/authActions.test.ts` | Teardown; the store already empty when the phase flips; onboarding flag surviving; draft-ownership discard incl. the `DEMO_PROFILE_ID` case; auth-vs-data error routing |
| `src/content/__tests__/authCopy.test.ts` | No enumeration wording; no env var or internal identifier; no diagnostic/clinical language (I-8); D2's reversal complete rather than partial |
| `src/data/__tests__/authPosture.test.ts` | Demo / misconfigured / configured startup, each re-importing the module graph under a different environment; misconfigured build still throws its own message |

**Not covered, and not claimed** `[fact]`: the auth screen's rendering, and the gate as actually executed
by Expo Router. No component-test tooling exists, by decision. **No on-device verification was
performed** — `Docs/agents.md` requires cold-start verification before any rendering claim, and none is
made here.

---

## 6. Findings during implementation

- **A failing test caught a real gap** `[fact]`. `signOutAndTearDown` awaited the remote sign-out
  unguarded, so a rejection would abort teardown before the stores were cleared — leaving a lifter signed
  in on a shared phone because the network was down. Now wrapped; `auth.signOut` swallows its own errors
  too, and a test drives a rejection to prove teardown still completes.
- **An anticipated fix was unnecessary** `[fact]`. `activeWorkoutStore.start()` already stamped
  `profileId` from the loaded profile at all three call sites, so no change was made. Worth recording
  because the plan expected one.
- **A tension with an existing comment, handled rather than ignored** `[fact]`. `start()` warns that
  `profileId` must not be read back as a permission or used to gate UI. The new `hydrate()` check reads
  it. The comment was extended rather than contradicted: the check discards *local* state, grants no
  access, gates no UI — it can throw a draft away and can never let one through.
- **Typed routes are invisible to CI** `[fact]`. `.expo/types/router.d.ts` is gitignored and CI has no
  typegen step, so a stale local copy rejected the new `/auth` route while CI would have passed. It was
  regenerated rather than cast away with `as never`.

---

## 7. Explicitly out of scope

`[fact]` None of these were touched, and none is advanced by this sprint:

- **I-2 / G-2** — `saveWorkout` is still three sequential non-transactional upserts. Its severity rose:
  a partial write now corrupts a real account's history rather than resettable demo data.
- **I-10** — account deletion and data export. Blocking for store submission; now reachable by real users
  rather than theoretical. Its own branch.
- **`Docs/release-checklist.md` and `npm run verify`** — both absent repo-wide with no git history,
  despite `feature/release-and-summary-hardening` having merged. Their own sprint.
- **Deep-link session capture** — `detectSessionInUrl` stays false; see §8 and
  `Docs/production-posture-v1.md` §4.1.
- **Password reset, OAuth/social sign-in, email change, biometric unlock, multi-device session
  management, offline handling (G-9), observability (G-4).**

---

## 8. Known incompleteness

**There is no sign-out affordance** `[fact]`. `signOutAndTearDown` is implemented, ordered and tested,
and nothing in the UI calls it, because the app has no settings screen and adding one would have been an
unplanned surface outside this sprint's scope. A lifter can sign in and cannot sign out. Owner's call: a
minimal control on an existing surface, or a settings sprint.

**Email confirmation is an assumption, not a verified project setting** `[assumption]`. The sprint assumes
it is ON (Supabase's default) and implements the honest consequence — sign-up reports "check your email"
rather than pretending to sign in. If it is off, the same code path signs the user straight in.

**Nothing has run against a live Supabase project** `[fact]`. See §5.

---

## 9. Validation evidence

Per `Docs/agents.md` "Required handoff" — commands run and their actual results:

| Command | Result |
|---|---|
| `npx tsc --noEmit` | Exit 0, clean |
| `npx jest` | 20 suites, 287 tests, all passing |
| `npm run test:integration` | 1 suite, 5 tests, **skipped** (credential-gated) |
| On-device cold start | **Not run.** No rendering or layout claim is made in this record. |

**Changed files:** 13 new, 8 modified — enumerated in §4.

---

## 10. The exact next decision

**Does Supabase email confirmation stay ON?** It is an owner decision (a project setting, behind
`CLAUDE.md`'s approval gate), it is the cheapest of the four open decisions, and it blocks the most: it
determines whether the current manual-sign-in flow is the shipping flow, and whether a password-reset
path is nearly free or a separate problem. The remaining three — password reset in v1 or v1.x, where
sign-out lives, and I-10 — are stated in `Docs/production-posture-v1.md` §7.
