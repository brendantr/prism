import { useState, forwardRef } from 'react';
import {
  StyleSheet,
  TextInput,
  View,
  type TextInputProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from './Text';
import { a11y, color, radius, space, type as typeTokens } from '@/theme';

export interface InputProps extends Omit<TextInputProps, 'style' | 'placeholderTextColor'> {
  /** Always visible, never a disappearing placeholder. */
  label: string;
  /** Quiet helper line under the field. Replaced by `error` when one is set. */
  hint?: string;
  /** Shown in place of the hint, and colours the field's outline. */
  error?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  /** Layout-only overrides. Never colour or height. */
  style?: StyleProp<ViewStyle>;
}

/**
 * A single-line field.
 *
 * The label sits above the input rather than inside it: a placeholder that
 * doubles as a label vanishes the moment someone starts typing, which is
 * exactly when they are most likely to need it.
 */
export const Input = forwardRef<TextInput, InputProps>(function Input(
  { label, hint, error, icon, style, onFocus, onBlur, ...rest },
  ref,
) {
  const [focused, setFocused] = useState(false);
  const outline = error ? color.coral : focused ? color.violetBright : color.line;

  return (
    <View style={style}>
      <Text variant="eyebrow" tone="muted" style={styles.label}>
        {label}
      </Text>

      <View style={[styles.field, { borderColor: outline }]}>
        {icon ? (
          <Ionicons
            name={icon}
            size={16}
            color={focused ? color.violetBright : color.textFaint}
            style={styles.icon}
          />
        ) : null}
        <TextInput
          ref={ref}
          accessibilityLabel={label}
          placeholderTextColor={color.textFaint}
          maxFontSizeMultiplier={1.4}
          {...rest}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          style={styles.input}
        />
      </View>

      {error || hint ? (
        <Text
          variant="bodySm"
          tone={error ? 'coral' : 'faint'}
          accessibilityRole={error ? 'alert' : undefined}
          style={styles.help}
        >
          {error ?? hint}
        </Text>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  label: { marginBottom: space.sm },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: a11y.minTouch + 8,
    paddingHorizontal: space.base,
    backgroundColor: color.inset,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  icon: { marginRight: space.md },
  input: {
    ...(typeTokens.body as object),
    flex: 1,
    color: color.text,
    paddingVertical: space.md,
  },
  help: { marginTop: space.sm },
});
