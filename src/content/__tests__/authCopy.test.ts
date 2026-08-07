import {
  AUTH,
  AUTH_OUTCOME_COPY,
  AUTH_OUTCOME_TONE,
  AUTH_RESET,
  AUTH_RESET_ERROR_COPY,
} from '../onboarding';
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
  'resetSent',
  'invalidCode',
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
    const surface = [
      ...Object.values(AUTH_OUTCOME_COPY),
      ...Object.values(AUTH),
      ...Object.values(AUTH_RESET),
      ...Object.values(AUTH_RESET_ERROR_COPY),
    ].join(' ');

    expect(surface).not.toMatch(/EXPO_PUBLIC_/);
    expect(surface).not.toMatch(/SUPABASE|supabase/);
    expect(surface).not.toMatch(/ANON_KEY|SERVICE_ROLE|API_KEY|SECRET|TOKEN|PASSWORD=/);
    expect(surface).not.toMatch(/auth\/v1|\bRLS\b|profile_id|postgres/i);
  });

  it('makes no medical, diagnostic, or clinical claim', () => {
    // I-8. Trivially satisfied on this surface -- there is nothing here to
    // overclaim about -- which is why it is worth pinning before someone adds
    // a reassuring sentence about recovery to the sign-up screen.
    const surface = [
      ...Object.values(AUTH_OUTCOME_COPY),
      ...Object.values(AUTH),
      ...Object.values(AUTH_RESET),
      ...Object.values(AUTH_RESET_ERROR_COPY),
    ].join(' ');

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

/**
 * PASSWORD RESET COPY
 * ===================
 * Reset adds a second place where the app could accidentally confirm that an
 * address is registered — this time by reporting what happened to a send.
 */
describe('password reset copy', () => {
  it('never confirms whether the address has an account', () => {
    /*
      "A code has been sent" would confirm registration. The hedge is the whole
      sentence's job, and the server behaves the same way — it resolves either
      way — so the copy is not being coy about something the API reveals.
    */
    const sent = AUTH_OUTCOME_COPY.resetSent.toLowerCase();
    expect(sent).toMatch(/if that address has an account/);
    expect(sent).not.toMatch(/we sent|has been sent to your|your account/);
    expect(sent).not.toMatch(/no account|not found|does not exist|unrecognis/);

    expect(AUTH_RESET.sentBody.toLowerCase()).toMatch(/if that address has an account/);
  });

  it('does not distinguish a wrong code from an expired one', () => {
    // "Expired" would confirm a code had been issued, and therefore that the
    // account exists. One sentence covers both.
    const message = AUTH_OUTCOME_COPY.invalidCode.toLowerCase();
    expect(message).toMatch(/not right/);
    expect(message).toMatch(/expired/);
    // Both possibilities in one sentence, never one of them alone.
    expect(message).toMatch(/or/);
  });

  it('treats a sent code as a notice and a rejected code as an error', () => {
    expect(AUTH_OUTCOME_TONE.resetSent).toBe('notice');
    expect(AUTH_OUTCOME_TONE.invalidCode).toBe('error');
  });

  it('names no environment variable or internal identifier', () => {
    const surface = [
      ...Object.values(AUTH_RESET),
      ...Object.values(AUTH_RESET_ERROR_COPY),
    ].join(' ');

    expect(surface).not.toMatch(/EXPO_PUBLIC_/);
    expect(surface).not.toMatch(/SUPABASE|supabase/);
    expect(surface).not.toMatch(/ANON_KEY|SERVICE_ROLE|API_KEY|SECRET|TOKEN/);
    expect(surface).not.toMatch(/auth\/v1|\bRLS\b|profile_id|postgres|otp|verifyOtp/i);
  });

  it('makes no medical, diagnostic, or clinical claim', () => {
    const surface = [
      ...Object.values(AUTH_RESET),
      ...Object.values(AUTH_RESET_ERROR_COPY),
    ].join(' ');
    expect(surface).not.toMatch(/diagnos|clinical|medical|injur|overtrain/i);
  });

  it('never promises deletion or export', () => {
    // I-10 is open. A reset changes a credential; it removes nothing.
    const surface = [
      ...Object.values(AUTH_RESET),
      ...Object.values(AUTH_RESET_ERROR_COPY),
    ].join(' ');
    expect(surface).not.toMatch(/delete|erase|export|wipe your/i);
  });

  it('describes a code, not a link, so the copy matches what the flow does', () => {
    /*
      There is no deep-link capture (`detectSessionInUrl` is false, no Linking
      handler). Telling someone to "follow the link" would send them somewhere
      the app cannot receive them.
    */
    const instructions = [AUTH_RESET.sentBody, AUTH_RESET.codeBody, AUTH_RESET.requestBody]
      .join(' ')
      .toLowerCase();
    expect(instructions).toMatch(/code/);
    expect(instructions).not.toMatch(/follow the link|click the link|tap the link/);
  });

  it('says the reset ends at sign-in rather than implying an automatic session', () => {
    expect(AUTH_RESET.doneNotice.toLowerCase()).toMatch(/sign in/);
  });

  it('covers every reset field error exactly once', () => {
    expect(Object.keys(AUTH_RESET_ERROR_COPY).sort()).toEqual(['code_invalid', 'code_required']);
  });
});
