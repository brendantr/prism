import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card, Screen, SectionHeader, Text } from '@/components/ui';
import { PhasePanel } from '@/components/ui/PhasePanel';
import { completedThisWeek, volumeInWindow } from '@/domain/calc/readiness';
import { muscleDistribution } from '@/domain/calc/volume';
import { MUSCLE_META } from '@/domain/muscles';
import { selectCompletedWorkouts, useTrainingStore } from '@/store/trainingStore';
import { useShallow } from 'zustand/react/shallow';
import { formatVolume } from '@/utils/format';
import { color, space } from '@/theme';

/**
 * INSIGHTS (Phase 4)
 *
 * Phase 1 derives three highlights directly from the existing calculations, so
 * the tab earns its place immediately. The full recommendation engine -- ranked,
 * dismissible, acted on in one tap -- is Phase 4.
 */
export default function InsightsScreen() {
  const history = useTrainingStore(useShallow(selectCompletedWorkouts));
  const profile = useTrainingStore((s) => s.profile);
  const exerciseById = useTrainingStore((s) => s.exerciseById);
  const now = useMemo(() => new Date(), []);

  const highlights = useMemo(() => {
    if (!profile) return [];

    const week = volumeInWindow(history, now, 7);
    const priorWeek = volumeInWindow(history, now, 14) - week;
    const sessions = completedThisWeek(history, now);

    const lastMonth = history.filter(
      (w) => new Date(w.startedAt).getTime() >= now.getTime() - 28 * 86_400_000,
    );
    const dist = muscleDistribution(lastMonth, exerciseById);
    const undertrained = dist
      .filter((d) => d.sets / 4 < MUSCLE_META[d.muscle].weeklySetTarget * 0.6)
      .sort((a, b) => a.sets - b.sets)[0];

    const out: Array<{ icon: keyof typeof Ionicons.glyphMap; tone: 'violet' | 'cyan' | 'coral'; title: string; body: string }> = [];

    out.push({
      icon: 'pulse',
      tone: priorWeek > 0 && week < priorWeek * 0.8 ? 'coral' : 'violet',
      title:
        priorWeek === 0
          ? `${formatVolume(week, profile.unit)} ${profile.unit} logged this week`
          : week >= priorWeek
            ? `Volume up ${Math.round(((week - priorWeek) / priorWeek) * 100)}% on last week`
            : `Volume down ${Math.round(((priorWeek - week) / priorWeek) * 100)}% on last week`,
      body: `${formatVolume(week, profile.unit)} ${profile.unit} across ${sessions} ${sessions === 1 ? 'session' : 'sessions'}. Your 4-week weekly average is ${formatVolume(volumeInWindow(history, now, 28) / 4, profile.unit)} ${profile.unit}.`,
    });

    if (undertrained) {
      out.push({
        icon: 'alert-circle',
        tone: 'coral',
        title: `${MUSCLE_META[undertrained.muscle].label} is running light`,
        body: `About ${(undertrained.sets / 4).toFixed(1)} effective sets a week over the last month, against a ${MUSCLE_META[undertrained.muscle].weeklySetTarget}-set target for an intermediate lifter. Adding one exercise would close most of that gap.`,
      });
    }

    out.push({
      icon: 'calendar',
      tone: sessions >= profile.trainingDaysPerWeek ? 'cyan' : 'violet',
      title:
        sessions >= profile.trainingDaysPerWeek
          ? 'Weekly session target hit'
          : `${profile.trainingDaysPerWeek - sessions} ${profile.trainingDaysPerWeek - sessions === 1 ? 'session' : 'sessions'} left this week`,
      body: `You set a target of ${profile.trainingDaysPerWeek} sessions a week. Consistency contributes 10% of your readiness score.`,
    });

    return out;
  }, [history, profile, exerciseById, now]);

  return (
    <Screen eyebrow="What the data says" title="Insights">
      <SectionHeader title="This week" eyebrow="Highlights" />
      {highlights.map((h) => (
        <Card key={h.title} style={styles.gutter} padding="lg">
          <View style={styles.head}>
            <View style={[styles.icon, { backgroundColor: WASH[h.tone] }]}>
              <Ionicons name={h.icon} size={15} color={TINT[h.tone]} />
            </View>
            <Text variant="title3" style={styles.title}>
              {h.title}
            </Text>
          </View>
          <Text variant="bodySm" tone="secondary" style={styles.body}>
            {h.body}
          </Text>
        </Card>
      ))}

      <SectionHeader title="Coming next" eyebrow="Roadmap" />
      <PhasePanel
        phase={4}
        summary="A ranked recommendation feed where every card can be acted on without leaving the screen."
        deliverables={[
          'Ranked, dismissible recommendation cards with a one-tap action',
          'Stalled-lift detection across the last 3-4 sessions',
          'Muscle-balance warnings, push/pull and left/right',
          'Deload prompts driven by the acute:chronic workload ratio',
          'Week-in-review digest with a shareable card',
        ]}
        readyNow={[
          'Acute:chronic workload ratio, already weighted into readiness',
          'Effective-set totals per muscle against weekly targets',
          'Next-load recommendation with a full plain-language rationale',
        ]}
      />
    </Screen>
  );
}

const WASH = { violet: color.violetWash, cyan: color.cyanWash, coral: color.coralWash };
const TINT = { violet: color.violetBright, cyan: color.cyanBright, coral: color.coralBright };

const styles = StyleSheet.create({
  gutter: { marginHorizontal: space.lg, marginBottom: space.md },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  icon: { width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1 },
  body: { marginTop: space.md, lineHeight: 19 },
});
