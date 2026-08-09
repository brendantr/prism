import * as fs from 'node:fs';
import * as path from 'node:path';
import { EXERCISE_BY_ID, EXERCISE_LIBRARY } from '../exerciseLibrary';
import { ROUTINE_TEMPLATES } from '../routineTemplates';

/**
 * DRIFT GUARD: the bundled catalogue and the seeded one must describe the same
 * movements.
 * ===========================================================================
 * PRism now holds its movement catalogue twice, and it has to: `EXERCISE_LIBRARY`
 * is what demo mode logs against with no backend, and
 * `supabase/migrations/0006_seed_library.sql` is what a real account logs
 * against. They are different representations of one thing.
 *
 * Two copies of one thing drift. The failure would be quiet and specific: a cue
 * improved in TypeScript that no real user ever sees, or — worse — a muscle
 * mapping corrected in one place only, so the same movement contributes to
 * different muscles in demo than it does in production. Volume, muscle
 * distribution and readiness all read those arrays, so that is not a cosmetic
 * divergence; it is two different apps computing two different numbers and
 * calling both "your training".
 *
 * The migration was generated from these constants. This test asserts it still
 * matches, by rebuilding each expected SQL row from the TypeScript and looking
 * for it verbatim. Regenerating is the intended fix when this fails — not
 * loosening the assertion.
 *
 * What this deliberately does NOT check: the ids. They differ by design and
 * nothing depends on them agreeing (see the migration's header).
 *
 * ---------------------------------------------------------------------------
 * The template half used to be weaker than the exercise half, and the gap was
 * the programming itself. Movements were pinned field by field, but a template
 * slot was pinned only by *count* and by which movement it named — so
 * `sets`, the rep range, the RPE target, the rest timer, `weekday` and
 * `dayIndex` could be retuned in TypeScript and silently never reach a real
 * account. Demo mode would prescribe 4×5–8 @8 and production 3×10–12 @8.5 for
 * the same day of the same plan, with nothing red anywhere. Every one of those
 * fields is now rebuilt from the constants and matched verbatim.
 */

const MIGRATION = path.join(
  __dirname,
  '..',
  '..',
  '..',
  'supabase',
  'migrations',
  '0006_seed_library.sql',
);

const sql = fs.readFileSync(MIGRATION, 'utf8');

/** Exactly the quoting the migration was generated with. */
const q = (s: string) => `'${s.replace(/'/g, "''")}'`;
const arr = (xs: readonly string[]) => `'{${xs.join(',')}}'`;
/** `null` is a SQL keyword, not a quoted value, and `8.5` must not become `8.50`. */
const num = (n: number | null) => (n === null ? 'null' : String(n));

describe('0006_seed_library.sql matches the bundled catalogue', () => {
  it.each(EXERCISE_LIBRARY.map((e) => [e.name, e] as const))(
    'seeds %s with the same equipment, muscles and cue',
    (_name, exercise) => {
      const row =
        `(null, ${q(exercise.name)}, ${q(exercise.equipment)}, ` +
        `${arr(exercise.primaryMuscles)}, ${arr(exercise.secondaryMuscles)}, ` +
        `${exercise.isUnilateral}, ${q(exercise.cue ?? '')})`;

      expect(sql).toContain(row);
    },
  );

  it('seeds no movement the bundle does not have', () => {
    // Catches the other direction: a row added to the migration by hand, or one
    // left behind after an exercise was removed from the library.
    const seeded = sql.match(/^\s{4}\(null, '/gm) ?? [];
    expect(seeded).toHaveLength(EXERCISE_LIBRARY.length);
  });

  it('seeds every template slot, and only those', () => {
    const slots = ROUTINE_TEMPLATES.reduce(
      (total, routine) =>
        total + routine.days.reduce((n, day) => n + day.exercises.length, 0),
      0,
    );
    const inserts = sql.match(/insert into public\.routine_exercises/g) ?? [];

    expect(inserts).toHaveLength(slots);
    // The migration's own guard raises if this number and the rows it inserted
    // disagree, so the literal has to stay in step with the templates too.
    expect(sql).toContain(`v_slots <> ${slots}`);
  });

  it.each(ROUTINE_TEMPLATES.map((r) => [r.name, r] as const))(
    'seeds the %s header with the same description and schedule',
    (_name, routine) => {
      expect(sql).toContain(
        `values (null, ${q(routine.name)}, ${q(routine.description)}, ` +
          `${routine.daysPerWeek}, ${routine.isTemplate}, false)`,
      );
    },
  );

  it('seeds every training day with the same name, position and weekday pin', () => {
    // `dayIndex` orders the rotation and `weekday` is what the schedule screen
    // pins a session to, so a day that arrives with either one different is a
    // different plan — not a cosmetic difference.
    for (const routine of ROUTINE_TEMPLATES) {
      for (const day of routine.days) {
        expect(sql).toContain(
          `values (v_routine, ${q(day.name)}, ${day.dayIndex}, ${num(day.weekday)})`,
        );
      }
    }
  });

  it('seeds every template slot with the same movement and the same prescription', () => {
    for (const routine of ROUTINE_TEMPLATES) {
      for (const day of routine.days) {
        for (const slot of day.exercises) {
          const exercise = EXERCISE_BY_ID.get(slot.exerciseId);
          // A template naming a movement the library does not define would
          // produce a `select` that matches nothing and inserts nothing —
          // silently, which is why the migration also checks the count.
          expect(exercise).toBeDefined();

          // Rebuilt whole rather than field by field: the `select` is what the
          // migration actually runs, and matching it verbatim covers the
          // prescription (sets, rep range, RPE, rest), the slot's position in
          // the day, and the name-plus-equipment pair that resolves the
          // movement. Equipment is part of the key — a barbell bench press and
          // a dumbbell bench press are different movements with one name.
          expect(sql).toContain(
            `select v_day, e.id, ${slot.orderIndex}, ${slot.targetSets}, ` +
              `${slot.targetRepsLow}, ${slot.targetRepsHigh}, ` +
              `${num(slot.targetRpe)}, ${slot.restSeconds}\n` +
              `      from public.exercises e\n` +
              `     where e.profile_id is null and lower(e.name) = lower(${q(exercise!.name)}) ` +
              `and e.equipment = ${q(exercise!.equipment)};`,
          );
        }
      }
    }
  });

  it('seeds no training history of any kind', () => {
    // The product decision this migration implements: testers start with
    // something to log against and nothing already logged. A workout, check-in
    // or personal record appearing here would be fabricated data in a real
    // lifter's account.
    for (const table of ['workouts', 'sets', 'workout_exercises', 'check_ins',
      'personal_records', 'body_measurements']) {
      expect(sql).not.toContain(`insert into public.${table}`);
    }
  });
});
