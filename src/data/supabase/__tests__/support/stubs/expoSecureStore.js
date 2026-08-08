/**
 * The Keychain, as a Map -- with SecureStore's real ~2048-byte ceiling kept.
 *
 * The ceiling is the point: a real Supabase session is well past it, so a
 * regression that stopped chunking fails here rather than only on a device.
 * The store hangs off `globalThis` because `loadApp()` resets the module
 * registry between accounts and a module-scoped Map would be replaced.
 */
const KEY = Symbol.for('prism.integration.keychain');
function store() {
  if (!globalThis[KEY]) globalThis[KEY] = new Map();
  return globalThis[KEY];
}
module.exports = {
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 'after-first-unlock-this-device-only',
  getItemAsync: async (k) => store().get(k) ?? null,
  setItemAsync: async (k, v) => {
    const bytes = Buffer.byteLength(v, 'utf8');
    if (bytes > 2048) throw new Error(`SecureStore value too large: ${bytes} bytes`);
    store().set(k, v);
  },
  deleteItemAsync: async (k) => {
    store().delete(k);
  },
  __store: store,
};
