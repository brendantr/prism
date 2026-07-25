import { estimateOneRepMax, isE1rmExtrapolated } from './oneRepMax';
import { isVolumeSet } from './volume';
import type { PersonalRecord, PrKind, SetPrResult, Workout, WorkoutSet } from '../types';

/**
 * PR detection.
 *
 * PRism recognises two headline records per exercise:
 *   1. `e1rm`   -- best estimated one-rep max (strength across any rep range)
 *   2. `weight` -- heaviest weight actually completed for at least one rep
 *
 * Both are tracked because they answer different questions. A lifter can hit a
 * top-end weight PR on a grindy single while their e1RM stays flat, and can
 * push e1RM up on a clean set of 8 without ever touching a heavy single.
 */

const PR_EPSILON = 0.01;

export interface ExerciseBests {
  bestE1rm: number;
  bestWeightKg: number;
}

/** Roll a set of historical records into a per-exercise best lookup. */
export function bestsFromRecords(records: PersonalRecord[]): Map<string, ExerciseBests> {
  const map = new Map<string, ExerciseBests>();
  for (const r of records) {
    const entry = map.get(r.exerciseId) ?? { bestE1rm: 0, bestWeightKg: 0 };
    if (r.kind === 'e1rm') entry.bestE1rm = Math.max(entry.bestE1rm, r.value);
    if (r.kind === 'weight') entry.bestWeightKg = Math.max(entry.bestWeightKg, r.value);
    map.set(r.exerciseId, entry);
  }
  return map;
}

/** Recompute bests directly from workout history (used for seeding + backfill). */
export function bestsFromHistory(workouts: Workout[]): Map<string, ExerciseBests> {
  const map = new Map<string, ExerciseBests>();
  for (const w of workouts) {
    for (const we of w.exercises) {
      const entry = map.get(we.exerciseId) ?? { bestE1rm: 0, bestWeightKg: 0 };
      for (const s of we.sets) {
        if (!isVolumeSet(s)) continue;
        entry.bestE1rm = Math.max(entry.bestE1rm, estimateOneRepMax(s.weightKg, s.reps));
        entry.bestWeightKg = Math.max(entry.bestWeightKg, s.weightKg);
      }
      map.set(we.exerciseId, entry);
    }
  }
  return map;
}

/**
 * Evaluate a single set against the lifter's prior bests.
 * Pure -- callers decide whether to persist the result.
 */
export function evaluateSetForPr(
  set: Pick<WorkoutSet, 'weightKg' | 'reps' | 'type' | 'completed'>,
  prior: ExerciseBests | undefined,
): SetPrResult {
  const e1rm = isVolumeSet(set) ? estimateOneRepMax(set.weightKg, set.reps) : 0;
  const priorE1rm = prior?.bestE1rm ?? 0;
  const priorWeight = prior?.bestWeightKg ?? 0;

  // A set beyond Epley's reliable range can still set a weight PR, but we do
  // not let it claim a strength PR on an extrapolated number.
  const e1rmEligible = isVolumeSet(set) && !isE1rmExtrapolated(set.reps);

  return {
    isE1rmPr: e1rmEligible && e1rm > priorE1rm + PR_EPSILON,
    isWeightPr: isVolumeSet(set) && set.weightKg > priorWeight + PR_EPSILON,
    e1rm,
    previousBestE1rm: priorE1rm > 0 ? priorE1rm : null,
    previousBestWeightKg: priorWeight > 0 ? priorWeight : null,
  };
}

export interface DetectedPr {
  exerciseId: string;
  kind: PrKind;
  value: number;
  reps: number;
  weightKg: number;
}

/**
 * Scan a finished workout for records, walking sets in order so that the
 * running best updates within the session (two PRs on the same lift in one
 * workout only report the final, highest one).
 */
export function detectWorkoutPrs(workout: Workout, priorBests: Map<string, ExerciseBests>): DetectedPr[] {
  const running = new Map<string, ExerciseBests>(
    [...priorBests.entries()].map(([k, v]) => [k, { ...v }]),
  );
  const found = new Map<string, DetectedPr>();

  for (const we of workout.exercises) {
    for (const set of we.sets) {
      if (!isVolumeSet(set)) continue;
      const prior = running.get(we.exerciseId) ?? { bestE1rm: 0, bestWeightKg: 0 };
      const result = evaluateSetForPr(set, prior);

      if (result.isE1rmPr) {
        prior.bestE1rm = result.e1rm;
        found.set(`${we.exerciseId}:e1rm`, {
          exerciseId: we.exerciseId,
          kind: 'e1rm',
          value: round2(result.e1rm),
          reps: set.reps,
          weightKg: set.weightKg,
        });
      }
      if (result.isWeightPr) {
        prior.bestWeightKg = set.weightKg;
        found.set(`${we.exerciseId}:weight`, {
          exerciseId: we.exerciseId,
          kind: 'weight',
          value: set.weightKg,
          reps: set.reps,
          weightKg: set.weightKg,
        });
      }
      running.set(we.exerciseId, prior);
    }
  }

  return [...found.values()];
}

/** e1RM time series for one exercise, one point per session (best set). */
export function e1rmSeries(
  workouts: Workout[],
  exerciseId: string,
): Array<{ date: string; e1rm: number; weightKg: number; reps: number }> {
  const points: Array<{ date: string; e1rm: number; weightKg: number; reps: number }> = [];
  for (const w of workouts) {
    let best = { e1rm: 0, weightKg: 0, reps: 0 };
    for (const we of w.exercises) {
      if (we.exerciseId !== exerciseId) continue;
      for (const s of we.sets) {
        if (!isVolumeSet(s)) continue;
        const e = estimateOneRepMax(s.weightKg, s.reps);
        if (e > best.e1rm) best = { e1rm: e, weightKg: s.weightKg, reps: s.reps };
      }
    }
    if (best.e1rm > 0) {
      points.push({
        date: w.startedAt.slice(0, 10),
        e1rm: round2(best.e1rm),
        weightKg: best.weightKg,
        reps: best.reps,
      });
    }
  }
  return points.sort((a, b) => a.date.localeCompare(b.date));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
