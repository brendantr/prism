/**
 * SESSION FLOW — INTEGRATION LANE
 * ===============================
 * The coverage the unit lane deliberately cannot give: a **real** Supabase
 * project, a **real** WebSocket transport, and a session obtained from a server
 * rather than written into storage by hand.
 *
 * This file is excluded from `npm test` (see `jest.testPathIgnorePatterns` in
 * `package.json`). Run it on its own:
 *
 *     npm run test:integration
 *
 * ---------------------------------------------------------------------------
 * WHY THE SPLIT
 * ---------------------------------------------------------------------------
 * `sessionFlow.test.ts` builds a real Supabase client and drives real auth code,
 * but injects a stub realtime transport, because `createClient()` resolves a
 * WebSocket eagerly and CI's Node runtime has no global `WebSocket`. That keeps
 * the default lane hermetic and version-independent — it needs no network, no
 * database, and no runtime networking features.
 *
 * What it therefore cannot prove: that a token issued by a real Supabase
 * project survives a round trip through the Keychain adapter, that a refresh
 * works, or that sign-out reaches the server. Those need infrastructure that
 * does not exist yet — PRism has no auth implementation and no linked project
 * (`Docs/architecture.md`, invariant `I-1`).
 *
 * Rather than pretend otherwise, that coverage lives here, ready for the sprint
 * that hooks up the database.
 *
 * ---------------------------------------------------------------------------
 * WHAT IS NEEDED BEFORE THESE CAN RUN
 * ---------------------------------------------------------------------------
 *   1. A Supabase project with `0001_init.sql` and `0002_security_hardening.sql`
 *      applied (`0002` is written but unapplied as of 2026-07-30).
 *   2. `PRISM_INTEGRATION_SUPABASE_URL` and `PRISM_INTEGRATION_SUPABASE_ANON_KEY`
 *      in the environment. Deliberately NOT the `EXPO_PUBLIC_*` names, so a
 *      developer's app config can never silently point a test suite at their own
 *      project.
 *   3. A disposable test account. **Never a real user's credentials**, and never
 *      a service-role key — see `Docs/invariants.md` I-4 and I-5.
 *   4. A Node runtime with a global `WebSocket` (Node 22+), or an explicitly
 *      supplied transport.
 *
 * Until (1) and (2) exist these skip rather than fail: a red suite for missing
 * infrastructure trains people to ignore red suites.
 */

const url = process.env.PRISM_INTEGRATION_SUPABASE_URL;
const anonKey = process.env.PRISM_INTEGRATION_SUPABASE_ANON_KEY;
const configured = Boolean(url && anonKey);

// `describe.skip` keeps the intent visible in the runner output instead of the
// file simply appearing to contain nothing.
const suite = configured ? describe : describe.skip;

suite('Supabase session flow against a real project', () => {
  it('has the environment it needs', () => {
    expect(configured).toBe(true);
    expect(typeof WebSocket).toBe('function');
  });

  /**
   * The checks to write once a project exists. Each is deliberately something
   * the unit lane cannot answer.
   *
   * - A session issued by `signInWithPassword` is persisted through
   *   `secureSessionStorage` and read back by a fresh client instance.
   * - `refreshSession` replaces the stored session, and the old refresh token
   *   stops working.
   * - `signOut` reaches the server and the session no longer authenticates,
   *   rather than only being cleared locally.
   * - A write with a forged `profile_id` is rejected by RLS — the assumption
   *   `src/data/__tests__/ownership.test.ts` currently takes on trust because
   *   there is no database to ask.
   */
  it.todo('persists a server-issued session through the Keychain adapter');
  it.todo('rotates the refresh token and invalidates the previous one');
  it.todo('invalidates the session server-side on sign-out');
  it.todo('rejects a write carrying a forged profile_id (RLS)');
});
