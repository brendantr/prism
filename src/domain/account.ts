import type { Workout } from './types';
import type { SessionPhase } from './routing';

/**
 * ACCOUNT RULES
 * =============
 * The two decisions the sign-out surface makes, kept out of the components that
 * render them.
 *
 * Same reasoning as `routing.ts`: this repository has no component-test tooling
 * by decision (`Docs/sprints/2026-08-01-onboarding-ui-redesign.md` Decision 6),
 * so a rule living inside a screen is a rule with no coverage. Both functions
 * below are pure — no store, no I/O, no navigation.
 */

/**
 * Whether this build and this session may show a sign-out control at all.
 *
 * `authEnabled` is false for **two** different builds, and both must hide it for
 * the same reason: there is no account to leave.
 *
 *  - **Demo** — the lifter never signed in, and `DEMO_PROFILE_ID` is a constant.
 *  - **Misconfigured** (demo off, credentials absent) — hiding it here also keeps
 *    the surface from competing with `SUPABASE_MISCONFIGURED_MESSAGE`, which is
 *    what that build actually owes the person holding the phone
 *    (`Docs/production-posture-v1.md` §5).
 *
 * Hidden rather than shown-and-disabled, deliberately. A greyed-out "Sign out"
 * implies an account you could have had, which is the same overstatement the
 * placeholder notice on the old auth screen was deleted for
 * (`Docs/ui-ux-foundation-v1.md` D2a).
 */
export function canOfferSignOut(opts: {
  authEnabled: boolean;
  sessionPhase: SessionPhase;
}): boolean {
  return opts.authEnabled && opts.sessionPhase === 'authenticated';
}

/**
 * Whether the sign-in screen may offer "Forgot password?".
 *
 * The same rule as `canOfferSignOut`, applied to a different capability: show a
 * control only where the build can honour it. Recovery needs **both** an
 * account system (`authEnabled`) and an email path that delivers a typed code
 * (`emailRecoveryEnabled` — custom SMTP plus a recovery template exposing
 * `{{ .Token }}`; see `isEmailRecoveryEnabled`).
 *
 * Hidden rather than disabled, for the reason recorded above: a greyed-out
 * "Forgot password?" tells a locked-out person that recovery exists and is
 * being withheld, which is worse than it plainly not being offered.
 */
export function canOfferPasswordReset(opts: {
  authEnabled: boolean;
  emailRecoveryEnabled: boolean;
}): boolean {
  return opts.authEnabled && opts.emailRecoveryEnabled;
}

/**
 * Whether signing out has to stop and ask first.
 *
 * `signOutAndTearDown` discards the in-progress draft, so this is a destructive
 * action whenever there is work in it. The rule is D6's, unchanged: **confirm
 * only when logged work would be lost.** Interrupting someone to confirm the
 * loss of a plan they never touched is friction with nothing behind it;
 * interrupting to confirm the loss of logged sets is the entire point.
 *
 * A completed **warm-up** set counts. It does not count toward volume, but it is
 * still something the lifter did and ticked off, and "counts toward volume" and
 * "is logged work" are different questions — this one is the second.
 */
export function shouldConfirmSignOut(workout: Workout | null): boolean {
  return countCompletedSets(workout) > 0;
}

/**
 * Completed sets across the whole session. Exported because the confirmation
 * copy names the number, and counting it twice in two places is how the sentence
 * and the rule drift apart.
 */
export function countCompletedSets(workout: Workout | null): number {
  if (!workout) return 0;
  return workout.exercises.reduce(
    (total, exercise) => total + exercise.sets.filter((set) => set.completed).length,
    0,
  );
}
