/** Pure build-posture policy for the internal Sentry verification artifact. */

/**
 * Select the verification-only root only for the exact literal build flag.
 *
 * Expo inlines `EXPO_PUBLIC_*` variables into the JavaScript bundle. Keeping
 * the value as an argument makes this boundary pure and lets the root/profile
 * matrix prove that an unset, malformed, or explicitly false value selects the
 * normal application.
 */
export function shouldRenderSentryVerificationRoot(
  verificationFlag: string | undefined,
): boolean {
  return verificationFlag === 'true';
}
