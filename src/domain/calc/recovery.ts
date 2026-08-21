import { MUSCLE_CONTRIBUTION, MUSCLE_META } from '../muscles';
import { isVolumeSet } from './volume';
import { MUSCLE_GROUPS, type Exercise, type MuscleGroup, type MuscleRecovery, type Workout } from '../types';

/**
 * MUSCLE RECOVERY ESTIMATE
 * ========================
 * This is a transparent heuristic, not a physiological measurement. PRism never
 * presents it as fact -- every surface that renders it is required to carry the
 * word "estimate" and link to `RECOVERY_MODEL_EXPLANATION` below.
 *
 * The model, end to end:
 *
 *   1. Each muscle has a baseline recovery window (`MUSCLE_META.baseRecoveryHours`),
 *      longer for large muscles that take more eccentric damage.
 *
 *   2. A session's stimulus for a muscle = its effective hard sets in that
 *      session (primary sets count 1.0, synergist sets count 0.4).
 *
 *   3. The window stretches or shrinks with how hard the muscle was hit,
 *      relative to a reference of 6 effective sets:
 *          window = base * clamp(sets / 6, 0.55, 1.6)
 *      A 3-set touch recovers faster than a 12-set annihilation.
 *
 *   4. Readiness = clamp(hoursSince / window, 0, 1), eased so the last stretch
 *      of the window returns less than the first. A muscle never trained shows
 *      as fully fresh.
 *
 * What this model deliberately does NOT know: sleep, nutrition, stress, age,
 * training age, or how the set actually felt. Those live in the check-in and
 * are handled separately by the readiness score.
 */

export const RECOVERY_REFERENCE_SETS = 6;
export const RECOVERY_MODEL_EXPLANATION =
  'Repello estimates recovery from how recently you trained a muscle and how many effective sets it absorbed. ' +
  'Bigger muscles and harder sessions get a longer window. This is a training heuristic, not a medical or ' +
  'physiological measurement -- treat it as a prompt to check in with your own body, not a verdict.';

export interface MuscleStimulus {
  muscle: MuscleGroup;
  lastTrainedAt: string;
  effectiveSets: number;
}

/** Most recent session that touched each muscle, with the load it absorbed. */
export function lastStimulusPerMuscle(
  workouts: Workout[],
  exerciseById: Map<string, Exercise>,
): Map<MuscleGroup, MuscleStimulus> {
  const latest = new Map<MuscleGroup, MuscleStimulus>();

  // Newest first so the first hit per muscle wins.
  const ordered = [...workouts].sort((a, b) => b.startedAt.localeCompare(a.startedAt));

  for (const workout of ordered) {
    const setsThisSession = new Map<MuscleGroup, number>();

    for (const we of workout.exercises) {
      const exercise = exerciseById.get(we.exerciseId);
      if (!exercise) continue;
      const hardSets = we.sets.filter(isVolumeSet).length;
      if (hardSets === 0) continue;

      for (const m of exercise.primaryMuscles) {
        setsThisSession.set(m, (setsThisSession.get(m) ?? 0) + hardSets * MUSCLE_CONTRIBUTION.primary);
      }
      for (const m of exercise.secondaryMuscles) {
        setsThisSession.set(m, (setsThisSession.get(m) ?? 0) + hardSets * MUSCLE_CONTRIBUTION.secondary);
      }
    }

    for (const [muscle, effectiveSets] of setsThisSession) {
      if (latest.has(muscle)) continue;
      latest.set(muscle, { muscle, lastTrainedAt: workout.startedAt, effectiveSets });
    }
  }

  return latest;
}

/** How long this model thinks a muscle needs after absorbing `effectiveSets`. */
export function estimatedRecoveryWindowHours(muscle: MuscleGroup, effectiveSets: number): number {
  const base = MUSCLE_META[muscle].baseRecoveryHours;
  const loadFactor = clamp(effectiveSets / RECOVERY_REFERENCE_SETS, 0.55, 1.6);
  return Math.round(base * loadFactor);
}

export function recoveryStatus(readiness: number): MuscleRecovery['status'] {
  if (readiness >= 0.98) return 'fresh';
  if (readiness >= 0.8) return 'ready';
  if (readiness >= 0.55) return 'moderate';
  if (readiness >= 0.3) return 'fatigued';
  return 'depleted';
}

export function estimateRecovery(
  workouts: Workout[],
  exerciseById: Map<string, Exercise>,
  now: Date = new Date(),
): MuscleRecovery[] {
  const stimuli = lastStimulusPerMuscle(workouts, exerciseById);

  return MUSCLE_GROUPS.map((muscle) => {
    const stimulus = stimuli.get(muscle);

    if (!stimulus) {
      return {
        muscle,
        readiness: 1,
        hoursSinceLastStimulus: null,
        estimatedRecoveryHours: MUSCLE_META[muscle].baseRecoveryHours,
        status: 'fresh' as const,
      };
    }

    const hoursSince = Math.max(
      0,
      (now.getTime() - new Date(stimulus.lastTrainedAt).getTime()) / 3_600_000,
    );
    const window = estimatedRecoveryWindowHours(muscle, stimulus.effectiveSets);
    const linear = clamp(hoursSince / window, 0, 1);
    // Ease-out: the first hours after a session buy back more than the last.
    const readiness = 1 - Math.pow(1 - linear, 1.7);

    return {
      muscle,
      readiness: round3(readiness),
      hoursSinceLastStimulus: Math.round(hoursSince),
      estimatedRecoveryHours: window,
      status: recoveryStatus(readiness),
    };
  });
}

/**
 * Whether any muscle in an estimate has a real session behind it.
 *
 * `estimateRecovery` answers for all sixteen `MUSCLE_GROUPS` unconditionally,
 * and a muscle it has never seen trained comes back `readiness: 1`,
 * `status: 'fresh'`, `hoursSinceLastStimulus: null`. That is the right answer
 * for one muscle among fifteen others with history; for an account with no
 * history at all it produces sixteen rows reading 100%, which is a full screen
 * of confident output derived entirely from the absence of input -- exactly what
 * I-18 forbids. `computeReadiness` already models the correct posture by
 * returning `score: null, confidence: 'insufficient'` instead of a stand-in.
 *
 * Kept as a separate predicate rather than folded into `estimateRecovery`'s
 * return type: the per-muscle default is load-bearing for callers like
 * `averageReadiness`, which needs a number for every muscle in a session. This
 * only tells a renderer whether the estimate is worth showing at all.
 */
export function hasRecoveryEvidence(recovery: MuscleRecovery[]): boolean {
  return recovery.some((r) => r.hoursSinceLastStimulus != null);
}

/** Mean readiness across a specific set of muscles (e.g. today's session). */
export function averageReadiness(recovery: MuscleRecovery[], muscles: MuscleGroup[]): number {
  if (muscles.length === 0) return 1;
  const wanted = new Set(muscles);
  const relevant = recovery.filter((r) => wanted.has(r.muscle));
  if (relevant.length === 0) return 1;
  return relevant.reduce((sum, r) => sum + r.readiness, 0) / relevant.length;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
