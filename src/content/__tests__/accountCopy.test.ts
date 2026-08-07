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

  it('keeps sign-out copy clear of any claim about deletion or export', () => {
    /*
      This assertion is unchanged; its reason is not.

      It was written while I-10 was open, to stop the copy implying a deletion
      that did not exist. Deletion and export shipped in
      `v1-account-deletion-export`, and the rule now matters MORE rather than
      less: erasing an account is a real button two rows below this sentence, so
      "sign out" blurring into "erase me" is no longer a hypothetical
      misreading -- it is a lifter tapping the wrong one of two adjacent, very
      different actions.

      Scoped to `explanation` deliberately. The delete strings are supposed to
      say "delete"; this is the one sentence that must not.
    */
    expect(ACCOUNT.explanation).not.toMatch(/delete|erase|export|wipe|permanently/i);
    expect(ACCOUNT.explanation).not.toMatch(/remove your account|close your account/i);
  });

  it('states permanence in the deletion copy rather than softening it', () => {
    // I-10. The one action in the product with no undo, no backup and no
    // support path. Copy that reads as reversible is the failure mode.
    const deletionCopy = [
      ACCOUNT.deleteSubtitle,
      ACCOUNT.deleteConfirmMessageEmpty,
      ACCOUNT.deleteConfirmMessage({ workouts: 4, sets: 40, checkIns: 9 }),
      ACCOUNT.deleteFinalTitle,
      ACCOUNT.deleteFinalMessage,
    ].join(' ');

    expect(deletionCopy).toMatch(/permanent/i);
    expect(deletionCopy).toMatch(/cannot be undone|cannot recover/i);
    // No hedging that implies a grace period or a recycle bin.
    expect(deletionCopy).not.toMatch(/archive|deactivat|suspend|30 days|recoverable/i);
  });

  it('names real counts before deleting, so the decision is made on specifics', () => {
    const message = ACCOUNT.deleteConfirmMessage({ workouts: 4, sets: 40, checkIns: 9 });
    expect(message).toContain('4');
    expect(message).toContain('40');
    expect(message).toContain('9');
  });

  it('pluralises the deletion counts rather than saying "1 workouts"', () => {
    const one = ACCOUNT.deleteConfirmMessage({ workouts: 1, sets: 1, checkIns: 1 });
    expect(one).toContain('1 workout,');
    expect(one).toContain('1 logged set');
    expect(one).toContain('1 check-in');
  });

  it('tells a lifter what did NOT happen when deletion fails', () => {
    /*
      The worst outcome on this screen is someone walking away believing their
      data is gone when it is not. The failure message has to assert the
      account still exists, not merely apologise.
    */
    expect(ACCOUNT.deleteFailedMessage).toMatch(/unchanged|still|not deleted/i);
  });

  it('does not promise deletion in the export copy', () => {
    // Exporting is the reversible neighbour of an irreversible action. It must
    // not borrow any of its vocabulary.
    const exportCopy = [ACCOUNT.exportSubtitle, ACCOUNT.exportEmptyMessage].join(' ');
    expect(exportCopy).not.toMatch(/delete|erase|permanent/i);
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
