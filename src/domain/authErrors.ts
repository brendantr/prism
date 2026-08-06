/**
 * AUTH FAILURE CODES
 * ==================
 * Rules, not copy -- the same split `authValidation.ts` already uses, and for
 * the same reason: a sentence must never be able to quietly change a rule.
 * `src/content/onboarding.ts` maps every code below onto wording.
 *
 * Everything Supabase can hand back collapses into this closed set at the
 * boundary. A raw `AuthError` never travels past `toAuthFailure` -- those carry
 * server-side detail (endpoint names, provider internals, sometimes whether an
 * address is registered) that has no business on a screen.
 *
 * TODO(docs): record the taxonomy in ADR-0004-authentication-and-session, and
 * the "one code, one sentence" rule alongside `Docs/invariants.md` I-8.
 */

export type AuthFailure =
  | 'invalidCredentials'
  | 'rateLimited'
  | 'network'
  | 'sessionExpired'
  | 'checkEmail'
  | 'unknown';

/**
 * The shape we actually read off a Supabase auth rejection.
 *
 * Deliberately structural rather than importing `AuthError`: this module is in
 * `src/domain`, which imports nothing from `src/data` (`Docs/architecture.md`
 * §Layering), and the mapping is a rule about status codes, not about a class.
 */
export interface AuthErrorLike {
  message?: unknown;
  status?: unknown;
  code?: unknown;
  name?: unknown;
}

/**
 * Supabase returns 400 for a bad password **and** for an address with no
 * account, which is what makes the single `invalidCredentials` code below
 * honest rather than merely convenient: the server does not distinguish them,
 * so neither can we, so neither can the copy. See the account-enumeration note
 * in `src/content/onboarding.ts`.
 */
const INVALID_CREDENTIAL_CODES = new Set([
  'invalid_credentials',
  'invalid_grant',
  'email_not_confirmed',
]);

function asString(value: unknown): string {
  return typeof value === 'string' ? value.toLowerCase() : '';
}

function asStatus(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * Map any auth rejection onto one code.
 *
 * Unrecognised shapes become `'unknown'`, never a passed-through message. That
 * is the point of the function: an error nobody anticipated is exactly the one
 * most likely to name something internal.
 */
export function toAuthFailure(error: unknown): AuthFailure {
  if (error == null || typeof error !== 'object') return 'unknown';

  const { message, status, code, name } = error as AuthErrorLike;
  const text = asString(message);
  const codeText = asString(code);
  const nameText = asString(name);
  const httpStatus = asStatus(status);

  // Network first: a failed fetch has no status at all, and reading its
  // message as anything else would blame the user for their connection.
  if (
    nameText === 'authretryablefetcherror' ||
    nameText === 'typeerror' ||
    text.includes('network request failed') ||
    text.includes('failed to fetch')
  ) {
    return 'network';
  }

  if (httpStatus === 429 || codeText === 'over_request_rate_limit' || text.includes('rate limit')) {
    return 'rateLimited';
  }

  if (codeText === 'session_not_found' || codeText === 'refresh_token_not_found') {
    return 'sessionExpired';
  }

  if (INVALID_CREDENTIAL_CODES.has(codeText)) return 'invalidCredentials';
  if (httpStatus === 400 || httpStatus === 401) return 'invalidCredentials';

  return 'unknown';
}
