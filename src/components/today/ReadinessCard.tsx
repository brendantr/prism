import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card, Chip, LinearSpectrum, ReadinessRing, Text } from '@/components/ui';
import { BAND_COPY, READINESS_EXPLANATION } from '@/domain/calc/readiness';
import { color, opacity, radius, space } from '@/theme';
import type { ReadinessResult } from '@/domain/types';

export interface ReadinessCardProps {
  readiness: ReadinessResult;
}

/**
 * Readiness, with its reasoning attached.
 *
 * The card opens showing the number and the single most limiting factor. Tap
 * "How this is calculated" and every input expands with its own weight and a
 * plain sentence. A score the lifter cannot interrogate is a score they will
 * eventually stop trusting.
 */
export function ReadinessCard({ readiness }: ReadinessCardProps) {
  const [expanded, setExpanded] = useState(false);
  const band = BAND_COPY[readiness.band];
  const weakest = [...readiness.factors].sort((a, b) => a.score - b.score)[0];

  return (
    <Card variant="raised" padding="xl" spectral style={styles.card}>
      <View style={styles.head}>
        <View style={styles.headText}>
          <Text variant="eyebrow" tone="muted">
            Readiness estimate
          </Text>
          <Text variant="title1" style={styles.band}>
            {band.title}
          </Text>
          <Text variant="bodySm" tone="secondary">
            {band.guidance}
          </Text>
        </View>

        <ReadinessRing
          score={readiness.score}
          size={132}
          strokeWidth={10}
          caption="of 100"
          accessibilityLabel={`Readiness estimate ${readiness.score} out of 100, rated ${band.title}`}
        />
      </View>

      {!expanded && weakest ? (
        <View style={styles.limiter}>
          <Chip label="Limiter" tone="coral" />
          <Text variant="bodySm" tone="secondary" style={styles.limiterText}>
            {weakest.detail}
          </Text>
        </View>
      ) : null}

      {expanded ? (
        <View style={styles.factors}>
          {readiness.factors.map((factor) => (
            <View key={factor.key} style={styles.factor}>
              <View style={styles.factorHead}>
                <Text variant="label">{factor.label}</Text>
                <Text variant="numericSm" tone="muted">
                  {Math.round(factor.score * 100)}
                  <Text variant="eyebrow" tone="faint">
                    {`  ${Math.round(factor.weight * 100)}% weight`}
                  </Text>
                </Text>
              </View>
              <View style={styles.track}>
                <LinearSpectrum height={4} progress={factor.score} rounded />
              </View>
              <Text variant="bodySm" tone="muted">
                {factor.detail}
              </Text>
            </View>
          ))}

          <Text variant="bodySm" tone="faint" style={styles.disclaimer}>
            {READINESS_EXPLANATION}
          </Text>
        </View>
      ) : null}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={expanded ? 'Hide readiness breakdown' : 'Show how readiness is calculated'}
        accessibilityState={{ expanded }}
        onPress={() => setExpanded((v) => !v)}
        hitSlop={10}
        style={({ pressed }) => [styles.toggle, pressed && { opacity: opacity.pressed }]}
      >
        <Text variant="label" tone="violet">
          {expanded ? 'Hide the breakdown' : 'How this is calculated'}
        </Text>
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={14}
          color={color.violetBright}
        />
      </Pressable>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { marginHorizontal: space.lg },
  head: { flexDirection: 'row', alignItems: 'center' },
  headText: { flex: 1, paddingRight: space.md },
  band: { marginTop: space.xs, marginBottom: space.xs },
  limiter: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: space.lg,
    gap: space.md,
  },
  limiterText: { flex: 1 },
  factors: { marginTop: space.lg, gap: space.base },
  factor: { gap: 6 },
  factorHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  track: {
    height: 4,
    backgroundColor: color.inset,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  disclaimer: { marginTop: space.xs, lineHeight: 18 },
  toggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: space.lg,
    minHeight: 44,
  },
});
