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

/**
 * Whether this deployment has a RevenueCat customer to erase at all.
 *
 * The distinction this draws is the whole point, and it is not the same as
 * "did the call succeed":
 *
 *  - **Not configured** — no project id and no secret key, so this app has
 *    never sent RevenueCat a customer. There is nothing there to delete, and
 *    refusing to delete the Supabase account over it would block I-10 on a
 *    processor the build does not even use. Skip it and delete the account.
 *  - **Configured but failing** — a customer may well exist. Skipping would
 *    tell a lifter their data is gone while it sits at a processor. That stays
 *    a hard failure, and the caller sees 502.
 *
 * Both halves are required together. One without the other cannot authenticate
 * a v2 request, so a half-set deployment is treated as unconfigured rather than
 * attempted and reported as a transport failure.
 */
export function revenueCatConfigured(projectId: string, secretKey: string): boolean {
  return projectId.length > 0 && secretKey.length > 0;
}

export function revenueCatCustomerUrl(projectId: string, userId: string): string {
  return `https://api.revenuecat.com/v2/projects/${encodeURIComponent(projectId)}/customers/${encodeURIComponent(userId)}`;
}

/** 404 makes retry idempotent after RevenueCat has already erased the customer. */
export function revenueCatDeletionComplete(status: number): boolean {
  return status === 200 || status === 202 || status === 404;
}
