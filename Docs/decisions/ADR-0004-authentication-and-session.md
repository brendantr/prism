# ADR-0004: Email/password authentication with a Keychain-backed session, and no auth at all in demo builds

- Status: Accepted
- Date: 2026-08-06
- Sprint: v1-auth-and-session (`Docs/sprints/2026-08-06-auth-and-session.md`)
- Decision owner: Engineer/owner
- Supersedes: `Docs/ui-ux-foundation-v1.md` D2 (the presentation-only account screen), replaced by D2a
- Relates to: `Docs/production-posture-v1.md` (this ADR removes its stated blocker), `Docs/architecture.md` G-1, `Docs/invariants.md` I-1, I-6, I-19

## Context

`SupabaseRepository` was written as though a session existed and could not obtain one. `uid()` was the
first call inside ten of its methods; ownership on write was derived from it rather than from the
caller's object; `deleteWorkout` scoped by it as defence behind RLS. The schema assumed it too —
`profiles.id` references `auth.users(id) on delete cascade`, and a `handle_new_user` trigger creates the
profile row on signup. Nothing in the repository could produce a session, so `uid()` threw
`'Not signed in.'`, `trainingStore.refresh()` flattened that into the same `status: 'error'` as a dropped
connection, and every screen rendered "Could not load this" behind a Retry that could never succeed. Demo
mode was the only mode a real person could run, and `Docs/architecture.md` recorded this as G-1, the
single most material gap.

That mattered because `Docs/production-posture-v1.md` had already decided v1 ships to real users against a
real Supabase project. The posture was wired and correct and blocked on exactly one thing.

Two facts narrowed the work. Session-at-rest was already solved: `secureStorage.ts` is a chunked
Keychain/Keystore adapter whose commit marker is written last, so an interrupted write reads as "signed
out" rather than as a truncated token, and the client was already configured for `persistSession` and
`autoRefreshToken` against it. And the app already had a complete sign-up/sign-in *screen* that
deliberately did nothing, with a notice saying so. What was missing was narrower than "authentication":
token acquisition, app-level session state, a route gate, and sign-out.

## Decision

**1. Email and password, not magic links or OAuth.** The screen, the validation rules
(`src/domain/authValidation.ts`, length-only password policy) and the copy already existed for this shape.
Magic links and OAuth both require deep-link handling, which this repository does not have (see decision
6) and which would have expanded the sprint past its scope.

**2. The session stays in the existing Keychain adapter; the client configuration is not touched.** It is
already hardened and already tested, and re-solving it would have risked a regression in the one part of
the auth story that was known-good.

**3. Session state lives in its own store with a four-phase machine** — `unknown` / `unauthenticated` /
`authenticated` / `disabled` — following `onboardingStore`'s precedent rather than being merged into
`trainingStore`, which is a read model with a re-entry guard that session transitions would contend with.
**There is deliberately no `'error'` phase:** a failed restore is behaviourally identical to no session,
so an error phase would be a state with no distinct UI and no exit, and it would contradict the storage
layer's fail-closed contract. **`'disabled'` is a first-class terminal state**, so the root gate has one
uniform condition to wait on rather than a second, separate check for build mode.

**4. `AuthRequiredError` is thrown by `src/data` and interpreted by stores.** This is the only option that
preserves the one-directional layering `Docs/architecture.md` fixes. Passing a user id into repository
methods would make the client assert ownership, against I-6; having a repository read `sessionStore` would
invert the dependency arrow. `uid()` also moved from `auth.getUser()` to `auth.getSession()`: the former
round-trips to the auth server on every call, and six of the eight parallel calls in one `refresh()` land
there — RLS evaluates the token server-side regardless, so the second validation proved nothing.

**5. Demo builds have no authentication at all.** `isAuthEnabled()` is false, the phase resolves to
`'disabled'` without constructing a client or reading the Keychain, and the onboarding account step is
skipped entirely. The same branch covers the misconfigured build (demo off, credentials absent) —
deliberately, so that build reaches `getRepository()`'s loud `SUPABASE_MISCONFIGURED_MESSAGE` instead of
being diverted to a sign-in form that cannot work. This also answers
`Docs/ui-ux-foundation-v1.md` §9 open question 1: the account step is visible exactly where accounts exist.

