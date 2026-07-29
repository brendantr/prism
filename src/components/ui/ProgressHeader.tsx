import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from './Text';
import { a11y, color, opacity, radius, space } from '@/theme';

export interface ProgressHeaderProps {
  /** 1-based position. */
  step: number;
  totalSteps: number;
  /** Omitted on the first screen of a flow, where there is nowhere to go back to. */
  onBack?: () => void;
  /** Optional escape hatch, e.g. "Skip". Never the dominant action on a screen. */
  onSkip?: () => void;
  skipLabel?: string;
}

/**
 * The header for a step-based flow: where you are, and the way back.
 *
 * Progress is drawn as one segment per step rather than a single filling bar,
 * so the remaining commitment is countable at a glance instead of estimated
 * from a fraction.
 */
export function ProgressHeader({
  step,
  totalSteps,
  onBack,
  onSkip,
  skipLabel = 'Skip',
}: ProgressHeaderProps) {
  const insets = useSafeAreaInsets();
  const clamped = Math.min(Math.max(step, 1), totalSteps);

  return (
    <View style={[styles.wrap, { paddingTop: insets.top + space.sm }]}>
      <View style={styles.row}>
        {onBack ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Go back"
            onPress={onBack}
            hitSlop={10}
            style={({ pressed }) => [styles.back, pressed && { opacity: opacity.pressed }]}
          >
            <Ionicons name="chevron-back" size={20} color={color.text} />
          </Pressable>
        ) : (
          <View style={styles.back} />
        )}

        <Text variant="eyebrow" tone="muted" accessibilityLabel={`Step ${clamped} of ${totalSteps}`}>
          {`Step ${clamped} of ${totalSteps}`}
        </Text>

        {onSkip ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={skipLabel}
            onPress={onSkip}
            hitSlop={10}
            style={({ pressed }) => [styles.skip, pressed && { opacity: opacity.pressed }]}
          >
            <Text variant="label" tone="muted">
              {skipLabel}
            </Text>
          </Pressable>
        ) : (
          <View style={styles.back} />
        )}
      </View>

      <View
        style={styles.track}
        accessibilityRole="progressbar"
        accessibilityValue={{ min: 0, max: totalSteps, now: clamped }}
      >
        {Array.from({ length: totalSteps }, (_, i) => (
          <View key={i} style={[styles.segment, i < clamped && styles.segmentFilled]} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: space.lg, paddingBottom: space.lg },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: space.base,
  },
  back: {
    width: a11y.minTouch,
    height: a11y.minTouch,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  skip: {
    width: a11y.minTouch + 16,
    height: a11y.minTouch,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  track: { flexDirection: 'row', gap: space.xs },
  segment: {
    flex: 1,
    height: 3,
    borderRadius: radius.pill,
    backgroundColor: color.inset,
  },
  segmentFilled: { backgroundColor: color.violetBright },
});
