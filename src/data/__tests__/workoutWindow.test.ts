/**
 * The bounded startup read of `listWorkouts`.
 *
 * Two properties are worth pinning and neither is about the number itself:
 *
 *   1. **A bounded read returns the NEWEST sessions, still oldest-first.** The
 *      obvious implementation -- adding `.limit()` to the existing ascending
 *      query -- returns the OLDEST N instead, which would show a lifter their
 *      first month of training in place of their last. That bug typechecks,
 *      passes a "returns 120 rows" assertion, and is invisible until someone
 *      has more history than the limit.
 *   2. **Unbounded stays unbounded where completeness is a promise.**
 *      `exportAccountData` is I-10 and the privacy policy's "export everything";
 *      `deleteExercise` refuses to delete a movement any logged session
 *      references, and a session from three years ago still counts.
 */

const SESSION_UID = '11111111-1111-4111-8111-111111111111';

type SelectCall = {
  table: string;
  ascending?: boolean;
  limit?: number;
};
const selects: SelectCall[] = [];

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

jest.mock('../supabase/client', () => {
  // Built inside the factory: jest hoists `jest.mock` above module scope, so a
  // fixture declared outside it is not in scope yet when this runs.
  // Newest last, matching the oldest-first contract.
  const ROWS = Array.from({ length: 10 }, (_, i) => ({
    id: `w${i}`,
    profile_id: '11111111-1111-4111-8111-111111111111',
    routine_day_id: null,
    title: `Session ${i}`,
    status: 'completed',
    started_at: `2026-01-${String(i + 1).padStart(2, '0')}T10:00:00.000Z`,
    ended_at: `2026-01-${String(i + 1).padStart(2, '0')}T11:00:00.000Z`,
    reflection: null,
    session_rating: null,
    workout_exercises: [],
  }));

  const workoutsQuery = (call: SelectCall) => {
    const chain = {
      eq() {
        return chain;
      },
      // `listExercises` orders with no options, so this must tolerate that
      // rather than assume every caller passes `{ ascending }`.
      order(_column: string, opts?: { ascending?: boolean }) {
        if (opts && typeof opts.ascending === 'boolean') call.ascending = opts.ascending;
        return chain;
      },
      // Only the workouts table has fixture rows; every other table in the
      // export answers empty, which is all this test needs from them.
      limit(n: number) {
        call.limit = n;
        const rows = call.table === 'workouts' ? ROWS : [];
        // Postgres returns rows in the requested order; the mock mirrors that.
        const ordered = call.ascending === false ? [...rows].reverse() : rows;
        return Promise.resolve({ data: ordered.slice(0, n), error: null });
      },
      // The entitlement read terminates with `.maybeSingle()`.
      maybeSingle: async () => ({ data: null, error: null }),
      // `getProfile` terminates with `.single()`; the export awaits it too.
      single: async () => ({
        data: {
          id: '11111111-1111-4111-8111-111111111111',
          display_name: 'Lifter',
          goal: 'hypertrophy',
          experience: 'intermediate',
          training_days_per_week: 4,
          preferred_weekdays: [1, 2, 4, 5],
          available_equipment: [],
          unit: 'kg',
          bodyweight_kg: null,
          created_at: '2026-01-01T00:00:00.000Z',
        },
        error: null,
      }),
      then(resolve: (value: { data: unknown; error: null }) => void) {
        const rows = call.table === 'workouts' ? ROWS : [];
        const ordered = call.ascending === false ? [...rows].reverse() : rows;
        resolve({ data: ordered, error: null });
      },
    };
    return chain;
  };

  return {
    DEMO_MODE: false,
    SUPABASE_MISCONFIGURED: false,
    SUPABASE_MISCONFIGURED_MESSAGE: '',
    isSupabaseConfigured: true,
    getSupabase: () => ({
      auth: {
        getSession: async () => ({
          data: { session: { user: { id: SESSION_UID } } },
          error: null,
        }),
      },
      from: (table: string) => {
        const call: SelectCall = { table };
        return {
          select: () => {
            selects.push(call);
            return workoutsQuery(call);
          },
        };
      },
    }),
  };
});

import { getRepository, resetRepository } from '../repository';

beforeEach(() => {
  selects.length = 0;
  resetRepository();
});

describe('SupabaseRepository.listWorkouts', () => {
  it('reads every session, oldest first, when no limit is given', async () => {
    const workouts = await getRepository().listWorkouts();

    expect(selects[0].ascending).toBe(true);
    expect(selects[0].limit).toBeUndefined();
    expect(workouts).toHaveLength(10);
    expect(workouts[0].id).toBe('w0');
    expect(workouts[9].id).toBe('w9');
  });

  it('returns the NEWEST sessions when bounded, not the oldest', async () => {
    const workouts = await getRepository().listWorkouts({ limit: 3 });

    // The query must invert the sort to let the database pick the newest rows.
    expect(selects[0].ascending).toBe(false);
    expect(selects[0].limit).toBe(3);

    // ...and the caller must still receive them oldest-first.
    expect(workouts.map((w) => w.id)).toEqual(['w7', 'w8', 'w9']);
  });

  it('asks for a limit the database can use, rather than trimming after the fact', async () => {
    await getRepository().listWorkouts({ limit: 3 });
    // The whole point is fewer rows over the wire. Slicing client-side would
    // pass every behavioural assertion above and none of the cost ones.
    expect(selects[0].limit).toBe(3);
  });

  it('does not bound the export, because I-10 promises it is complete', async () => {
    await getRepository().exportAccountData();

    const workoutSelect = selects.find((c) => c.table === 'workouts');
    expect(workoutSelect).toBeDefined();
    expect(workoutSelect?.limit).toBeUndefined();
  });
});
