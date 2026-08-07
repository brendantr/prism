import {
  getCurrentUser,
  isAuthEnabled,
  signInWithPassword,
  signUpWithPassword,
  subscribeToAuthState,
  type AuthStateEvent,
} from '@/data/supabase/auth';
import { __resetSessionSubscriptionForTests, useSessionStore } from '../sessionStore';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

/**
 * The transport layer is mocked; the state machine is not.
 *
 * `src/data/supabase/__tests__/sessionFlow.test.ts` already drives the real
 * Supabase client against the real Keychain adapter, and deliberately obtains
 * no token from a server. What is untested until here is the layer above it:
 * which phase the app lands in, and therefore which surface the lifter sees.
 */
jest.mock('@/data/supabase/auth', () => ({
  isAuthEnabled: jest.fn(() => true),
  getCurrentUser: jest.fn(async () => null),
  signInWithPassword: jest.fn(),
  signUpWithPassword: jest.fn(),
  signOut: jest.fn(async () => undefined),
  subscribeToAuthState: jest.fn(() => null),
}));

const mockIsAuthEnabled = isAuthEnabled as jest.MockedFunction<typeof isAuthEnabled>;
const mockGetCurrentUser = getCurrentUser as jest.MockedFunction<typeof getCurrentUser>;
const mockSignIn = signInWithPassword as jest.MockedFunction<typeof signInWithPassword>;
const mockSignUp = signUpWithPassword as jest.MockedFunction<typeof signUpWithPassword>;
const mockSubscribe = subscribeToAuthState as jest.MockedFunction<typeof subscribeToAuthState>;

/** A signed-in user, in the shape `src/data/supabase/auth.ts` hands back. */
function user(userId: string, email: string | null = `${userId}@example.com`) {
  return { userId, email };
}

/** Drives whatever handler the store registered with `subscribeToAuthState`. */
function emitAuthEvent(event: AuthStateEvent, userId: string | null) {
  const handler = mockSubscribe.mock.calls[0]?.[0];
  if (!handler) throw new Error('store never subscribed to auth state');
  handler(event, userId === null ? null : user(userId));
}

beforeEach(() => {
  jest.clearAllMocks();
  __resetSessionSubscriptionForTests();
  useSessionStore.setState({
    phase: 'unknown',
    userId: null,
    email: null,
    pending: null,
    lastFailure: null,
  });
  mockIsAuthEnabled.mockReturnValue(true);
  mockGetCurrentUser.mockResolvedValue(null);
  mockSubscribe.mockReturnValue(null);
});

describe('initialize', () => {
  it('lands authenticated when a session is restored from storage', async () => {
    mockGetCurrentUser.mockResolvedValue(user('user_a'));

    await useSessionStore.getState().initialize();

    expect(useSessionStore.getState().phase).toBe('authenticated');
    expect(useSessionStore.getState().userId).toBe('user_a');
    expect(useSessionStore.getState().email).toBe('user_a@example.com');
  });

  it('carries a null email through rather than inventing one', async () => {
    // Supabase can return a user with no email. The account sheet falls back to
    // the display name; it must not render "Signed in as null".
    mockGetCurrentUser.mockResolvedValue(user('user_a', null));

    await useSessionStore.getState().initialize();

    expect(useSessionStore.getState().email).toBeNull();
  });

  it('lands unauthenticated when there is no stored session', async () => {
    await useSessionStore.getState().initialize();

    expect(useSessionStore.getState().phase).toBe('unauthenticated');
    expect(useSessionStore.getState().userId).toBeNull();
  });

  it('treats a half-written session as signed out, not as an error', async () => {
    /*
      `secureStorage.getItem` fails closed: a session whose commit marker landed
      but whose chunks did not reads as null. That contract has to survive up
      here as "sign in again", because the alternative -- an error phase -- is a
      state with no screen and no way out.
    */
    mockGetCurrentUser.mockResolvedValue(null);

    await useSessionStore.getState().initialize();

    expect(useSessionStore.getState().phase).toBe('unauthenticated');
    expect(useSessionStore.getState().lastFailure).toBeNull();
  });

  it('is idempotent and subscribes exactly once', async () => {
    mockGetCurrentUser.mockResolvedValue(user('user_a'));

    await useSessionStore.getState().initialize();
    await useSessionStore.getState().initialize();

    expect(mockSubscribe).toHaveBeenCalledTimes(1);
    expect(mockGetCurrentUser).toHaveBeenCalledTimes(1);
  });

  describe('when this build has no accounts', () => {
    beforeEach(() => {
      mockIsAuthEnabled.mockReturnValue(false);
    });

    it('resolves to disabled', async () => {
      await useSessionStore.getState().initialize();
      expect(useSessionStore.getState().phase).toBe('disabled');
    });

    it('never reads a session or subscribes -- no client is constructed', async () => {
      // The demo guarantee: zero network, zero Keychain, and `getSupabase()`
      // (which throws when unconfigured) is never reached.
      await useSessionStore.getState().initialize();

      expect(mockGetCurrentUser).not.toHaveBeenCalled();
      expect(mockSubscribe).not.toHaveBeenCalled();
    });
  });
});

