import { create } from 'zustand';
import { getRepository } from '@/data/repository';
import { isAuthRequiredError } from '@/data/authRequired';
import { useSessionStore } from './sessionStore';
import type { CustomExerciseInput } from '@/domain/customExercise';
import { planSelectionWrite, selectActiveRoutine } from '@/domain/settings';
import { deviceLocalDate } from '@/domain/trainingDay';
import type {
  BodyMeasurement,
  CheckIn,
  Exercise,
  PersonalRecord,
  Profile,
  Routine,
  Workout,
} from '@/domain/types';

/**
 * Persisted training data, loaded once and kept in memory.
 *
 * This store is the read model. It never computes anything -- derived values
 * come from `src/domain/calc` via selectors so the same maths runs in tests,
 * in the UI, and (later) on a server.
 */

interface TrainingState {
  status: 'idle' | 'loading' | 'ready' | 'error';
  error: string | null;

  profile: Profile | null;
  exercises: Exercise[];
  exerciseById: Map<string, Exercise>;
  routines: Routine[];
  activeRoutine: Routine | null;
  workouts: Workout[];
  checkIns: CheckIn[];
  measurements: BodyMeasurement[];
  personalRecords: PersonalRecord[];
  favouriteExerciseIds: string[];

  load: () => Promise<void>;
  refresh: () => Promise<void>;
  /** Returns the store to its pre-load state. Part of sign-out teardown. */
  reset: () => void;
  upsertWorkout: (workout: Workout) => Promise<void>;
  addPersonalRecords: (records: PersonalRecord[]) => Promise<void>;
  /**
   * Finish a session in one operation -- see `Repository.completeWorkout`.
   *
   * `upsertWorkout` followed by `addPersonalRecords` is still available for the
   * paths that genuinely are separate edits (the summary screen changing a
   * rating, say). Finishing is not one of them: it is a single user action and
   * splitting it is what let a session commit while its records did not.
   */
  completeWorkout: (workout: Workout, records: PersonalRecord[]) => Promise<void>;
  saveCheckIn: (checkIn: CheckIn) => Promise<void>;
  updateProfile: (patch: Partial<Profile>) => Promise<void>;
  createExercise: (input: CustomExerciseInput) => Promise<Exercise>;
  updateExercise: (id: string, input: CustomExerciseInput) => Promise<Exercise>;
  deleteExercise: (id: string) => Promise<void>;
  saveMeasurement: (measurement: BodyMeasurement) => Promise<void>;
  deleteMeasurement: (id: string) => Promise<void>;
  selectRoutine: (routineId: string) => Promise<void>;
  toggleFavourite: (exerciseId: string) => void;
}

/**
 * Everything this store holds that belongs to a user, at its pre-load value.
 *
 * Named and reused by `reset()` so sign-out cannot drift from construction:
 * a field added here is cleared on sign-out for free, and a field added only
 * to the initializer below would be a field that survives a sign-out. That is
 * the whole failure mode `reset()` exists to prevent (proposed I-19).
 *
 * `favouriteExerciseIds` is included even though it is never persisted -- it is
 * still one lifter's preference sitting in memory when the next one signs in.
 */
const INITIAL_DATA = {
  status: 'idle' as const,
  error: null,
  profile: null,
  exercises: [],
  exerciseById: new Map<string, Exercise>(),
  routines: [],
  activeRoutine: null,
  workouts: [],
  checkIns: [],
  measurements: [],
  personalRecords: [],
  favouriteExerciseIds: ['ex_back_squat', 'ex_bench_press', 'ex_deadlift', 'ex_pullup'],
};

