import {
  MUSCLE_GROUPS,
  type Equipment,
  type Exercise,
  type MuscleGroup,
  type Workout,
} from './types';

/**
 * CUSTOM MOVEMENTS
 * ================
 * The rules behind "add a movement PRism does not know", kept out of the
 * screens that render them.
 *
 * Same reasoning as `account.ts` and `routing.ts`: this repository has no
 * component-test tooling by decision (`Docs/sprints/2026-08-01-onboarding-ui-redesign.md`
 * Decision 6), so a rule that lives inside a screen is a rule with no coverage.
 * Everything here is pure -- no store, no I/O, no navigation.
 *
 * WHAT THE DATABASE ALREADY ENFORCES, AND WHAT IT DOES NOT
 * -------------------------------------------------------
 * `exercises` (`supabase/migrations/0001_init.sql`) requires at least one
 * primary muscle (`check (array_length(primary_muscles, 1) >= 1)`) and a valid
 * `equipment_type`. Those are re-checked here so a lifter gets a sentence
 * rather than a rejected round trip.
 *
 * It does **not** constrain the name. `exercises_system_name_key` is a partial
 * unique index `where profile_id is null`, so it governs the PRism library and
 * deliberately leaves user names alone. A lifter is allowed to make their own
 * "Bench Press" -- their version of it -- and this module does not stop them.
 * The only bound applied is a length cap, which is a client-side courtesy
 * rather than a schema rule.
 */

/**
 * Client-side length cap on a custom movement's name.
 *
 * `exercises.name` is unbounded `text`, unlike `profiles.display_name`, which
 * `0002_security_hardening.sql` capped at 60 after finding it attacker-
 * controlled. This is the same number applied for the same reason one layer up:
 * a name that does not fit any row in the app is not a name anyone wanted.
 */
export const CUSTOM_EXERCISE_NAME_MAX = 60;

/** The same cap on the optional cue, which renders as one paragraph. */
export const CUSTOM_EXERCISE_CUE_MAX = 200;

/** Exactly what a form holds: strings and selections, nothing normalised yet. */
export interface CustomExerciseDraft {
  name: string;
  equipment: Equipment;
  primaryMuscles: MuscleGroup[];
  secondaryMuscles: MuscleGroup[];
  isUnilateral: boolean;
  cue: string;
}

/**
 * A validated movement, ready for a repository.
 *
 * No `id` and no `isSystem`. The id belongs to whoever writes the row, and
 * `isSystem` is derived from `profile_id` at the mapper -- a caller must not be
 * able to claim a movement is part of the PRism library.
 */
export interface CustomExerciseInput {
  name: string;
  equipment: Equipment;
  primaryMuscles: MuscleGroup[];
  secondaryMuscles: MuscleGroup[];
  isUnilateral: boolean;
  cue: string | null;
}

export type CustomExerciseProblem =
  | 'name_missing'
  | 'name_too_long'
  | 'cue_too_long'
  | 'primary_muscle_missing'
  | 'muscle_in_both';

export type CustomExerciseValidation =
  | { ok: true; value: CustomExerciseInput }
  | { ok: false; problem: CustomExerciseProblem };

export function emptyExerciseDraft(): CustomExerciseDraft {
  return {
    name: '',
    // Barbell is the most common starting point and is a real answer rather
    // than a blank one -- equipment is required by the schema, so an empty
    // state here would only ever be a validation error waiting to happen.
    equipment: 'barbell',
    primaryMuscles: [],
    secondaryMuscles: [],
    isUnilateral: false,
    cue: '',
  };
}

/** Load an existing movement back into a form for editing. */
export function draftFromExercise(exercise: Exercise): CustomExerciseDraft {
  return {
    name: exercise.name,
    equipment: exercise.equipment,
    primaryMuscles: [...exercise.primaryMuscles],
    secondaryMuscles: [...exercise.secondaryMuscles],
    isUnilateral: exercise.isUnilateral,
    cue: exercise.cue ?? '',
  };
}

/**
 * Validate and normalise, in one pass.
 *
 * Muscle lists come back deduplicated and in `MUSCLE_GROUPS` order rather than
 * tap order, so two lifters who selected the same muscles produce the same row
 * and the exported document is stable.
 */
export function validateCustomExercise(draft: CustomExerciseDraft): CustomExerciseValidation {
  const name = draft.name.trim().replace(/\s+/g, ' ');
  if (name.length === 0) return { ok: false, problem: 'name_missing' };
  if (name.length > CUSTOM_EXERCISE_NAME_MAX) return { ok: false, problem: 'name_too_long' };

  const cue = draft.cue.trim();
  if (cue.length > CUSTOM_EXERCISE_CUE_MAX) return { ok: false, problem: 'cue_too_long' };

  const primaryMuscles = canonicalMuscles(draft.primaryMuscles);
  if (primaryMuscles.length === 0) return { ok: false, problem: 'primary_muscle_missing' };

  const secondaryMuscles = canonicalMuscles(draft.secondaryMuscles);
  // A muscle cannot be both the point of the movement and an assister. The
  // volume attribution counts primaries at 100% and secondaries at 40%
  // (`src/domain/calc`), so a muscle in both lists would be counted twice.
  if (secondaryMuscles.some((m) => primaryMuscles.includes(m))) {
    return { ok: false, problem: 'muscle_in_both' };
  }

  return {
    ok: true,
    value: {
      name,
      equipment: draft.equipment,
      primaryMuscles,
      secondaryMuscles,
      isUnilateral: draft.isUnilateral,
      cue: cue.length > 0 ? cue : null,
    },
  };
}

/** Deduplicate and put muscles in the canonical anatomical order. */
function canonicalMuscles(muscles: MuscleGroup[]): MuscleGroup[] {
  const chosen = new Set(muscles);
  return MUSCLE_GROUPS.filter((m) => chosen.has(m));
}

/**
 * Whether this movement may be edited or deleted at all.
 *
 * The PRism library is world-readable and writable by no one -- there is no
 * RLS policy that would let a lifter update a `profile_id is null` row, so
 * offering the control would be offering a button that cannot work.
 */
export function canEditExercise(exercise: Exercise): boolean {
  return !exercise.isSystem;
}

/**
 * How much logged training a movement is carrying.
 *
 * Deleting an in-use movement is refused by Postgres
 * (`workout_exercises_exercise_id_fkey`, made deferrable rather than cascading
 * by `0007_deletable_account_with_custom_exercises.sql` precisely so the sets
 * performed with it are not silently destroyed). This is what lets the app say
 * *why* before the round trip, and name real numbers when it does.
 */
export function exerciseUsage(
  exerciseId: string,
  workouts: Workout[],
): { workouts: number; sets: number } {
  let workoutCount = 0;
  let setCount = 0;

  for (const workout of workouts) {
    const blocks = workout.exercises.filter((we) => we.exerciseId === exerciseId);
    if (blocks.length === 0) continue;
    workoutCount += 1;
    for (const block of blocks) setCount += block.sets.length;
  }

  return { workouts: workoutCount, sets: setCount };
}

/** The lifter's own movements, newest-looking first is not knowable -- so by name. */
export function customExercises(exercises: Exercise[]): Exercise[] {
  return exercises.filter((e) => !e.isSystem).sort((a, b) => a.name.localeCompare(b.name));
}