describe('auth state events', () => {
  beforeEach(async () => {
    mockGetCurrentUser.mockResolvedValue(user('user_a'));
    await useSessionStore.getState().initialize();
  });

  it('routes a revoked or expired refresh token to unauthenticated', () => {
    emitAuthEvent('SIGNED_OUT', null);

    expect(useSessionStore.getState().phase).toBe('unauthenticated');
    expect(useSessionStore.getState().userId).toBeNull();
    // The identity goes with the session -- an account sheet reached on a stale
    // render must never still name the person who just lost their token.
    expect(useSessionStore.getState().email).toBeNull();
    expect(useSessionStore.getState().lastFailure).toBe('sessionExpired');
  });

  it('keeps the session on a token refresh', () => {
    emitAuthEvent('TOKEN_REFRESHED', 'user_a');

    expect(useSessionStore.getState().phase).toBe('authenticated');
    expect(useSessionStore.getState().userId).toBe('user_a');
  });

  it('ignores events it has no behaviour for', () => {
    emitAuthEvent('OTHER', 'user_a');

    expect(useSessionStore.getState().phase).toBe('authenticated');
  });
});

describe('signIn', () => {
  it('authenticates and clears the form state on success', async () => {
    mockSignIn.mockResolvedValue(user('user_a'));

    const ok = await useSessionStore.getState().signIn('a@example.com', 'correct horse battery');

    expect(ok).toBe(true);
    expect(useSessionStore.getState().phase).toBe('authenticated');
    expect(useSessionStore.getState().userId).toBe('user_a');
    expect(useSessionStore.getState().pending).toBeNull();
    expect(useSessionStore.getState().lastFailure).toBeNull();
  });

  it('maps a rejection to a code and leaves the phase alone', async () => {
    mockSignIn.mockRejectedValue({ status: 400, code: 'invalid_credentials' });
    useSessionStore.setState({ phase: 'unauthenticated' });

    const ok = await useSessionStore.getState().signIn('a@example.com', 'wrong');

    expect(ok).toBe(false);
    expect(useSessionStore.getState().phase).toBe('unauthenticated');
    expect(useSessionStore.getState().lastFailure).toBe('invalidCredentials');
    expect(useSessionStore.getState().pending).toBeNull();
  });

  it('never leaves pending set after a rejection', async () => {
    // A stranded spinner is unrecoverable without a relaunch.
    mockSignIn.mockRejectedValue(new TypeError('Network request failed'));

    await useSessionStore.getState().signIn('a@example.com', 'whatever');

    expect(useSessionStore.getState().pending).toBeNull();
    expect(useSessionStore.getState().lastFailure).toBe('network');
  });
});

describe('signUp', () => {
  it('does NOT authenticate when confirmation is required', async () => {
    /*
      The assumed project setting. Supabase creates the user and withholds the
      session until the address is verified; reporting success would send the
      gate to Today, where every query fails on a session that does not exist.
    */
    mockSignUp.mockResolvedValue({ user: null, sessionEstablished: false });
    useSessionStore.setState({ phase: 'unauthenticated' });

    const ok = await useSessionStore.getState().signUp('a@example.com', 'correct horse battery');

    expect(ok).toBe(false);
    expect(useSessionStore.getState().phase).toBe('unauthenticated');
    expect(useSessionStore.getState().lastFailure).toBe('checkEmail');
  });

  it('signs straight in if the project ever stops requiring confirmation', async () => {
    mockSignUp.mockResolvedValue({ user: user('user_new'), sessionEstablished: true });

    const ok = await useSessionStore.getState().signUp('a@example.com', 'correct horse battery');

    expect(ok).toBe(true);
    expect(useSessionStore.getState().phase).toBe('authenticated');
    expect(useSessionStore.getState().userId).toBe('user_new');
  });

  it('maps a rejection like any other attempt', async () => {
    mockSignUp.mockRejectedValue({ status: 429 });

    await useSessionStore.getState().signUp('a@example.com', 'correct horse battery');

    expect(useSessionStore.getState().lastFailure).toBe('rateLimited');
  });
});
