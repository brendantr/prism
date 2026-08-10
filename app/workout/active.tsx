import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, BackHandler, Pressable, ScrollView, StyleSheet, View } from 'react-native';
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
import { reportHandledError } from '@/observability/telemetry';
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
  const draftPendingReview = useActiveWorkoutStore((s) => s.draftPendingReview);
  const resumeDraft = useActiveWorkoutStore((s) => s.resumeDraft);

  const profile = useTrainingStore((s) => s.profile);
  const exerciseById = useTrainingStore((s) => s.exerciseById);
  const activeRoutine = useTrainingStore((s) => s.activeRoutine);
  const history = useTrainingStore(useShallow(selectCompletedWorkouts));
  const completeWorkout = useTrainingStore((s) => s.completeWorkout);

  const [elapsed, setElapsed] = useState('0:00');
  const [saving, setSaving] = useState(false);
  /**
   * Set when the save fails. The session is still on screen and still complete,
   * so this is a retry prompt, not a dead end.
   */
  const [saveFailed, setSaveFailed] = useState(false);
  /**
   * Guards the redirect below. Clearing the session after a successful save
   * would otherwise look identical to "the session vanished", and bounce the
   * lifter to Today instead of letting them reach their summary.
   */
  const finishing = useRef(false);
  /**
   * Whether this screen is still on the stack.
   *
   * The finish handler awaits a network round trip and then sets state and
   * redirects. Both are wrong once the screen is gone -- the redirect in
   * particular would yank the lifter off whatever they navigated to while the
   * save was in flight. The navigation guard below makes that hard to reach on
   * purpose; this makes it harmless if it happens anyway.
   */
  const mounted = useRef(true);
  useEffect(
    () => () => {
      mounted.current = false;
    },
    [],
  );

  /**
   * Android's hardware back is blocked for exactly as long as the save runs.
   *
   * `gestureEnabled: false` on this route (`app/_layout.tsx`) stops the iOS
   * swipe, and the header control below disables itself, but neither touches
   * the hardware button -- so on Android the one irreversible moment in the
   * logger was also the one moment you could walk out of it mid-write.
   *
   * Returning `true` consumes the event. This only applies while `saving`, so
   * the ordinary back behaviour is untouched.
   */
  useEffect(() => {
    if (!saving) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => sub.remove();
  }, [saving]);

  // Session clock.
  useEffect(() => {
    if (!workout) return;
    const startedAt = new Date(workout.startedAt).getTime();
    const tick = () => setElapsed(formatClock((Date.now() - startedAt) / 1000));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [workout]);

  // If the store has no session (e.g. a deep link straight to this route), leave.
  // `finishing` excludes the one case where an empty store is expected and the
  // navigation is already handled.
  //
  // `profile` is included deliberately. Without it, a session in the store but
  // no profile fell through to `return null` below -- a blank screen with no
  // header, no control, and no way out. Today owns the loading and error states
  // for the training store, so the honest destination is Today. Defensive: the
  // profile is only null before the first successful load, and the logger is
  // not reachable until Today has loaded, so this is not expected to fire.
  useEffect(() => {
    if ((!workout || !profile) && !finishing.current) router.replace('/');
  }, [workout, profile, router]);

  // Being on this screen IS resuming, whichever route got here.
  //
  // `resumeDraft()` used to be called from exactly one place -- Today's
  // "Recovered session" card -- so any other way in (Exercises' "log this
  // lift", the template modal reached from an empty Insights/History state)
  // left `draftPendingReview` set. Today then went on offering Resume/Discard
  // for a session the lifter was already logging in, which is the opposite of
  // the honest continuity states D5 exists to guarantee.
  //
  // Clearing it here rather than in the store keeps the store ignorant of
  // navigation. The call is idempotent, so Today's Resume button -- which
  // already calls it before navigating -- is unaffected.
  useEffect(() => {
    if (workout && draftPendingReview) resumeDraft();
  }, [workout, draftPendingReview, resumeDraft]);

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
        [
          { text: 'Keep going', style: 'cancel' },
          {
            text: 'Discard',
            style: 'destructive',
            // Straight to the discard, not through `handleDiscard`'s prompt.
            // Nothing is logged, so there is nothing to lose and nothing to
            // confirm -- chaining a second dialog onto this one asked the same
            // question twice.
            onPress: () => {
              discard();
              router.replace('/');
            },
          },
        ],
      );
      return;
    }

    Alert.alert('Finish session?', `${completedSets} sets logged in ${elapsed}.`, [
      { text: 'Keep going', style: 'cancel' },
      {
        text: 'Finish',
        onPress: async () => {
          setSaving(true);
          setSaveFailed(false);
          try {
            // Builds the record without clearing the session -- see the store.
            // Nothing local is thrown away until the write has come back clean.
            const finished = finish();
            if (!finished) return;

            // Detect records against the state before this session, then send
            // them WITH the workout rather than after it.
            //
            // This was two awaited calls: save the workout, then insert the
            // records. When the second failed the lifter was told the session
            // had not saved -- over a session that had -- and retrying re-minted
            // the record ids, so a lost response on the first attempt became a
            // duplicate PR on the second. One call, one transaction, and a
            // repeat is a no-op. See `Repository.completeWorkout`.
            const detected = detectWorkoutPrs(finished, priorBests);
            const records: PersonalRecord[] = detected.map((pr) => ({
              id: newId('pr'),
              // Local draft only. The server sets the real owner from the
              // session on write, so this value is never authoritative.
              profileId: profile.id,
              exerciseId: pr.exerciseId,
              kind: pr.kind,
              value: pr.value,
              reps: pr.reps,
              weightKg: pr.weightKg,
              achievedAt: finished.startedAt,
              workoutId: finished.id,
            }));

            await completeWorkout(finished, records);

            // Saved. Only now is it safe to let the session go.
            //
            // If the screen went away while the write was in flight, the save
            // still counted -- it is committed and in the read model -- but
            // redirecting now would pull the lifter off wherever they went.
            // Clearing the session is still correct and still happens.
            if (!mounted.current) {
              discard();
              return;
            }
            finishing.current = true;
            router.replace({ pathname: '/workout/summary', params: { id: finished.id } });
            discard();
          } catch (e) {
            // The write can fail for reasons the lifter cannot see -- the server
            // refusing it, an expired session, no signal in the gym. Whatever the
            // cause, the sets stay on screen and stay theirs to retry. Silently
            // dropping them here is how a session gets lost for good.
            reportHandledError('workout', 'save failed', e);
            if (mounted.current) setSaveFailed(true);
          } finally {
            if (mounted.current) setSaving(false);
          }
        },
      },
    ]);
  };

  /**
   * Removing logged work asks first; removing nothing does not.
   *
   * The session-level Discard has always confirmed, but removing an exercise
   * took every set logged under it with one tap and no prompt, and a long press
   * on a set index deleted it outright. Both are irreversible -- there is no
   * undo anywhere in the logger -- so both now confirm.
   *
   * The condition matters as much as the prompt: an untouched exercise or an
   * unticked set is a plan, not a record, and asking before clearing one is
   * friction in the middle of a set. Only work that would actually be lost is
   * worth interrupting for.
   */
  const confirmRemoveExercise = (workoutExerciseId: string, name: string, loggedSets: number) => {
    if (loggedSets === 0) {
      removeExercise(workoutExerciseId);
      return;
    }
    Alert.alert(
      `Remove ${name}?`,
      `${loggedSets} logged ${loggedSets === 1 ? 'set goes' : 'sets go'} with it. This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: () => removeExercise(workoutExerciseId) },
      ],
    );
  };

  const confirmRemoveSet = (setId: string, isLogged: boolean) => {
    if (!isLogged) {
      removeSet(setId);
      return;
    }
    Alert.alert('Remove this set?', 'You have already logged it. This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => removeSet(setId) },
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
          {/*
            Disabled while the session is being written. Leaving mid-save was
            the one way to get the finish handler redirecting into a screen the
            lifter had already navigated away from, and the state that says
            "saving" was visible on the button below while this one happily
            dismissed the screen out from under it.
          */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Minimise session and go back"
            accessibilityState={{ disabled: saving }}
            accessibilityHint={saving ? 'Unavailable while the session is saving' : undefined}
            disabled={saving}
            onPress={() => router.back()}
            hitSlop={10}
            style={({ pressed }) => [
              styles.headerButton,
              pressed && { opacity: opacity.pressed },
              saving && { opacity: opacity.disabled },
            ]}
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
          {/*
            "Sets done", not "Sets": this counts every ticked set including
            warm-ups, which is the right progress number here but is NOT the
            "Working sets" the summary and History report for the same session
            (those exclude warm-ups, as volume does). Two different numbers under
            one word made the summary look like it had lost a set.
          */}
          <Metric label="Sets done" value={`${completedSets}/${totalSets}`} />
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
                onRemoveSet={(setId) =>
                  confirmRemoveSet(setId, we.sets.find((s) => s.id === setId)?.completed ?? false)
                }
                onAddSet={() => addSet(we.id)}
                onRemoveExercise={() =>
                  confirmRemoveExercise(
                    we.id,
                    exercise.name,
                    we.sets.filter((s) => s.completed).length,
                  )
                }
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

        {/*
          Shown in place of nothing at all, which is what used to happen. The
          wording deliberately promises only what is true: the sets are still
          here. It does not say the session is saved, and it does not guess why
          the server refused.
        */}
        {saveFailed ? (
          <View
            style={styles.saveError}
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
          >
            <Ionicons name="cloud-offline-outline" size={16} color={color.coral} />
            <Text variant="bodySm" tone="coral" style={styles.saveErrorText}>
              Could not save this session. Your sets are still here — try finishing again.
            </Text>
          </View>
        ) : null}

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
  saveError: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.sm,
    marginHorizontal: space.lg,
    marginTop: space.md,
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    backgroundColor: color.coralWash,
  },
  saveErrorText: { flex: 1, lineHeight: 18 },
});
