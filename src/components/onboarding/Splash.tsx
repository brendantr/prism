import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { LinearSpectrum, Text } from '@/components/ui';
import { color, space } from '@/theme';

/**
 * The first frame.
 *
 * Shown only while the app works out where to send you, so it carries the mark
 * and nothing else. Anything more would flash and disappear before it could be
 * read, which is worse than an empty canvas.
 */
export function Splash() {
  return (
    <View style={styles.canvas}>
      <View style={styles.mark}>
        <Text variant="display" accessibilityRole="header">
          PRism
        </Text>
        <LinearSpectrum height={3} rounded style={styles.band} />
        <Text variant="bodySm" tone="muted" style={styles.tagline}>
          See your training from every angle.
        </Text>
      </View>

      <ActivityIndicator color={color.violetBright} style={styles.spinner} />
    </View>
  );
}

const styles = StyleSheet.create({
  canvas: {
    flex: 1,
    backgroundColor: color.bg,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.xl,
  },
  mark: { alignItems: 'center' },
  band: { width: 96, marginTop: space.base },
  tagline: { marginTop: space.base, textAlign: 'center' },
  spinner: { position: 'absolute', bottom: space.huge },
});
