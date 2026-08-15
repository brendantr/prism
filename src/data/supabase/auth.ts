import type { Subscription } from '@supabase/supabase-js';
import { DEMO_MODE, getSupabase, isSupabaseConfigured } from './client';

/**
 * AUTH OPERATIONS
 * ===============
 * The only place in the app that calls Supabase's auth API.
 *
 * `sessionStore` drives the flow but must not reach for `getSupabase()` itself:
 * stores sit above `src/data` in the layering, and `getSupabase()` throws on a
 * build with no credentials. Keeping the calls here means the store handles
 * session *state* and this file handles session *transport*, and a demo build
 * never constructs a client at all.
 *
 * Nothing here persists anything by hand. The client is already configured with
 * `storage: secureSessionStorage` (Keychain/Keystore, chunked, commit-marker
 * last), `persistSession` and `autoRefreshToken` -- see `client.ts` and
 * `secureStorage.ts`. Session-at-rest is a solved problem in this repo and this
 * sprint deliberately does not re-solve it.
 */

/**
 * Whether this build has an account system at all.
 *
 * False for demo builds and for the misconfigured "demo off, no credentials"
 * build. The second case matters: routing that build to a sign-in screen would
 * ask someone to type a password into a form that cannot work, and would hide
 * the loud `SUPABASE_MISCONFIGURED_MESSAGE` that `getRepository()` still owes
 * them (`Docs/production-posture-v1.md` §5). Auth stays out of the way and lets
 * the data layer report the real problem.
 */
export function isAuthEnabled(): boolean {
  return !DEMO_MODE && isSupabaseConfigured;
}

/**
 * Whether this build can actually deliver a password-reset code.
 *
 * **Declared, never inferred.** The app cannot detect whether the Supabase
 * project has custom SMTP, or whether its recovery template exposes
 * `{{ .Token }}` — and both are required, because `confirmPasswordReset` asks
 * the lifter to type a six-digit code and Supabase's default template sends a
 * link with no code in it.
 *
 * Until both are true, "Forgot password?" leads to a screen that waits forever
 * for digits that will never arrive. That is worse than having no recovery at
 * all: an absent control is a missing feature, a dead-ended one is a broken
 * promise. This repository already holds that line twice — `canOfferSignOut`
 * hides sign-out where there is no session, and `resolveOnboardingAuthHref`
 * routes demo builds past an account step they cannot complete, on the stated
 * grounds that a form which cannot work is a form that should not be shown.
 *
 * Default **off**, so a build claims recovery only when someone has configured
 * it and said so. Set `EXPO_PUBLIC_EMAIL_RECOVERY_ENABLED=true` once
 * `Docs/store-submission-runbook.md` §3a is done.
 */
export function isEmailRecoveryEnabled(): boolean {
  return process.env.EXPO_PUBLIC_EMAIL_RECOVERY_ENABLED === 'true';
}

export interface SessionUser {
  userId: string;
  /**
   * Display only, and null whenever Supabase has none (a provider that does not
   * return one). It answers "which account am I in?" on a shared device, which
   * is the question a sign-out control exists to settle. It is **never** used to
   * scope a query or identify a row — that is `auth.uid()`'s job, checked by RLS
   * (`Docs/invariants.md` I-6).
   */
  email: string | null;
}

/**
 * The current session, read locally.
 *
 * `getSession()` rather than `getUser()` deliberately: `getUser()` round-trips
 * to `/auth/v1/user` on every call, and `uid()` is invoked by six of the eight
 * repository calls `trainingStore.refresh()` fires in parallel -- six network
 * requests before a single row is fetched. The access token is what Postgres
 * evaluates RLS against anyway, so validating it a second time client-side buys
 * nothing: a token the server rejects fails the query regardless, which is the
 * check that actually counts (`Docs/invariants.md` I-1, I-6).
 */
export async function getCurrentUser(): Promise<SessionUser | null> {
  if (!isAuthEnabled()) return null;
  const { data, error } = await getSupabase().auth.getSession();
  if (error || !data.session?.user) return null;
  return { userId: data.session.user.id, email: data.session.user.email ?? null };
}

/** Rejects with the raw Supabase error; callers map it via `toAuthFailure`. */
export async function signInWithPassword(
  email: string,
  password: string,
): Promise<SessionUser> {
  const { data, error } = await getSupabase().auth.signInWithPassword({ email, password });
  if (error) throw error;
  if (!data.session?.user) {
    // Defensive: a success with no session is not something to paper over by
    // reporting "signed in" to a store that would then load nothing.
    throw new Error('Sign-in returned no session.');
  }
  return { userId: data.session.user.id, email: data.session.user.email ?? null };
}

export interface SignUpResult {
  /**
   * Null whenever the project requires email confirmation -- Supabase returns
   * the created user with no session until the address is verified. The caller
   * must not treat sign-up as sign-in; see `sessionStore.signUp`.
   */
  user: SessionUser | null;
  /** True when there is a live session, i.e. confirmation is disabled. */
  sessionEstablished: boolean;
}

