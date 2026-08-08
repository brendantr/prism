/**
 * The two native modules `secureSessionStorage` sits on, faked for Node.
 *
 * Shared by the integration lane so each suite does not re-declare them, and
 * kept faithful in the one way that matters: `setItemAsync` **enforces the
 * ~2048-byte SecureStore ceiling**. A real Supabase access token is well over
 * it, so a regression that stopped chunking would fail here rather than only on
 * a device — which is the whole reason this lane stores a server-issued session
 * instead of a hand-written one.
 *
 * The store lives on `globalThis` because `loadApp()` calls `jest.resetModules()`,
 * which re-evaluates this module. A module-scoped `Map` would be replaced
 * underneath any test still holding a reference to the old one.
 */

const STORE_KEY = Symbol.for('prism.integration.keychain');

type GlobalWithStore = typeof globalThis & { [STORE_KEY]?: Map<string, string> };

export function keychainStore(): Map<string, string> {
  const g = globalThis as GlobalWithStore;
  if (!g[STORE_KEY]) g[STORE_KEY] = new Map<string, string>();
  return g[STORE_KEY];
}

