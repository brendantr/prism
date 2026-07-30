import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

/**
 * SESSION STORAGE
 * ===============
 * Where the Supabase session lives at rest.
 *
 * Supabase persists the access token *and* the long-lived refresh token through
 * whatever storage it is handed. On AsyncStorage that is an unencrypted file in
 * the app container, readable by anyone with filesystem access -- and a stolen
 * refresh token survives a password change, so the victim cannot self-remediate.
 * This adapter puts it in the iOS Keychain / Android Keystore instead.
 *
 * Two constraints shape the implementation:
 *
 *   1. SecureStore rejects values over ~2048 bytes. A Supabase session is
 *      comfortably larger than that, so values are split across numbered keys.
 *   2. A write can be interrupted (crash, kill, low memory) partway through
 *      those keys. The chunk count is therefore written *last* and acts as the
 *      commit marker: until it lands, `getItem` reports no session at all. A
 *      half-written session reads as "signed out", never as a corrupt one.
 */

/**
 * Conservative ceiling per SecureStore item. The real limit is ~2048 bytes, and
 * chunks are packed by UTF-8 byte length rather than character count so a
 * display name full of multi-byte characters cannot silently push an item over.
 */
const MAX_CHUNK_BYTES = 1800;

/**
 * Upper bound on chunks swept when the commit marker is missing or unreadable.
 * Only used to clean up orphans; a real session is a handful of chunks.
 */
const MAX_CHUNKS = 32;

/**
 * Keychain items are device-only, so they are excluded from iCloud and from
 * encrypted backups restored onto a different device -- which is the backup
 * -extraction path in the threat model.
 *
 * `AFTER_FIRST_UNLOCK` rather than `WHEN_UNLOCKED`: the client is configured
 * with `autoRefreshToken`, and a refresh that fires while the screen is locked
 * must still be able to read the token. `WHEN_UNLOCKED` would fail that read and
 * silently sign the user out. Both settings are hardware-encrypted at rest and
 * both stay off backups; this one does not trade a real security gain for a
 * refresh failure.
 */
const KEYCHAIN_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

/** UTF-8 byte length of a single code point. */
function utf8Length(codePoint: number): number {
  if (codePoint <= 0x7f) return 1;
  if (codePoint <= 0x7ff) return 2;
  if (codePoint <= 0xffff) return 3;
  return 4;
}

/**
 * Split on code-point boundaries, packing greedily up to `MAX_CHUNK_BYTES`.
 *
 * Splitting on code points rather than UTF-16 code units matters: cutting a
 * surrogate pair in half would hand a lone surrogate to the native bridge,
 * which is free to mangle it.
 */
function chunk(value: string): string[] {
  const chunks: string[] = [];
  let current = '';
  let currentBytes = 0;

  for (const character of value) {
    const bytes = utf8Length(character.codePointAt(0) as number);
    if (currentBytes + bytes > MAX_CHUNK_BYTES) {
      chunks.push(current);
      current = '';
      currentBytes = 0;
    }
    current += character;
    currentBytes += bytes;
  }
  if (current.length > 0) chunks.push(current);

  return chunks;
}

const chunkKey = (key: string, index: number) => `${key}.${index}`;

/**
 * SecureStore has no web implementation and throws when called there. `app.json`
 * declares a web target, so web falls back to the previous AsyncStorage
 * behaviour rather than crashing on boot.
 *
 * This is not a hardened path -- on web AsyncStorage is `localStorage`, which
 * any XSS can read. Web is not a supported target for real accounts; see the
 * sprint record's follow-ups.
 */
const useSecureStore = Platform.OS !== 'web';

async function clearChunks(key: string, knownCount: number | null): Promise<void> {
  const count = knownCount ?? MAX_CHUNKS;
  for (let i = 0; i < count; i++) {
    await SecureStore.deleteItemAsync(chunkKey(key, i), KEYCHAIN_OPTIONS);
  }
}

export const secureSessionStorage = {
  async getItem(key: string): Promise<string | null> {
    if (!useSecureStore) return AsyncStorage.getItem(key);

    const marker = await SecureStore.getItemAsync(key, KEYCHAIN_OPTIONS);
    if (marker === null) return null;

    const count = Number.parseInt(marker, 10);
    if (!Number.isInteger(count) || count <= 0) {
      // Marker present but meaningless -- treat as no session and tidy up.
      await this.removeItem(key);
      return null;
    }

    let value = '';
    for (let i = 0; i < count; i++) {
      const part = await SecureStore.getItemAsync(chunkKey(key, i), KEYCHAIN_OPTIONS);
      if (part === null) {
        // A chunk vanished under a valid marker: the session is unrecoverable.
        // Fail closed rather than handing Supabase a truncated token.
        await this.removeItem(key);
        return null;
      }
      value += part;
    }
    return value;
  },

  async setItem(key: string, value: string): Promise<void> {
    if (!useSecureStore) return AsyncStorage.setItem(key, value);

    // Drop the previous session first so a shorter one cannot leave stale
    // trailing chunks that a later, longer write would read back as its own.
    await this.removeItem(key);

    const parts = chunk(value);
    for (let i = 0; i < parts.length; i++) {
      await SecureStore.setItemAsync(chunkKey(key, i), parts[i], KEYCHAIN_OPTIONS);
    }
    // Commit marker, written last -- see the file header.
    await SecureStore.setItemAsync(key, String(parts.length), KEYCHAIN_OPTIONS);
  },

  async removeItem(key: string): Promise<void> {
    if (!useSecureStore) return AsyncStorage.removeItem(key);

    const marker = await SecureStore.getItemAsync(key, KEYCHAIN_OPTIONS);
    const parsed = marker === null ? NaN : Number.parseInt(marker, 10);

    // Marker goes first: if this is interrupted, what remains reads as no
    // session rather than as a session missing its chunks.
    await SecureStore.deleteItemAsync(key, KEYCHAIN_OPTIONS);
    await clearChunks(key, Number.isInteger(parsed) && parsed > 0 ? parsed : null);
  },
};
