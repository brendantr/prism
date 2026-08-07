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
 *  2. **No claim of deletion or export.** Signing out clears a device. It does
 *     not delete an account and it does not export anything — neither exists
 *     (I-10, still open). The explanatory line has to say what actually happens
 *     on both sides of the boundary, because "signing out" is exactly the
 *     phrase a worried person misreads as "erasing my data".
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
} as const;
