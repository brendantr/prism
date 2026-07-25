import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Supabase client, created lazily so that demo mode never touches the network
 * and the app boots fine with no environment variables at all.
 */

const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

export const DEMO_MODE = (process.env.EXPO_PUBLIC_DEMO_MODE ?? 'true') !== 'false';

/** True when real credentials are present and demo mode is off. */
export const isSupabaseConfigured = !DEMO_MODE && url.length > 0 && anonKey.length > 0;

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
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        // React Native has no URL bar to parse a session out of.
        detectSessionInUrl: false,
      },
    });
  }
  return client;
}
