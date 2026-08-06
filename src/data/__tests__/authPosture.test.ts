/**
 * BUILD POSTURE, WITH AUTH IN THE PICTURE
 * =======================================
 * `client.ts` resolves the mode at module load, so each case here re-imports
 * the module graph under a different environment. That is the only way to
 * exercise a build-time decision from a test, and it is why these live apart
 * from the store suites.
 *
 * The case that matters most is the middle one: demo off with no credentials.
 * The auth gate must not divert that build to a sign-in screen, because doing
 * so would ask someone to type a password into a form that cannot work while
 * hiding the message that names the actual problem
 * (`Docs/production-posture-v1.md` §5).
 */

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const ENV_KEYS = [
  'EXPO_PUBLIC_DEMO_MODE',
  'EXPO_PUBLIC_SUPABASE_URL',
  'EXPO_PUBLIC_SUPABASE_ANON_KEY',
] as const;

const originalEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const key of ENV_KEYS) originalEnv[key] = process.env[key];
  jest.resetModules();
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
  jest.resetModules();
});

function setEnv(env: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>>) {
  for (const key of ENV_KEYS) {
    const value = env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

describe('demo build', () => {
  beforeEach(() => setEnv({ EXPO_PUBLIC_DEMO_MODE: 'true' }));

  it('has no account system', () => {
    const { isAuthEnabled } = require('../supabase/auth');
    expect(isAuthEnabled()).toBe(false);
  });

  it('resolves the session phase to disabled without touching the client', async () => {
    const { useSessionStore } = require('@/store/sessionStore');

    await useSessionStore.getState().initialize();

    expect(useSessionStore.getState().phase).toBe('disabled');
    expect(useSessionStore.getState().userId).toBeNull();
  });

  it('still returns a working repository', () => {
    const { getRepository } = require('../repository');
    expect(getRepository().kind).toBe('demo');
  });
});

describe('misconfigured build (demo off, no credentials)', () => {
  beforeEach(() =>
    setEnv({
      EXPO_PUBLIC_DEMO_MODE: 'false',
      EXPO_PUBLIC_SUPABASE_URL: undefined,
      EXPO_PUBLIC_SUPABASE_ANON_KEY: undefined,
    }),
  );

  it('has no account system, so the gate cannot divert to sign-in', async () => {
    const { isAuthEnabled } = require('../supabase/auth');
    const { useSessionStore } = require('@/store/sessionStore');

    expect(isAuthEnabled()).toBe(false);

    await useSessionStore.getState().initialize();
    expect(useSessionStore.getState().phase).toBe('disabled');
  });

  it('still fails loudly with the message that names the missing variables', () => {
    // The auth work must not have shadowed this. `phase: 'disabled'` above is
    // precisely what lets startup reach it.
    const { getRepository } = require('../repository');
    const { SUPABASE_MISCONFIGURED_MESSAGE } = require('../supabase/client');

    expect(() => getRepository()).toThrow(SUPABASE_MISCONFIGURED_MESSAGE);
    expect(SUPABASE_MISCONFIGURED_MESSAGE).toContain('EXPO_PUBLIC_SUPABASE_URL');
  });
});

describe('configured production build', () => {
  beforeEach(() =>
    setEnv({
      EXPO_PUBLIC_DEMO_MODE: 'false',
      EXPO_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
      EXPO_PUBLIC_SUPABASE_ANON_KEY: 'test-anon-key-not-a-real-credential',
    }),
  );

  it('has an account system', () => {
    const { isAuthEnabled } = require('../supabase/auth');
    expect(isAuthEnabled()).toBe(true);
  });

  it('lands unauthenticated when there is no stored session', async () => {
    const { useSessionStore } = require('@/store/sessionStore');

    await useSessionStore.getState().initialize();

    expect(useSessionStore.getState().phase).toBe('unauthenticated');
  });

  it('does not load training data while unauthenticated', async () => {
    /*
      The gate's whole purpose. `refresh()` used to fire on mount regardless,
      which meant eight repository calls rejecting on a session that did not
      exist -- an error screen reached before the app had decided the lifter
      should be looking at sign-in.
    */
    const { useSessionStore } = require('@/store/sessionStore');
    const { useTrainingStore } = require('@/store/trainingStore');

    await useSessionStore.getState().initialize();

    expect(useSessionStore.getState().phase).toBe('unauthenticated');
    expect(useTrainingStore.getState().status).toBe('idle');
    expect(useTrainingStore.getState().workouts).toEqual([]);
  });
});
