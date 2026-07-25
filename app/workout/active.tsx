import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useKeepAwake } from 'expo-keep-awake';
import { Button, Card, LinearSpectrum, Text } from '@/components/ui';
import { ExerciseBlock } from '@/components/workout/ExerciseBlock';
import { RestTimerBar } from '@/components/workout/RestTimerBar';
import {
  bestsFromHistory,
  detectWorkoutPrs,
  recommendNextLoad,
  setsVolume,
} from '@/domain/calc';
import { previousSetsForExercise } from '@/domain/schedule';
import {
  selectCompletedSetCount,
  selectTotalSetCount,
  useActiveWorkoutStore,
} from '@/store/activeWorkoutStore';
import { selectCompletedWorkouts, useTrainingStore } from '@/store/trainingStore';
import { useShallow } from 'zustand/react/shallow';
import { newId } from '@/utils/id';
import { formatClock, formatVolume } from '@/utils/format';
import { a11y, color, opacity, radius, space } from '@/theme';
import type { LoadSuggestion, PersonalRecord } from '@/domain/types';

/**
 * WORKOUT LOGGER
 * ==============
 * The screen the app is judged on. Design constraints, in priority order:
 *
 *   1. Logging a set must take one tap. Everything else is secondary.
 *   2. The previous session's numbers must be visible without navigating.
 *   3. The screen must not shift under your thumb -- tabs are hidden, the
 *      header is fixed, and the rest bar docks rather than overlaying.
 *   4. The device must not sleep mid-session (`useKeepAwake`).
 */
