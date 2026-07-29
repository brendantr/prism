import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Card, LinearSpectrum, Text } from '@/components/ui';
import { COMPLETE } from '@/content/onboarding';
import { useOnboardingStore } from '@/store/onboardingStore';
import { color, radius, space } from '@/theme';

/**
 * COMPLETION
 * ==========
 * The handover into the app.
 *
 * Marking onboarding complete is what flips the root layout's gate, so this is
 * the only screen in the flow that writes anything. The navigation is left to
 * that gate rather than pushed from here -- two things steering the same
 * transition is how you get a double navigation.
 */
export default function CompleteScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const complete = useOnboardingStore((s) => s.complete);
  const [finishing, setFinishing] = useState(false);

  const finish = async () => {
    setFinishing(true);
    try {
      await complete();
      router.replace('/(tabs)');
    } finally {
      setFinishing(false);
    }
  };

  return (
    <View
      style={[
        styles.canvas,
        { paddingTop: insets.top + space.xxl, paddingBottom: insets.bottom + space.xl },
      ]}
    >
      <View style={styles.body}>
        <View style={styles.badge}>
          <Ionicons name="checkmark" size={26} color={color.violetBright} />
        </View>

        <Text variant="eyebrow" tone="violet" style={styles.eyebrow}>
          {COMPLETE.eyebrow}
        </Text>
        <LinearSpectrum height={3} rounded style={styles.band} />
        <Text variant="display" accessibilityRole="header" style={styles.title}>
          {COMPLETE.title}
        </Text>

        <Card padding="base" style={styles.note}>
          <Text variant="bodySm" tone="secondary">
            {COMPLETE.body}
          </Text>
        </Card>
      </View>

      <Button
        label={COMPLETE.primaryCta}
        fullWidth
        size="lg"
        loading={finishing}
        onPress={() => void finish()}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  canvas: { flex: 1, backgroundColor: color.bg, paddingHorizontal: space.lg },
  body: { flex: 1, justifyContent: 'center' },
  badge: {
    width: 56,
    height: 56,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.violetWash,
    marginBottom: space.xl,
  },
  eyebrow: { marginTop: space.xs },
  band: { width: 72, marginTop: space.base },
  title: { marginTop: space.lg },
  note: { marginTop: space.xl },
});
