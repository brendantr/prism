import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from './Text';
import { a11y, color, opacity, radius, space } from '@/theme';

type IconTone = 'violet' | 'cyan' | 'coral' | 'positive' | 'neutral';

export interface ListRowProps {
  title: string;
  subtitle?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  iconTone?: IconTone;
  /** Trailing content: a value, a `Chip`, a star toggle. */
  trailing?: ReactNode;
  /** Trailing chevron. Ignored when `trailing` is supplied. */
  chevron?: boolean;
  onPress?: () => void;
  /** Spoken instead of the assembled title/subtitle when the row needs context. */
  accessibilityLabel?: string;
  /** Hairline above the row, for rows stacked inside a single card. */
  divided?: boolean;
  /** Layout-only overrides. Never colour or height. */
  style?: StyleProp<ViewStyle>;
}

const ICON_TONE: Record<IconTone, { bg: string; fg: string }> = {
  violet: { bg: color.violetWash, fg: color.violetBright },
  cyan: { bg: color.cyanWash, fg: color.cyanBright },
  coral: { bg: color.coralWash, fg: color.coralBright },
  positive: { bg: color.positiveWash, fg: color.positive },
  neutral: { bg: color.neutralWash, fg: color.textMuted },
};

/**
 * The standard tappable row: leading glyph tile, title over subtitle, trailing
 * value or affordance.
 *
 * Every surface that lists things -- exercises, navigation into a deeper
 * screen, a record -- was growing its own near-identical row. One primitive
 * keeps the row height, the glyph tile, and the pressed state identical across
 * all of them.
 */
export function ListRow({
  title,
  subtitle,
  icon,
  iconTone = 'neutral',
  trailing,
  chevron = false,
  onPress,
  accessibilityLabel,
  divided = false,
  style,
}: ListRowProps) {
  const palette = ICON_TONE[iconTone];

  const body = (
    <View style={[styles.row, divided && styles.divided, style]}>
      {icon ? (
        <View style={[styles.tile, { backgroundColor: palette.bg }]}>
          <Ionicons name={icon} size={15} color={palette.fg} />
        </View>
      ) : null}

      <View style={styles.text}>
        <Text variant="title3" numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="bodySm" tone="faint" numberOfLines={2} style={styles.subtitle}>
            {subtitle}
          </Text>
        ) : null}
      </View>

      {trailing ?? (chevron ? <Ionicons name="chevron-forward" size={16} color={color.textFaint} /> : null)}
    </View>
  );

  if (!onPress) {
    return (
      <View accessible accessibilityLabel={accessibilityLabel ?? [title, subtitle].filter(Boolean).join('. ')}>
        {body}
      </View>
    );
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? [title, subtitle].filter(Boolean).join('. ')}
      onPress={onPress}
      style={({ pressed }) => [pressed && { opacity: opacity.pressed }]}
    >
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: a11y.minTouch + 12,
    paddingVertical: space.md,
  },
  divided: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.line },
  tile: {
    width: 34,
    height: 34,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { flex: 1 },
  subtitle: { marginTop: 2 },
});
