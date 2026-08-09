import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card } from './Card';
import { Chip } from './Chip';
import { SectionHeader } from './SectionHeader';
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
 *
 * ---------------------------------------------------------------------------
 * DEVELOPMENT ONLY -- IT RENDERS NOTHING IN ANY SHIPPED BUILD
 * ---------------------------------------------------------------------------
 * The audience for a roadmap is the person building the app, not the person who
 * installed it. To an App Store reviewer it is a rejection under **Guideline
 * 2.1, App Completeness**, which forbids placeholder and "coming soon" content
 * in a submitted build. Five of the six tabs rendered one of these -- `plans`,
 * `progress`, `body`, `insights`, `social` -- and the social one opened with
 * "Nothing is committed", so this was not a marginal case.
 *
 * The gate lives HERE, and the "Coming next" heading moved in here with it, for
 * a reason worth stating: while the heading sat at the call site, hiding the
 * panel alone would have left a dangling "Coming next" above nothing, and every
 * new screen would have had to remember its own guard. One component, one gate,
 * nothing to leak -- a sixth screen cannot get this wrong.
 *
 * `__DEV__` is false in every EAS build, so a preview build has no roadmaps
 * either. That is intended: an internal tester is closer to a reviewer than to
 * an engineer, and the roadmap tells them nothing they can act on.
 */
export function PhasePanel({ phase, summary, deliverables, readyNow = [] }: PhasePanelProps) {
  if (!__DEV__) return null;

  return (
    <>
      {/* Outside `wrap` deliberately: SectionHeader carries its own screen
          padding, so nesting it here would indent it past every other section
          header on the screen. */}
      <SectionHeader title="Coming next" eyebrow="Roadmap" />

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
              <Ionicons
                name="ellipse-outline"
                size={11}
                color={color.textFaint}
                style={styles.icon}
              />
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
                  <Ionicons
                    name="checkmark-circle"
                    size={12}
                    color={color.positive}
                    style={styles.icon}
                  />
                  <Text variant="bodySm" tone="muted" style={styles.rowText}>
                    {item}
                  </Text>
                </View>
              ))}
            </>
          ) : null}
        </Card>
      </View>
    </>
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
