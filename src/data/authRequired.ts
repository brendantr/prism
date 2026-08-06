/**
 * AUTH REQUIRED
 * =============
 * The one error the store layer has to be able to tell apart from every other
 * failure a repository can produce.
 *
 * Before this existed, `uid()` threw `new Error('Not signed in.')` and
 * `trainingStore.refresh()` flattened it into the same `status: 'error'` as a
 * dropped connection or a schema fault. The lifter got "Could not load this"
 * and a Retry button that could never succeed, with no route to a sign-in
 * screen. The message was accurate and the affordance was a lie.
 *
 * It lives in `src/data` rather than in a store because of the dependency
 * arrow: `app/` -> stores -> `src/data` (`Docs/architecture.md` §Layering).
 * `src/data` defines and throws this; stores catch and interpret it. A
 * repository must never read session state back out of a store.
 */

/**
 * Thrown when a repository call needs a signed-in user and there is no session.
 *
 * Carries no server detail by construction -- there is nothing to carry. It
 * means "there is no session", never "your credentials were rejected"; the
 * latter is a sign-in form's problem and is coded in `src/domain/authErrors.ts`.
 */
export class AuthRequiredError extends Error {
  /**
   * Discriminant. `instanceof` alone is unreliable across Jest module registry
   * boundaries and would silently degrade to the generic error path -- the
   * exact failure this class exists to prevent.
   */
  readonly isAuthRequired = true as const;

  constructor(message = 'Not signed in.') {
    super(message);
    this.name = 'AuthRequiredError';
    // Required for `instanceof` to survive the ES5 downlevel target.
    Object.setPrototypeOf(this, AuthRequiredError.prototype);
  }
}

/** Narrow an unknown catch value. Prefers the discriminant over `instanceof`. */
export function isAuthRequiredError(error: unknown): error is AuthRequiredError {
  if (error instanceof AuthRequiredError) return true;
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { isAuthRequired?: unknown }).isAuthRequired === true
  );
}
