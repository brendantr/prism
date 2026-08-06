import { create } from 'zustand';
import {
  getCurrentUser,
  isAuthEnabled,
  signInWithPassword,
  signUpWithPassword,
  subscribeToAuthState,
  type SessionUser,
} from '@/data/supabase/auth';
import { toAuthFailure, type AuthFailure } from '@/domain/authErrors';
import type { SessionPhase } from '@/domain/routing';

/**
 * SESSION
 * =======
 * Who is signed in, and whether the app is allowed to load anything yet.
 *
 * Kept out of `trainingStore` deliberately, following `onboardingStore`'s
 * precedent: that store is a read model with a re-entry guard on its own
 * status, and threading session transitions through it would mean every
 * sign-in contended with that guard. This is navigation-shaped state, not data.
 *
 * WHY THERE IS NO 'error' PHASE
 * -----------------------------
 * A failed session *restore* is behaviourally identical to having no session --
 * you show sign-in either way -- so an error phase would be a state with no
 * distinct UI and no clear exit. It would also contradict the storage layer,
 * which already fails closed: `secureStorage.getItem` returns null for a
 * half-written or corrupt session rather than surfacing an error, precisely so
 * an interrupted write reads as "signed out" and never as "signed in with a
 * truncated token". Restore failures resolve to 'unauthenticated'.
 *
 * Transient *operation* failures (a rejected password, a rate limit) are form
 * state and live in `lastFailure`, not in the phase.
 *
 * TODO(docs): `Docs/architecture.md` §Runtime Architecture 1/3/4 and the
 * `src/store` layering bullet all predate this store. ADR-0004 should record
 * the phase machine and the session-in-Keychain posture it builds on.
 */

export interface SessionState {
  phase: SessionPhase;
  /**
   * IDENTITY, FOR LOOKING AT ONLY
   * -----------------------------
   * `userId` and `email` are display and test assertions. **Neither is ever
   * passed into a repository method** -- identity reaches Postgres through the
   * access token and is checked by RLS (`Docs/invariants.md` I-6). A client that
   * hands its own id to a query is a client asserting ownership.
   *
   * `email` exists so the account sheet can answer "which account am I in?" on a
   * shared device, which is the question a sign-out control is usually opened to
   * settle. Both are cleared by `markUnauthenticated`, which is what sign-out
   * teardown calls last (I-19).
   */
  userId: string | null;
  email: string | null;
  pending: 'signIn' | 'signUp' | null;
  /**
   * Outcome of the last attempt. Note `'checkEmail'` rides this channel while
   * being a *success* -- see `AUTH_OUTCOME_TONE` in `src/content/onboarding.ts`,
   * which is what keeps it from being rendered as an error.
   */
  lastFailure: AuthFailure | null;

  initialize: () => Promise<void>;
  markAuthenticated: (user: SessionUser) => void;
  markUnauthenticated: () => void;
  startSignIn: () => void;
  startSignUp: () => void;
  finishAttempt: (code: AuthFailure | null) => void;
  clearFailure: () => void;

  signIn: (email: string, password: string) => Promise<boolean>;
  signUp: (email: string, password: string) => Promise<boolean>;
}

/**
 * Process-lifetime subscription, matching `getRepository()`'s once-per-process
 * posture. Never torn down: the only thing that ends it is the process.
 */
let authSubscribed = false;

export const useSessionStore = create<SessionState>((set, get) => ({
  phase: 'unknown',
  userId: null,
  email: null,
  pending: null,
  lastFailure: null,

  initialize: async () => {
    if (get().phase !== 'unknown') return;

    // Mode first, and before anything that could touch the network or the
    // Keychain. A demo build must not construct a Supabase client, and the
    // misconfigured build must be allowed to reach `getRepository()`'s throw
    // rather than being diverted to a sign-in form that cannot work.
    if (!isAuthEnabled()) {
      set({ phase: 'disabled', userId: null, email: null, pending: null, lastFailure: null });
      return;
    }

    if (!authSubscribed) {
      authSubscribed = true;
      subscribeToAuthState((event, user) => {
        if (event === 'SIGNED_OUT') {
          // The revoked/expired refresh token path: supabase-js emits this when
          // a refresh permanently fails. Routing, not an error state.
          set({
            phase: 'unauthenticated',
            userId: null,
            email: null,
            pending: null,
            lastFailure: 'sessionExpired',
          });
          return;
        }
        if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && user) {
          set({ phase: 'authenticated', userId: user.userId, email: user.email, pending: null });
        }
      });
    }

    const user = await getCurrentUser();
    set(
      user
        ? { phase: 'authenticated', userId: user.userId, email: user.email, lastFailure: null }
        : { phase: 'unauthenticated', userId: null, email: null },
    );
  },

  markAuthenticated: (user) =>
    set({
      phase: 'authenticated',
      userId: user.userId,
      email: user.email,
      pending: null,
      lastFailure: null,
    }),

  /** Idempotent: safe to call from both the auth listener and a failed load. */
  markUnauthenticated: () =>
    set({
      phase: 'unauthenticated',
      userId: null,
      email: null,
      pending: null,
      lastFailure: null,
    }),

  startSignIn: () => set({ pending: 'signIn', lastFailure: null }),
  startSignUp: () => set({ pending: 'signUp', lastFailure: null }),
  finishAttempt: (code) => set({ pending: null, lastFailure: code }),
  clearFailure: () => set({ lastFailure: null }),

  signIn: async (email, password) => {
    get().startSignIn();
    try {
      get().markAuthenticated(await signInWithPassword(email, password));
      return true;
    } catch (e) {
      get().finishAttempt(toAuthFailure(e));
      return false;
    }
  },

  /**
   * Sign-up is **not** sign-in.
   *
   * `Docs/production-posture-v1.md` assumes email confirmation is ON for the
   * project, which means Supabase creates the user and returns no session until
   * the address is verified. Reporting success as `authenticated` would send
   * the gate to Today, where every query would fail on a session that does not
   * exist. The honest outcome is 'checkEmail' and a stay on this screen.
   *
   * If confirmation is ever turned off, `sessionEstablished` comes back true
   * and this signs them straight in -- no second code path to maintain.
   */
  signUp: async (email, password) => {
    get().startSignUp();
    try {
      const { user, sessionEstablished } = await signUpWithPassword(email, password);
      if (sessionEstablished && user) {
        get().markAuthenticated(user);
        return true;
      }
      get().finishAttempt('checkEmail');
      return false;
    } catch (e) {
      get().finishAttempt(toAuthFailure(e));
      return false;
    }
  },
}));

/** Test seam. Resets the module-level subscription latch alongside the store. */
export function __resetSessionSubscriptionForTests(): void {
  authSubscribed = false;
}