export default function ActiveWorkoutScreen() {
  useKeepAwake();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const workout = useActiveWorkoutStore((s) => s.workout);
  const restTimer = useActiveWorkoutStore((s) => s.restTimer);
  const completedSets = useActiveWorkoutStore(selectCompletedSetCount);
  const totalSets = useActiveWorkoutStore(selectTotalSetCount);
  const updateSet = useActiveWorkoutStore((s) => s.updateSet);
  const toggleSetComplete = useActiveWorkoutStore((s) => s.toggleSetComplete);
  const removeSet = useActiveWorkoutStore((s) => s.removeSet);
  const addSet = useActiveWorkoutStore((s) => s.addSet);
  const removeExercise = useActiveWorkoutStore((s) => s.removeExercise);
  const finish = useActiveWorkoutStore((s) => s.finish);
  const discard = useActiveWorkoutStore((s) => s.discard);

  const profile = useTrainingStore((s) => s.profile);
  const exerciseById = useTrainingStore((s) => s.exerciseById);
  const activeRoutine = useTrainingStore((s) => s.activeRoutine);
  const history = useTrainingStore(useShallow(selectCompletedWorkouts));
  const upsertWorkout = useTrainingStore((s) => s.upsertWorkout);
  const addPersonalRecords = useTrainingStore((s) => s.addPersonalRecords);

  const [elapsed, setElapsed] = useState('0:00');
  const [saving, setSaving] = useState(false);

  // Session clock.
  useEffect(() => {
    if (!workout) return;
    const startedAt = new Date(workout.startedAt).getTime();
    const tick = () => setElapsed(formatClock((Date.now() - startedAt) / 1000));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [workout]);

  // If the store has no session (e.g. deep link, or after finishing), leave.
  useEffect(() => {
    if (!workout) router.replace('/');
  }, [workout, router]);

  const priorBests = useMemo(() => bestsFromHistory(history), [history]);

  const routineDay = useMemo(
    () => activeRoutine?.days.find((d) => d.id === workout?.routineDayId) ?? null,
    [activeRoutine, workout?.routineDayId],
  );

  /** One load suggestion per exercise, computed against real history. */
  const suggestions = useMemo(() => {
    const map = new Map<string, LoadSuggestion>();
    if (!workout || !profile) return map;

    for (const we of workout.exercises) {
      const exercise = exerciseById.get(we.exerciseId);
      if (!exercise) continue;
      const slot = routineDay?.exercises.find((s) => s.exerciseId === we.exerciseId);
      map.set(
        we.id,
        recommendNextLoad({
          exercise,
          workouts: history,
          targetReps: slot?.targetRepsLow ?? 8,
          unit: profile.unit,
        }),
      );
    }
    return map;
  }, [workout, profile, exerciseById, history, routineDay]);

  const liveVolume = useMemo(() => {
    if (!workout) return 0;
    return workout.exercises.reduce((total, we) => total + setsVolume(we.sets), 0);
  }, [workout]);

  if (!workout || !profile) return null;

  const handleFinish = () => {
    if (completedSets === 0) {
      Alert.alert(
        'Nothing logged yet',
        'Mark at least one set complete, or discard the session.',
        [{ text: 'Keep going' }, { text: 'Discard', style: 'destructive', onPress: handleDiscard }],
      );
      return;
    }

    Alert.alert('Finish session?', `${completedSets} sets logged in ${elapsed}.`, [
      { text: 'Keep going', style: 'cancel' },
      {
        text: 'Finish',
        onPress: async () => {
          setSaving(true);
          try {
            const finished = finish();
            if (!finished) return;

            await upsertWorkout(finished);

            // Detect and persist records against the state before this session.
            const detected = detectWorkoutPrs(finished, priorBests);
            const records: PersonalRecord[] = detected.map((pr) => ({
              id: newId('pr'),
              profileId: profile.id,
              exerciseId: pr.exerciseId,
              kind: pr.kind,
              value: pr.value,
              reps: pr.reps,
              weightKg: pr.weightKg,
              achievedAt: finished.startedAt,
              workoutId: finished.id,
            }));
            await addPersonalRecords(records);

            router.replace({ pathname: '/workout/summary', params: { id: finished.id } });
          } finally {
            setSaving(false);
          }
        },
      },
    ]);
  };

  const handleDiscard = () => {
    Alert.alert('Discard this session?', 'Nothing you logged will be saved.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Discard',
        style: 'destructive',
        onPress: () => {
          discard();
          router.replace('/');
        },
      },
    ]);
  };

  const progress = totalSets === 0 ? 0 : completedSets / totalSets;

  return (
    <View style={styles.root}>
      {/* Fixed header */}
      <View style={[styles.header, { paddingTop: insets.top + space.sm }]}>
        <View style={styles.headerRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Minimise session and go back"
            onPress={() => router.back()}
            hitSlop={10}
            style={({ pressed }) => [styles.headerButton, pressed && { opacity: opacity.pressed }]}
          >
            <Ionicons name="chevron-down" size={20} color={color.text} />
          </Pressable>

          <View style={styles.headerCenter}>
            <Text variant="eyebrow" tone="muted" numberOfLines={1}>
              {workout.title}
            </Text>
            <Text variant="numeric" accessibilityLabel={`Elapsed time ${elapsed}`}>
              {elapsed}
            </Text>
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Discard this session"
            onPress={handleDiscard}
            hitSlop={10}
            style={({ pressed }) => [styles.headerButton, pressed && { opacity: opacity.pressed }]}
          >
            <Ionicons name="trash-outline" size={17} color={color.textFaint} />
          </Pressable>
        </View>

        <View style={styles.metrics}>
          <Metric label="Sets" value={`${completedSets}/${totalSets}`} />
          <Metric label="Volume" value={`${formatVolume(liveVolume, profile.unit)} ${profile.unit}`} />
          <Metric label="Lifts" value={String(workout.exercises.length)} />
        </View>

        <LinearSpectrum height={2} progress={progress} />
      </View>

      {/* Sets */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: space.huge }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {workout.exercises.length === 0 ? (
          <Card style={styles.empty} padding="xl">
            <Text variant="title2">Empty session</Text>
            <Text variant="body" tone="secondary" style={styles.emptyText}>
              Add your first lift and PRism will pull in your last numbers and a load
              suggestion for each one.
            </Text>
            <Button
              label="Add an exercise"
              icon="add"
              style={styles.emptyButton}
              onPress={() => router.push('/workout/picker')}
            />
          </Card>
        ) : (
          workout.exercises.map((we) => {
            const exercise = exerciseById.get(we.exerciseId);
            if (!exercise) return null;
            const previous = previousSetsForExercise(history, we.exerciseId, workout.id);

            return (
              <ExerciseBlock
                key={we.id}
                workoutExercise={we}
                exercise={exercise}
                unit={profile.unit}
                suggestion={suggestions.get(we.id) ?? null}
                previousSets={previous?.sets ?? []}
                previousWorkout={previous?.workout ?? null}
                priorBests={priorBests.get(we.exerciseId)}
                onUpdateSet={updateSet}
                onToggleSet={toggleSetComplete}
                onRemoveSet={removeSet}
                onAddSet={() => addSet(we.id)}
                onRemoveExercise={() => removeExercise(we.id)}
                onApplySuggestion={(weightKg) => {
                  for (const set of we.sets) {
                    if (!set.completed && set.type !== 'warmup') updateSet(set.id, { weightKg });
                  }
                }}
              />
            );
          })
        )}

        {workout.exercises.length > 0 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Add another exercise to this session"
            onPress={() => router.push('/workout/picker')}
            style={({ pressed }) => [styles.addExercise, pressed && { opacity: opacity.pressed }]}
          >
            <Ionicons name="add-circle-outline" size={18} color={color.violetBright} />
            <Text variant="label" tone="violet">
              Add exercise
            </Text>
          </Pressable>
        ) : null}
      </ScrollView>

      {/* Dock: rest timer above the finish bar */}
      <View style={[styles.dock, { paddingBottom: insets.bottom + space.md }]}>
        {restTimer ? <RestTimerBar /> : null}
        <View style={styles.finishBar}>
          <Button
            label={saving ? 'Saving…' : 'Finish session'}
            icon="checkmark"
            onPress={handleFinish}
            loading={saving}
            fullWidth
          />
        </View>
      </View>
    </View>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metric} accessible accessibilityLabel={`${label}: ${value}`}>
      <Text variant="eyebrow" tone="faint">
        {label}
      </Text>
      <Text variant="numericSm" tone="secondary">
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  header: {
    backgroundColor: color.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.line,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.md,
  },
  headerButton: {
    width: a11y.minTouch,
    height: a11y.minTouch,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: { flex: 1, alignItems: 'center' },
  metrics: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: space.lg,
    paddingBottom: space.md,
  },
  metric: { alignItems: 'center', gap: 2 },
  scroll: { flex: 1 },
  scrollContent: { paddingTop: space.base },
  empty: { marginHorizontal: space.lg },
  emptyText: { marginTop: space.sm },
  emptyButton: { marginTop: space.lg },
  addExercise: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    marginHorizontal: space.lg,
    minHeight: a11y.minTouch + 8,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderStyle: 'dashed',
    borderColor: color.lineStrong,
  },
  dock: {
    backgroundColor: color.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.line,
  },
  finishBar: { paddingHorizontal: space.lg, paddingTop: space.md },
});
