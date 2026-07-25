import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  View,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from './Text';
import { a11y, color, opacity, radius, space } from '@/theme';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

export interface ButtonProps extends Omit<PressableProps, 'style' | 'children'> {
  label: string;
  variant?: Variant;
  size?: Size;
  icon?: keyof typeof Ionicons.glyphMap;
  iconPosition?: 'left' | 'right';
  loading?: boolean;
  fullWidth?: boolean;
  /** Layout-only overrides (margins, alignment). Never colour or height. */
  style?: StyleProp<ViewStyle>;
}

const HEIGHT: Record<Size, number> = {
  sm: a11y.minTouch,
  md: 52,
  lg: 60,
};

/**
 * Every button is at least 44pt tall (`a11y.minTouch`) and carries an
 * accessibility label derived from its own text, so an icon-only variant can
 * never ship unlabelled.
 */
export function Button({
  label,
  variant = 'primary',
  size = 'md',
  icon,
  iconPosition = 'left',
  loading = false,
  fullWidth = false,
  disabled,
  style,
  ...rest
}: ButtonProps) {
  const isDisabled = disabled || loading;
  const tone = variant === 'primary' ? 'onAccent' : variant === 'danger' ? 'coral' : 'primary';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!isDisabled, busy: loading }}
      disabled={isDisabled}
      hitSlop={6}
      {...rest}
      style={({ pressed }) => [
        styles.base,
        { height: HEIGHT[size] },
        VARIANT_STYLE[variant],
        fullWidth && styles.fullWidth,
        pressed && !isDisabled && { opacity: opacity.pressed },
        isDisabled && { opacity: opacity.disabled },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'primary' ? color.textOnAccent : color.text} />
      ) : (
        <View style={styles.row}>
          {icon && iconPosition === 'left' ? (
            <Ionicons name={icon} size={18} color={ICON_COLOR[variant]} style={styles.iconLeft} />
          ) : null}
          <Text variant={size === 'sm' ? 'label' : 'title3'} tone={tone}>
            {label}
          </Text>
          {icon && iconPosition === 'right' ? (
            <Ionicons name={icon} size={18} color={ICON_COLOR[variant]} style={styles.iconRight} />
          ) : null}
        </View>
      )}
    </Pressable>
  );
}

const ICON_COLOR: Record<Variant, string> = {
  primary: color.textOnAccent,
  secondary: color.text,
  ghost: color.textSecondary,
  danger: color.coralBright,
};

const VARIANT_STYLE = StyleSheet.create({
  primary: {
    backgroundColor: color.violetBright,
  },
  secondary: {
    backgroundColor: color.inset,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.lineStrong,
  },
  ghost: {
    backgroundColor: 'transparent',
  },
  danger: {
    backgroundColor: color.coralWash,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.coral,
  },
});

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.lg,
    minWidth: a11y.minTouch,
  },
  fullWidth: {
    alignSelf: 'stretch',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconLeft: { marginRight: space.sm },
  iconRight: { marginLeft: space.sm },
});
