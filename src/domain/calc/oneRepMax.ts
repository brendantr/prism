import type { WorkoutSet } from '../types';

/**
 * Estimated one-rep max, Epley formula.
 *
 *   e1RM = weight * (1 + reps / 30)
 *
 * **A single is its own max.** `estimateOneRepMax(w, 1)` returns exactly `w`,
 * not `w * (1 + 1/30)`.
 *
 * Epley is a curve fitted to multi-rep sets, and taken literally it does not
 * pass through the point it should: at one rep it returns 103.3% of a weight
 * the lifter demonstrably just lifted for one. That is not an estimate, it is
 * an extrapolation past the evidence — and the evidence is the strongest kind
 * this app has, a completed single.
 *
 * The consequence was concrete and user-visible. A 100 kg single would record
 * an estimated-1RM of 103.33, so the lifter's e1RM PR sat *above* a real lift
 * they had actually completed, and a later genuine 103 kg single would fail to
 * register as a PR at all. `bestsFromHistory` and the progress chart both read
 * from here, so the inflated number propagated everywhere.
 *
 * This behaviour was documented in this comment from the start and never
 * implemented; the test asserting the wrong value was even *named* for the
 * documented behaviour ("returns the weight itself for a single"). Corrected
 * 2026-08-06 on the engineer/owner's decision — see the sprint record.
 *
 * Epley loses accuracy above roughly 12 reps, so we cap the rep count used in
 * the estimate and flag it. This keeps a 20-rep back-off set from inventing a
 * fake PR.
 */

export const E1RM_REP_CAP = 12;

export function estimateOneRepMax(weightKg: number, reps: number): number {
  if (weightKg <= 0 || reps <= 0) return 0;
  // A completed single is the max, not an input to a curve. Returning early
  // rather than special-casing inside the formula keeps that a stated rule
  // rather than an arithmetic coincidence.
  if (reps === 1) return weightKg;
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
 *
 * Mirrors the single-rep rule above, and has to. If a single is its own max,
 * then the weight that hits a one-rep target at a given e1RM *is* that e1RM.
 * Leaving this side on the raw formula would have suggested 96.8% of the
 * lifter's e1RM for a target of one rep, and broken the round trip —
 * `weightForReps(estimateOneRepMax(w, 1), 1)` must come back to `w`.
 */
export function weightForReps(e1rm: number, targetReps: number): number {
  if (e1rm <= 0 || targetReps <= 0) return 0;
  if (targetReps === 1) return e1rm;
  const cappedReps = Math.min(targetReps, E1RM_REP_CAP);
  return e1rm / (1 + cappedReps / 30);
}
