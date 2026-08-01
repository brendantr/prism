import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card, Text } from '@/components/ui';
import { ProgressChart } from './ProgressChart';
import { estimateOneRepMax } from '@/domain/calc/oneRepMax';
import { ONBOARDING_PROGRESS_DEMO } from '@/content/onboarding';
import { color, opacity, space } from '@/theme';

/**
 * The estimated-1RM stat, its Epley explanation, and the trend chart --
 * together, since the chart is what makes "an estimate that improves with
 * more logged sessions" concrete rather than a claim you have to take on
 * faith.
 *
 * Every number here is computed from `ONBOARDING_PROGRESS_DEMO`'s static
 * (weight, reps) samples through the real `estimateOneRepMax` -- never typed
 * as a result -- so this card can never quietly drift out of sync with the
 * formula it shows.
 */
export function EstimatedOneRepMaxCard() {
  const [expanded, setExpanded] = useState(false);

  const points = ONBOARDING_PROGRESS_DEMO.weeklySamples.map((s) => ({
    label: s.weekLabel,
    e1rmKg: estimateOneRepMax(s.weightKg, s.reps),
  }));
  const current = points[points.length - 1];
  const currentSample = ONBOARDING_PROGRESS_DEMO.weeklySamples[ONBOARDING_PROGRESS_DEMO.weeklySamples.length - 1];
  const displayValue = current.e1rmKg.toFixed(1);

  return (
    <Card variant="raised" padding="xl" spectral spectralTone="cool" style={styles.card}>
      <Text variant="eyebrow" tone="muted">
        Estimated 1RM
      </Text>
      <Text
        variant="hero"
        tone="cyan"
        style={styles.value}
        accessibilityLabel={`Estimated one rep max, ${displayValue} kilograms`}
      >
        {displayValue}
        <Text variant="title3" tone="muted">
          {' kg'}
        </Text>
      </Text>
      <Text variant="bodySm" tone="secondary">
        Calculated from your logged work
      </Text>

      <ProgressChart points={points} />

      <Text variant="bodySm" tone="faint" style={styles.uncertainty}>
        An estimate that improves with more logged sessions.
      </Text>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={expanded ? 'Hide how this is calculated' : 'Show how this is calculated'}
        accessibilityState={{ expanded }}
        onPress={() => setExpanded((v) => !v)}
        hitSlop={10}
        style={({ pressed }) => [styles.toggle, pressed && { opacity: opacity.pressed }]}
      >
        <Text variant="label" tone="cyan">
          {expanded ? 'Hide the calculation' : 'How is this calculated?'}
        </Text>
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={14} color={color.cyanBright} />
      </Pressable>

      {expanded ? (
        <View style={styles.formula}>
          <Text variant="bodySm" tone="secondary">
            e1RM = weight × (1 + reps / 30)
          </Text>
          <Text variant="bodySm" tone="faint" style={styles.formulaLine}>
            {`${currentSample.weightKg} × (1 + ${currentSample.reps} / 30) = ${displayValue} kg`}
          </Text>
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { marginTop: space.xl },
  value: { marginTop: space.xs },
  uncertainty: { marginTop: space.base, lineHeight: 18 },
  toggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: space.lg,
    minHeight: 44,
  },
  formula: { marginTop: space.sm, gap: space.xs },
  formulaLine: { lineHeight: 18 },
});
