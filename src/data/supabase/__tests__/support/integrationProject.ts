/**
 * THE INTEGRATION LANE'S SHARED HARNESS
 * =====================================
 * Everything the `*.integration.test.ts` files need to talk to a **real**
 * Supabase project through PRism's own code rather than through a client the
 * test built for itself.
 *
 * That distinction is the entire point of this lane. A test that constructs its
 * own `createClient()` proves Supabase works. It does not prove that
 * `SupabaseRepository`, `src/data/supabase/auth.ts`, `secureSessionStorage` and
 * the RPC payload builders work — and those are what ship. So the harness
 * bootstraps the app's own module graph against the staging project and gets
 * out of the way.
 *
 * ---------------------------------------------------------------------------
 * WHY THE ENVIRONMENT VARIABLES HAVE DIFFERENT NAMES
 * ---------------------------------------------------------------------------
 * The app reads `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY`.
 * This lane reads `PRISM_INTEGRATION_SUPABASE_URL` / `..._ANON_KEY` and copies
 * them across in `loadApp()`. The indirection is deliberate and predates this
 * sprint: a developer with a real `.env` on their machine must never be able to
 * point a suite that **creates and deletes accounts** at their own project by
 * accident. Opting in has to be an explicit, differently-named act.
 *
 * ---------------------------------------------------------------------------
 * WHAT THE PROJECT ON THE OTHER END MUST LOOK LIKE
 * ---------------------------------------------------------------------------
 *   1. A **staging** project. Never production. This lane deletes accounts.
 *   2. All seven migrations applied, in order, `0001` … `0007`. Not optional and
 *      not "whatever the project already had": this suite asserts against `0006`
 *      (it expects the seeded catalogue — at least 43 system movements and both
 *      template plans) and `0007` (it deletes an account holding a custom
 *      movement, which every earlier schema refuses to do). A project stopped at
 *      `0005` fails both, and the failure reads like an app bug rather than an
 *      unapplied migration.
 *   3. Email confirmation **disabled**, so `signUp` returns a session and the
 *      suite can create disposable accounts without a mailbox. `assertSession`
 *      below fails with that instruction rather than a generic null error.
 *   4. Anon key only. A service-role key must never enter this environment —
 *      `Docs/invariants.md` I-4. Nothing here needs one: every account the
 *      suite creates, it deletes with the account's own session, through
 *      `delete_my_account`.
 *
 * Full runbook: `Docs/sprints/2026-08-07-staging-supabase-verification.md`.
 */

const url = process.env.PRISM_INTEGRATION_SUPABASE_URL;
const anonKey = process.env.PRISM_INTEGRATION_SUPABASE_ANON_KEY;

/** True when this machine has been pointed at a staging project. */
export const isIntegrationConfigured = Boolean(url && anonKey);

/**
 * `describe` when configured, `describe.skip` otherwise.
 *
 * Skipping rather than failing is deliberate: a suite that goes red because
 * infrastructure is absent teaches people to ignore red suites. The skip is
 * visible in the runner output, and CI reports the lane as "not exercised"
 * rather than as passing.
 */
export const integrationSuite = isIntegrationConfigured ? describe : describe.skip;

/**
 * Network calls against a hosted project, from CI runners on bad days. The
 * default 5s is a flake generator; 30s is long enough that a failure here means
 * something is actually wrong.
 */
export const INTEGRATION_TIMEOUT_MS = 30_000;

export interface AppModules {
  auth: typeof import('../../auth');
  client: typeof import('../../client');
  repository: typeof import('../../../repository');
}

/**
 * Load PRism's data layer configured for the staging project.
 *
 * `jest.resetModules()` first because `client.ts` reads `process.env` **at
 * module load** and memoises the client in a module-level singleton. Setting
 * the variables after that module has been evaluated changes nothing, which is
 * a genuinely confusing way to watch a suite talk to no backend at all.
 */
export function loadApp(): AppModules {
  process.env.EXPO_PUBLIC_SUPABASE_URL = url;
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = anonKey;
  // Explicit, because `DEMO_MODE` falls back to `__DEV__` when unset — and
  // `__DEV__` is true under Jest, so an unset flag would quietly select the
  // demo repository and pass every assertion below against local seed data.
  process.env.EXPO_PUBLIC_DEMO_MODE = 'false';

  jest.resetModules();

  return {
    auth: require('../../auth'),
    client: require('../../client'),
    repository: require('../../../repository'),
  };
}

