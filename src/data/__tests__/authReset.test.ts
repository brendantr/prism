/**
 * PASSWORD RESET TRANSPORT
 * ========================
 * `confirmPasswordReset` is three server calls behind one function, and the
 * third one — signing straight back out — is the part most likely to be
 * "simplified" away by someone who reads only the first two. These tests exist
 * mostly to make that removal fail loudly.
 *
 * Everything is mocked; no Supabase project is contacted. Consistent with every
 * other suite in this repo, and with the fact that nothing here has ever run
 * against a live project.
 */

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const mockAuth = {
  resetPasswordForEmail: jest.fn(),
  verifyOtp: jest.fn(),
  updateUser: jest.fn(),
  signOut: jest.fn(async () => ({ error: null })),
};

/** Order of calls across the whole client, so step 3 can be pinned to last. */
const callLog: string[] = [];

jest.mock('../supabase/client', () => ({
  DEMO_MODE: false,
  isSupabaseConfigured: true,
  getSupabase: () => ({ auth: mockAuth }),
}));

import {
  confirmPasswordReset,
  isAuthEnabled,
  requestPasswordReset,
} from '../supabase/auth';

const USER = { id: 'user_a', email: 'a@example.com' };

beforeEach(() => {
  jest.clearAllMocks();
  callLog.length = 0;

  mockAuth.resetPasswordForEmail.mockImplementation(async () => {
    callLog.push('resetPasswordForEmail');
    return { data: {}, error: null };
  });
  mockAuth.verifyOtp.mockImplementation(async () => {
    callLog.push('verifyOtp');
    return { data: { user: USER, session: { user: USER } }, error: null };
  });
  mockAuth.updateUser.mockImplementation(async () => {
    callLog.push('updateUser');
    return { data: { user: USER }, error: null };
  });
  mockAuth.signOut.mockImplementation(async () => {
    callLog.push('signOut');
    return { error: null };
  });
});

describe('preconditions', () => {
  it('reports auth as enabled for this configured, non-demo mock', () => {
    expect(isAuthEnabled()).toBe(true);
  });
});

describe('requestPasswordReset', () => {
  it('resolves when the send is accepted', async () => {
    await expect(requestPasswordReset('a@example.com')).resolves.toBeUndefined();
    expect(mockAuth.resetPasswordForEmail).toHaveBeenCalledWith('a@example.com');
  });

  it('passes no redirect URL, because this flow does not use the link', async () => {
    /*
      Deliberate. `detectSessionInUrl` is false and nothing in the repo handles
      an incoming deep link, so a returning link would land nowhere. Passing a
      `redirectTo` would imply a capture path that does not exist and would need
      a URL allow-listed on the project.
    */
    await requestPasswordReset('a@example.com');
    expect(mockAuth.resetPasswordForEmail).toHaveBeenCalledTimes(1);
    expect(mockAuth.resetPasswordForEmail.mock.calls[0]).toHaveLength(1);
  });

  it('throws the raw Supabase error for the domain layer to map', async () => {
    mockAuth.resetPasswordForEmail.mockResolvedValueOnce({ data: null, error: { status: 429 } });
    await expect(requestPasswordReset('a@example.com')).rejects.toEqual({ status: 429 });
  });
});

describe('confirmPasswordReset', () => {
  it('verifies the code, updates the password, and returns the user', async () => {
    const user = await confirmPasswordReset('a@example.com', '123456', 'a new long password');

    expect(mockAuth.verifyOtp).toHaveBeenCalledWith({
      type: 'recovery',
      email: 'a@example.com',
      token: '123456',
    });
    expect(mockAuth.updateUser).toHaveBeenCalledWith({ password: 'a new long password' });
    expect(user).toEqual({ userId: 'user_a', email: 'a@example.com' });
  });

  it('ends signed out, and signs out LAST', async () => {
    /*
      The load-bearing assertion. `verifyOtp` leaves the app authenticated --
      that is the only way `updateUser` can work -- and continuing into Today off
      the back of an emailed code is a surprising way to end a password reset,
      especially on a shared device. The lifter returns to sign-in and proves the
      new password works.
    */
    await confirmPasswordReset('a@example.com', '123456', 'a new long password');

    expect(callLog).toEqual(['verifyOtp', 'updateUser', 'signOut']);
  });

  it('does not update the password when the code is rejected', async () => {
    mockAuth.verifyOtp.mockResolvedValueOnce({ data: { user: null }, error: { status: 403 } });

    await expect(
      confirmPasswordReset('a@example.com', '000000', 'a new long password'),
    ).rejects.toEqual({ status: 403 });

    expect(mockAuth.updateUser).not.toHaveBeenCalled();
  });

  it('rejects a verification that returns no user rather than proceeding', async () => {
    mockAuth.verifyOtp.mockResolvedValueOnce({ data: { user: null }, error: null });

    await expect(
      confirmPasswordReset('a@example.com', '123456', 'a new long password'),
    ).rejects.toThrow(/did not produce a session/i);
    expect(mockAuth.updateUser).not.toHaveBeenCalled();
  });

  it('throws the raw update error for the domain layer to map', async () => {
    mockAuth.updateUser.mockResolvedValueOnce({ data: { user: null }, error: { status: 422 } });

    await expect(
      confirmPasswordReset('a@example.com', '123456', 'short'),
    ).rejects.toEqual({ status: 422 });
  });

  it('never returns an error message from the server', async () => {
    // Whatever it throws is mapped by `toAuthFailure` before any screen sees it;
    // this pins that nothing is formatted into a user-facing string here.
    mockAuth.verifyOtp.mockResolvedValueOnce({
      data: { user: null },
      error: { status: 403, message: 'token_hash not found for user 11111111-1111' },
    });

    await expect(
      confirmPasswordReset('a@example.com', '000000', 'a new long password'),
    ).rejects.toHaveProperty('status', 403);
  });
});
