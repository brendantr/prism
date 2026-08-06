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

  // First run wins over everything, including an already-valid session: a user
  // who signed in on the onboarding auth step still has the rest of the flow
  // ahead of them, and bouncing them to Today mid-sequence would strand the
  // questions that follow.
  if (!onboardingCompleted) {
    return currentSegment === 'onboarding' ? null : ONBOARDING_ROUTE;
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
