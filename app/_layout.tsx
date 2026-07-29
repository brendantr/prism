import { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { Stack, useRouter, useSegments } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Splash } from '@/components/onboarding/Splash';
import { useOnboardingStore } from '@/store/onboardingStore';
import { useTrainingStore } from '@/store/trainingStore';
import { color } from '@/theme';

/**
 * Root layout. Loads the training data once, then hands off to the tabs.
 * Modal routes (logger, picker, summary) sit outside the tab navigator so they
 * cover the tab bar during a session.
 *
 * First launch is routed through `onboarding/` instead. The decision waits on a
 * persisted flag, so the splash holds the screen rather than letting the tabs
 * paint and then yanking them away.
 */
export default function RootLayout() {
  const load = useTrainingStore((s) => s.load);
  const loadOnboarding = useOnboardingStore((s) => s.load);
  const onboardingStatus = useOnboardingStore((s) => s.status);
  const completed = useOnboardingStore((s) => s.completed);

  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    void load();
    void loadOnboarding();
  }, [load, loadOnboarding]);

  useEffect(() => {
    if (onboardingStatus !== 'ready') return;

    const inOnboarding = segments[0] === 'onboarding';
    if (!completed && !inOnboarding) {
      router.replace('/onboarding');
    } else if (completed && inOnboarding) {
      router.replace('/(tabs)');
    }
  }, [onboardingStatus, completed, segments, router]);

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: color.bg }}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        {onboardingStatus !== 'ready' ? (
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
            <Stack.Screen
              name="workout/active"
              options={{ animation: 'slide_from_bottom', gestureEnabled: false }}
            />
            <Stack.Screen name="workout/picker" options={{ presentation: 'modal' }} />
          </Stack>
        )}
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
