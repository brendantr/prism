import { Stack } from 'expo-router';
import { color } from '@/theme';

/**
 * The onboarding stack, kept separate from the authenticated app shell so the
 * two never share history: finishing setup should not leave a back gesture
 * that returns you to a half-filled form.
 *
 * Every screen here can be backed out of except the first, which has nowhere
 * to go, and the last, which has already written the completion flag.
 *
 * The setup screens slide, because they are steps in a sequence. The completion
 * screen fades: it is an arrival, not another step, and a horizontal push would
 * imply there is more of the form behind it.
 */
export default function OnboardingLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: color.bg },
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="index" options={{ gestureEnabled: false }} />
      <Stack.Screen name="features" />
      <Stack.Screen name="auth" />
      <Stack.Screen name="steps" />
      <Stack.Screen name="complete" options={{ gestureEnabled: false, animation: 'fade' }} />
    </Stack>
  );
}
