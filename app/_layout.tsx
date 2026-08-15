import { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { Stack, useRouter, useSegments } from 'expo-router';
import { AppState, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppErrorBoundary } from '@/components/AppErrorBoundary';
import { Splash } from '@/components/onboarding/Splash';
import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { resolveInitialRoute } from '@/domain/routing';
import { shouldRenderSentryVerificationRoot } from '@/domain/sentryVerification';
import { useActiveWorkoutStore } from '@/store/activeWorkoutStore';
import { useEntitlementStore } from '@/store/entitlementStore';
import { useOnboardingStore } from '@/store/onboardingStore';
import { useSessionStore } from '@/store/sessionStore';
import { useTrainingStore } from '@/store/trainingStore';
import { color, space } from '@/theme';
import {
  initTelemetry,
  sendSentryVerificationDiagnostic,
} from '@/observability/telemetry';

initTelemetry();

const RENDER_SENTRY_VERIFICATION_ROOT = shouldRenderSentryVerificationRoot(
  process.env.EXPO_PUBLIC_SENTRY_VERIFICATION_ENABLED,
);

export { shouldRenderSentryVerificationRoot } from '@/domain/sentryVerification';

/**
 * The only surface in the dedicated internal verification artifact.
 *
 * This is intentionally not an Expo Router route. It mounts no navigator,
 * provider, store hook, session/account hydration, or Supabase-backed data
 * load. Its only state is whether this process already invoked the fixed,
 * no-argument diagnostic function.
 */
export function SentryVerificationRoot() {
  const [attempted, setAttempted] = useState(false);

  const sendDiagnostic = () => {
    if (attempted) return;
    setAttempted(true);
    sendSentryVerificationDiagnostic();
  };

  return (
    <View style={verificationStyles.root}>
      <Text variant="title1" align="center">
        Sentry verification artifact
      </Text>
      <Text tone="secondary" align="center">
        Owner-only internal build for one controlled diagnostic.
      </Text>
      <Button
        label="Send verification diagnostic"
        onPress={sendDiagnostic}
        disabled={attempted}
        fullWidth
      />
      {attempted ? (
        <Text tone="positive" align="center">
          Verification diagnostic sent for external review.
        </Text>
      ) : null}
    </View>
  );
}

/**
 * Root layout. Resolves who is signed in and whether this is a first run, then
 * hands off to the tabs. Modal routes (logger, picker, summary) sit outside the
 * tab navigator so they cover the tab bar during a session. History sits here
 * too: it is a review surface reached from more than one tab, and pushing it on
 * the root stack is what makes a plain "back" return where the lifter actually
 * came from.
 *
 * ONE GATE, NOT TWO
 * -----------------
 * The splash holds until *both* the persisted onboarding flag and the session
 * phase have resolved, and a single effect then asks `resolveInitialRoute` where
 * to go. Two effects redirecting off the same `segments` array is how a second
 * condition turns into a redirect loop; the decision is a pure function so it
 * can be enumerated in a test, which matters because this repo has no
 * component-test tooling by decision.
 */
export function NormalAppRoot() {
  const refresh = useTrainingStore((s) => s.refresh);
  const loadOnboarding = useOnboardingStore((s) => s.load);
  const onboardingStatus = useOnboardingStore((s) => s.status);
  const completed = useOnboardingStore((s) => s.completed);
  const hydrateActiveWorkout = useActiveWorkoutStore((s) => s.hydrate);
  const initializeSession = useSessionStore((s) => s.initialize);
  const initializeEntitlement = useEntitlementStore((s) => s.initialize);
  const refreshEntitlement = useEntitlementStore((s) => s.refresh);
  const resetEntitlement = useEntitlementStore((s) => s.reset);
  const sessionPhase = useSessionStore((s) => s.phase);
  const userId = useSessionStore((s) => s.userId);

  const router = useRouter();
  const segments = useSegments();

  const gateReady = sessionPhase !== 'unknown' && onboardingStatus === 'ready';

  useEffect(() => {
    // Both only read local storage and neither redirects, so racing is safe.
    void initializeSession();
    void loadOnboarding();
  }, [initializeSession, loadOnboarding]);

  /*
    Data loading waits for the session. It used to fire on mount unconditionally,
    which on a real-backend build meant eight repository calls rejecting on a
    session that did not exist yet -- an error state reached before the gate had
    even decided the user should be looking at a sign-in screen.

    'disabled' loads too: that is demo, and the misconfigured build, where
    `getRepository()` still owes the lifter its own loud message.
  */
  useEffect(() => {
    if (sessionPhase !== 'authenticated' && sessionPhase !== 'disabled') return;
    void refresh();
    // Recovers any workout draft left behind by a killed process -- but only
    // once we know whose it should be. A draft belonging to another account is
    // discarded rather than resumed; see `DraftOwner`.
    void hydrateActiveWorkout(
      sessionPhase === 'authenticated' && userId
        ? { enforce: true, profileId: userId }
        : { enforce: false },
    );
  }, [sessionPhase, userId, refresh, hydrateActiveWorkout]);

  useEffect(() => {
    if (sessionPhase === 'authenticated' || sessionPhase === 'disabled') {
      void initializeEntitlement(sessionPhase === 'authenticated' ? userId : null);
      return;
    }
    // An expired/revoked Supabase session reaches this path without going
    // through `signOutAndTearDown`. Clear account-scoped access here as well so
    // the next signed-in user cannot inherit the previous in-memory phase.
    if (sessionPhase === 'unauthenticated') void resetEntitlement();
  }, [sessionPhase, userId, initializeEntitlement, resetEntitlement]);

  useEffect(() => {
    if (sessionPhase !== 'authenticated') return;
    // A refund or transfer can land while PRism is backgrounded. Re-read the
    // server on foreground so a process that stays alive does not keep a stale
    // grant until its next full launch. SDK CustomerInfo remains only transport;
    // this refresh is the same owner-scoped Postgres read used at startup.
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') void refreshEntitlement();
    });
    return () => subscription.remove();
  }, [sessionPhase, userId, refreshEntitlement]);

  useEffect(() => {
    if (!gateReady) return;
    const target = resolveInitialRoute({
      onboardingCompleted: completed,
      sessionPhase,
      currentSegment: segments[0],
    });
    // Null means "already where you should be" -- the loop guard.
    if (target) router.replace(target as never);
  }, [gateReady, completed, sessionPhase, segments, router]);

  return (
    <AppErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1, backgroundColor: color.bg }}>
        <SafeAreaProvider>
          <StatusBar style="light" />
          {!gateReady ? (
            <Splash />
          ) : (
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: color.bg },
                animation: 'slide_from_right',
              }}
            >
              <Stack.Screen name="(tabs)" />
              <Stack.Screen name="onboarding" options={{ gestureEnabled: false }} />
              {/* No back gesture: there is nothing behind sign-in to return to. */}
              <Stack.Screen name="auth/index" options={{ gestureEnabled: false }} />
              {/* Reached from Settings. A modal because account lifecycle is a
                  detour, not a primary destination. */}
              <Stack.Screen name="account" options={{ presentation: 'modal' }} />
              <Stack.Screen name="settings" options={{ presentation: 'modal' }} />
              <Stack.Screen name="exercise" options={{ presentation: 'modal' }} />
              <Stack.Screen name="measurement" options={{ presentation: 'modal' }} />
              <Stack.Screen name="paywall" options={{ presentation: 'modal' }} />
              <Stack.Screen
                name="workout/active"
                options={{ animation: 'slide_from_bottom', gestureEnabled: false }}
              />
              <Stack.Screen name="workout/picker" options={{ presentation: 'modal' }} />
              <Stack.Screen name="workout/templates" options={{ presentation: 'modal' }} />
              {/* Registered rather than left to file-convention routing alone, so
                  every route this stack can show is visible in one place. */}
              <Stack.Screen name="workout/summary" />
              <Stack.Screen name="history/index" />
              <Stack.Screen name="history/[id]" />
            </Stack>
          )}
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </AppErrorBoundary>
  );
}

/** The compile-time root-selection boundary used by every build profile. */
export default function RootLayout() {
  return RENDER_SENTRY_VERIFICATION_ROOT ? (
    <SentryVerificationRoot />
  ) : (
    <NormalAppRoot />
  );
}

const verificationStyles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'center',
    gap: space.lg,
    padding: space.xl,
    backgroundColor: color.bg,
  },
});
