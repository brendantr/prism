import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card } from './Card';
import { Chip } from './Chip';
import { Text } from './Text';
import { color, space } from '@/theme';

export interface PhasePanelProps {
  phase: number;
  /** What this screen will do, stated concretely. */
  summary: string;
  /** Specific, checkable deliverables -- not marketing bullets. */
  deliverables: string[];
  /** Which pieces already exist and are being reused. */
  readyNow?: string[];
}

/**
 * Honest roadmap panel for screens scheduled after the current phase.
 *
 * This is deliberately NOT a fake skeleton or a greyed-out mock. Showing a
 * plausible-looking chart with no data behind it is how a prototype gets
 * mistaken for a product. This states the phase, the scope, and what already
 * exists underneath.
 */
export function PhasePanel({ phase, summary, deliverables, readyNow = [] }: PhasePanelProps) {
  return (
    <View style={styles.wrap}>
      <Card variant="outline" padding="xl">
        <Chip label={`Phase ${phase}`} tone="violet" icon="construct" />

        <Text variant="body" tone="secondary" style={styles.summary}>
          {summary}
        </Text>

        <Text variant="eyebrow" tone="faint" style={styles.heading}>
          Scope
        </Text>
        {deliverables.map((item) => (
          <View key={item} style={styles.row}>
            <Ionicons name="ellipse-outline" size={11} color={color.textFaint} style={styles.icon} />
            <Text variant="bodySm" tone="muted" style={styles.rowText}>
              {item}
            </Text>
          </View>
        ))}

        {readyNow.length > 0 ? (
          <>
            <Text variant="eyebrow" tone="faint" style={styles.heading}>
              Already built
            </Text>
            {readyNow.map((item) => (
              <View key={item} style={styles.row}>
                <Ionicons name="checkmark-circle" size={12} color={color.positive} style={styles.icon} />
                <Text variant="bodySm" tone="muted" style={styles.rowText}>
                  {item}
                </Text>
              </View>
            ))}
          </>
        ) : null}
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginHorizontal: space.lg },
  summary: { marginTop: space.md },
  heading: { marginTop: space.lg, marginBottom: space.sm },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm, marginBottom: 6 },
  icon: { marginTop: 3 },
  rowText: { flex: 1 },
});
