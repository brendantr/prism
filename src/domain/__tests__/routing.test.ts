import {
  AUTH_ROUTE,
  HOME_ROUTE,
  ONBOARDING_ROUTE,
  resolveInitialRoute,
  resolveOnboardingAuthHref,
  type SessionPhase,
} from '../routing';

/**
 * The route gate, enumerated.
 *
 * This is the coverage that justifies pulling the decision out of
 * `app/_layout.tsx`: the rule is a product of three inputs, and a version of it
 * living inside an effect would have none of the cases below tested at all,
 * since the repo has no component-test tooling (Decision 6,
 * `Docs/sprints/2026-08-01-onboarding-ui-redesign.md`).
 */
describe('resolveInitialRoute', () => {
  const PHASES: SessionPhase[] = ['unknown', 'unauthenticated', 'authenticated', 'disabled'];

  describe('while the session is still resolving', () => {
    it('never routes anywhere, whatever else is true', () => {
      for (const onboardingCompleted of [true, false]) {
        for (const currentSegment of ['(tabs)', 'onboarding', 'auth', undefined]) {
          expect(
            resolveInitialRoute({ onboardingCompleted, sessionPhase: 'unknown', currentSegment }),
          ).toBeNull();
        }
      }
    });
  });

  describe('first run', () => {
    it('sends an un-onboarded user to onboarding regardless of session phase', () => {
      for (const sessionPhase of PHASES.filter((p) => p !== 'unknown')) {
        expect(
          resolveInitialRoute({
            onboardingCompleted: false,
            sessionPhase,
            currentSegment: '(tabs)',
          }),
        ).toBe(ONBOARDING_ROUTE);
      }
    });

    it('leaves them alone once they are already in onboarding (loop guard)', () => {
      for (const sessionPhase of PHASES.filter((p) => p !== 'unknown')) {
        expect(
          resolveInitialRoute({
            onboardingCompleted: false,
            sessionPhase,
            currentSegment: 'onboarding',
          }),
        ).toBeNull();
      }
    });

    it('keeps an authenticated user in onboarding rather than jumping to Today', () => {
      // Signing in on the account step must not skip the questions that follow.
      expect(
        resolveInitialRoute({
          onboardingCompleted: false,
          sessionPhase: 'authenticated',
          currentSegment: 'onboarding',
        }),
      ).toBeNull();
    });
  });

  describe('onboarded but signed out', () => {
    it('routes to auth from anywhere else', () => {
      for (const currentSegment of ['(tabs)', 'workout', 'history', undefined]) {
        expect(
          resolveInitialRoute({
            onboardingCompleted: true,
            sessionPhase: 'unauthenticated',
            currentSegment,
          }),
        ).toBe(AUTH_ROUTE);
      }
    });

    it('stays put once on the auth route (loop guard)', () => {
      expect(
        resolveInitialRoute({
          onboardingCompleted: true,
          sessionPhase: 'unauthenticated',
          currentSegment: 'auth',
        }),
      ).toBeNull();
    });

    it('pulls a lifter out of an in-progress logger when the token dies mid-session', () => {
      expect(
        resolveInitialRoute({
          onboardingCompleted: true,
          sessionPhase: 'unauthenticated',
          currentSegment: 'workout',
        }),
      ).toBe(AUTH_ROUTE);
    });
  });

  describe('onboarded and allowed in', () => {
    for (const sessionPhase of ['authenticated', 'disabled'] as SessionPhase[]) {
      it(`evicts ${sessionPhase} users from the onboarding and auth entry surfaces`, () => {
        expect(
          resolveInitialRoute({
            onboardingCompleted: true,
            sessionPhase,
            currentSegment: 'onboarding',
          }),
        ).toBe(HOME_ROUTE);
        expect(
          resolveInitialRoute({ onboardingCompleted: true, sessionPhase, currentSegment: 'auth' }),
        ).toBe(HOME_ROUTE);
      });

      it(`leaves ${sessionPhase} users on any other route, including deep ones`, () => {
        for (const currentSegment of ['(tabs)', 'workout', 'history', undefined]) {
          expect(
            resolveInitialRoute({ onboardingCompleted: true, sessionPhase, currentSegment }),
          ).toBeNull();
        }
      });
    }
  });

  it('is stable: re-running against its own result never redirects again', () => {
    // The property that actually rules out a loop, rather than the individual
    // cases above implying it.
    for (const onboardingCompleted of [true, false]) {
      for (const sessionPhase of PHASES) {
        for (const currentSegment of ['(tabs)', 'onboarding', 'auth', 'workout', undefined]) {
          const first = resolveInitialRoute({ onboardingCompleted, sessionPhase, currentSegment });
          if (first === null) continue;
          const landed = first === HOME_ROUTE ? '(tabs)' : first.replace('/', '');
          expect(
            resolveInitialRoute({ onboardingCompleted, sessionPhase, currentSegment: landed }),
          ).toBeNull();
        }
      }
    }
  });
});

describe('resolveOnboardingAuthHref', () => {
  it('sends a build with accounts to the real form', () => {
    expect(resolveOnboardingAuthHref(true)).toBe(AUTH_ROUTE);
  });

  it('skips the step entirely where there are no accounts to create', () => {
    // A demo build showing a working sign-up form is the same dishonesty the
    // old placeholder notice existed to prevent, pointing the other way.
    expect(resolveOnboardingAuthHref(false)).toBe('/onboarding/steps');
  });
});
