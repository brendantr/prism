import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Card, Chip, Screen, SectionHeader, Text } from '@/components/ui';
import { PhasePanel } from '@/components/ui/PhasePanel';
import { estimateDayMinutes } from '@/domain/schedule';
import { useTrainingStore } from '@/store/trainingStore';
import { WEEKDAY_NAMES } from '@/utils/format';
import { color, space } from '@/theme';

/**
 * PLANS (Phase 5)
 *
 * The template plans and their full day/exercise structure are real data today
 * -- Today's scheduled session is resolved from them. The custom plan editor
 * and calendar are Phase 5.
 */
export default function PlansScreen() {
  const router = useRouter();
  const routines = useTrainingStore((s) => s.routines);
  const activeRoutine = useTrainingStore((s) => s.activeRoutine);
  const exerciseById = useTrainingStore((s) => s.exerciseById);

  return (
    <Screen eyebrow="Structure" title="Plans">
      <SectionHeader title="Template plans" eyebrow="Ready to run" />

      {routines.map((routine) => {
        const isActive = routine.id === activeRoutine?.id;
        return (
          <Card
            key={routine.id}
            variant={isActive ? 'raised' : 'flat'}
            spectral={isActive}
            padding="lg"
            style={styles.gutter}
          >
            <View style={styles.head}>
              <Text variant="title2" style={styles.name}>
                {routine.name}
              </Text>
              {isActive ? <Chip label="Active" tone="positive" icon="checkmark" /> : null}
            </View>

            <Text variant="bodySm" tone="secondary" style={styles.description}>
              {routine.description}
            </Text>

            <View style={styles.meta}>
              <Chip label={`${routine.daysPerWeek} days/week`} />
              <Chip label={`${routine.days.reduce((n, d) => n + d.exercises.length, 0)} lifts`} />
            </View>

            <View style={styles.days}>
              {routine.days.map((day) => (
                <View key={day.id} style={styles.day}>
                  <View style={styles.dayHead}>
                    <Text variant="title3" numberOfLines={1} style={styles.dayName}>
                      {day.name}
                    </Text>
                    <Text variant="eyebrow" tone="faint">
                      {day.weekday != null ? WEEKDAY_NAMES[day.weekday - 1].slice(0, 3) : 'Flexible'}
                      {` · ~${estimateDayMinutes(day)}m`}
                    </Text>
                  </View>
                  <Text variant="bodySm" tone="faint" numberOfLines={2}>
                    {day.exercises
                      .map((slot) => exerciseById.get(slot.exerciseId)?.name ?? '')
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                </View>
              ))}
            </View>
          </Card>
        );
      })}

      <SectionHeader title="Coming next" eyebrow="Roadmap" />
      <PhasePanel
        phase={5}
        summary="Make the plans yours: edit, build from scratch, and see them on a calendar."
        deliverables={[
          'Custom plan editor with drag-to-reorder days and exercises',
          'Per-slot targets: sets, rep range, RPE and rest',
          'Month calendar with planned versus completed sessions',
          'Clone a template into an editable personal plan',
          'Swap an exercise for an equipment-matched alternative',
        ]}
        readyNow={[
          'Routine / RoutineDay / RoutineExercise schema with RLS policies',
          'Two original template plans, fully specified',
          'Weekday-pin and rotation scheduling, live on the Today tab',
        ]}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  gutter: { marginHorizontal: space.lg, marginBottom: space.md },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  name: { flex: 1 },
  description: { marginTop: space.sm, lineHeight: 19 },
  meta: { flexDirection: 'row', gap: space.xs, marginTop: space.md },
  days: {
    marginTop: space.lg,
    paddingTop: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.line,
    gap: space.base,
  },
  day: { gap: 3 },
  dayHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: space.sm },
  dayName: { flex: 1 },
});
