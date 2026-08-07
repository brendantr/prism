/**
 * ACCOUNT COPY
 * ============
 * Every string on the account surface, per D11: user-facing vocabulary lives in
 * `src/content/`, never in a screen or a store.
 *
 * Three constraints, all asserted by `src/content/__tests__/accountCopy.test.ts`
 * rather than left to review:
 *
 *  1. **No configuration detail.** No environment variable, endpoint or schema
 *     identifier reaches a lifter (I-4/I-5). `SUPABASE_MISCONFIGURED_MESSAGE` is
 *     the one string in the product that names variables, and its audience is
 *     whoever built the app.
 *  2. **Sign-out copy still claims nothing about deletion or export.** This rule
 *     was written when neither existed (I-10). Both exist now, and the rule it
 *     protects is unchanged and arguably more important: **signing out clears a
 *     device, and that is all it does.** "Signing out" is exactly the phrase a
 *     worried person misreads as "erasing my data" — and now that erasing their
 *     data is a real button two rows below, conflating the two would be worse
 *     than it was when one of them was hypothetical. The sign-out strings say
 *     what happens on both sides of that boundary; the delete strings own the
 *     other meaning outright.
 *  3. **Nothing diagnostic or clinical** (I-8). Trivially true here; pinned so it
 *     stays true.
 */

export const ACCOUNT = {
  /** Today's header control. Icon-only, so this is what a screen reader says. */
  headerControlLabel: 'Account',

  title: 'Account',
  eyebrow: 'You',

  /** `{identity}` is the signed-in email, or the display name when none is known. */
  signedInAs: (identity: string) => `Signed in as ${identity}`,
  /** Shown when neither an email nor a display name is available. */
  signedInFallback: 'Signed in',

  signOutLabel: 'Sign out',
  signOutSubtitle: 'Ends this session on this device',

  /**
   * The honest half-and-half. Both clauses matter: the first is what someone is
   * afraid of, the second is what they are actually asking.
   */
  explanation:
    'Signing out clears your training data from this device. Your account and everything you have logged stay on your PRism account.',

  confirmTitle: 'Discard current session?',
  /**
   * Names the count and the session, so the decision is made on specifics rather
   * than on the word "discard". Mirrors Today's existing draft alert.
   */
  confirmMessage: (setCount: number, workoutTitle: string) =>
    `You have ${setCount} ${setCount === 1 ? 'set' : 'sets'} logged in ${workoutTitle}. Signing out discards them.`,
  confirmCancel: 'Cancel',
  confirmSignOut: 'Sign out',

  // --- Export (I-10) -------------------------------------------------------

  exportLabel: 'Export my data',
  exportSubtitle: 'A copy of everything PRism has logged for you',
  exportBusyLabel: 'Preparing your data…',
  /** The share sheet's subject line, when the destination has one (mail). */
  exportShareTitle: 'PRism data export',
  exportEmptyTitle: 'Nothing to export yet',
  exportEmptyMessage:
    'Once you have logged a session or a check-in, you can take a copy of it with you.',
  exportFailedTitle: 'Could not prepare your data',
  exportFailedMessage: 'Nothing was sent. Try again in a moment.',

  // --- Deletion (I-10) -----------------------------------------------------

  deleteLabel: 'Delete my account',
  deleteSubtitle: 'Permanently erases your account and all of your data',

  deleteConfirmTitle: 'Delete your account?',
  /**
   * Names real numbers rather than "all your data".
   *
   * Someone about to erase four years of training deserves to be told what four
   * years is. The counts come from the export summary, so this sentence and the
   * file a lifter can take with them cannot disagree — and the offer to export
   * first sits directly above this row for exactly that reason.
   */
  deleteConfirmMessage: (counts: { workouts: number; sets: number; checkIns: number }) =>
    `This permanently deletes your account, ${counts.workouts} ${counts.workouts === 1 ? 'workout' : 'workouts'}, ${counts.sets} logged ${counts.sets === 1 ? 'set' : 'sets'} and ${counts.checkIns} ${counts.checkIns === 1 ? 'check-in' : 'check-ins'}. It cannot be undone.`,
  /** Shown when the account holds nothing yet — no counts worth naming. */
  deleteConfirmMessageEmpty:
    'This permanently deletes your account. It cannot be undone.',
  deleteConfirmCancel: 'Cancel',
  deleteConfirmContinue: 'Continue',

  /**
   * The second gate.
   *
   * Two prompts rather than one, because deletion is the only action in PRism
   * with no undo, no backup and no support path — a mis-tap on a single alert is
   * not a decision. The second names the consequence again rather than repeating
   * the question, so it is read rather than dismissed.
   */
  deleteFinalTitle: 'This cannot be undone',
  deleteFinalMessage:
    'Your account and everything you have logged will be erased. PRism cannot recover it afterwards.',
  deleteFinalCancel: 'Keep my account',
  deleteFinalConfirm: 'Delete permanently',

  deleteBusyLabel: 'Deleting your account…',
  deleteFailedTitle: 'Could not delete your account',
  /**
   * Says what did *not* happen. A failed deletion that reads like a completed
   * one is the worst outcome on this screen: the lifter walks away believing
   * their data is gone.
   */
  deleteFailedMessage: 'Your account and your data are unchanged. Try again in a moment.',

  /**
   * The account IS gone; only the device cleanup fell short.
   *
   * A separate message because `deleteFailedMessage` above asserts the account
   * still exists, and saying that after a successful deletion is the worst
   * outcome on this screen -- it sends someone away believing their data is
   * safe when it has been erased. Both halves are stated: what happened on the
   * server, and what did not happen here.
   */
  deletedCleanupFailedTitle: 'Account deleted',
  deletedCleanupFailedMessage:
    'Your account and your data have been permanently deleted. PRism could not clear everything from this device — reinstalling the app will remove what is left.',
} as const;