export async function signUpWithPassword(
  email: string,
  password: string,
): Promise<SignUpResult> {
  const { data, error } = await getSupabase().auth.signUp({ email, password });
  if (error) throw error;
  const user = data.session?.user;
  return {
    user: user ? { userId: user.id, email: user.email ?? null } : null,
    sessionEstablished: user != null,
  };
}

/**
 * Ends the session and clears it from the Keychain.
 *
 * Errors are swallowed on purpose. A sign-out that fails server-side (offline,
 * an already-revoked token) must still tear down everything on the device --
 * see `signOutAndTearDown` in `src/store/authActions.ts`. Leaving a lifter
 * signed in because the network was down is the worse outcome on a shared
 * phone.
 */
export async function signOut(): Promise<void> {
  if (!isAuthEnabled()) return;
  try {
    await getSupabase().auth.signOut();
  } catch {
    // Intentionally ignored -- local teardown proceeds regardless.
  }
}

/**
 * PASSWORD RESET, STEP 1 — ask for a code.
 *
 * Sends the project's recovery email. **No `redirectTo` is passed, deliberately:**
 * this flow does not use the link. `detectSessionInUrl` is false and nothing in
 * this repository handles an incoming deep link, so a returning link would land
 * nowhere (`Docs/production-posture-v1.md` §4.1). The lifter instead types the
 * code from the email into the app, which keeps the whole flow in-process and
 * needs no redirect URL allow-listed on the project.
 *
 * Resolves on success and says nothing about whether the address has an account —
 * the caller's copy must not either.
 */
export async function requestPasswordReset(email: string): Promise<void> {
  if (!isAuthEnabled()) throw new Error('Auth is not enabled in this build.');
  const { error } = await getSupabase().auth.resetPasswordForEmail(email);
  if (error) throw error;
}

/**
 * PASSWORD RESET, STEP 2 — verify the code and set the new password.
 *
 * Three server steps behind one call, because they are not independently useful
 * and a caller left holding a half-finished reset would be holding a live
 * recovery session it did not ask for:
 *
 *   1. `verifyOtp({ type: 'recovery' })` — exchanges the emailed code for a
 *      session. This is what makes step 2 possible at all: `updateUser` requires
 *      a signed-in user, which the lifter is not.
 *   2. `updateUser({ password })` — the actual change.
 *   3. `signOut()` — hands the session straight back.
 *
 * Step 3 is the deliberate part. `verifyOtp` leaves the app authenticated, and
 * silently continuing into Today off the back of an emailed code is a surprising
 * way to end a password reset — especially on a shared device. The lifter
 * returns to sign-in and proves the new password works, which is the one moment
 * they should. The `SIGNED_IN` this fires in between is suppressed by the caller;
 * see `sessionStore.runPasswordReset`.
 *
 * The code is user-supplied, transient, and never stored (I-4/I-5).
 */
export async function confirmPasswordReset(
  email: string,
  token: string,
  newPassword: string,
): Promise<SessionUser> {
  if (!isAuthEnabled()) throw new Error('Auth is not enabled in this build.');
  const supabase = getSupabase();

  const { data: verified, error: verifyError } = await supabase.auth.verifyOtp({
    type: 'recovery',
    email,
    token,
  });
  if (verifyError) throw verifyError;
  if (!verified.user) throw new Error('Recovery code did not produce a session.');

  const { data: updated, error: updateError } = await supabase.auth.updateUser({
    password: newPassword,
  });
  if (updateError) throw updateError;
  if (!updated.user) throw new Error('Password update returned no user.');

  const user: SessionUser = { userId: updated.user.id, email: updated.user.email ?? null };

  // Always, including when the two calls above succeeded but something later
  // fails: a recovery session must not outlive the reset that created it.
  await signOut();

  return user;
}

export type AuthStateEvent = 'SIGNED_IN' | 'SIGNED_OUT' | 'TOKEN_REFRESHED' | 'OTHER';

/**
 * Subscribe to session lifecycle changes for the process lifetime.
 *
 * This is what makes a revoked or expired refresh token a routing event rather
 * than a mystery error on the next data load: supabase-js emits `SIGNED_OUT`
 * when a refresh permanently fails.
 */
export function subscribeToAuthState(
  handler: (event: AuthStateEvent, user: SessionUser | null) => void,
): Subscription | null {
  if (!isAuthEnabled()) return null;

  const { data } = getSupabase().auth.onAuthStateChange((event, session) => {
    const supabaseUser = session?.user;
    const user: SessionUser | null = supabaseUser
      ? { userId: supabaseUser.id, email: supabaseUser.email ?? null }
      : null;
    if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'TOKEN_REFRESHED') {
      handler(event, user);
      return;
    }
    handler('OTHER', user);
  });

  return data.subscription;
}
