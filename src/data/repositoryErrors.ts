/**
 * REPOSITORY ERRORS THE UI IS EXPECTED TO HANDLE
 * ==============================================
 * Named types for the two write failures a lifter can actually cause, so a
 * screen can tell them apart from "something went wrong" without reading a
 * message string.
 *
 * The rule these exist to serve is the one `app/account.tsx` already follows:
 * **a raw database error names schema internals and goes to the log, never to
 * the screen.** `update or delete on table "exercises" violates foreign key
 * constraint "workout_exercises_exercise_id_fkey"` is a true sentence and a
 * useless one — it names two tables and a constraint, and says nothing about
 * the twelve sessions it is protecting.
 *
 * Both implementations raise the same types for the same conditions, because
 * demo mode is the rehearsal for the real path and a failure that only exists
 * against Postgres is a failure nobody tests.
 */

/**
 * A movement cannot be deleted because logged sets still reference it.
 *
 * Postgres refuses this by design.
 * `0007_deletable_account_with_custom_exercises.sql` deliberately chose
 * `on delete no action deferrable initially deferred` over `cascade`, and its
 * own comment says why: cascading "would silently delete the logged sets
 * performed with it". The refusal is the feature. This type carries it up to a
 * screen that can say so in a sentence.
 */
export class ExerciseInUseError extends Error {
  readonly exerciseId: string;

  constructor(exerciseId: string, cause?: unknown) {
    super('This movement is used by logged sessions and cannot be deleted.');
    this.name = 'ExerciseInUseError';
    this.exerciseId = exerciseId;
    if (cause !== undefined) this.cause = cause;
  }
}

export function isExerciseInUseError(e: unknown): e is ExerciseInUseError {
  return e instanceof ExerciseInUseError;
}

/**
 * A routine cannot be marked active because it is not the lifter's to mark.
 *
 * `routines.is_active` is a column on the routine row, and every plan PRism
 * ships is a template with `profile_id = null` — **one shared row, read by every
 * account**. A flag on it would mean "active for everyone", which is why
 * `routines: write own` refuses the update. See `planSelectionWrite` in
 * `src/domain/settings.ts` for what the app does instead, and
 * `Docs/sprints/2026-08-09-v1-user-data-writes.md` §5 for the recorded
 * template-selection decision.
 */
export class RoutineNotSelectableError extends Error {
  readonly routineId: string;

  constructor(routineId: string) {
    super('A shared Repello plan cannot be marked active for one account.');
    this.name = 'RoutineNotSelectableError';
    this.routineId = routineId;
  }
}

export function isRoutineNotSelectableError(e: unknown): e is RoutineNotSelectableError {
  return e instanceof RoutineNotSelectableError;
}

/**
 * PostgreSQL `foreign_key_violation`.
 *
 * The code, not the message: the message names constraints and tables and is
 * free to change between server versions, while `23503` is part of the SQL
 * standard's class 23 and is not.
 */
export const PG_FOREIGN_KEY_VIOLATION = '23503';

/** Whether a PostgREST error object is that violation. */
export function isForeignKeyViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === PG_FOREIGN_KEY_VIOLATION
  );
}
