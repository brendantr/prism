/**
 * SESSION FLOW — the Keychain adapter against the real Supabase client.
 *
 * `secureStorage.test.ts` proves the adapter round-trips strings. That is not
 * the same as proving it works, because it never asks the question that
 * matters: does `@supabase/supabase-js` agree with it?
 *
 * These tests wire the real client to the real adapter and drive the real
 * session lifecycle. Everything is local -- a session that has not expired is
 * read straight out of storage, and `signOut({ scope: 'local' })` skips the API
 * call -- so there is no network here and no Supabase project involved.
 *
 * What this still does NOT cover, and is not claimed: signing in for real.
 * Nothing here obtains a token from a server. See the sprint record.
 *
 * WHY A TRANSPORT IS INJECTED
 * ---------------------------
 * `createClient()` resolves a WebSocket implementation eagerly, so on a Node
 * runtime without a global `WebSocket` it cannot be constructed at all -- which
 * made this suite pass locally (Node 22+) and fail on CI purely on runtime
 * version. `OFFLINE_REALTIME_OPTIONS` removes that dependency.
 *
 * It changes nothing about what is asserted below. PRism's session handling
 * never opens a socket, and the injected transport throws if anything tries to
 * construct it, so this stays a real client exercising real auth code rather
 * than a fake standing in for one. See `support/realtimeTransport.ts`.
 */

jest.mock(
  '@react-native-async-storage/async-storage',
  () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const mockKeychain = new Map<string, string>();

jest.mock('expo-secure-store', () => ({
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 'after-first-unlock-this-device-only',
  getItemAsync: jest.fn(async (key: string) => mockKeychain.get(key) ?? null),
  setItemAsync: jest.fn(async (key: string, value: string) => {
    const bytes = Buffer.byteLength(value, 'utf8');
    if (bytes > 2048) throw new Error(`SecureStore value too large: ${bytes} bytes`);
    mockKeychain.set(key, value);
  }),
  deleteItemAsync: jest.fn(async (key: string) => {
    mockKeychain.delete(key);
  }),
}));

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { secureSessionStorage } from '../secureStorage';
import { OFFLINE_REALTIME_OPTIONS } from './support/realtimeTransport';

const STORAGE_KEY = 'sb-prism-auth-token';

/**
 * A session shaped the way auth-js persists one: the whole Session object,
 * JSON-encoded, under `storageKey`. The user payload is padded so the encoded
 * session comfortably exceeds SecureStore's ~2048-byte ceiling and therefore
 * exercises the chunking path rather than the single-item happy case.
 */
function fakeSession(expiresInSeconds = 3600) {
  const expiresAt = Math.floor(Date.now() / 1000) + expiresInSeconds;
  return {
    access_token: `header.${'a'.repeat(1200)}.signature`,
    refresh_token: `refresh-${'r'.repeat(300)}`,
    expires_at: expiresAt,
    expires_in: expiresInSeconds,
    token_type: 'bearer',
    user: {
      id: '00000000-0000-4000-8000-000000000001',
      aud: 'authenticated',
      role: 'authenticated',
      email: 'lifter@example.com',
      app_metadata: { provider: 'email' },
      user_metadata: { display_name: 'Lifter' },
      created_at: new Date(0).toISOString(),
    },
  };
}

function makeClient(): SupabaseClient {
  return createClient('https://prism.supabase.co', 'anon-key-not-a-real-secret', {
    auth: {
      storage: secureSessionStorage,
      storageKey: STORAGE_KEY,
      // No refresh timer and no URL parsing: this test must stay offline.
      autoRefreshToken: false,
      persistSession: true,
      detectSessionInUrl: false,
    },
    // Keeps the client constructible on a Node runtime with no global
    // WebSocket. Not used by any auth path -- see the file header.
    ...OFFLINE_REALTIME_OPTIONS,
  });
}

/** Exactly how auth-js writes a session: JSON, through the storage adapter. */
async function writeSessionThroughAdapter(session: object) {
  await secureSessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

beforeEach(() => mockKeychain.clear());

describe('Supabase session flow over the Keychain adapter', () => {
  it('lets the real client read back a session the adapter stored', async () => {
    const session = fakeSession();
    await writeSessionThroughAdapter(session);

    const { data, error } = await makeClient().auth.getSession();

    expect(error).toBeNull();
    expect(data.session).not.toBeNull();
    expect(data.session?.access_token).toBe(session.access_token);
    expect(data.session?.refresh_token).toBe(session.refresh_token);
    expect(data.session?.user.id).toBe(session.user.id);
  });

  it('stores the session across multiple Keychain items rather than one oversized one', async () => {
    await writeSessionThroughAdapter(fakeSession());

    // The commit marker holds the chunk count; >1 proves the session really was
    // split. The SecureStore mock throws above 2048 bytes, so a regression to
    // single-item storage fails here rather than only on a device.
    expect(Number(mockKeychain.get(STORAGE_KEY))).toBeGreaterThan(1);
  });

  it('purges every Keychain item on sign-out, even when the server call fails', async () => {
    await writeSessionThroughAdapter(fakeSession());
    const client = makeClient();
    expect((await client.auth.getSession()).data.session).not.toBeNull();

    // `scope: 'local'` still contacts the auth API in auth-js 2.110 (verified in
    // GoTrueClient._signOut), so offline it comes back with an error. That is
    // deliberately NOT asserted to be null -- the security-relevant question is
    // not whether the server was reachable, it is whether the token survived on
    // the device. Source confirms the failure path calls removeCurrentSession()
    // before returning the error, and these assertions hold it to that.
    await client.auth.signOut({ scope: 'local' });

    expect(mockKeychain.size).toBe(0);
    expect(await secureSessionStorage.getItem(STORAGE_KEY)).toBeNull();
    expect((await client.auth.getSession()).data.session).toBeNull();
  });

  it('presents a half-written session as signed out, never as a partial one', async () => {
    await writeSessionThroughAdapter(fakeSession());
    // Simulate a write torn off mid-flight: a chunk is gone, marker still there.
    mockKeychain.delete(`${STORAGE_KEY}.1`);

    const { data, error } = await makeClient().auth.getSession();

    // The lifter signs in again. That is the correct failure -- the alternative
    // is handing the client a truncated token.
    expect(error).toBeNull();
    expect(data.session).toBeNull();
  });

  it('treats an absent session as signed out', async () => {
    const { data, error } = await makeClient().auth.getSession();

    expect(error).toBeNull();
    expect(data.session).toBeNull();
  });
});
