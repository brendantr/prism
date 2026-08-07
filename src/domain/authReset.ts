import { PASSWORD_MIN_LENGTH, type AuthFieldError } from './authValidation';

/**
 * PASSWORD RESET RULES
 * ====================
 * The stage machine and the field rules behind the reset flow, kept out of the
 * screen that renders them — same reasoning as `routing.ts` and `account.ts`:
 * no component-test tooling exists by decision
 * (`Docs/sprints/2026-08-01-onboarding-ui-redesign.md` Decision 6), so a rule
 * living inside a component is a rule with no coverage.
 *
 * WHY A STAGE MACHINE RATHER THAN TWO BOOLEANS
 * --------------------------------------------
 * Reset is the only flow in the app with two sequential server round trips, and
 * the second one holds something the first produced: a token the lifter typed in
 * from an email. A failure in the second step must land back on the code entry
 * with that token still on screen — dropping to the start would throw away a
 * code that is very likely still valid and make them request a second one.
 * `requestIdle` and `codeIdle` are therefore genuinely different states, not one
 * "idle" with a flag beside it.
 */

export type ResetStage =
  | 'requestIdle'
  | 'requestSending'
  /** Request accepted. The lifter now goes to their inbox. */
  | 'requestDone'
  | 'codeIdle'
  | 'codeSending'
  | 'done';

export type ResetEvent =
  | 'requestStarted'
  | 'requestSucceeded'
  | 'requestFailed'
  | 'enterCode'
  | 'codeStarted'
  | 'codeSucceeded'
  | 'codeFailed'
  | 'startOver';

/**
 * The whole transition table, in one place.
 *
 * Unhandled pairs return the current stage rather than throwing: a late
 * resolution arriving after the lifter has already moved on must not corrupt
 * the flow or crash the screen. Every legal path is enumerated in
 * `src/domain/__tests__/authReset.test.ts`.
 */
export function nextResetStage(stage: ResetStage, event: ResetEvent): ResetStage {
  // Available from anywhere: "request a new code" after an expiry, and the
  // back-out from the code step.
  if (event === 'startOver') return 'requestIdle';

  switch (stage) {
    case 'requestIdle':
      return event === 'requestStarted' ? 'requestSending' : stage;

    case 'requestSending':
      if (event === 'requestSucceeded') return 'requestDone';
      // Back to the form with the address intact, so a network blip costs a tap
      // rather than retyping.
      if (event === 'requestFailed') return 'requestIdle';
      return stage;

    case 'requestDone':
      return event === 'enterCode' ? 'codeIdle' : stage;

    case 'codeIdle':
      return event === 'codeStarted' ? 'codeSending' : stage;

    case 'codeSending':
      if (event === 'codeSucceeded') return 'done';
      // Deliberately NOT 'requestIdle'. See the module header: the typed code is
      // probably still good, and a wrong-digit typo should cost one correction.
      if (event === 'codeFailed') return 'codeIdle';
      return stage;

    case 'done':
      return stage;

    default:
      return stage;
  }
}

/** True while a server call for this flow is outstanding. */
export function isResetBusy(stage: ResetStage): boolean {
  return stage === 'requestSending' || stage === 'codeSending';
}

// ---------------------------------------------------------------------------
// Field rules
// ---------------------------------------------------------------------------

/**
 * Reused rather than re-implemented, so the reset form cannot drift from the
 * sign-up form's idea of a valid address or an acceptable password.
 * `authValidation` owns both patterns; this module owns only the shape of the
 * code, which is new.
 */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Supabase email OTPs are six digits. */
const CODE_LENGTH = 6;
const CODE_PATTERN = /^\d{6}$/;

export type ResetCodeError = 'code_required' | 'code_invalid';

export interface ResetRequestValidation {
  email?: AuthFieldError;
}

export interface ResetConfirmValidation {
  token?: ResetCodeError;
  password?: AuthFieldError;
}

export function validateResetRequest(email: string): ResetRequestValidation {
  const trimmed = email.trim();
  if (trimmed.length === 0) return { email: 'email_required' };
  if (!EMAIL_PATTERN.test(trimmed)) return { email: 'email_invalid' };
  return {};
}

/**
 * The code and the new password are validated together because they are
 * submitted together — showing one error, fixing it, then meeting the other is
 * two round trips through the same form for no reason.
 */
export function validateResetConfirm(token: string, password: string): ResetConfirmValidation {
  const result: ResetConfirmValidation = {};

  const trimmedToken = token.trim();
  if (trimmedToken.length === 0) result.token = 'code_required';
  else if (!CODE_PATTERN.test(trimmedToken)) result.token = 'code_invalid';

  // Same floor as sign-up. A reset is not an opportunity to set a weaker
  // password than the account could have been created with.
  if (password.length === 0) result.password = 'password_required';
  else if (password.length < PASSWORD_MIN_LENGTH) result.password = 'password_too_short';

  return result;
}

export function isValidResetRequest(result: ResetRequestValidation): boolean {
  return result.email === undefined;
}

export function isValidResetConfirm(result: ResetConfirmValidation): boolean {
  return result.token === undefined && result.password === undefined;
}

export { CODE_LENGTH };
