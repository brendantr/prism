import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from './Text';
import { a11y, color, opacity, radius, space } from '@/theme';

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  /** Announced instead of `label` when the visible text is an abbreviation. */
  accessibilityLabel?: string;
}

export interface SegmentedControlProps<T extends string> {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Wide-tracked caption above the track. Omit when the context is obvious. */
  label?: string;
  /** Announced for the group as a whole. */
  accessibilityLabel?: string;
}

/**
 * One-of-N selector.
 *
 * Deliberately distinct from `Chip`: a chip row is many-of-N and changes what a
 * list *contains*, a segmented control is one-of-N and changes what a list
 * *is*. Drawing them the same way would make two different behaviours look
 * interchangeable.
 *
 * The selected segment is filled rather than merely tinted, so the current
 * choice survives being read at arm's length or without colour perception.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  label,
  accessibilityLabel,
}: SegmentedControlProps<T>) {
  return (
    <View>
      {label ? (
        <Text variant="eyebrow" tone="faint" style={styles.label}>
          {label}
        </Text>
      ) : null}

      <View style={styles.track} accessibilityLabel={accessibilityLabel}>
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <Pressable
              key={option.value}
              accessibilityRole="button"
              accessibilityLabel={option.accessibilityLabel ?? option.label}
              accessibilityState={{ selected }}
              onPress={() => onChange(option.value)}
              style={({ pressed }) => [
                styles.segment,
                selected && styles.segmentSelected,
                pressed && !selected && { opacity: opacity.pressed },
              ]}
            >
              <Text variant="eyebrow" tone={selected ? 'primary' : 'muted'} numberOfLines={1}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  label: { marginBottom: space.sm },
  track: {
    flexDirection: 'row',
    padding: space.xxs,
    gap: space.xxs,
    borderRadius: radius.md,
    backgroundColor: color.inset,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.line,
  },
  segment: {
    flex: 1,
    // The track is only as tall as one segment, so this is what guarantees the
    // 44pt target for every choice in the group.
    minHeight: a11y.minTouch - space.xs,
    paddingHorizontal: space.sm,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentSelected: {
    backgroundColor: color.cardRaised,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.lineStrong,
  },
});
