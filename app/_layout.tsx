import { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { Stack, useRouter, useSegments } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Splash } from '@/components/onboarding/Splash';
import { resolveInitialRoute } from '@/domain/routing';
import { useActiveWorkoutStore } from '@/store/activeWorkoutStore';
import { useOnboardingStore } from '@/store/onboardingStore';
import { useSessionStore } from '@/store/sessionStore';
import { useTrainingStore } from '@/store/trainingStore';
import { color } from '@/theme';

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
export default function RootLayout() {
  const refresh = useTrainingStore((s) => s.refresh);
  const loadOnboarding = useOnboardingStore((s) => s.load);
  const onboardingStatus = useOnboardingStore((s) => s.status);
  const completed = useOnboardingStore((s) => s.completed);
  const hydrateActiveWorkout = useActiveWorkoutStore((s) => s.hydrate);
  const initializeSession = useSessionStore((s) => s.initialize);
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
  );
}
