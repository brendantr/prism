import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from './Text';
import { a11y, color, opacity, radius, space } from '@/theme';

type ChipTone = 'neutral' | 'violet' | 'cyan' | 'coral' | 'positive';

export interface ChipProps {
  label: string;
  tone?: ChipTone;
  icon?: keyof typeof Ionicons.glyphMap;
  selected?: boolean;
  onPress?: () => void;
  /** Announced instead of `label` when the visible text is an abbreviation. */
  accessibilityLabel?: string;
}

const TONE = {
  neutral: { bg: color.neutralWash, fg: color.textSecondary, border: color.line },
  violet: { bg: color.violetWash, fg: color.violetSoft, border: 'rgba(122,59,255,0.4)' },
  cyan: { bg: color.cyanWash, fg: color.cyanSoft, border: 'rgba(22,196,222,0.4)' },
  coral: { bg: color.coralWash, fg: color.coralBright, border: 'rgba(242,96,78,0.4)' },
  positive: { bg: color.positiveWash, fg: color.positive, border: 'rgba(74,222,155,0.4)' },
} as const;

/** Small, high-density label. Interactive when `onPress` is supplied. */
export function Chip({ label, tone = 'neutral', icon, selected, onPress, accessibilityLabel }: ChipProps) {
  const palette = TONE[selected ? (tone === 'neutral' ? 'violet' : tone) : tone];

  const content = (
    <View
      style={[
        styles.chip,
        { backgroundColor: palette.bg, borderColor: selected ? palette.fg : palette.border },
      ]}
    >
      {icon ? <Ionicons name={icon} size={12} color={palette.fg} style={styles.icon} /> : null}
      <Text variant="eyebrow" style={{ color: palette.fg }}>
        {label}
      </Text>
    </View>
  );

  if (!onPress) {
    return (
      <View accessible accessibilityLabel={accessibilityLabel ?? label}>
        {content}
      </View>
    );
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ selected: !!selected }}
      onPress={onPress}
      // The visual chip is short; hitSlop brings the target to 44pt.
      hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
      style={({ pressed }) => [pressed && { opacity: opacity.pressed }]}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: space.md,
    paddingVertical: 6,
    minHeight: 26,
  },
  icon: { marginRight: 5 },
});

/** Chip-sized tappable rows still need a real target; export the constant. */
export const CHIP_MIN_TOUCH = a11y.minTouch;
