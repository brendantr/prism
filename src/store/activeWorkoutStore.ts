import { create } from 'zustand';
import * as Haptics from 'expo-haptics';
import { newId } from '@/utils/id';
import type { RoutineDay, SetType, Workout, WorkoutExercise, WorkoutSet } from '@/domain/types';

/**
 * ACTIVE WORKOUT
 * ==============
 * The only piece of genuinely local, ephemeral state in PRism. It lives apart
 * from `trainingStore` on purpose: a session in progress is not "data" until
 * the user finishes it, and treating it as such is how logging apps end up with
 * phantom half-workouts in the history.
 *
 * Everything here is synchronous and optimistic. Persistence happens once, on
 * finish, through the repository.
 */

export interface RestTimer {
  /** Epoch ms when the rest period ends. */
  endsAt: number;
  durationSeconds: number;
  /** Which set kicked it off, so the UI can anchor the bar. */
  setId: string;
}

interface ActiveWorkoutState {
  workout: Workout | null;
  restTimer: RestTimer | null;
  /** Set ids the user has completed this session, for PR celebration ordering. */
  lastCompletedSetId: string | null;

  start: (params: { profileId: string; title: string; routineDay?: RoutineDay | null }) => Workout;
  discard: () => void;

  addExercise: (exerciseId: string, defaults?: { sets: number; reps: number; rest: number }) => void;
  removeExercise: (workoutExerciseId: string) => void;
  reorderExercise: (workoutExerciseId: string, direction: 'up' | 'down') => void;
  setExerciseNotes: (workoutExerciseId: string, notes: string) => void;

  addSet: (workoutExerciseId: string, seed?: Partial<WorkoutSet>) => void;
  updateSet: (setId: string, patch: Partial<WorkoutSet>) => void;
  removeSet: (setId: string) => void;
  toggleSetComplete: (setId: string, restSeconds: number) => void;

  startRest: (seconds: number, setId: string) => void;
  adjustRest: (deltaSeconds: number) => void;
  clearRest: () => void;

  setReflection: (text: string) => void;
  setRating: (rating: number) => void;
  /** Stamps `endedAt` + status and hands the workout back for persistence. */
  finish: () => Workout | null;
}

const DEFAULT_SET: Omit<WorkoutSet, 'id' | 'workoutExerciseId' | 'setIndex'> = {
  type: 'working',
  weightKg: 0,
  reps: 0,
  rpe: null,
  completed: false,
  restSeconds: null,
  notes: null,
};

