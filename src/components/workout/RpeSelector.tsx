import { useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/ui';
import { a11y, color, opacity, radius, space } from '@/theme';

export interface RpeSelectorProps {
  value: number | null;
  onChange: (rpe: number | null) => void;
  label: string;
}

/** Half-point RPE from 6 to 10, plus "not rated". */
const RPE_VALUES = [6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10] as const;

const RPE_MEANING: Record<number, string> = {
  6: '4+ reps left in the tank',
  6.5: '3–4 reps left',
  7: '3 reps left',
  7.5: '2–3 reps left',
  8: '2 reps left',
  8.5: '1–2 reps left',
  9: '1 rep left',
  9.5: 'Maybe 1 more, maybe not',
  10: 'Nothing left',
};

/**
 * RPE picker. A compact tappable cell that opens a sheet explaining what each
 * value actually means -- RPE is only useful if it is logged consistently, and
 * consistency needs the definitions in front of you.
 */
export function RpeSelector({ value, onChange, label }: RpeSelectorProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityValue={{ text: value == null ? 'not rated' : `RPE ${value}` }}
        onPress={() => setOpen(true)}
        style={({ pressed }) => [
          styles.cell,
          value != null && styles.cellSet,
          pressed && { opacity: opacity.pressed },
        ]}
      >
        <Text variant="numericSm" tone={value == null ? 'faint' : 'cyan'}>
          {value == null ? 'RPE' : String(value)}
        </Text>
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)} accessibilityLabel="Close RPE picker">
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <Text variant="eyebrow" tone="muted">
              Rate of perceived exertion
            </Text>
            <Text variant="title2" style={styles.sheetTitle}>
              How much was left?
            </Text>

            <View style={styles.options}>
              {RPE_VALUES.map((rpe) => {
                const selected = value === rpe;
                return (
                  <Pressable
                    key={rpe}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    accessibilityLabel={`RPE ${rpe}, ${RPE_MEANING[rpe]}`}
                    onPress={() => {
                      onChange(rpe);
                      setOpen(false);
                    }}
                    style={({ pressed }) => [
                      styles.option,
                      selected && styles.optionSelected,
                      pressed && { opacity: opacity.pressed },
                    ]}
                  >
                    <Text variant="numeric" tone={selected ? 'cyan' : 'primary'} style={styles.optionValue}>
                      {rpe}
                    </Text>
                    <Text variant="bodySm" tone={selected ? 'secondary' : 'muted'}>
                      {RPE_MEANING[rpe]}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Clear RPE for this set"
              onPress={() => {
                onChange(null);
                setOpen(false);
              }}
              style={({ pressed }) => [styles.clear, pressed && { opacity: opacity.pressed }]}
            >
              <Text variant="label" tone="muted">
                Don’t rate this set
              </Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  cell: {
    height: a11y.minTouch - 6,
    borderRadius: radius.sm,
    backgroundColor: color.inset,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellSet: {
    backgroundColor: color.cyanWash,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(22,196,222,0.4)',
  },
  backdrop: {
    flex: 1,
    backgroundColor: color.overlay,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: color.cardRaised,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: space.xl,
    paddingBottom: space.xxxl,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.lineStrong,
  },
  sheetTitle: { marginTop: space.xs, marginBottom: space.lg },
  options: { gap: space.xs },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: a11y.minTouch,
    paddingHorizontal: space.base,
    borderRadius: radius.sm,
    gap: space.base,
  },
  optionSelected: { backgroundColor: color.cyanWash },
  optionValue: { width: 36 },
  clear: {
    marginTop: space.base,
    minHeight: a11y.minTouch,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
