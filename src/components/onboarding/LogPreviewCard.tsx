import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card, Text } from '@/components/ui';
import { ONBOARDING_LOG_DEMO } from '@/content/onboarding';
import { color, space } from '@/theme';

/**
 * A believable, static preview of a logged session -- Back Squat, three sets,
 * the same tabular weight/reps/RPE type the real workout logger's set rows
 * use. This is a read-only instrument panel, not an interactive mini-app: no
 * row is pressable. The small per-row checkmark is the one piece of
 * iconography this slide uses, and it does real work (marking each set
 * recorded) rather than decorating the card.
 *
 * Exposed to screen readers as one assembled unit -- three separately
 * focusable, unpressable rows would read as broken controls, not data.
 */
export function LogPreviewCard() {
  const { exerciseName, sets } = ONBOARDING_LOG_DEMO;
  const label = [
    exerciseName,
    `${sets.length} sets`,
    ...sets.map((s, i) => `Set ${i + 1}: ${s.weightKg} kilograms by ${s.reps}, RPE ${s.rpe}, recorded`),
  ].join('. ');

  return (
    <Card variant="outline" padding="lg" style={styles.card} accessible accessibilityLabel={label}>
      <View style={styles.head}>
        <Text variant="title2">{exerciseName}</Text>
        <Text variant="eyebrow" tone="faint">
          {`${sets.length} SETS`}
        </Text>
      </View>

      <View style={styles.rows}>
        {sets.map((set, i) => (
          <View key={i} style={[styles.row, i > 0 && styles.rowDivided]}>
            <Ionicons name="checkmark-circle" size={16} color={color.positive} style={styles.check} />
            <Text variant="label" tone="muted" style={styles.setIndex}>
              {`Set ${i + 1}`}
            </Text>
            <View style={styles.values}>
              <Text variant="numeric">
                {set.weightKg}
                <Text variant="label" tone="muted">
                  {' kg'}
                </Text>
              </Text>
              <Text variant="numeric" tone="secondary" style={styles.reps}>
                {`× ${set.reps}`}
              </Text>
            </View>
            <Text variant="numericSm" tone="muted">
              {`RPE ${set.rpe}`}
            </Text>
          </View>
        ))}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { marginTop: space.xl },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rows: { marginTop: space.base },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: space.sm,
  },
  rowDivided: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.line },
  check: { marginRight: space.sm },
  setIndex: { width: 46 },
  values: { flex: 1, flexDirection: 'row', alignItems: 'baseline' },
  reps: { marginLeft: space.sm },
});
