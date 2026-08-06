import { create } from 'zustand';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { newId } from '@/utils/id';
import type { RoutineDay, SetType, Workout, WorkoutExercise, WorkoutSet } from '@/domain/types';

/**
 * Local-only draft key, independent of the repository -- see the module-level
 * `subscribe` below. Exported so sign-out teardown can remove it deterministically
 * rather than relying on the subscriber's fire-and-forget write
 * (`src/store/authActions.ts`).
 */
export const DRAFT_STORAGE_KEY = 'prism.activeWorkout.draft.v1';

/**
 * ACTIVE WORKOUT
 * ==============
 * The only piece of genuinely local, ephemeral state in PRism. It lives apart
 * from `trainingStore` on purpose: a session in progress is not "data" until
 * the user finishes it, and treating it as such is how logging apps end up with
 * phantom half-workouts in the history.
 *
 * Everything here is synchronous and optimistic. The repository never sees this
 * state until `finish()` hands a completed workout to `trainingStore`. A raw
 * mirror of `workout` is also kept in `AsyncStorage` (see the `subscribe` below)
 * purely so a killed process can recover the in-progress draft on relaunch --
 * that mirror is never read by anything except this store's own `hydrate()`.
 */

/**
 * Who a recovered draft has to belong to for `hydrate()` to keep it.
 *
 * `{ enforce: false }` is the demo/single-identity case: there is one lifter on
 * the device and `DEMO_PROFILE_ID` is a constant, so there is nothing to check.
 * The caller decides, because only the caller knows the build's mode -- this
 * store stays mode-agnostic, as `Docs/architecture.md` describes it.
 *
 * NOT AN AUTHORIZATION CHECK -- see the note on `start()` below, which this
 * deliberately does not contradict. Discarding local state is not the same as
 * granting access to remote state: the security boundary is still RLS plus the
 * session-derived `profile_id` that `SupabaseRepository.saveWorkout` stamps on
 * write. What this prevents is a *data-integrity* accident -- one lifter's
 * unfinished session being saved onto the next lifter's account when a shared
 * phone changes hands, which the write path would happily do, because the write
 * path correctly trusts the session and knows nothing about where the draft
 * came from.
 */
