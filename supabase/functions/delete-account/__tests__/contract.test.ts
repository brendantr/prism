import {
  authenticatedUserId,
  revenueCatCustomerUrl,
  revenueCatDeletionComplete,
} from '../contract';

const USER_ID = '11111111-1111-4111-8111-111111111111';

function jwt(claims: Record<string, unknown>): string {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'ES256' })}.${encode(claims)}.signature-verified-by-gateway`;
}

describe('delete-account request contract', () => {
  it('accepts only an authenticated UUID claim from the gateway-verified token', () => {
    expect(authenticatedUserId(`Bearer ${jwt({ sub: USER_ID, role: 'authenticated' })}`)).toBe(USER_ID);
    expect(authenticatedUserId(`Bearer ${jwt({ sub: USER_ID, role: 'anon' })}`)).toBeNull();
    expect(authenticatedUserId(`Bearer ${jwt({ sub: 'not-a-uuid', role: 'authenticated' })}`)).toBeNull();
    expect(authenticatedUserId(null)).toBeNull();
  });

  it('builds the v2 customer endpoint without accepting a caller-provided path', () => {
    expect(revenueCatCustomerUrl('proj_123', USER_ID)).toBe(
      `https://api.revenuecat.com/v2/projects/proj_123/customers/${USER_ID}`,
    );
  });

  it('treats accepted, completed and already-absent deletion as idempotent success', () => {
    expect([200, 202, 404].every(revenueCatDeletionComplete)).toBe(true);
    expect([400, 401, 403, 409, 429, 500].some(revenueCatDeletionComplete)).toBe(false);
  });
});
