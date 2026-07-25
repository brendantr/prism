import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from './Text';
import { color, opacity, space } from '@/theme';
import { SCREEN_PADDING } from './Screen';

export interface SectionHeaderProps {
  title: string;
  /** Wide-tracked uppercase kicker above the title. */
  eyebrow?: string;
  actionLabel?: string;
  onAction?: () => void;
}

/**
 * Editorial section rule. The hairline runs from the title to the screen edge,
 * which is what makes the layout read as a magazine spread rather than a
 * stack of dashboard tiles.
 */
export function SectionHeader({ title, eyebrow, actionLabel, onAction }: SectionHeaderProps) {
  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <View style={styles.titleGroup}>
          {eyebrow ? (
            <Text variant="eyebrow" tone="faint" style={styles.eyebrow}>
              {eyebrow}
            </Text>
          ) : null}
          <Text variant="title2" accessibilityRole="header">
            {title}
          </Text>
        </View>

        {actionLabel && onAction ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={actionLabel}
            onPress={onAction}
            hitSlop={{ top: 14, bottom: 14, left: 12, right: 12 }}
            style={({ pressed }) => [styles.action, pressed && { opacity: opacity.pressed }]}
          >
            <Text variant="label" tone="violet">
              {actionLabel}
            </Text>
            <Ionicons name="chevron-forward" size={14} color={color.violetBright} />
          </Pressable>
        ) : null}
      </View>
      <View style={styles.rule} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: SCREEN_PADDING,
    marginTop: space.xxl,
    marginBottom: space.base,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  titleGroup: { flex: 1 },
  eyebrow: { marginBottom: 3 },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    minHeight: 24,
  },
  rule: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: color.line,
    marginTop: space.md,
  },
});
