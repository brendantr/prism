import { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { Stack } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useTrainingStore } from '@/store/trainingStore';
import { color } from '@/theme';

/**
 * Root layout. Loads the training data once, then hands off to the tabs.
 * Modal routes (logger, picker, summary) sit outside the tab navigator so they
 * cover the tab bar during a session.
 */
export default function RootLayout() {
  const load = useTrainingStore((s) => s.load);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: color.bg }}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: color.bg },
            animation: 'slide_from_right',
          }}
        >
          <Stack.Screen name="(tabs)" />
          <Stack.Screen
            name="workout/active"
            options={{ animation: 'slide_from_bottom', gestureEnabled: false }}
          />
          <Stack.Screen name="workout/picker" options={{ presentation: 'modal' }} />
        </Stack>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
