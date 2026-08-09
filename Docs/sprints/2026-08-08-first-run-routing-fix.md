# Sprint: first-run routing — a new user could not get in

## Document status

- **Status:** Fixed, and verified on a cold-started simulator against the live staging project.
- **Date opened:** 2026-08-08
- **Branch:** `feature/v1-first-run-routing`
- **Labels:** `[fact]`, `[assumption]`, `[recommendation]`, `[open question]`.

---

## 1. The defect

`[fact]` On a real-backend build, **a new install could neither sign up nor sign in**. Both entry
points bounced silently back to the welcome screen.

The chain, confirmed in code and on device:

1. `app/onboarding/features.tsx` "Skip" and "Continue" both `router.push('/onboarding/auth')`.
2. `app/onboarding/auth.tsx` is a `<Redirect>`; with auth enabled it resolves to `/auth`.
3. The first segment becomes `auth`.
4. `resolveInitialRoute` hit `if (!onboardingCompleted) return currentSegment === 'onboarding' ? null
   : ONBOARDING_ROUTE` and returned `/onboarding`.
5. The lifter is back on the welcome screen. `index.tsx`'s "I already have an account" takes the same
   path with `?mode=signin` and bounces identically.

`[fact]` **Demo builds were unaffected**: `resolveOnboardingAuthHref` sends them to
`/onboarding/steps`, which never leaves the segment. The defect existed only in the mode that ships
to testers, which is why it survived every previous session.

## 2. Why nothing caught it

`[fact]` The precedence rule was correct when written. The account step used to live at
`app/onboarding/auth.tsx` — inside the `onboarding` segment. The auth sprint (2026-08-06) moved the
real form to `app/auth/`, and the rule protecting the first run began evicting the one step that has
to happen during it.

`src/domain/__tests__/routing.test.ts` covered the full truth table and **passed throughout**, because
the function did exactly what it was specified to do. The specification went stale. A pure-function
test cannot detect "this rule no longer matches the route graph" — which is precisely the hole left by
`app/` having no rendering coverage.

`[fact]` A second, compounding defect: `app/auth/index.tsx` did `router.replace('/(tabs)')` on success
— a second navigator competing with the gate, the exact shape `app/_layout.tsx`'s "ONE GATE, NOT TWO"
comment warns against. On a first run that produced two redirects in a row.

## 3. The fix

`[decision, engineer/owner, 2026-08-08]` **After signing up mid-flow, resume at the setup questions**
(`/onboarding/steps`) — not the welcome screen, which reads as the sign-up having failed, and not
Today, which would strand the questions.

- `src/domain/routing.ts` — `/auth` is now a legal segment during the first run **when accounts exist**
  (`sessionPhase === 'unauthenticated'`); a `'disabled'` build still falls through to onboarding,
  because it has nothing to sign into. An `'authenticated'` first-runner routes to the new
  `ONBOARDING_STEPS_ROUTE`.
- `app/auth/index.tsx` — the `router.replace('/(tabs)')` is gone. The phase flip is the signal and the
  gate is keyed on it; it already knows both destinations. One authority.

## 4. Validation

| | |
|---|---|
| `npx tsc --noEmit` | clean |
| `npm test -- --ci` | **452 / 26 suites** (up 4) |
| Cold-started simulator, real staging project | Sign-in form reachable; account created; landed on **Step 1 of 4**; completed onboarding; Today rendered; account deleted through the app |

`[fact]` Test changes are the point, not an afterthought:
- A regression case pinning that an un-onboarded lifter can reach `/auth`.
- A case pinning that a `'disabled'` build still cannot.
- The resume-at-questions destination.
- The pre-existing stability property's helper was **wrong** and silently so: it modelled
  `segments[0]` as `first.replace('/', '')`, which was right while every destination was a single
  segment and broke on `/onboarding/steps`. Fixed to take the first path segment.

`[fact]` **Cold start, per `Docs/agents.md`.** Every claim above comes from an app terminated and
relaunched after the change — not a hot reload.

## 5. What the cold start also found

**F-A `[fact]`, copy that is false on a real backend.** `app/onboarding/complete.tsx` tells a new
lifter: *"PRism opens on eight weeks of sample training so nothing looks empty. Log a real session
whenever you want and it saves on this device."* On a real account there is no sample training and
nothing saves to the device — it goes to Postgres under their account. This is demo-mode copy shown to
a real user, and it is the same class of problem `accountCopy.test.ts` and the deletion-honesty fix
exist to prevent. **Not fixed here** — it is a content change with its own decision (does the sentence
branch on mode, or is the whole panel demo-only?).

**F-B `[fact]`, dev-only React warning.** Deleting the account emits
`Cannot update a component ('ForwardRef(NavigationContainerInner)') while rendering a different
component ('AccountScreen')`. Navigation state is being updated during `AccountScreen`'s render.
Development-only and invisible in a release build; no user-visible effect observed. **Not fixed here.**

## 6. Handoff

The next decision is **F-A**: the completion screen lies to every tester who reaches it. It is one
string plus a test, and it should land before a tester build.

`[open question]` `Docs/architecture.md` §Runtime Architecture 1 still describes the pre-fix
precedence, and `routing.ts` carries a `TODO(docs)` about it that predates this sprint.