export type DraftOwner = { enforce: false } | { enforce: true; profileId: string };

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

  /** Whether `hydrate()` has finished reading any locally persisted draft yet. */
  hydrationStatus: 'idle' | 'loading' | 'ready';
  /**
   * Set when a recovered draft was thrown away because it belonged to a
   * different account. Surfaced nowhere in v1 -- it exists so the discard is
   * observable in a test rather than being a silent deletion.
   */
  draftDiscardedForOwner: boolean;
  /**
   * True only when the current `workout` was just restored from disk on this
   * app launch and the user has not yet chosen to resume or discard it. Drives
   * the "Recovered session" decision on Today rather than silently dropping the
   * lifter back into the logger.
   */
  draftPendingReview: boolean;
  /** Reads any locally persisted draft from a prior, killed session. Idempotent. */
  hydrate: (owner?: DraftOwner) => Promise<void>;
  /** Clears the pending-review flag; the restored `workout` is left untouched. */
  resumeDraft: () => void;

  /**
   * `profileId` is **local draft state, never an ownership claim.**
   *
   * It exists so the in-progress session has the shape of a `Workout` while it
   * is still on the device. On write, `SupabaseRepository` replaces it with the
   * id from the signed-in session and Postgres checks the result against its
   * own policies — so nothing the client puts here can decide who owns a row.
   * Do not read it back as a permission, and do not gate UI on it.
   *
   * `hydrate()` compares it against `DraftOwner` on launch, which is not a
   * reversal of the above: it decides whether to keep a *local* draft, grants
   * no access to anything, and gates no UI. The rule stands — this value can
   * throw a draft away, and can never let one through.
   */
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
  hydrationStatus: 'idle',
  draftPendingReview: false,
  draftDiscardedForOwner: false,

  hydrate: async (owner = { enforce: false }) => {
    if (get().hydrationStatus !== 'idle') return;
    set({ hydrationStatus: 'loading' });

    let restored: Workout | null = null;
    let discardedForOwner = false;
    try {
      const raw = await AsyncStorage.getItem(DRAFT_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Workout;
        // Defensive: nothing in this store ever persists another status (see
        // the `subscribe` below), but a stored value is external input and
        // gets the same skepticism as any other -- a corrupt or unexpected
        // shape must never block launch.
        if (parsed && parsed.status === 'in_progress') restored = parsed;
      }
    } catch {
      restored = null;
    }

    // A draft from a different account -- or from a demo run on a device that
    // has since signed in, where the id is the `DEMO_PROFILE_ID` literal -- is
    // dropped rather than resumed. Resuming it would let `finish()` hand the
    // previous lifter's sets to `upsertWorkout`, which stamps the *current*
    // session's id on write and would file someone else's training under this
    // account. See `DraftOwner`.
    if (restored && owner.enforce && restored.profileId !== owner.profileId) {
      restored = null;
      discardedForOwner = true;
      await AsyncStorage.removeItem(DRAFT_STORAGE_KEY).catch(() => {});
    }

    // The read above is async; the user may have already started a new
    // session (e.g. tapping "Start session" before this resolves) while it
    // was in flight. A workout already sitting in the store by now is never
    // the stale on-disk draft -- it's real, current state, and must win.
    if (get().workout) {
      set({ hydrationStatus: 'ready', draftDiscardedForOwner: discardedForOwner });
      return;
    }

    set(
      restored
        ? { workout: restored, draftPendingReview: true, hydrationStatus: 'ready' }
        : { hydrationStatus: 'ready', draftDiscardedForOwner: discardedForOwner },
    );
  },

  resumeDraft: () => set({ draftPendingReview: false }),

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

    set({ workout, restTimer: null, lastCompletedSetId: null, draftPendingReview: false });
    return workout;
  },

  discard: () =>
    set({ workout: null, restTimer: null, lastCompletedSetId: null, draftPendingReview: false }),

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

  /**
   * Build the completed workout **without touching the store.**
   *
   * This used to clear the session here, which meant the only copy of the
   * lifter's sets was gone before the save had been attempted. If the write
   * then failed -- the server rejecting it, an expired session, gym wifi --
   * there was nothing left to retry with and nothing to show them.
   *
   * Clearing is now the caller's job, once the save has actually succeeded.
   * See `discard()`, and `app/workout/active.tsx`.
   */
  finish: () => {
    const workout = get().workout;
    if (!workout) return null;

    // Drop exercises where nothing was actually completed -- an untouched block
    // is a plan, not a record of training.
    const exercises = workout.exercises
      .map((we) => ({ ...we, sets: we.sets.filter((st) => st.completed) }))
      .filter((we) => we.sets.length > 0)
      .map((we, i) => ({ ...we, orderIndex: i, sets: we.sets.map((st, s) => ({ ...st, setIndex: s })) }));

    return {
      ...workout,
      exercises,
      status: 'completed',
      endedAt: new Date().toISOString(),
    };
  },
}));

// --- Local draft persistence -----------------------------------------------
//
// The only persistence mechanism this store needs: every mutating action
// above already replaces `workout` with a new object, so watching the
// reference is enough to catch every meaningful change without touching each
// action individually. A kill mid-session loses nothing older than the last
// completed write; a kill mid-`finish()` loses nothing at all, since
// `finish()` never calls `set()` -- see its own comment above.
useActiveWorkoutStore.subscribe((state, prevState) => {
  if (state.workout === prevState.workout) return;
  if (state.workout && state.workout.status === 'in_progress') {
    AsyncStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(state.workout)).catch(() => {});
  } else {
    AsyncStorage.removeItem(DRAFT_STORAGE_KEY).catch(() => {});
  }
});

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

// `SET_TYPE_LABEL` used to live here with no consumers at all, while the logger
// and History each wrote their own set-type wording. The one vocabulary is now
// `src/content/setTypes.ts` -- copy does not belong in a store either way.
