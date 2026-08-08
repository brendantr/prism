import * as fs from 'node:fs';
import * as path from 'node:path';
import { EXERCISE_LIBRARY } from '../exerciseLibrary';
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

  it('resolves every template slot to a movement that is actually seeded', () => {
    const byId = new Map(EXERCISE_LIBRARY.map((e) => [e.id, e]));

    for (const routine of ROUTINE_TEMPLATES) {
      for (const day of routine.days) {
        for (const slot of day.exercises) {
          const exercise = byId.get(slot.exerciseId);
          // A template naming a movement the library does not define would
          // produce a `select` that matches nothing and inserts nothing —
          // silently, which is why the migration also checks the count.
          expect(exercise).toBeDefined();
          expect(sql).toContain(`lower(e.name) = lower(${q(exercise!.name)})`);
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
