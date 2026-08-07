import { toAuthFailure } from '../authErrors';

/**
 * The mapper's job is containment: whatever Supabase returns, exactly one of
 * six reviewed codes comes out, and nothing that was not reviewed reaches a
 * screen. The `unknown` cases below matter as much as the recognised ones --
 * an error nobody anticipated is the one most likely to name an endpoint.
 */
describe('toAuthFailure', () => {
  it('maps a rejected password to invalidCredentials', () => {
    expect(toAuthFailure({ status: 400, code: 'invalid_credentials' })).toBe('invalidCredentials');
  });

  it('maps an unconfirmed email to invalidCredentials, not a distinct state', () => {
    // Supabase distinguishes this; the user-facing taxonomy deliberately does
    // not, because "that address exists but is unconfirmed" is an enumeration
    // signal.
    expect(toAuthFailure({ status: 400, code: 'email_not_confirmed' })).toBe('invalidCredentials');
  });

  it('maps any 400/401 without a code to invalidCredentials', () => {
    expect(toAuthFailure({ status: 401 })).toBe('invalidCredentials');
  });

  it('maps 429 and rate-limit codes to rateLimited', () => {
    expect(toAuthFailure({ status: 429 })).toBe('rateLimited');
    expect(toAuthFailure({ code: 'over_request_rate_limit' })).toBe('rateLimited');
    expect(toAuthFailure({ message: 'Email rate limit exceeded' })).toBe('rateLimited');
  });

  it('maps a failed fetch to network rather than blaming the credentials', () => {
    expect(toAuthFailure(new TypeError('Network request failed'))).toBe('network');
    expect(toAuthFailure({ name: 'AuthRetryableFetchError', status: 0 })).toBe('network');
  });

  it('prefers network over the status-code branches when both could match', () => {
    // A retryable fetch error can carry a status; reading it as a credential
    // failure would tell someone their password is wrong when their wifi is.
    expect(toAuthFailure({ name: 'AuthRetryableFetchError', status: 400 })).toBe('network');
  });

  it('maps a missing session/refresh token to sessionExpired', () => {
    expect(toAuthFailure({ code: 'session_not_found' })).toBe('sessionExpired');
    expect(toAuthFailure({ code: 'refresh_token_not_found' })).toBe('sessionExpired');
  });

  it('maps unrecognised shapes to unknown', () => {
    expect(toAuthFailure({ status: 500 })).toBe('unknown');
    expect(toAuthFailure({ code: 'something_new_from_the_server' })).toBe('unknown');
  });

  it('maps non-objects to unknown without throwing', () => {
    expect(toAuthFailure(null)).toBe('unknown');
    expect(toAuthFailure(undefined)).toBe('unknown');
    expect(toAuthFailure('a bare string')).toBe('unknown');
    expect(toAuthFailure(42)).toBe('unknown');
  });

  describe('on the reset-code path', () => {
    /*
      The server returns the same 4xx family for "that password is wrong" and
      "that recovery code is wrong", so the caller passes which call it made.
      Guessing from the error alone would put the wrong sentence on screen.
    */
    it('maps the 4xx family to invalidCode rather than invalidCredentials', () => {
      for (const status of [400, 401, 403, 422]) {
        expect(toAuthFailure({ status }, 'resetCode')).toBe('invalidCode');
      }
    });

    it('recognises an expired one-time code by its own code, in either context', () => {
      expect(toAuthFailure({ code: 'otp_expired' }, 'resetCode')).toBe('invalidCode');
      expect(toAuthFailure({ code: 'otp_expired' })).toBe('invalidCode');
    });

    it('maps a wrong code and an expired code to the SAME value', () => {
      // Distinguishing them would confirm a code had been issued, and therefore
      // that the address has an account -- the enumeration signal the whole
      // taxonomy avoids.
      expect(toAuthFailure({ status: 403 }, 'resetCode')).toBe(
        toAuthFailure({ code: 'otp_expired' }, 'resetCode'),
      );
    });

    it('still reports a rate limit as a rate limit', () => {
      expect(toAuthFailure({ status: 429 }, 'resetCode')).toBe('rateLimited');
    });

    it('still blames the connection, not the code, on a failed fetch', () => {
      expect(toAuthFailure(new TypeError('Network request failed'), 'resetCode')).toBe('network');
    });

    it('maps anything else to unknown rather than assuming a bad code', () => {
      expect(toAuthFailure({ status: 500 }, 'resetCode')).toBe('unknown');
    });
  });

  it('defaults to the credentials context, so existing callers are unchanged', () => {
    expect(toAuthFailure({ status: 400, code: 'invalid_credentials' })).toBe('invalidCredentials');
    expect(toAuthFailure({ status: 403 })).toBe('unknown');
  });

  it('never returns a value derived from the error message text', () => {
    const leaky = {
      status: 500,
      message: 'relation "public.profiles" does not exist at /auth/v1/token',
    };
    // The mapper returns a code, so the schema detail above cannot survive it.
    expect(toAuthFailure(leaky)).toBe('unknown');
  });
});
