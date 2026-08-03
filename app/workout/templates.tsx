import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { OptionRow, SectionHeader, Text } from '@/components/ui';
import { estimateDayMinutes, listTemplateChoices } from '@/domain/schedule';
import { useActiveWorkoutStore } from '@/store/activeWorkoutStore';
import { useTrainingStore } from '@/store/trainingStore';
import { a11y, color, opacity, space } from '@/theme';
import type { RoutineDay } from '@/domain/types';

/**
 * CHOOSE A WORKOUT
 * ================
 * The deliberate entry point this app was missing: every template day, plus an
 * explicit "Start empty," instead of a single auto-resolved suggestion. Picking
 * a day here only seeds a new session's exercises/sets -- it never writes back
 * to the routine/template it came from (`activeWorkoutStore.start()` only reads
 * the day's slots to build fresh `WorkoutExercise`/`WorkoutSet` objects).
 */
export default function ChooseWorkoutScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const routines = useTrainingStore((s) => s.routines);
  const profile = useTrainingStore((s) => s.profile);
  const activeWorkout = useActiveWorkoutStore((s) => s.workout);
  const startWorkout = useActiveWorkoutStore((s) => s.start);

  const choices = useMemo(() => listTemplateChoices(routines), [routines]);

  const groups = useMemo(() => {
    const byRoutine = new Map<string, { routineName: string; days: RoutineDay[] }>();
    for (const choice of choices) {
      const group = byRoutine.get(choice.routineId);
      if (group) group.days.push(choice.day);
      else byRoutine.set(choice.routineId, { routineName: choice.routineName, days: [choice.day] });
    }
    return [...byRoutine.values()];
  }, [choices]);

  if (!profile) return null;

  // Never starts a second session -- an active one just gets resumed.
  const handleDay = (day: RoutineDay) => {
    if (!activeWorkout) startWorkout({ profileId: profile.id, title: day.name, routineDay: day });
    router.replace('/workout/active');
  };

  const handleEmpty = () => {
    if (!activeWorkout) {
      startWorkout({ profileId: profile.id, title: 'Open session', routineDay: null });
    }
    router.replace('/workout/picker');
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top + space.md }]}>
      <View style={styles.header}>
        <Text variant="title1">Choose a workout</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close"
          onPress={() => router.back()}
          hitSlop={10}
          style={({ pressed }) => [styles.close, pressed && { opacity: opacity.pressed }]}
        >
          <Ionicons name="close" size={20} color={color.text} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + space.xxl }]}
        showsVerticalScrollIndicator={false}
      >
        {groups.map((group) => (
          <View key={group.routineName}>
            <SectionHeader title={group.routineName} eyebrow="Template" />
            <View style={styles.rows}>
              {group.days.map((day) => (
                <OptionRow
                  key={day.id}
                  mode="radio"
                  label={day.name}
                  description={`${day.exercises.length} lifts · ~${estimateDayMinutes(day)}m`}
                  selected={false}
                  onPress={() => handleDay(day)}
                />
              ))}
            </View>
          </View>
        ))}

        <SectionHeader title="Or" eyebrow="No template" />
        <View style={styles.rows}>
          <OptionRow
            mode="radio"
            label="Start empty"
            description="Add lifts as you go. Nothing is prescribed."
            selected={false}
            onPress={handleEmpty}
          />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
    paddingBottom: space.base,
  },
  close: {
    width: a11y.minTouch,
    height: a11y.minTouch,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: { paddingTop: space.xs },
  rows: { paddingHorizontal: space.lg, gap: space.sm },
});
