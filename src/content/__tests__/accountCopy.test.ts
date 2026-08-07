import { ACCOUNT } from '../account';

/**
 * Copy as policy, same posture as `authCopy.test.ts`.
 *
 * The account sheet is the one surface where a lifter goes looking for control
 * over their data, which makes it the surface where an overstated sentence does
 * the most damage. These are the claims that must not drift.
 */

/** Every string the surface can render, including the formatted ones. */
const ALL_COPY = [
  ACCOUNT.headerControlLabel,
  ACCOUNT.title,
  ACCOUNT.eyebrow,
  ACCOUNT.signedInAs('someone@example.com'),
  ACCOUNT.signedInFallback,
  ACCOUNT.signOutLabel,
  ACCOUNT.signOutSubtitle,
  ACCOUNT.explanation,
  ACCOUNT.confirmTitle,
  ACCOUNT.confirmMessage(3, 'Lower A'),
  ACCOUNT.confirmCancel,
  ACCOUNT.confirmSignOut,
].join(' ');

describe('account copy', () => {
  it('names no environment variable, credential, or internal identifier', () => {
    // I-4/I-5. `SUPABASE_MISCONFIGURED_MESSAGE` is the only string in the
    // product that names variables, and its audience is whoever built the app.
    expect(ALL_COPY).not.toMatch(/EXPO_PUBLIC_/);
    expect(ALL_COPY).not.toMatch(/SUPABASE|supabase/);
    expect(ALL_COPY).not.toMatch(/ANON_KEY|SERVICE_ROLE|API_KEY|SECRET|TOKEN/);
    expect(ALL_COPY).not.toMatch(/auth\/v1|\bRLS\b|profile_id|postgres|keychain/i);
  });

  it('makes no medical, diagnostic, or clinical claim', () => {
    // I-8. Nothing here has any reason to, which is why it is worth pinning
    // before someone adds a friendly line about recovery to an account screen.
    expect(ALL_COPY).not.toMatch(/diagnos|clinical|medical|injur|overtrain/i);
  });

  it('never promises deletion or export', () => {
    /*
      I-10 is open: there is no way to delete an account or export its data.
      "Sign out" is exactly the phrase a worried person reads as "erase me", so
      the copy must not meet them halfway. If deletion ever ships, this test is
      the thing that has to be deliberately changed.
    */
    expect(ACCOUNT.explanation).not.toMatch(/delete|erase|export|wipe|permanently/i);
    expect(ACCOUNT.explanation).not.toMatch(/remove your account|close your account/i);
  });

  it('says what sign-out does on both sides of the device boundary', () => {
    // Half the sentence is what someone fears; half is what they are asking.
    // Dropping either half is how this becomes misleading.
    expect(ACCOUNT.explanation).toMatch(/this device/i);
    expect(ACCOUNT.explanation).toMatch(/stay|remain|keep/i);
  });

  it('names the count and the session in the confirmation, not just "discard"', () => {
    // The decision should be made on specifics. Mirrors Today's draft alert.
    const message = ACCOUNT.confirmMessage(3, 'Lower A');
    expect(message).toContain('3');
    expect(message).toContain('Lower A');
  });

  it('pluralises the set count rather than saying "1 sets"', () => {
    expect(ACCOUNT.confirmMessage(1, 'Lower A')).toContain('1 set ');
    expect(ACCOUNT.confirmMessage(2, 'Lower A')).toContain('2 sets ');
  });

  it('gives the icon-only header control a spoken label', () => {
    expect(ACCOUNT.headerControlLabel.trim().length).toBeGreaterThan(0);
  });
});
