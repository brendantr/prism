import { useState, useEffect } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Text } from './Text';
import { a11y, color, opacity, radius, space, type as typeTokens } from '@/theme';

export interface StepperProps {
  value: number;
  onChange: (value: number) => void;
  step?: number;
  min?: number;
  max?: number;
  /** Announced as "<label>, <value>". Required -- there are no unlabelled controls. */
  label: string;
  suffix?: string;
  /** Allow decimals (weight) or force integers (reps). */
  decimals?: boolean;
  editable?: boolean;
}

/**
 * Numeric entry built for a phone balanced on a bench: two 44pt targets and a
 * tappable field in the middle. Typing is optional, never required.
 */
export function Stepper({
  value,
  onChange,
  step = 1,
  min = 0,
  max = 9999,
  label,
  suffix,
  decimals = false,
  editable = true,
}: StepperProps) {
  const [draft, setDraft] = useState(format(value, decimals));

  // Keep the field in sync when the value changes from elsewhere (e.g. the
  // "use suggested load" action) without stomping on active typing.
  useEffect(() => {
    setDraft(format(value, decimals));
  }, [value, decimals]);

  const commit = (next: number) => {
    const clamped = Math.min(max, Math.max(min, next));
    const rounded = decimals ? Math.round(clamped * 100) / 100 : Math.round(clamped);
    onChange(rounded);
    setDraft(format(rounded, decimals));
    Haptics.selectionAsync().catch(() => {});
  };

  return (
    <View style={styles.wrap}>
      <StepButton
        icon="remove"
        label={`Decrease ${label}`}
        onPress={() => commit(value - step)}
        disabled={value <= min}
      />

      <Pressable
        style={styles.field}
        accessibilityLabel={`${label}${suffix ? ` in ${suffix}` : ''}`}
        accessibilityValue={{ text: `${format(value, decimals)}` }}
      >
        <TextInput
          value={draft}
          editable={editable}
          onChangeText={setDraft}
          onBlur={() => {
            const parsed = Number.parseFloat(draft.replace(',', '.'));
            commit(Number.isFinite(parsed) ? parsed : value);
          }}
          keyboardType={decimals ? 'decimal-pad' : 'number-pad'}
          selectTextOnFocus
          style={styles.input}
          placeholderTextColor={color.textFaint}
          maxFontSizeMultiplier={1.4}
          accessibilityLabel={label}
        />
        {suffix ? (
          <Text variant="label" tone="faint" style={styles.suffix}>
            {suffix}
          </Text>
        ) : null}
      </Pressable>

      <StepButton
        icon="add"
        label={`Increase ${label}`}
        onPress={() => commit(value + step)}
        disabled={value >= max}
      />
    </View>
  );
}

function StepButton({
  icon,
  label,
  onPress,
  disabled,
}: {
  icon: 'add' | 'remove';
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        pressed && { opacity: opacity.pressed },
        disabled && { opacity: opacity.disabled },
      ]}
    >
      <Ionicons name={icon} size={18} color={color.text} />
    </Pressable>
  );
}

function format(n: number, decimals: boolean): string {
  if (!decimals) return String(Math.round(n));
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: color.inset,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.line,
    overflow: 'hidden',
  },
  button: {
    width: a11y.minTouch,
    height: a11y.minTouch,
    alignItems: 'center',
    justifyContent: 'center',
  },
  field: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    minHeight: a11y.minTouch,
    paddingHorizontal: space.xs,
  },
  input: {
    ...(typeTokens.numeric as object),
    color: color.text,
    textAlign: 'center',
    minWidth: 44,
    paddingVertical: space.sm,
  },
  suffix: { marginLeft: 3 },
});
