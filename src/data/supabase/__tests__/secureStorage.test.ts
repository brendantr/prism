/**
 * The session adapter's job is to survive two things AsyncStorage never had to:
 * a hard size ceiling per item, and being interrupted halfway through a write.
 * Both are tested here against an in-memory stand-in for the Keychain.
 */

// Pulled in only by the adapter's web fallback, which never runs under this
// preset -- but the import is top-level, so it still needs a native stand-in.
jest.mock(
  '@react-native-async-storage/async-storage',
  () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// `mock` prefix is required: jest hoists the factory above the imports, and
// only mock-prefixed bindings may be referenced from inside it.
const mockKeychain = new Map<string, string>();

jest.mock('expo-secure-store', () => ({
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 'after-first-unlock-this-device-only',
  getItemAsync: jest.fn(async (key: string) => mockKeychain.get(key) ?? null),
  setItemAsync: jest.fn(async (key: string, value: string) => {
    // Mirror the real ceiling so an oversized write fails the test rather than
    // passing here and failing on a device.
    const bytes = Buffer.byteLength(value, 'utf8');
    if (bytes > 2048) throw new Error(`SecureStore value too large: ${bytes} bytes`);
    mockKeychain.set(key, value);
  }),
  deleteItemAsync: jest.fn(async (key: string) => {
    mockKeychain.delete(key);
  }),
}));

import { secureSessionStorage } from '../secureStorage';

const KEY = 'sb-prism-auth-token';

beforeEach(() => mockKeychain.clear());

/** Roughly the shape and size of a real Supabase session. */
function sessionOfSize(bytes: number): string {
  return JSON.stringify({ access_token: 'a'.repeat(bytes), token_type: 'bearer' });
}

describe('secureSessionStorage', () => {
  it('round-trips a session larger than one SecureStore item', async () => {
    const session = sessionOfSize(6000);
    await secureSessionStorage.setItem(KEY, session);

    expect(await secureSessionStorage.getItem(KEY)).toBe(session);
    // Proves it actually split rather than storing one oversized value.
    expect(Number(mockKeychain.get(KEY))).toBeGreaterThan(1);
  });

  it('round-trips multi-byte characters without corrupting them', async () => {
    // A display name inside the session is free to contain astral-plane
    // characters; chunking on code units instead of code points would split a
    // surrogate pair and mangle them.
    const session = JSON.stringify({ name: '🏋 Ünïcödé ' + '🎯'.repeat(400) });
    await secureSessionStorage.setItem(KEY, session);

    expect(await secureSessionStorage.getItem(KEY)).toBe(session);
  });

  it('reports no session when the commit marker was never written', async () => {
    // Simulates a write interrupted after some chunks but before the marker.
    mockKeychain.set(`${KEY}.0`, 'orphaned-chunk');

    expect(await secureSessionStorage.getItem(KEY)).toBeNull();
  });

  it('fails closed when a chunk is missing under a valid marker', async () => {
    await secureSessionStorage.setItem(KEY, sessionOfSize(6000));
    mockKeychain.delete(`${KEY}.1`);

    // Must not hand Supabase a truncated token.
    expect(await secureSessionStorage.getItem(KEY)).toBeNull();
  });

  it('does not leave stale chunks when a shorter session replaces a longer one', async () => {
    await secureSessionStorage.setItem(KEY, sessionOfSize(6000));
    const short = sessionOfSize(10);
    await secureSessionStorage.setItem(KEY, short);

    expect(await secureSessionStorage.getItem(KEY)).toBe(short);
    expect(mockKeychain.has(`${KEY}.1`)).toBe(false);
  });

  it('clears every chunk on sign-out', async () => {
    await secureSessionStorage.setItem(KEY, sessionOfSize(6000));
    await secureSessionStorage.removeItem(KEY);

    expect(await secureSessionStorage.getItem(KEY)).toBeNull();
    expect(mockKeychain.size).toBe(0);
  });
});
