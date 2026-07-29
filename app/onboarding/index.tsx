import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, LinearSpectrum, Text } from '@/components/ui';
import { WELCOME } from '@/content/onboarding';
import { color, space } from '@/theme';

/**
 * WELCOME
 * =======
 * The value proposition, and one way forward.
 *
 * The secondary action is a text button rather than a second filled button:
 * two equally weighted CTAs on a first screen make the user choose before they
 * know enough to have a preference.
 */
export default function WelcomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.canvas, { paddingTop: insets.top + space.xxl, paddingBottom: insets.bottom + space.xl }]}>
      <View style={styles.body}>
        <Text variant="eyebrow" tone="violet">
          {WELCOME.eyebrow}
        </Text>
        <LinearSpectrum height={3} rounded style={styles.band} />
        <Text variant="display" accessibilityRole="header" style={styles.title}>
          {WELCOME.title}
        </Text>
        <Text variant="body" tone="secondary" style={styles.copy}>
          {WELCOME.body}
        </Text>
      </View>

      <View style={styles.actions}>
        <Button
          label={WELCOME.primaryCta}
          fullWidth
          size="lg"
          onPress={() => router.push('/onboarding/features')}
        />
        <Button
          label={WELCOME.secondaryCta}
          variant="ghost"
          fullWidth
          onPress={() => router.push('/onboarding/auth?mode=signin')}
          style={styles.secondary}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  canvas: { flex: 1, backgroundColor: color.bg, paddingHorizontal: space.lg },
  body: { flex: 1, justifyContent: 'center' },
  band: { width: 72, marginTop: space.base },
  title: { marginTop: space.xl },
  copy: { marginTop: space.base, maxWidth: 340 },
  actions: { gap: space.xs },
  secondary: { marginTop: space.xs },
});
