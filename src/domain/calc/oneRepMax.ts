import type { WorkoutSet } from '../types';

/**
 * Estimated one-rep max, Epley formula.
 *
 *   e1RM = weight * (1 + reps / 30)
 *
 * At reps = 1 this returns the weight itself, which is the behaviour we want:
 * a single is its own max, not an extrapolation.
 *
 * Epley loses accuracy above roughly 12 reps, so we cap the rep count used in
 * the estimate and flag it. This keeps a 20-rep back-off set from inventing a
 * fake PR.
 */

export const E1RM_REP_CAP = 12;

export function estimateOneRepMax(weightKg: number, reps: number): number {
  if (weightKg <= 0 || reps <= 0) return 0;
  const cappedReps = Math.min(reps, E1RM_REP_CAP);
  return weightKg * (1 + cappedReps / 30);
}

/** True when the rep count exceeded the range Epley models well. */
export function isE1rmExtrapolated(reps: number): boolean {
  return reps > E1RM_REP_CAP;
}

export function setE1rm(set: Pick<WorkoutSet, 'weightKg' | 'reps' | 'completed'>): number {
  if (!set.completed) return 0;
  return estimateOneRepMax(set.weightKg, set.reps);
}

/** Highest e1RM across a group of sets. Returns 0 when nothing qualifies. */
export function bestE1rm(sets: Array<Pick<WorkoutSet, 'weightKg' | 'reps' | 'completed'>>): number {
  return sets.reduce((best, s) => Math.max(best, setE1rm(s)), 0);
}

/**
 * Inverse Epley: what weight should hit a target rep count at a given e1RM.
 * Used by the next-load recommendation to move between rep targets.
 */
export function weightForReps(e1rm: number, targetReps: number): number {
  if (e1rm <= 0 || targetReps <= 0) return 0;
  const cappedReps = Math.min(targetReps, E1RM_REP_CAP);
  return e1rm / (1 + cappedReps / 30);
}