export const useTrainingStore = create<TrainingState>((set, get) => ({
  ...INITIAL_DATA,

  load: async () => {
    if (get().status === 'loading' || get().status === 'ready') return;
    await get().refresh();
  },

  refresh: async () => {
    set({ status: 'loading', error: null });
    try {
      const repo = getRepository();
      const [profile, exercises, routines, activeRoutine, workouts, checkIns, measurements, personalRecords] =
        await Promise.all([
          repo.getProfile(),
          repo.listExercises(),
          repo.listRoutines(),
          repo.getActiveRoutine(),
          repo.listWorkouts(),
          repo.listCheckIns(),
          repo.listMeasurements(),
          repo.listPersonalRecords(),
        ]);

      set({
        status: 'ready',
        profile,
        exercises,
        exerciseById: new Map(exercises.map((e) => [e.id, e])),
        routines,
        activeRoutine,
        workouts,
        checkIns,
        measurements,
        personalRecords,
      });
    } catch (e) {
      // "No session" is a routing problem, not a load failure. Left as
      // `status: 'error'` it rendered `ScreenState`'s "Could not load this"
      // behind a Retry that could never succeed, with no way to a sign-in
      // screen. Status goes back to 'idle' rather than 'error' because
      // `load()`'s re-entry guard blocks on 'loading'/'ready' -- leaving a
      // stale status here would silently swallow the load that runs after a
      // successful sign-in.
      if (isAuthRequiredError(e)) {
        set({ status: 'idle', error: null });
        useSessionStore.getState().markUnauthenticated();
        return;
      }
      set({ status: 'error', error: e instanceof Error ? e.message : 'Could not load your training data.' });
    }
  },

  /**
   * Sign-out teardown. Ordered by `signOutAndTearDown` in `authActions.ts`,
   * which is the only caller -- this is not a "reload" affordance.
   */
  reset: () => set({ ...INITIAL_DATA, exerciseById: new Map<string, Exercise>() }),

  upsertWorkout: async (workout) => {
    await getRepository().saveWorkout(workout);
    set((s) => {
      const rest = s.workouts.filter((w) => w.id !== workout.id);
      return { workouts: [...rest, workout].sort((a, b) => a.startedAt.localeCompare(b.startedAt)) };
    });
  },

  addPersonalRecords: async (records) => {
    if (records.length === 0) return;
    await getRepository().savePersonalRecords(records);
    set((s) => ({ personalRecords: [...s.personalRecords, ...records] }));
  },

  completeWorkout: async (workout, records) => {
    await getRepository().completeWorkout(workout, records);
    // One `set` for both, so the read model can never show a finished workout
    // without the records it set. The repository already refused to commit one
    // without the other; doing it in two calls here would reintroduce the same
    // split a layer higher.
    //
    // Records are merged by id rather than appended: the repository treats a
    // repeat call as a no-op, so a retry must not grow the array either.
    set((s) => {
      const known = new Set(s.personalRecords.map((r) => r.id));
      return {
        workouts: [...s.workouts.filter((w) => w.id !== workout.id), workout].sort((a, b) =>
          a.startedAt.localeCompare(b.startedAt),
        ),
        personalRecords: [...s.personalRecords, ...records.filter((r) => !known.has(r.id))],
      };
    });
  },

  saveCheckIn: async (checkIn) => {
    await getRepository().saveCheckIn(checkIn);
    set((s) => {
      // The database keeps the existing row id when a caller submits a new id
      // for the same date. Mirror that here so the read model never diverges
      // until the next refresh merely because its cache was cold.
      const existing = s.checkIns.find((c) => c.localDate === checkIn.localDate);
      const saved = existing
        ? { ...checkIn, id: existing.id, profileId: existing.profileId }
        : checkIn;
      return {
        checkIns: [
          ...s.checkIns.filter(
            (c) => c.id !== saved.id && c.localDate !== saved.localDate,
          ),
          saved,
        ].sort((a, b) => a.checkedInAt.localeCompare(b.checkedInAt)),
      };
    });
  },

  updateProfile: async (patch) => {
    const profile = await getRepository().updateProfile(patch);
    set((s) => ({ profile, activeRoutine: selectActiveRoutine(s.routines, profile) }));
  },

  createExercise: async (input) => {
    const exercise = await getRepository().createExercise(input);
    set((s) => withExercise(s, exercise));
    return exercise;
  },

  updateExercise: async (id, input) => {
    const exercise = await getRepository().updateExercise(id, input);
    set((s) => withExercise(s, exercise));
    return exercise;
  },

  deleteExercise: async (id) => {
    await getRepository().deleteExercise(id);
    set((s) => {
      const exercises = s.exercises.filter((exercise) => exercise.id !== id);
      return {
        exercises,
        exerciseById: new Map(exercises.map((exercise) => [exercise.id, exercise])),
        favouriteExerciseIds: s.favouriteExerciseIds.filter((exerciseId) => exerciseId !== id),
      };
    });
  },

  saveMeasurement: async (measurement) => {
    await getRepository().saveMeasurement(measurement);
    set((s) => ({
      measurements: [...s.measurements.filter((m) => m.id !== measurement.id), measurement].sort(
        (a, b) => a.measuredAt.localeCompare(b.measuredAt),
      ),
    }));
  },

  deleteMeasurement: async (id) => {
    await getRepository().deleteMeasurement(id);
    set((s) => ({ measurements: s.measurements.filter((m) => m.id !== id) }));
  },

  selectRoutine: async (routineId) => {
    const routine = get().routines.find((candidate) => candidate.id === routineId);
    if (!routine) throw new Error('That plan is not available.');

    const write = planSelectionWrite(routine);
    if (write.kind === 'profile') {
      const profile = await getRepository().updateProfile(write.patch);
      set((s) => ({ profile, activeRoutine: selectActiveRoutine(s.routines, profile) }));
      return;
    }

    await getRepository().setActiveRoutine(write.routineId);
    set((s) => {
      const routines = s.routines.map((candidate) =>
        candidate.profileId == null
          ? candidate
          : { ...candidate, isActive: candidate.id === write.routineId },
      );
      return { routines, activeRoutine: selectActiveRoutine(routines, s.profile) };
    });
  },

  toggleFavourite: (exerciseId) =>
    set((s) => ({
      favouriteExerciseIds: s.favouriteExerciseIds.includes(exerciseId)
        ? s.favouriteExerciseIds.filter((id) => id !== exerciseId)
        : [...s.favouriteExerciseIds, exerciseId],
    })),
}));

/** Replace-or-add one exercise while keeping both read indexes in lockstep. */
function withExercise(
  state: Pick<TrainingState, 'exercises'>,
  exercise: Exercise,
): Pick<TrainingState, 'exercises' | 'exerciseById'> {
  const exercises = [...state.exercises.filter((candidate) => candidate.id !== exercise.id), exercise]
    .sort((a, b) => a.name.localeCompare(b.name));
  return {
    exercises,
    exerciseById: new Map(exercises.map((candidate) => [candidate.id, candidate])),
  };
}

/** Completed sessions only, oldest first. Most calculations want this. */
export function selectCompletedWorkouts(s: TrainingState): Workout[] {
  return s.workouts.filter((w) => w.status === 'completed');
}

export function selectLatestCheckIn(s: TrainingState): CheckIn | null {
  return s.checkIns.length > 0 ? s.checkIns[s.checkIns.length - 1] : null;
}

/** Today's check-in by captured local date, independent of its UTC timestamp. */
export function selectTodaysCheckIn(
  s: TrainingState,
  reference: Date = new Date(),
): CheckIn | null {
  const today = deviceLocalDate(reference);
  return [...s.checkIns].reverse().find((checkIn) => checkIn.localDate === today) ?? null;
}
