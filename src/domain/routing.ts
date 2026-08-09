/**
 * ROUTE GATING
 * ============
 * Which surface the app is allowed to show, given what it knows about the
 * first-run flag and the session. Pure on purpose.
 *
 * The redirect it drives used to be an effect reading `useSegments()` inline in
 * `app/_layout.tsx`. Adding a second condition (auth) to that shape is how you
 * get two effects racing on the same segment array and bouncing the user
 * between routes. There is now one effect, and the decision it makes lives
 * here, where it can be enumerated in a test -- which matters because this repo
 * has no component-test tooling by decision
 * (`Docs/sprints/2026-08-01-onboarding-ui-redesign.md` Decision 6), so a rule
 * left inside a component is a rule with no coverage at all.
 *
 * TODO(docs): `Docs/architecture.md` §Runtime Architecture 1 describes the old
 * single-gate startup and needs rewriting for this.
 */

/** Mirrors `sessionStore.phase`. Duplicated structurally so `src/domain` imports no store. */
export type SessionPhase = 'unknown' | 'unauthenticated' | 'authenticated' | 'disabled';

export interface RouteGateInput {
  onboardingCompleted: boolean;
  sessionPhase: SessionPhase;
  /** First path segment, as Expo Router reports it. `undefined` at the root. */
  currentSegment: string | undefined;
}

export const ONBOARDING_ROUTE = '/onboarding';
/**
 * Where a lifter resumes after signing up part-way through the first run.
 *
 * Deliberately the questions, not `ONBOARDING_ROUTE`: sending them back to the
 * welcome screen after they have just created an account reads as the sign-up
 * having failed. Engineer/owner decision, 2026-08-08.
 */
export const ONBOARDING_STEPS_ROUTE = '/onboarding/steps';
export const AUTH_ROUTE = '/auth';
export const HOME_ROUTE = '/(tabs)';

/**
 * Where the app must be, or `null` to stay where it is.
 *
 * Returning `null` when already at the destination is the loop guard: the
 * caller redirects only on a non-null result, so a redirect can never re-fire
 * against the route it just produced.
 */
export function resolveInitialRoute({
  onboardingCompleted,
  sessionPhase,
  currentSegment,
}: RouteGateInput): string | null {
  // The gate holds the splash until the phase resolves; nothing should route
  // on a guess. Defensive -- `app/_layout.tsx` does not call this while unknown.
  if (sessionPhase === 'unknown') return null;

  /*
    FIRST RUN, AND THE ACCOUNT STEP INSIDE IT
    -----------------------------------------
    First run still wins over a valid session -- someone who signed up mid-flow
    has the rest of the questions ahead of them, and dropping them on Today
    would strand those. What changed on 2026-08-08 is that the account step is
    no longer *inside* the `onboarding` segment.

    This branch used to be one line: anything not in `onboarding` was evicted to
    `ONBOARDING_ROUTE`. That was correct while the sign-in form lived at
    `app/onboarding/auth.tsx`. The auth sprint moved the real form to
    `app/auth/`, which left the segment -- so the rule protecting the flow began
    evicting the one step that has to happen during it. `/onboarding/auth` is
    now a `<Redirect>` to `/auth`, this gate immediately sent the lifter back to
    the welcome screen, and on a real-backend build **a new install could
    neither sign up nor sign in**. Found by a cold-start run against a live
    project; every unit test passed throughout, because the function did exactly
    what it was specified to do and the specification had gone stale.

    Demo builds never hit it: `resolveOnboardingAuthHref` sends them to
    `/onboarding/steps`, which never leaves the segment. The defect existed only
    in the mode that ships.
  */
  if (!onboardingCompleted) {
    // Signed up or signed in part-way through: forward into the questions, not
    // back to the welcome screen, which reads as the sign-up having failed.
    if (sessionPhase === 'authenticated') {
      return currentSegment === 'onboarding' ? null : ONBOARDING_STEPS_ROUTE;
    }

    if (currentSegment === 'onboarding') return null;

    // Signing in is a step of the first run, so `auth` is a legal place to be
    // during it -- but only where accounts exist. A 'disabled' build (demo, or
    // misconfigured) falls through and is returned to onboarding, because there
    // is no account for it to be creating.
    if (sessionPhase === 'unauthenticated' && currentSegment === 'auth') return null;

    return ONBOARDING_ROUTE;
  }

  if (sessionPhase === 'unauthenticated') {
    return currentSegment === 'auth' ? null : AUTH_ROUTE;
  }

  // Authenticated, or auth does not apply to this build ('disabled'). Evict
  // from the two entry surfaces; leave every other route alone so a deep link
  // or an in-progress session is not yanked back to Today.
  if (currentSegment === 'onboarding' || currentSegment === 'auth') return HOME_ROUTE;
  return null;
}

/**
 * Where onboarding's account step should send the lifter.
 *
 * Demo builds have no accounts, so they skip it entirely rather than showing a
 * real sign-up form that cannot create anything -- the same honesty argument
 * that put the placeholder notice on the old screen, applied in the other
 * direction now that the form works. This is the answer to
 * `Docs/ui-ux-foundation-v1.md` §9 open question 1: the step is visible exactly
 * in builds where accounts exist.
 */
export function resolveOnboardingAuthHref(authEnabled: boolean): string {
  return authEnabled ? AUTH_ROUTE : '/onboarding/steps';
}