export const useActiveWorkoutStore = create<ActiveWorkoutState>((set, get) => ({
  workout: null,
  restTimer: null,
  lastCompletedSetId: null,

  start: ({ profileId, title, routineDay }) => {
    const workoutId = newId('wk');

    const exercises: WorkoutExercise[] = (routineDay?.exercises ?? []).map((slot, i) => {
      const weId = newId('we');
      return {
        id: weId,
        workoutId,
        exerciseId: slot.exerciseId,
        orderIndex: i,
        notes: null,
        // Pre-build the prescribed number of empty sets so the logger opens
        // with the session already laid out.
        sets: Array.from({ length: slot.targetSets }, (_, s) => ({
          ...DEFAULT_SET,
          id: newId('st'),
          workoutExerciseId: weId,
          setIndex: s,
          reps: slot.targetRepsLow,
          restSeconds: slot.restSeconds,
        })),
      };
    });

    const workout: Workout = {
      id: workoutId,
      profileId,
      routineDayId: routineDay?.id ?? null,
      title,
      status: 'in_progress',
      startedAt: new Date().toISOString(),
      endedAt: null,
      reflection: null,
      sessionRating: null,
      exercises,
    };

    set({ workout, restTimer: null, lastCompletedSetId: null });
    return workout;
  },

  discard: () => set({ workout: null, restTimer: null, lastCompletedSetId: null }),

  addExercise: (exerciseId, defaults) => {
    const workout = get().workout;
    if (!workout) return;
    const weId = newId('we');
    const setCount = defaults?.sets ?? 3;

    const we: WorkoutExercise = {
      id: weId,
      workoutId: workout.id,
      exerciseId,
      orderIndex: workout.exercises.length,
      notes: null,
      sets: Array.from({ length: setCount }, (_, s) => ({
        ...DEFAULT_SET,
        id: newId('st'),
        workoutExerciseId: weId,
        setIndex: s,
        reps: defaults?.reps ?? 8,
        restSeconds: defaults?.rest ?? 120,
      })),
    };

    set({ workout: { ...workout, exercises: [...workout.exercises, we] } });
  },

  removeExercise: (workoutExerciseId) =>
    set((s) => {
      if (!s.workout) return s;
      const exercises = s.workout.exercises
        .filter((we) => we.id !== workoutExerciseId)
        .map((we, i) => ({ ...we, orderIndex: i }));
      return { workout: { ...s.workout, exercises } };
    }),

  reorderExercise: (workoutExerciseId, direction) =>
    set((s) => {
      if (!s.workout) return s;
      const list = [...s.workout.exercises];
      const i = list.findIndex((we) => we.id === workoutExerciseId);
      const j = direction === 'up' ? i - 1 : i + 1;
      if (i < 0 || j < 0 || j >= list.length) return s;
      [list[i], list[j]] = [list[j], list[i]];
      return {
        workout: { ...s.workout, exercises: list.map((we, idx) => ({ ...we, orderIndex: idx })) },
      };
    }),

  setExerciseNotes: (workoutExerciseId, notes) =>
    set((s) =>
      s.workout
        ? {
            workout: {
              ...s.workout,
              exercises: s.workout.exercises.map((we) =>
                we.id === workoutExerciseId ? { ...we, notes } : we,
              ),
            },
          }
        : s,
    ),

  addSet: (workoutExerciseId, seed) =>
    set((s) => {
      if (!s.workout) return s;
      return {
        workout: {
          ...s.workout,
          exercises: s.workout.exercises.map((we) => {
            if (we.id !== workoutExerciseId) return we;
            // A new set inherits the last one's load -- the overwhelmingly
            // common case is "same weight, one more set".
            const previous = we.sets[we.sets.length - 1];
            return {
              ...we,
              sets: [
                ...we.sets,
                {
                  ...DEFAULT_SET,
                  weightKg: previous?.weightKg ?? 0,
                  reps: previous?.reps ?? 8,
                  restSeconds: previous?.restSeconds ?? 120,
                  ...seed,
                  id: newId('st'),
                  workoutExerciseId,
                  setIndex: we.sets.length,
                  completed: false,
                },
              ],
            };
          }),
        },
      };
    }),

  updateSet: (setId, patch) =>
    set((s) =>
      s.workout
        ? {
            workout: {
              ...s.workout,
              exercises: s.workout.exercises.map((we) => ({
                ...we,
                sets: we.sets.map((st) => (st.id === setId ? { ...st, ...patch } : st)),
              })),
            },
          }
        : s,
    ),

  removeSet: (setId) =>
    set((s) =>
      s.workout
        ? {
            workout: {
              ...s.workout,
              exercises: s.workout.exercises.map((we) => ({
                ...we,
                sets: we.sets
                  .filter((st) => st.id !== setId)
                  .map((st, i) => ({ ...st, setIndex: i })),
              })),
            },
          }
        : s,
    ),

  toggleSetComplete: (setId, restSeconds) => {
    const workout = get().workout;
    if (!workout) return;

    let nowComplete = false;
    const exercises = workout.exercises.map((we) => ({
      ...we,
      sets: we.sets.map((st) => {
        if (st.id !== setId) return st;
        nowComplete = !st.completed;
        return { ...st, completed: nowComplete };
      }),
    }));

    set({ workout: { ...workout, exercises }, lastCompletedSetId: nowComplete ? setId : null });

    if (nowComplete) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      if (restSeconds > 0) get().startRest(restSeconds, setId);
    } else {
      get().clearRest();
    }
  },

  startRest: (seconds, setId) =>
    set({ restTimer: { endsAt: Date.now() + seconds * 1000, durationSeconds: seconds, setId } }),

  adjustRest: (deltaSeconds) =>
    set((s) =>
      s.restTimer
        ? {
            restTimer: {
              ...s.restTimer,
              endsAt: Math.max(Date.now(), s.restTimer.endsAt + deltaSeconds * 1000),
              durationSeconds: Math.max(0, s.restTimer.durationSeconds + deltaSeconds),
            },
          }
        : s,
    ),

  clearRest: () => set({ restTimer: null }),

  setReflection: (text) =>
    set((s) => (s.workout ? { workout: { ...s.workout, reflection: text } } : s)),

  setRating: (rating) =>
    set((s) => (s.workout ? { workout: { ...s.workout, sessionRating: rating } } : s)),

  finish: () => {
    const workout = get().workout;
    if (!workout) return null;

    // Drop exercises where nothing was actually completed -- an untouched block
    // is a plan, not a record of training.
    const exercises = workout.exercises
      .map((we) => ({ ...we, sets: we.sets.filter((st) => st.completed) }))
      .filter((we) => we.sets.length > 0)
      .map((we, i) => ({ ...we, orderIndex: i, sets: we.sets.map((st, s) => ({ ...st, setIndex: s })) }));

    const finished: Workout = {
      ...workout,
      exercises,
      status: 'completed',
      endedAt: new Date().toISOString(),
    };

    set({ workout: null, restTimer: null, lastCompletedSetId: null });
    return finished;
  },
}));

// --- Selectors -------------------------------------------------------------

export function selectHasActiveWorkout(s: ActiveWorkoutState): boolean {
  return s.workout != null;
}

export function selectCompletedSetCount(s: ActiveWorkoutState): number {
  if (!s.workout) return 0;
  return s.workout.exercises.reduce((n, we) => n + we.sets.filter((st) => st.completed).length, 0);
}

export function selectTotalSetCount(s: ActiveWorkoutState): number {
  if (!s.workout) return 0;
  return s.workout.exercises.reduce((n, we) => n + we.sets.length, 0);
}

export const SET_TYPE_LABEL: Record<SetType, string> = {
  working: 'Working set',
  warmup: 'Warm-up',
  dropset: 'Drop set',
  failure: 'To failure',
  backoff: 'Back-off',
};
