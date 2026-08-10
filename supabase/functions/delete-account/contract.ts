/** Pure request helpers for the authenticated account-deletion Edge Function. */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function decodeBase64Url(value: string): string {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  return atob(padded);
}

/**
 * Extract the authenticated UUID from a JWT already verified by Supabase's
 * `verify_jwt = true` gateway. This function does not verify signatures and
 * must never be used on an endpoint whose platform JWT gate is disabled.
 */
export function authenticatedUserId(authorization: string | null): string | null {
  if (!authorization?.startsWith('Bearer ')) return null;
  const token = authorization.slice('Bearer '.length);
  const parts = token.split('.');
  if (parts.length !== 3 || !parts[1]) return null;

  try {
    const claims = JSON.parse(decodeBase64Url(parts[1])) as Record<string, unknown>;
    return claims.role === 'authenticated' && typeof claims.sub === 'string' && UUID.test(claims.sub)
      ? claims.sub.toLowerCase()
      : null;
  } catch {
    return null;
  }
}

export function revenueCatCustomerUrl(projectId: string, userId: string): string {
  return `https://api.revenuecat.com/v2/projects/${encodeURIComponent(projectId)}/customers/${encodeURIComponent(userId)}`;
}

/** 404 makes retry idempotent after RevenueCat has already erased the customer. */
export function revenueCatDeletionComplete(status: number): boolean {
  return status === 200 || status === 202 || status === 404;
}