**6. Email confirmation is assumed ON, and confirmation ends in a manual sign-in.** Sign-up is not treated
as sign-in — Supabase returns no session until the address is verified, so `sessionStore.signUp` reports a
`checkEmail` outcome and the lifter stays put. `detectSessionInUrl` remains `false`: it reads
`window.location`, a web mechanism, and no `expo-linking` import or `Linking` listener exists anywhere in
`app/` or `src/`, so setting it true would imply a capture path that does not exist.

**7. Sign-out has an ordered teardown contract**, with the phase flip last so that navigation cannot
precede an empty store. Recorded as `Docs/invariants.md` **I-19**.

## Alternatives considered

- **Wire the existing onboarding screen in place, rather than promoting it to `app/auth/`.** Rejected: a
  returning lifter on a fresh install has already onboarded, and routing them through the first-run stack
  to sign in gives them a back gesture into a form they finished months ago.
- **Add an `'error'` phase for restore failures.** Rejected as described in decision 3 — no screen, no exit.
- **Namespace the workout draft key per user (`…draft.v1.<uid>`).** Rejected in favour of checking the
  `profileId` already inside the draft: key namespacing accumulates orphan drafts indefinitely and needs a
  migration for the existing unscoped key, while the ownership check needs neither.
- **Set `detectSessionInUrl: true` anyway, in anticipation.** Rejected: it would change nothing on device
  and would imply a capability the app does not have.
- **Include password reset.** Deferred, with reservations recorded in §7 of the posture doc — a v1 with
  real accounts and no reset is a support dead end.

## Consequences

**Positive**

- Demo builds remain exactly as they were: no client, no Keychain, no network, `DEMO_PROFILE_ID`, and the
  full existing test suite runs on that path untouched.
- The misconfigured build stays loud — and stays loud *because* auth resolves to `'disabled'` rather than
  intercepting it.
- Production builds reach Supabase data only with a session, and "no session" is a redirect rather than an
  unrecoverable error screen.
- Sign-out has a tested contract, and adding a new user-scoped store now has an explicit obligation
  attached (I-19) rather than being a thing someone has to remember.

**Negative, or accepted**

- **No sign-out control exists in the UI**, because the app has no settings screen. The teardown is
  reachable only in code. A lifter can sign in and cannot sign out.
- **Confirmation requires a manual round trip** — open the link, return to the app, sign in.
- **No password reset**, so a forgotten password is recoverable only by hand in the Supabase dashboard.
- **Nothing has been exercised against a live Supabase project.** The integration lane is credential-gated
  and skipped; the 287 passing tests are hermetic and prove the state machine, gate, teardown and copy
  rules, not a real project's behaviour.
- Decision 6 rests on an **assumption** about a project setting this repository cannot read.

**Unchanged — explicitly not advanced by this ADR**

- **I-2 / G-2**: `saveWorkout` is still three sequential non-transactional upserts, and the severity rose
  now that writes land in real accounts.
- **I-10**: account deletion and export still do not exist, and are now reachable-by-real-users rather
  than theoretical. Blocking for store submission.
- **G-4**: no observability, so a failed sign-in in the field is invisible.
- **`Docs/release-checklist.md`** still does not exist, and neither does an `npm run verify` script.

## References

**Implementation** — `src/store/sessionStore.ts`, `src/store/authActions.ts`, `src/data/authRequired.ts`,
`src/data/supabase/auth.ts`, `src/domain/authErrors.ts`, `src/domain/routing.ts`, `app/auth/index.tsx`,
`app/onboarding/auth.tsx`, `app/_layout.tsx`, `src/data/repository.ts`, `src/store/trainingStore.ts`,
`src/store/activeWorkoutStore.ts`, `src/content/onboarding.ts`, `src/data/supabase/client.ts`.

**Pre-existing and relied upon** — `src/data/supabase/secureStorage.ts`,
`src/data/supabase/__tests__/sessionFlow.test.ts`, `sessionFlow.integration.test.ts`.

**Tests** — `src/domain/__tests__/authErrors.test.ts`, `src/domain/__tests__/routing.test.ts`,
`src/store/__tests__/sessionStore.test.ts`, `src/store/__tests__/authActions.test.ts`,
`src/content/__tests__/authCopy.test.ts`, `src/data/__tests__/authPosture.test.ts`,
`src/data/__tests__/ownership.test.ts` (updated).

**Documents** — `Docs/sprints/2026-08-06-auth-and-session.md`, `Docs/production-posture-v1.md`,
`Docs/architecture.md` (G-1), `Docs/invariants.md` (I-1, I-6, I-19),
`Docs/ui-ux-foundation-v1.md` (D2 → D2a, §4.9, §8, §9).
