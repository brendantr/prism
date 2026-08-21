import { estimateOneRepMax } from './oneRepMax';
import { isVolumeSet } from './volume';
import type { Equipment, Exercise, LoadSuggestion, Unit, Workout, WorkoutSet } from '../types';

/**
 * NEXT-LOAD RECOMMENDATION
 * ========================
 * Looks at the last 2-3 comparable sessions for one exercise and proposes a
 * working weight for today. Rule-based and fully explainable -- every decision
 * appends a sentence to `rationale`, and the UI shows all of them.
 *
 * "Comparable" means: same exercise, completed session, at least one working
 * set. We compare the TOP working set of each session (heaviest e1RM), because
 * that is the set that actually determines whether load should move.
 *
 * The rules, in priority order:
 *
 *   DELOAD    Top-set RPE averaged >= 9.3, or reps fell short of target in 2 of
 *             the last 3 sessions -> drop ~7%.
 *   HOLD      Average RPE 8.5-9.3, or the last session missed target reps ->
 *             repeat the same weight and win it cleanly first.
 *   INCREASE  Average RPE <= 7.5 with reps met -> +5% (compound) / +4% (isolation).
 *             Average RPE 7.5-8.5 with reps met -> +2.5% / +2%.
 *   ESTABLISH No history -> no number invented; the UI asks for a first set.
 *
 * The result is always rounded to a plate/pin increment the user can actually
 * load, in their own unit.
 */

export const RPE_DELOAD_THRESHOLD = 9.3;
export const RPE_HOLD_THRESHOLD = 8.5;
export const RPE_PUSH_THRESHOLD = 7.5;
export const COMPARABLE_SESSION_LIMIT = 3;

const KG_PER_LB = 0.45359237;

/** Smallest jump a lifter can actually make on this equipment, in kg. */
export function loadIncrementKg(equipment: Equipment, unit: Unit): number {
  const lbIncrement = (lb: number) => lb * KG_PER_LB;
  if (unit === 'lb') {
    switch (equipment) {
      case 'barbell':
      case 'smith':
        return lbIncrement(5);
      case 'dumbbell':
        return lbIncrement(5);
      case 'machine':
      case 'cable':
        return lbIncrement(5);
      default:
        return lbIncrement(2.5);
    }
  }
  switch (equipment) {
    case 'barbell':
    case 'smith':
      return 2.5;
    case 'dumbbell':
      return 2;
    case 'machine':
    case 'cable':
      return 2.5;
    default:
      return 1;
  }
}

export function roundToIncrement(weightKg: number, increment: number): number {
  if (increment <= 0) return weightKg;
  return Math.round(weightKg / increment) * increment;
}

export interface ComparableSession {
  workoutId: string;
  date: string;
  topSet: WorkoutSet;
  e1rm: number;
  /** Every working set of that session, for rep-target checks. */
  workingSets: WorkoutSet[];
}

/** Newest-first list of the last N sessions containing this exercise. */
export function comparableSessions(
  workouts: Workout[],
  exerciseId: string,
  limit: number = COMPARABLE_SESSION_LIMIT,
): ComparableSession[] {
  const sessions: ComparableSession[] = [];

  const ordered = [...workouts]
    .filter((w) => w.status === 'completed')
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));

  for (const workout of ordered) {
    if (sessions.length >= limit) break;
    const workingSets: WorkoutSet[] = [];
    for (const we of workout.exercises) {
      if (we.exerciseId !== exerciseId) continue;
      workingSets.push(...we.sets.filter(isVolumeSet));
    }
    if (workingSets.length === 0) continue;

    let topSet = workingSets[0];
    let topE1rm = estimateOneRepMax(topSet.weightKg, topSet.reps);
    for (const s of workingSets.slice(1)) {
      const e = estimateOneRepMax(s.weightKg, s.reps);
      if (e > topE1rm) {
        topE1rm = e;
        topSet = s;
      }
    }

    sessions.push({
      workoutId: workout.id,
      date: workout.startedAt,
      topSet,
      e1rm: topE1rm,
      workingSets,
    });
  }

  return sessions;
}

export interface LoadRecommendationInput {
  exercise: Exercise;
  workouts: Workout[];
  /** Bottom of the prescribed rep range for this slot. */
  targetReps: number;
  unit: Unit;
  /** Set to false for accessory/isolation work to use gentler jumps. */
  isCompound?: boolean;
}

