import { StyleSheet, View } from 'react-native';
import { Card, Chip, ListRow, Text } from '@/components/ui';
import { ONBOARDING_READINESS_DEMO } from '@/content/onboarding';
import { space } from '@/theme';

/**
 * Readiness, onboarding's honest-uncertainty screen: an explicit "not enough
 * input" state, a row per signal PRism can use, and the same non-medical
 * framing the real readiness card ships (`Docs/invariants.md` I-8).
 *
 * "NOT ENOUGH INPUT" is the existing neutral `Chip` tone, never `coral` --
 * this is an honest absence, not an alert. The same tone distinction (cyan
 * "logged" vs. neutral "no input yet") repeats per row so the one signal that
 * currently has data reads differently from the two that do not, at a
 * glance, without colour being the only cue (the trailing label spells out
 * the state in words too).
 */
export function ReadinessInputRows() {
  const { rows, disclaimer } = ONBOARDING_READINESS_DEMO;

  return (
    <View style={styles.wrap}>
      <Chip label="NOT ENOUGH INPUT" tone="neutral" />

      <Card variant="outline" padding="none" style={styles.card}>
        {rows.map((row, i) => (
          <ListRow
            key={row.key}
            title={row.title}
            subtitle={row.subtitle}
            divided={i > 0}
            style={styles.row}
            trailing={
              <Chip label={row.hasInput ? 'LOGGED' : 'NO INPUT'} tone={row.hasInput ? 'cyan' : 'neutral'} />
            }
          />
        ))}
      </Card>

      <Text variant="bodySm" tone="faint" style={styles.disclaimer}>
        {disclaimer}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: space.xl },
  card: { marginTop: space.base, paddingHorizontal: space.lg },
  row: { paddingVertical: space.base },
  disclaimer: { marginTop: space.lg, lineHeight: 18 },
});
