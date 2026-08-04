import { isVolumeSet, setsVolume, workoutRepCount, workoutVolume, workoutWorkingSetCount } from './calc/volume';
import type { Exercise, PersonalRecord, SetType, Workout, WorkoutSet } from './types';

/**
 * Workout history: turning stored sessions into something a lifter can scan.
 *
 * Pure derivation, no React and no I/O -- the same rules that govern the rest of
 * `src/domain`. The History screens hold no state of their own beyond which
 * session is open; everything they render comes from here, recomputed from
 * `trainingStore.workouts` on render, so nothing is cached and no set-level row
 * is ever discarded to make a summary cheaper (`Docs/invariants.md` I-3).
 *
 * Two shapes, one for each surface:
 *   - `HistoryEntry`   a row in the list: what happened, in five numbers.
 *   - `SessionDetail`  one session opened up: every exercise, every set as logged.
 *
 * Only `status: 'completed'` sessions are history. An in-progress session -- the
 * one in the logger, or a recovered draft waiting on Resume/Discard -- is not a
 * record of training yet, and every other calculation in the app already agrees
 * (`selectCompletedWorkouts`). Abandoned sessions stay out for the same reason.
 */

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

export interface HistoryEntry {
  workoutId: string;
  title: string;
  startedAt: string;
  endedAt: string | null;
  /** Wall-clock length. Null when the session has no end stamp. */
  durationMinutes: number | null;
  /** Completed working sets only -- warm-ups never count (see `calc/volume`). */
  volumeKg: number;
  workingSets: number;
  totalReps: number;
  exerciseCount: number;
  /** Records banked in this session, joined from `personalRecords`. */
  prCount: number;
  sessionRating: number | null;
}

/**
 * Wall-clock length of a session in minutes, or null when it cannot be known.
 *
 * Null covers both "never ended" and "ended before it started" -- a clock that
 * ran backwards is missing information, not a negative duration, and rendering
 * it as one would invent a fact the data does not support.
 */
export function workoutDurationMinutes(workout: Workout): number | null {
  if (workout.endedAt == null) return null;
  const ms = new Date(workout.endedAt).getTime() - new Date(workout.startedAt).getTime();
  if (!Number.isFinite(ms) || ms < 0) return null;
  return ms / 60_000;
}

/** One session reduced to the numbers the list row shows. */
export function summariseWorkout(workout: Workout, prCount = 0): HistoryEntry {
  return {
    workoutId: workout.id,
    title: workout.title,
    startedAt: workout.startedAt,
    endedAt: workout.endedAt,
    durationMinutes: workoutDurationMinutes(workout),
    volumeKg: workoutVolume(workout),
    workingSets: workoutWorkingSetCount(workout),
    totalReps: workoutRepCount(workout),
    exerciseCount: workout.exercises.length,
    prCount,
    sessionRating: workout.sessionRating,
  };
}

/**
 * Every completed session, most recent first.
 *
 * `personalRecords` is optional so the ordering/summarising rules can be tested
 * on their own; passing it only adds the per-session record count.
 */
export function listWorkoutHistory(
  workouts: Workout[],
  personalRecords: PersonalRecord[] = [],
): HistoryEntry[] {
  const prCounts = new Map<string, number>();
  for (const pr of personalRecords) {
    prCounts.set(pr.workoutId, (prCounts.get(pr.workoutId) ?? 0) + 1);
  }

  return workouts
    .filter((w) => w.status === 'completed')
    .slice()
    // Id breaks ties so two sessions stamped the same instant cannot swap places
    // between renders -- a list that reorders itself under the finger is worse
    // than one with an arbitrary but stable order.
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt) || b.id.localeCompare(a.id))
    .map((w) => summariseWorkout(w, prCounts.get(w.id) ?? 0));
}

export interface HistoryMonth {
  /** `YYYY-MM` in the device's own timezone. */
  key: string;
  entries: HistoryEntry[];
}

/**
 * `YYYY-MM` for the month an ISO timestamp falls in, read in local time.
 *
 * Local rather than UTC on purpose: the row underneath says "Sat, 28 Feb" in
 * local time too, and a session filed under March above a date reading February
 * is the kind of small dishonesty that makes a lifter distrust the whole screen.
 */
export function monthKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Split an already-ordered list into consecutive month runs.
 *
 * Runs, not buckets: the caller's ordering is preserved exactly, and a list that
 * is not sorted by date simply produces more sections rather than being silently
 * reordered into an order it did not ask for.
 */
