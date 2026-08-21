/**
 * FAILURE COPY
 * ============
 * The strings shown when PRism itself breaks, per D11: user-facing vocabulary
 * lives in `src/content/`, never inline in a component.
 *
 * Constraints, asserted by `src/content/__tests__/errorCopy.test.ts` rather than
 * left to review:
 *
 *  1. **No configuration detail** (I-4/I-5). A crash screen is the single most
 *     tempting place to print "what actually went wrong", and the underlying
 *     error can name a Supabase endpoint, a schema constraint or an environment
 *     variable. None of it reaches the lifter. This mirrors the rule
 *     `ScreenState` already follows for load failures.
 *  2. **No claim about data that has not been verified.** The screen says what
 *     a render failure does and does not touch, and says nothing about
 *     deletion, export, or the account — a crash is not an account event, and
 *     the words that describe one would be read as though it were.
 *  3. **Nothing diagnostic or clinical** (I-8). Trivially true here; pinned so
 *     it stays true, because "recover" is a word this product uses about
 *     training.
 */

export const APP_ERROR = {
  eyebrow: 'Unexpected error',
  title: 'Repello stopped short',

  /**
   * What happened, and — the part that matters to someone mid-session — what it
   * did not touch. A render failure writes nothing, so nothing already stored
   * is affected. Deliberately no cause, no code, no stack.
   */
  body: 'Something in the app failed while drawing this screen. Nothing you had already stored has been affected.',

  /** Remounts the app's screens. Not a reload of the process. */
  retryLabel: 'Try again',

  /**
   * Shown only when crash reporting is switched on for this build, because a
   * build with no DSN sends nothing and saying otherwise would be false. The
   * second sentence is the one worth having: people assume the worst about what
   * an error report contains, and here the answer is written down.
   */
  reportSentNote:
    'This build may send a report about the failure so it can be fixed. Reports describe the code that failed, not your training.',

  /** Shown when this build has no PRism crash reporting configured. */
  reportNotSentNote: 'This build did not send a Repello crash report.',
} as const;
