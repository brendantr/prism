import { Redirect, useLocalSearchParams } from 'expo-router';
import { isAuthEnabled } from '@/data/supabase/auth';
import { AUTH_ROUTE, resolveOnboardingAuthHref } from '@/domain/routing';

/**
 * ONBOARDING'S ACCOUNT STEP
 * =========================
 * A redirect, not a screen. The form itself moved to `app/auth/` when it became
 * real -- see that file for why.
 *
 * This wrapper stays so the onboarding route graph is unchanged: `features.tsx`
 * and `index.tsx` still push `/onboarding/auth`, the stack in
 * `app/onboarding/_layout.tsx` still declares it, and the back path through the
 * flow still works.
 *
 * In a demo build it skips straight to the questions. A build with no accounts
 * showing a working sign-up form would be the same dishonesty that put the
 * placeholder notice on the old screen, just pointing the other way -- so the
 * step exists exactly where accounts do. That is the answer to
 * `Docs/ui-ux-foundation-v1.md` §9 open question 1, and the rule itself is in
 * `resolveOnboardingAuthHref` where it can be tested.
 *
 * `<Redirect>` rather than an effect: it resolves during render, so there is no
 * frame in which an empty screen paints before the navigation lands.
 */
export default function OnboardingAuthStep() {
  const params = useLocalSearchParams<{ mode?: string }>();

  // Branching on the pure helper's result rather than interpolating its return
  // value keeps both destinations as literals, which is what Expo Router's
  // typed routes check against -- a template string here would need a cast, and
  // a cast is how a route typo ships.
  if (resolveOnboardingAuthHref(isAuthEnabled()) !== AUTH_ROUTE) {
    return <Redirect href="/onboarding/steps" />;
  }
  return <Redirect href={params.mode === 'signin' ? '/auth?mode=signin' : '/auth'} />;
}
