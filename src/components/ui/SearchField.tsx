import { forwardRef } from 'react';
import {
  Pressable,
  StyleSheet,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { a11y, color, opacity, radius, space, type as typeTokens } from '@/theme';

export interface SearchFieldProps
  extends Omit<TextInputProps, 'style' | 'placeholderTextColor' | 'value' | 'onChangeText'> {
  value: string;
  onChangeText: (value: string) => void;
  /** Required: a magnifier glyph is not a label. */
  accessibilityLabel: string;
  /** Layout-only overrides (margins, width). Never colour or height. */
  style?: StyleProp<ViewStyle>;
}

/**
 * A single-line filter field.
 *
 * Distinct from `Input`: search has no visible label above it because the
 * results underneath are the label, and it carries its own clear control. The
 * clear button is a real element rather than iOS's `clearButtonMode`, so
 * Android users get the same escape from a typo.
 */
export const SearchField = forwardRef<TextInput, SearchFieldProps>(function SearchField(
  { value, onChangeText, accessibilityLabel, placeholder = 'Search', style, ...rest },
  ref,
) {
  return (
    <View style={[styles.field, style]}>
      <Ionicons name="search" size={16} color={color.textFaint} />

      <TextInput
        ref={ref}
        value={value}
        onChangeText={onChangeText}
        accessibilityLabel={accessibilityLabel}
        placeholder={placeholder}
        placeholderTextColor={color.textFaint}
        autoCorrect={false}
        autoCapitalize="none"
        returnKeyType="search"
        maxFontSizeMultiplier={1.4}
        {...rest}
        style={styles.input}
      />

      {value.length > 0 ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Clear search"
          onPress={() => onChangeText('')}
          hitSlop={10}
          style={({ pressed }) => [styles.clear, pressed && { opacity: opacity.pressed }]}
        >
          <Ionicons name="close-circle" size={17} color={color.textMuted} />
        </Pressable>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingLeft: space.base,
    paddingRight: space.sm,
    minHeight: a11y.minTouch + 4,
    borderRadius: radius.md,
    backgroundColor: color.inset,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.line,
  },
  input: {
    ...(typeTokens.body as object),
    flex: 1,
    color: color.text,
    paddingVertical: space.md,
  },
  clear: {
    width: a11y.minTouch - space.md,
    height: a11y.minTouch - space.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
