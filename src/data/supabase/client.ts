import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { secureSessionStorage } from './secureStorage';

/**
 * Supabase client, created lazily so that demo mode never touches the network
 * and the app boots fine with no environment variables at all.
 */

const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

/**
 * Demo mode is now **opt-in for release builds and on by default only in
 * development**, rather than the previous "default true everywhere".
 *
 * The old default meant a production build with no environment configured
 * shipped silently in demo mode: deterministic seed data, zero network, every
 * session written to that one device. That is a fine way to explore the app
 * and a bad way to discover what your release does. An explicit
 * `EXPO_PUBLIC_DEMO_MODE` still wins in both directions, so `=true` gives a
 * demo release build and `=false` gives a real-backend dev build.
 *
 * `__DEV__` is true under Metro and Jest, false in any EAS/release bundle.
 */
const explicitDemoFlag = process.env.EXPO_PUBLIC_DEMO_MODE;
export const DEMO_MODE =
  explicitDemoFlag != null && explicitDemoFlag.length > 0 ? explicitDemoFlag !== 'false' : __DEV__;

/** Both credentials present. Says nothing about whether they are *correct*. */
export const hasSupabaseCredentials = url.length > 0 && anonKey.length > 0;

/** True when real credentials are present and demo mode is off. */
export const isSupabaseConfigured = !DEMO_MODE && hasSupabaseCredentials;

/**
 * Demo is off, but there is no backend to talk to.
 *
 * This is the state that must never resolve quietly. Falling back to the demo
 * repository here would leave a build claiming to be live while writing every
 * logged session to local storage only — the lifter's data would look saved
 * and be device-bound, which is the same class of dishonesty
 * `Docs/invariants.md` I-2 and I-15 exist to prevent. `getRepository()` refuses
 * instead, and the store surfaces it as a normal, retryable error state.
 */
export const SUPABASE_MISCONFIGURED = !DEMO_MODE && !hasSupabaseCredentials;

export const SUPABASE_MISCONFIGURED_MESSAGE =
  'This build is configured for a real backend but has no Supabase credentials. ' +
  'Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY, or set ' +
  'EXPO_PUBLIC_DEMO_MODE=true to run on demo data.';

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!isSupabaseConfigured) {
    throw new Error(
      'Supabase is not configured. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY, ' +
        'and set EXPO_PUBLIC_DEMO_MODE=false.',
    );
  }
  if (!client) {
    client = createClient(url, anonKey, {
      auth: {
        // Keychain/Keystore, not AsyncStorage: this holds the refresh token,
        // and a leaked refresh token outlives a password change.
        storage: secureSessionStorage,
        autoRefreshToken: true,
        persistSession: true,
        /*
          React Native has no URL bar to parse a session out of.

          Left false deliberately, and it was reconsidered: the auth/session
          sprint assumes email confirmation is ON for the project, so sign-up
          returns no session and the lifter has to come back through a
          confirmation link. Turning this on would not help. `detectSessionInUrl`
          reads `window.location` -- a web mechanism -- and nothing in this repo
          handles an incoming deep link: `app.json` declares `scheme: "prism"`,
          but a repo-wide search finds no `expo-linking` import and no `Linking`
          listener anywhere in `app/` or `src/`. Setting it true would change
          nothing on device except to imply a capture path that does not exist.

          Consequence, stated rather than implied: confirmation ends in a
          **manual sign-in**, and `app/auth/index.tsx` says exactly that on its
          "Confirm your email" state. Automatic capture needs its own sprint --
          a link handler, a redirect URL allow-listed in the Supabase project
          (owner-only, `CLAUDE.md`), and a test path.

        */
        detectSessionInUrl: false,
      },
    });
  }
  return client;
}