export function groupHistoryByMonth(entries: HistoryEntry[]): HistoryMonth[] {
  const months: HistoryMonth[] = [];
  for (const entry of entries) {
    const key = monthKey(entry.startedAt);
    const current = months[months.length - 1];
    if (current && current.key === key) current.entries.push(entry);
    else months.push({ key, entries: [entry] });
  }
  return months;
}

/** Totals across a set of history rows, for the list's header card. */
export interface HistoryTotals {
  sessions: number;
  volumeKg: number;
  workingSets: number;
}

export function historyTotals(entries: HistoryEntry[]): HistoryTotals {
  return entries.reduce<HistoryTotals>(
    (total, e) => ({
      sessions: total.sessions + 1,
      volumeKg: total.volumeKg + e.volumeKg,
      workingSets: total.workingSets + e.workingSets,
    }),
    { sessions: 0, volumeKg: 0, workingSets: 0 },
  );
}

// ---------------------------------------------------------------------------
// Detail
// ---------------------------------------------------------------------------

export interface HistorySetLine {
  id: string;
  /** 1-based position as logged, so the review matches what the logger showed. */
  position: number;
  type: SetType;
  weightKg: number;
  reps: number;
  rpe: number | null;
  completed: boolean;
  /**
   * Whether this set fed the session's volume and working-set totals. False for
   * warm-ups and for anything left unticked -- both are still shown, because the
   * point of a review screen is what actually happened, not a tidied version.
   */
  countsTowardVolume: boolean;
}

export interface HistoryExerciseLine {
  id: string;
  exerciseId: string;
  /** Resolved from the exercise library; falls back rather than showing a raw id. */
  name: string;
  notes: string | null;
  sets: HistorySetLine[];
  volumeKg: number;
  workingSets: number;
  /** Heaviest counted set of the exercise, the one-line "what mattered" read. */
  topSet: { weightKg: number; reps: number } | null;
}

export interface SessionDetail {
  entry: HistoryEntry;
  exercises: HistoryExerciseLine[];
  /** Records achieved in this session, newest-first order preserved from input. */
  records: PersonalRecord[];
  reflection: string | null;
  sessionRating: number | null;
}

/** Shown when an exercise id no longer resolves, instead of leaking the id. */
export const UNKNOWN_EXERCISE_NAME = 'Unknown exercise';

function toSetLine(set: WorkoutSet, position: number): HistorySetLine {
  return {
    id: set.id,
    position,
    type: set.type,
    weightKg: set.weightKg,
    reps: set.reps,
    rpe: set.rpe,
    completed: set.completed,
    countsTowardVolume: isVolumeSet(set),
  };
}

/** Heaviest counted set; more reps wins a tie on load. */
function topSetOf(sets: HistorySetLine[]): { weightKg: number; reps: number } | null {
  let best: HistorySetLine | null = null;
  for (const set of sets) {
    if (!set.countsTowardVolume) continue;
    if (!best || set.weightKg > best.weightKg || (set.weightKg === best.weightKg && set.reps > best.reps)) {
      best = set;
    }
  }
  return best ? { weightKg: best.weightKg, reps: best.reps } : null;
}

/**
 * One completed session, opened up.
 *
 * Exercises come back in the order they were logged (`orderIndex`), sets in
 * theirs (`setIndex`), both sorted defensively rather than trusting whatever
 * order the repository happened to return.
 */
export function buildSessionDetail(
  workout: Workout,
  exerciseById: Map<string, Exercise>,
  personalRecords: PersonalRecord[] = [],
): SessionDetail {
  const exercises = [...workout.exercises]
    .sort((a, b) => a.orderIndex - b.orderIndex)
    .map((we) => {
      const sets = [...we.sets]
        .sort((a, b) => a.setIndex - b.setIndex)
        .map((set, i) => toSetLine(set, i + 1));

      return {
        id: we.id,
        exerciseId: we.exerciseId,
        name: exerciseById.get(we.exerciseId)?.name ?? UNKNOWN_EXERCISE_NAME,
        notes: we.notes,
        sets,
        volumeKg: setsVolume(we.sets),
        workingSets: we.sets.filter(isVolumeSet).length,
        topSet: topSetOf(sets),
      };
    });

  const records = personalRecords.filter((pr) => pr.workoutId === workout.id);

  return {
    entry: summariseWorkout(workout, records.length),
    exercises,
    records,
    reflection: workout.reflection,
    sessionRating: workout.sessionRating,
  };
}
