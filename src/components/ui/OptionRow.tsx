import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from './Text';
import { a11y, color, opacity, radius, space } from '@/theme';

export interface OptionRowProps {
  label: string;
  /** One quiet line of context. Keep it to a line. */
  description?: string;
  selected: boolean;
  onPress: () => void;
  /** `check` for multi-select, `radio` for one-of. Changes the a11y role too. */
  mode?: 'check' | 'radio';
  icon?: keyof typeof Ionicons.glyphMap;
  disabled?: boolean;
}

/**
 * A tappable choice in a list.
 *
 * Selection is carried by the outline and the indicator rather than a fill: on
 * a near-black canvas a filled row reads as a button, and a list of buttons
 * gives no sense of which one is chosen.
 */
export function OptionRow({
  label,
  description,
  selected,
  onPress,
  mode = 'check',
  icon,
  disabled,
}: OptionRowProps) {
  return (
    <Pressable
      accessibilityRole={mode === 'radio' ? 'radio' : 'checkbox'}
      accessibilityLabel={description ? `${label}. ${description}` : label}
      accessibilityState={{ selected, checked: selected, disabled: !!disabled }}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.row,
        selected && styles.rowSelected,
        pressed && !disabled && { opacity: opacity.pressed },
        disabled && { opacity: opacity.disabled },
      ]}
    >
      {icon ? (
        <View style={[styles.icon, selected && styles.iconSelected]}>
          <Ionicons
            name={icon}
            size={17}
            color={selected ? color.violetBright : color.textMuted}
          />
        </View>
      ) : null}

      <View style={styles.text}>
        <Text variant="title3" tone={selected ? 'primary' : 'secondary'}>
          {label}
        </Text>
        {description ? (
          <Text variant="bodySm" tone="faint" style={styles.description}>
            {description}
          </Text>
        ) : null}
      </View>

      <View style={[styles.indicator, mode === 'radio' && styles.indicatorRound, selected && styles.indicatorOn]}>
        {selected ? <Ionicons name="checkmark" size={13} color={color.textOnAccent} /> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: a11y.minTouch + 16,
    paddingVertical: space.base,
    paddingHorizontal: space.base,
    borderRadius: radius.md,
    backgroundColor: color.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.line,
  },
  rowSelected: {
    backgroundColor: color.violetWash,
    borderColor: color.violetBright,
  },
  icon: {
    width: 34,
    height: 34,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.inset,
  },
  iconSelected: { backgroundColor: 'transparent' },
  text: { flex: 1 },
  description: { marginTop: 3 },
  indicator: {
    width: 22,
    height: 22,
    borderRadius: radius.xs,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.lineStrong,
  },
  indicatorRound: { borderRadius: radius.pill },
  indicatorOn: {
    backgroundColor: color.violetBright,
    borderColor: color.violetBright,
  },
});