/** A password that satisfies the project's policy and appears in no log. */
function throwawayPassword(): string {
  return `Pr1sm-int-${Math.random().toString(36).slice(2, 12)}!`;
}

/**
 * A unique address per account.
 *
 * `example.com` is reserved by RFC 2606 and cannot receive mail, which is the
 * property wanted: confirmation is disabled on the staging project, so nothing
 * is ever sent, and if someone re-enables it the failure is a bounced nothing
 * rather than a stranger's inbox. Override the domain if the project enforces
 * a deliverability check.
 */
function throwawayEmail(): string {
  const domain = process.env.PRISM_INTEGRATION_EMAIL_DOMAIN ?? 'example.com';
  const unique = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  return `prism-int-${unique}@${domain}`;
}

export interface DisposableAccount {
  email: string;
  password: string;
  userId: string;
  app: AppModules;
  /**
   * Delete the account through the app's own path.
   *
   * Safe to call twice — the second call is swallowed, so a test that deletes
   * the account deliberately does not then fail in teardown.
   */
  destroy: () => Promise<void>;
}

/**
 * Create a signed-in, disposable account against the staging project.
 *
 * Uses `signUpWithPassword` from the app rather than an admin API, because the
 * admin API needs a service-role key (I-4) and because sign-up is itself one of
 * the paths that has never run against a real project.
 */
export async function createDisposableAccount(): Promise<DisposableAccount> {
  const app = loadApp();
  const email = throwawayEmail();
  const password = throwawayPassword();

  const result = await app.auth.signUpWithPassword(email, password);

  if (!result.sessionEstablished || !result.user) {
    throw new Error(
      'Sign-up returned no session. The staging project still requires email ' +
        'confirmation — disable it (Authentication → Sign In / Providers → ' +
        'Confirm email) so this lane can create disposable accounts. See ' +
        'Docs/sprints/2026-08-07-staging-supabase-verification.md.',
    );
  }

  // Captured now, and used by `destroy()` instead of the repository singleton.
  // A suite that creates two accounts calls `loadApp()` twice, and the second
  // call resets the module registry -- so the first account's repository is no
  // longer the one `getRepository()` returns. Teardown has to work regardless
  // of which account the module graph currently belongs to, and a token does.
  const { data } = await app.client.getSupabase().auth.getSession();
  const token = data.session?.access_token ?? null;

  let destroyed = false;
  return {
    email,
    password,
    userId: result.user.userId,
    app,
    destroy: async () => {
      if (destroyed || !token) return;
      destroyed = true;
      try {
        await rpcWithToken('delete_my_account', token);
      } catch {
        // Teardown must not mask the failure the test already reported. An
        // orphan staging account is a housekeeping problem, not a test result.
      }
    },
  };
}

/** Call a Postgres function over PostgREST with an explicit session token. */
export async function rpcWithToken(
  fn: string,
  accessToken: string,
  args: Record<string, unknown> = {},
): Promise<{ status: number; body: unknown }> {
  const response = await fetch(`${url}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: {
      apikey: anonKey as string,
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(args),
  });
  const body = await response.json().catch(() => null);
  return { status: response.status, body };
}

/**
 * Ask the project a question with a **raw** access token, bypassing the client.
 *
 * Needed for exactly one class of assertion: that a token the app has discarded
 * is also dead server-side. `supabase-js` cannot answer that — it forgets the
 * token locally and would report success either way.
 */
export async function restWithToken(
  path: string,
  accessToken: string,
  init: RequestInit = {},
): Promise<{ status: number; body: unknown }> {
  const response = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: anonKey as string,
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  const body = await response.json().catch(() => null);
  return { status: response.status, body };
}

/**
 * Try to buy a new session with a refresh token, outside the client.
 *
 * This is the question that actually distinguishes a server-side sign-out from
 * a local one. It is deliberately **not** "does the old access token still
 * work": a Supabase access token is a stateless JWT that PostgREST validates by
 * signature and expiry, so it keeps working until it expires whether or not the
 * session was ended. The refresh token is the part the server can revoke, and
 * revoking it is what stops the session from renewing itself.
 */
export async function refreshWithToken(
  refreshToken: string,
): Promise<{ status: number; body: unknown }> {
  const response = await fetch(`${url}/auth/v1/token?grant_type=refresh_token`, {
    method: 'POST',
    headers: { apikey: anonKey as string, 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  const body = await response.json().catch(() => null);
  return { status: response.status, body };
}
