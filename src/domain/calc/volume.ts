import { MUSCLE_CONTRIBUTION } from '../muscles';
import type { Exercise, MuscleGroup, MuscleVolume, Workout, WorkoutSet } from '../types';

/**
 * Training volume = sum(weight * reps) over completed working sets.
 *
 * Warm-ups are excluded on purpose: counting them inflates volume for anyone
 * who ramps properly and punishes lifters who don't, which would make the
 * consistency and workload charts meaningless.
 */

const VOLUME_SET_TYPES = new Set(['working', 'dropset', 'failure', 'backoff']);

export function isVolumeSet(set: Pick<WorkoutSet, 'type' | 'completed'>): boolean {
  return set.completed && VOLUME_SET_TYPES.has(set.type);
}

export function setVolume(set: Pick<WorkoutSet, 'weightKg' | 'reps' | 'type' | 'completed'>): number {
  if (!isVolumeSet(set)) return 0;
  return set.weightKg * set.reps;
}

export function setsVolume(sets: Array<Pick<WorkoutSet, 'weightKg' | 'reps' | 'type' | 'completed'>>): number {
  return sets.reduce((total, s) => total + setVolume(s), 0);
}

export function workoutVolume(workout: Workout): number {
  return workout.exercises.reduce((total, we) => total + setsVolume(we.sets), 0);
}

export function workoutWorkingSetCount(workout: Workout): number {
  return workout.exercises.reduce((n, we) => n + we.sets.filter(isVolumeSet).length, 0);
}

export function workoutRepCount(workout: Workout): number {
  return workout.exercises.reduce(
    (n, we) => n + we.sets.filter(isVolumeSet).reduce((r, s) => r + s.reps, 0),
    0,
  );
}

/**
 * Split a workout's volume across muscle groups. A primary mover is credited
 * with the whole set; a synergist with `MUSCLE_CONTRIBUTION.secondary` of it.
 */
export function muscleDistribution(
  workouts: Workout[],
  exerciseById: Map<string, Exercise>,
): MuscleVolume[] {
  const volumeByMuscle = new Map<MuscleGroup, { volumeKg: number; sets: number }>();

  const credit = (muscle: MuscleGroup, volumeKg: number, share: number) => {
    const entry = volumeByMuscle.get(muscle) ?? { volumeKg: 0, sets: 0 };
    entry.volumeKg += volumeKg * share;
    entry.sets += share;
    volumeByMuscle.set(muscle, entry);
  };

  for (const workout of workouts) {
    for (const we of workout.exercises) {
      const exercise = exerciseById.get(we.exerciseId);
      if (!exercise) continue;
      for (const set of we.sets) {
        if (!isVolumeSet(set)) continue;
        const vol = setVolume(set);
        for (const m of exercise.primaryMuscles) credit(m, vol, MUSCLE_CONTRIBUTION.primary);
        for (const m of exercise.secondaryMuscles) credit(m, vol, MUSCLE_CONTRIBUTION.secondary);
      }
    }
  }

  return [...volumeByMuscle.entries()]
    .map(([muscle, v]) => ({ muscle, volumeKg: v.volumeKg, sets: v.sets }))
    .sort((a, b) => b.volumeKg - a.volumeKg);
}

/** Total volume per ISO date key (YYYY-MM-DD), for the volume chart. */
export function volumeByDay(workouts: Workout[]): Map<string, number> {
  const byDay = new Map<string, number>();
  for (const w of workouts) {
    const key = w.startedAt.slice(0, 10);
    byDay.set(key, (byDay.get(key) ?? 0) + workoutVolume(w));
  }
  return byDay;
}