export function recommendNextLoad(input: LoadRecommendationInput): LoadSuggestion {
  const { exercise, workouts, targetReps, unit } = input;
  const isCompound = input.isCompound ?? exercise.primaryMuscles.length > 1;
  const increment = loadIncrementKg(exercise.equipment, unit);
  const sessions = comparableSessions(workouts, exercise.id);
  const rationale: string[] = [];

  if (sessions.length === 0) {
    return {
      exerciseId: exercise.id,
      suggestedWeightKg: 0,
      previousWeightKg: null,
      deltaKg: 0,
      targetReps,
      action: 'establish',
      confidence: 'low',
      rationale: [
        'No history for this lift yet.',
        `Work up to a weight you could stop ${targetReps + 2} reps into, and log it — Repello takes over from there.`,
      ],
    };
  }

  const last = sessions[0];
  const previousWeightKg = last.topSet.weightKg;

  // --- Signals -------------------------------------------------------------
  const ratedSets = sessions.filter((s) => s.topSet.rpe != null);
  const avgRpe =
    ratedSets.length > 0
      ? ratedSets.reduce((sum, s) => sum + (s.topSet.rpe as number), 0) / ratedSets.length
      : null;

  const missedTarget = sessions.filter((s) => s.topSet.reps < targetReps);
  const missedCount = missedTarget.length;
  const lastMissed = last.topSet.reps < targetReps;

  rationale.push(
    `Last time: ${formatKg(previousWeightKg, unit)} × ${last.topSet.reps}${last.topSet.rpe != null ? ` @ RPE ${last.topSet.rpe}` : ''}.`,
  );
  if (sessions.length > 1) {
    rationale.push(
      `Compared against your last ${sessions.length} sessions on this lift${avgRpe != null ? `, averaging RPE ${avgRpe.toFixed(1)} on top sets` : ''}.`,
    );
  }

  // --- Rules, highest priority first ---------------------------------------
  let action: LoadSuggestion['action'];
  let pctChange: number;

  if ((avgRpe != null && avgRpe >= RPE_DELOAD_THRESHOLD) || (missedCount >= 2 && sessions.length >= 2)) {
    action = 'deload';
    pctChange = -0.07;
    rationale.push(
      avgRpe != null && avgRpe >= RPE_DELOAD_THRESHOLD
        ? `Top sets have been sitting at RPE ${avgRpe.toFixed(1)} — that is close to failure every week.`
        : `You fell short of ${targetReps} reps in ${missedCount} of the last ${sessions.length} sessions.`,
    );
    rationale.push('Backing off ~7% to rebuild bar speed before pushing again.');
  } else if ((avgRpe != null && avgRpe >= RPE_HOLD_THRESHOLD) || lastMissed) {
    action = 'hold';
    pctChange = 0;
    rationale.push(
      lastMissed
        ? `You got ${last.topSet.reps} of ${targetReps} target reps last time.`
        : `RPE is averaging ${avgRpe?.toFixed(1)} — near the top of the productive range.`,
    );
    rationale.push('Repeat the same load and own the full rep target first.');
  } else if (avgRpe != null && avgRpe <= RPE_PUSH_THRESHOLD) {
    action = 'increase';
    pctChange = isCompound ? 0.05 : 0.04;
    rationale.push(`RPE ${avgRpe.toFixed(1)} with reps met — there is clear room to add load.`);
  } else {
    action = 'increase';
    pctChange = isCompound ? 0.025 : 0.02;
    rationale.push(
      avgRpe != null
        ? `RPE ${avgRpe.toFixed(1)} with reps met — a small step up keeps the trend moving.`
        : 'Reps met and no RPE logged — taking the conservative step up.',
    );
  }

  // --- Turn the percentage into a loadable number --------------------------
  const raw = previousWeightKg * (1 + pctChange);
  let suggested = roundToIncrement(raw, increment);

  // Rounding must never silently cancel the decision.
  if (action === 'increase' && suggested <= previousWeightKg) {
    suggested = previousWeightKg + increment;
  }
  if (action === 'deload' && suggested >= previousWeightKg) {
    suggested = Math.max(increment, previousWeightKg - increment);
  }
  if (action === 'hold') {
    suggested = previousWeightKg;
  }

  const deltaKg = round2(suggested - previousWeightKg);
  if (deltaKg !== 0) {
    rationale.push(
      `Rounded to the nearest ${formatKg(increment, unit)} you can actually load: ${formatKg(suggested, unit)}.`,
    );
  }

  const confidence: LoadSuggestion['confidence'] =
    sessions.length >= 3 && avgRpe != null ? 'high' : sessions.length >= 2 ? 'medium' : 'low';

  return {
    exerciseId: exercise.id,
    suggestedWeightKg: round2(suggested),
    previousWeightKg: round2(previousWeightKg),
    deltaKg,
    targetReps,
    action,
    confidence,
    rationale,
  };
}

// --- Unit helpers ----------------------------------------------------------

export function kgToDisplay(kg: number, unit: Unit): number {
  return unit === 'lb' ? kg / KG_PER_LB : kg;
}

export function displayToKg(value: number, unit: Unit): number {
  return unit === 'lb' ? value * KG_PER_LB : value;
}

export function formatKg(kg: number, unit: Unit): string {
  const value = kgToDisplay(kg, unit);
  const rounded = Math.abs(value % 1) < 0.05 ? Math.round(value) : Math.round(value * 10) / 10;
  return `${rounded} ${unit}`;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
