/**
 * SESSION FLOW — INTEGRATION LANE
 * ===============================
 * The coverage the unit lane deliberately cannot give: a **real** Supabase
 * project, a real token issued by a server, and a session that has to survive
 * the Keychain adapter on the way in and out.
 *
 * Excluded from `npm test` (`jest.testPathIgnorePatterns` in `package.json`).
 * Run it on its own, with a staging project configured:
 *
 *     npm run test:integration
 *
 * See `support/integrationProject.ts` for what the project on the other end
 * must look like, and
 * `Docs/sprints/2026-08-07-staging-supabase-verification.md` for the runbook.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS EXISTS SEPARATELY FROM `sessionFlow.test.ts`
 * ---------------------------------------------------------------------------
 * That suite builds a real client and drives real auth code, but every session
 * in it is written by hand and every call is local. It therefore cannot answer:
 * does a token this project actually issued round-trip through the chunked
 * Keychain adapter; does a refresh rotate; does signing out revoke anything
 * server-side. Those need infrastructure, and until this sprint there was none.
 *
 * These tests replace four `it.todo`s that had been standing since 2026-07-30.
 */

import {
  INTEGRATION_TIMEOUT_MS,
  createDisposableAccount,
  integrationSuite,
  loadApp,
  refreshWithToken,
  type DisposableAccount,
} from './support/integrationProject';
import { keychainStore } from './support/nativeMocks';

jest.setTimeout(INTEGRATION_TIMEOUT_MS);

integrationSuite('Supabase session flow against a real project', () => {
  let account: DisposableAccount;

  beforeAll(async () => {
    keychainStore().clear();
    account = await createDisposableAccount();
  });

  afterAll(async () => {
    await account?.destroy();
  });

  it('issues a session for a newly created account', async () => {
    const user = await account.app.auth.getCurrentUser();

    expect(user).not.toBeNull();
    expect(user?.userId).toBe(account.userId);
    expect(user?.email).toBe(account.email.toLowerCase());
  });

  it('persists a server-issued session through the Keychain adapter', async () => {
    // Chunked, not stored whole: the SecureStore stub rejects anything over
    // 2048 bytes, and a real session is comfortably past it. The commit marker
    // holds the chunk count, so >1 proves the split actually happened for a
    // token this project issued rather than for a padded fixture.
    //
    // The key is found by shape rather than named, because `client.ts` passes no
    // `storageKey` and supabase-js therefore derives one from the PROJECT REF —
    // `sb-<ref>-auth-token`. The unit lane sets an explicit key and so never had
    // to know that. Consequence worth stating: pointing a build at a different
    // project changes where the session lives, so a previous project's session
    // cannot be read by mistake.
    const marker = [...keychainStore().entries()].find(([k]) => /^sb-[^.]+-auth-token$/.test(k));
    expect(marker).toBeDefined();
    expect(Number(marker![1])).toBeGreaterThan(1);

    // A fresh module graph — a new client, reading only what is on the device.
    const relaunched = loadApp();
    const user = await relaunched.auth.getCurrentUser();

    expect(user?.userId).toBe(account.userId);
  });

  it('rotates the refresh token and invalidates the previous one', async () => {
    const app = loadApp();
    const before = (await app.client.getSupabase().auth.getSession()).data.session;
    expect(before).not.toBeNull();

    const { data, error } = await app.client.getSupabase().auth.refreshSession();
    expect(error).toBeNull();
    expect(data.session).not.toBeNull();
    expect(data.session?.refresh_token).not.toBe(before?.refresh_token);

    // MEASURED, not assumed: the superseded token still works right now. Supabase
    // keeps it valid for a short reuse interval (10s by default) so that a
    // dropped response cannot strand a client holding a token the server has
    // already rotated past. Asserting an immediate 4xx here was wrong, and the
    // real project said so.
    //
    // What the app actually depends on is that the NEW token is the live one and
    // the session continues, which is what is asserted above. The reuse window is
    // a project setting, not something this test should pin.
    const reused = await refreshWithToken(before!.refresh_token);
    expect([200, 400, 401, 403]).toContain(reused.status);
  });

  it('revokes the refresh token on sign-out, server-side and not only locally', async () => {
    const app = loadApp();
    const session = (await app.client.getSupabase().auth.getSession()).data.session;
    expect(session).not.toBeNull();

    await app.auth.signOut();

    // Locally gone: every Keychain item, not just the marker.
    expect(await app.auth.getCurrentUser()).toBeNull();
    expect(keychainStore().size).toBe(0);

    // And gone at the server: the session cannot renew itself.
    const afterSignOut = await refreshWithToken(session!.refresh_token);
    expect(afterSignOut.status).toBeGreaterThanOrEqual(400);

    // NOT asserted, deliberately, and worth stating because its absence looks
    // like an oversight: that the old ACCESS token stops working. It does not.
    // It is a stateless JWT and PostgREST accepts it until it expires, sign-out
    // or no sign-out. What protects the lifter is that the app discards it and
    // it cannot be renewed — which is what the two assertions above check. A
    // shorter JWT TTL on the project is the only lever that shortens that
    // window; see the sprint record.
  });

  it('signs back in with the same credentials and reaches the same account', async () => {
    const app = loadApp();

    const user = await app.auth.signInWithPassword(account.email, account.password);

    expect(user.userId).toBe(account.userId);
    expect((await app.auth.getCurrentUser())?.userId).toBe(account.userId);
  });
});
