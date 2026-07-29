import { create } from 'zustand';
import { getRepository } from '@/data/repository';
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
  upsertWorkout: (workout: Workout) => Promise<void>;
  addPersonalRecords: (records: PersonalRecord[]) => Promise<void>;
  saveCheckIn: (checkIn: CheckIn) => Promise<void>;
  updateProfile: (patch: Partial<Profile>) => Promise<void>;
  toggleFavourite: (exerciseId: string) => void;
}

export const useTrainingStore = create<TrainingState>((set, get) => ({
  status: 'idle',
  error: null,

  profile: null,
  exercises: [],
  exerciseById: new Map(),
  routines: [],
  activeRoutine: null,
  workouts: [],
  checkIns: [],
  measurements: [],
  personalRecords: [],
  favouriteExerciseIds: ['ex_back_squat', 'ex_bench_press', 'ex_deadlift', 'ex_pullup'],

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
      set({ status: 'error', error: e instanceof Error ? e.message : 'Could not load your training data.' });
    }
  },

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

  saveCheckIn: async (checkIn) => {
    await getRepository().saveCheckIn(checkIn);
    set((s) => ({
      checkIns: [...s.checkIns.filter((c) => c.id !== checkIn.id), checkIn].sort((a, b) =>
        a.checkedInAt.localeCompare(b.checkedInAt),
      ),
    }));
  },

  updateProfile: async (patch) => {
    const profile = await getRepository().updateProfile(patch);
    set({ profile });
  },

  toggleFavourite: (exerciseId) =>
    set((s) => ({
      favouriteExerciseIds: s.favouriteExerciseIds.includes(exerciseId)
        ? s.favouriteExerciseIds.filter((id) => id !== exerciseId)
        : [...s.favouriteExerciseIds, exerciseId],
    })),
}));

/** Completed sessions only, oldest first. Most calculations want this. */
export function selectCompletedWorkouts(s: TrainingState): Workout[] {
  return s.workouts.filter((w) => w.status === 'completed');
}

export function selectLatestCheckIn(s: TrainingState): CheckIn | null {
  return s.checkIns.length > 0 ? s.checkIns[s.checkIns.length - 1] : null;
}

/** Today's check-in, if one exists. There is at most one per calendar day. */
export function selectTodaysCheckIn(s: TrainingState): CheckIn | null {
  const latest = selectLatestCheckIn(s);
  if (!latest) return null;
  const at = new Date(latest.checkedInAt);
  const now = new Date();
  const sameDay =
    at.getFullYear() === now.getFullYear() &&
    at.getMonth() === now.getMonth() &&
    at.getDate() === now.getDate();
  return sameDay ? latest : null;
}
