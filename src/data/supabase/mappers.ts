import type {
  BodyMeasurement,
  CheckIn,
  Exercise,
  PersonalRecord,
  Profile,
  Workout,
  WorkoutExercise,
  WorkoutSet,
} from '@/domain/types';

/**
 * snake_case (Postgres) <-> camelCase (TypeScript).
 *
 * Kept in one file so the shape of the database is only ever known here. Every
 * other module works with domain types.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

export function toProfile(row: any): Profile {
  return {
    id: row.id,
    displayName: row.display_name,
    goal: row.goal,
    experience: row.experience,
    trainingDaysPerWeek: row.training_days_per_week,
    preferredWeekdays: row.preferred_weekdays ?? [],
    availableEquipment: row.available_equipment ?? [],
    unit: row.unit,
    bodyweightKg: row.bodyweight_kg == null ? null : Number(row.bodyweight_kg),
    createdAt: row.created_at,
  };
}

export function fromProfile(profile: Partial<Profile>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (profile.displayName !== undefined) out.display_name = profile.displayName;
  if (profile.goal !== undefined) out.goal = profile.goal;
  if (profile.experience !== undefined) out.experience = profile.experience;
  if (profile.trainingDaysPerWeek !== undefined) out.training_days_per_week = profile.trainingDaysPerWeek;
  if (profile.preferredWeekdays !== undefined) out.preferred_weekdays = profile.preferredWeekdays;
  if (profile.availableEquipment !== undefined) out.available_equipment = profile.availableEquipment;
  if (profile.unit !== undefined) out.unit = profile.unit;
  if (profile.bodyweightKg !== undefined) out.bodyweight_kg = profile.bodyweightKg;
  return out;
}

export function toExercise(row: any): Exercise {
  return {
    id: row.id,
    name: row.name,
    equipment: row.equipment,
    primaryMuscles: row.primary_muscles ?? [],
    secondaryMuscles: row.secondary_muscles ?? [],
    isUnilateral: row.is_unilateral ?? false,
    isSystem: row.profile_id == null,
    cue: row.cue ?? undefined,
  };
}

export function toSet(row: any): WorkoutSet {
  return {
    id: row.id,
    workoutExerciseId: row.workout_exercise_id,
    setIndex: row.set_index,
    type: row.type,
    weightKg: Number(row.weight_kg),
    reps: row.reps,
    rpe: row.rpe == null ? null : Number(row.rpe),
    completed: row.completed,
    restSeconds: row.rest_seconds ?? null,
    notes: row.notes ?? null,
  };
}

export function fromSet(set: WorkoutSet): Record<string, unknown> {
  return {
    id: set.id,
    workout_exercise_id: set.workoutExerciseId,
    set_index: set.setIndex,
    type: set.type,
    weight_kg: set.weightKg,
    reps: set.reps,
    rpe: set.rpe,
    completed: set.completed,
    rest_seconds: set.restSeconds,
    notes: set.notes,
  };
}

export function toWorkoutExercise(row: any): WorkoutExercise {
  return {
    id: row.id,
    workoutId: row.workout_id,
    exerciseId: row.exercise_id,
    orderIndex: row.order_index,
    notes: row.notes ?? null,
    sets: (row.sets ?? []).map(toSet).sort((a: WorkoutSet, b: WorkoutSet) => a.setIndex - b.setIndex),
  };
}

export function fromWorkoutExercise(we: WorkoutExercise): Record<string, unknown> {
  return {
    id: we.id,
    workout_id: we.workoutId,
    exercise_id: we.exerciseId,
    order_index: we.orderIndex,
    notes: we.notes,
  };
}

export function toWorkout(row: any): Workout {
  return {
    id: row.id,
    profileId: row.profile_id,
    routineDayId: row.routine_day_id ?? null,
    title: row.title,
    status: row.status,
    startedAt: row.started_at,
    endedAt: row.ended_at ?? null,
    reflection: row.reflection ?? null,
    sessionRating: row.session_rating ?? null,
    exercises: (row.workout_exercises ?? [])
      .map(toWorkoutExercise)
      .sort((a: WorkoutExercise, b: WorkoutExercise) => a.orderIndex - b.orderIndex),
  };
}

/**
 * Note the absent `profile_id`. Ownership is not the mapper's to decide -- the
 * repository sets it from the signed-in session, so a `Workout` object carrying
 * someone else's `profileId` cannot smuggle it into a write.
 */
export function fromWorkout(w: Workout): Record<string, unknown> {
  return {
    id: w.id,
    routine_day_id: w.routineDayId,
    title: w.title,
    status: w.status,
    started_at: w.startedAt,
    ended_at: w.endedAt,
    reflection: w.reflection,
    session_rating: w.sessionRating,
  };
}

export function toCheckIn(row: any): CheckIn {
  return {
    id: row.id,
    profileId: row.profile_id,
    checkedInAt: row.checked_in_at,
    sleepQuality: row.sleep_quality ?? null,
    energy: row.energy ?? null,
    soreness: row.soreness ?? null,
    stress: row.stress ?? null,
  };
}

export function toMeasurement(row: any): BodyMeasurement {
  return {
    id: row.id,
    profileId: row.profile_id,
    measuredAt: row.measured_at,
    bodyweightKg: row.bodyweight_kg == null ? null : Number(row.bodyweight_kg),
    bodyFatPct: row.body_fat_pct == null ? null : Number(row.body_fat_pct),
    circumferencesCm: row.circumferences_cm ?? {},
  };
}

export function toPersonalRecord(row: any): PersonalRecord {
  return {
    id: row.id,
    profileId: row.profile_id,
    exerciseId: row.exercise_id,
    kind: row.kind,
    value: Number(row.value),
    reps: row.reps ?? null,
    weightKg: row.weight_kg == null ? null : Number(row.weight_kg),
    achievedAt: row.achieved_at,
    workoutId: row.workout_id,
  };
}
