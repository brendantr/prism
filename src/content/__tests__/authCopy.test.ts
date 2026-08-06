import { AUTH, AUTH_OUTCOME_COPY, AUTH_OUTCOME_TONE } from '../onboarding';
import type { AuthFailure } from '@/domain/authErrors';

/**
 * Copy as policy.
 *
 * These are content-invariant tests, not rendering tests -- this repo has no
 * component-test tooling by decision (`onboarding-ui-redesign` Decision 6). The
 * rules below are the ones where a single edited sentence would quietly undo a
 * security or honesty property, which makes them exactly the ones worth pinning
 * at the data layer instead of hoping a reviewer notices.
 */

const ALL_CODES: AuthFailure[] = [
  'invalidCredentials',
  'rateLimited',
  'network',
  'sessionExpired',
  'checkEmail',
  'unknown',
];

describe('auth outcome copy', () => {
  it('covers every failure code exactly once, in both maps', () => {
    // A code with no sentence renders as `undefined`; a sentence with no code
    // is dead copy that drifts. Both directions.
    expect(Object.keys(AUTH_OUTCOME_COPY).sort()).toEqual([...ALL_CODES].sort());
    expect(Object.keys(AUTH_OUTCOME_TONE).sort()).toEqual([...ALL_CODES].sort());
  });

  it('does not distinguish a wrong password from an account that does not exist', () => {
    /*
      The account-enumeration rule. Supabase returns the same 400 for both, and
      the copy must not be more specific than the server -- a form that says
      "no account with that email" tells anyone who asks whether a given person
      uses a training app that stores sleep, soreness and bodyweight.
    */
    const message = AUTH_OUTCOME_COPY.invalidCredentials.toLowerCase();

    expect(message).not.toMatch(/no account|not found|does not exist|unknown email/);
    expect(message).not.toMatch(/wrong password|incorrect password|password is/);
    expect(message).not.toMatch(/already (registered|exists|taken)/);
  });

  it('never names an environment variable, credential, or internal identifier', () => {
    // `SUPABASE_MISCONFIGURED_MESSAGE` deliberately names variables, because it
    // is for whoever built the app. Nothing on the auth surface is.
    const surface = [...Object.values(AUTH_OUTCOME_COPY), ...Object.values(AUTH)].join(' ');

    expect(surface).not.toMatch(/EXPO_PUBLIC_/);
    expect(surface).not.toMatch(/SUPABASE|supabase/);
    expect(surface).not.toMatch(/ANON_KEY|SERVICE_ROLE|API_KEY|SECRET|TOKEN|PASSWORD=/);
    expect(surface).not.toMatch(/auth\/v1|\bRLS\b|profile_id|postgres/i);
  });

  it('makes no medical, diagnostic, or clinical claim', () => {
    // I-8. Trivially satisfied on this surface -- there is nothing here to
    // overclaim about -- which is why it is worth pinning before someone adds
    // a reassuring sentence about recovery to the sign-up screen.
    const surface = [...Object.values(AUTH_OUTCOME_COPY), ...Object.values(AUTH)].join(' ');

    expect(surface).not.toMatch(/diagnos|clinical|medical|injur|overtrain|prevent/i);
  });

  it('treats "check your email" as a notice, not an error', () => {
    // It is the successful outcome of sign-up. Rendering it in the error tone
    // would tell someone their account was not created when it was.
    expect(AUTH_OUTCOME_TONE.checkEmail).toBe('notice');
    expect(AUTH_OUTCOME_TONE.sessionExpired).toBe('notice');
    expect(AUTH_OUTCOME_TONE.invalidCredentials).toBe('error');
  });

  it('has dropped the placeholder notice and the skip affordance together', () => {
    /*
      D2's reversal clause: copy, skip semantics, the completion gate and the
      autofill attributes change as one unit. A partial reversal is the real
      risk -- a working sign-up form still telling the lifter that accounts are
      not connected would be the single dishonest surface in the app.
    */
    expect(AUTH).not.toHaveProperty('placeholderNotice');
    expect(AUTH).not.toHaveProperty('skipLabel');
  });

  it('says outright that confirmation ends in a manual sign-in', () => {
    // Deep-link capture is not implemented (`detectSessionInUrl` is false and
    // nothing handles an incoming link). The copy must not imply otherwise.
    expect(AUTH.checkEmailBody.toLowerCase()).toContain('sign in');
  });
});
