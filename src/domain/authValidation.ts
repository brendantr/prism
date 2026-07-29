/**
 * CREDENTIAL VALIDATION
 * =====================
 * Pure rules, no copy. The screen maps these codes onto wording so the policy
 * can be tested without rendering anything, and so changing a sentence can
 * never quietly change a rule.
 *
 * The password policy is length-only by decision: no required uppercase,
 * lowercase, digit, or symbol. Composition rules push people toward short
 * predictable substitutions and away from the thing that actually helps, which
 * is length. Passwords remain case-sensitive.
 */

/** Sign-up only. Sign-in accepts whatever an existing account already has. */
export const PASSWORD_MIN_LENGTH = 12;

export type AuthMode = 'signup' | 'signin';

export type AuthFieldError =
  | 'email_required'
  | 'email_invalid'
  | 'password_required'
  | 'password_too_short';

export interface AuthValidationResult {
  email?: AuthFieldError;
  password?: AuthFieldError;
}

/**
 * Deliberately loose: one @, something either side, a dot in the domain. A
 * stricter pattern rejects addresses that are perfectly valid, and the only
 * check that ever really settles it is sending mail to the address.
 */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateCredentials(
  email: string,
  password: string,
  mode: AuthMode,
): AuthValidationResult {
  const result: AuthValidationResult = {};
  const trimmedEmail = email.trim();

  if (trimmedEmail.length === 0) result.email = 'email_required';
  else if (!EMAIL_PATTERN.test(trimmedEmail)) result.email = 'email_invalid';

  // Not trimmed: leading and trailing spaces are legitimate password characters.
  if (password.length === 0) {
    result.password = 'password_required';
  } else if (mode === 'signup' && password.length < PASSWORD_MIN_LENGTH) {
    // Sign-in is exempt on purpose. Enforcing today's minimum against an
    // existing account would lock out a user whose password predates it.
    result.password = 'password_too_short';
  }

  return result;
}

export function isValidCredentials(result: AuthValidationResult): boolean {
  return !result.email && !result.password;
}
