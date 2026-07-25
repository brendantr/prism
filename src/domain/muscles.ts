import type { MuscleGroup } from './types';

/**
 * Muscle metadata: display names, coarse regions, and the recovery baseline
 * used by the recovery estimate.
 *
 * `baseRecoveryHours` is a starting point derived from commonly cited training
 * guidance -- larger muscles with more eccentric damage take longer. It is a
 * heuristic, not a physiological measurement, and the UI says so.
 */

export type MuscleRegion = 'push' | 'pull' | 'legs' | 'core';

interface MuscleMeta {
  label: string;
  short: string;
  region: MuscleRegion;
  baseRecoveryHours: number;
  /** Weekly effective-set target midpoint for an intermediate lifter. */
  weeklySetTarget: number;
}

export const MUSCLE_META: Record<MuscleGroup, MuscleMeta> = {
  chest: { label: 'Chest', short: 'Chest', region: 'push', baseRecoveryHours: 60, weeklySetTarget: 14 },
  front_delts: { label: 'Front Delts', short: 'F.Delt', region: 'push', baseRecoveryHours: 48, weeklySetTarget: 8 },
  side_delts: { label: 'Side Delts', short: 'S.Delt', region: 'push', baseRecoveryHours: 40, weeklySetTarget: 12 },
  rear_delts: { label: 'Rear Delts', short: 'R.Delt', region: 'pull', baseRecoveryHours: 40, weeklySetTarget: 10 },
  lats: { label: 'Lats', short: 'Lats', region: 'pull', baseRecoveryHours: 60, weeklySetTarget: 14 },
  upper_back: { label: 'Upper Back', short: 'U.Back', region: 'pull', baseRecoveryHours: 52, weeklySetTarget: 12 },
  traps: { label: 'Traps', short: 'Traps', region: 'pull', baseRecoveryHours: 44, weeklySetTarget: 8 },
  lower_back: { label: 'Lower Back', short: 'L.Back', region: 'pull', baseRecoveryHours: 72, weeklySetTarget: 6 },
  biceps: { label: 'Biceps', short: 'Bis', region: 'pull', baseRecoveryHours: 44, weeklySetTarget: 12 },
  triceps: { label: 'Triceps', short: 'Tris', region: 'push', baseRecoveryHours: 44, weeklySetTarget: 12 },
  forearms: { label: 'Forearms', short: 'F.Arm', region: 'pull', baseRecoveryHours: 36, weeklySetTarget: 6 },
  core: { label: 'Core', short: 'Core', region: 'core', baseRecoveryHours: 36, weeklySetTarget: 8 },
  glutes: { label: 'Glutes', short: 'Glutes', region: 'legs', baseRecoveryHours: 64, weeklySetTarget: 12 },
  quads: { label: 'Quads', short: 'Quads', region: 'legs', baseRecoveryHours: 72, weeklySetTarget: 14 },
  hamstrings: { label: 'Hamstrings', short: 'Hams', region: 'legs', baseRecoveryHours: 72, weeklySetTarget: 12 },
  calves: { label: 'Calves', short: 'Calves', region: 'legs', baseRecoveryHours: 40, weeklySetTarget: 10 },
};

/**
 * How much of a set's stimulus is attributed to a muscle.
 * A primary mover absorbs the full set; a synergist absorbs a fraction.
 */
export const MUSCLE_CONTRIBUTION = {
  primary: 1,
  secondary: 0.4,
} as const;

export const REGION_LABEL: Record<MuscleRegion, string> = {
  push: 'Push',
  pull: 'Pull',
  legs: 'Legs',
  core: 'Core',
};

export function muscleLabel(muscle: MuscleGroup): string {
  return MUSCLE_META[muscle].label;
}

export function musclesByRegion(region: MuscleRegion): MuscleGroup[] {
  return (Object.keys(MUSCLE_META) as MuscleGroup[]).filter((m) => MUSCLE_META[m].region === region);
}
