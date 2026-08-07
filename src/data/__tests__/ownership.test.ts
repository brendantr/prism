/**
 * OWNERSHIP ON WRITE
 * ==================
 * Every Supabase write must stamp `profile_id` from the signed-in session, not
 * from whatever the caller handed in.
 *
 * Postgres would already reject a forged value -- each of these tables carries
 * `with check (profile_id = auth.uid())` -- so nothing here is currently
 * exploitable. That is exactly why it needs a test: the protection lives
 * entirely in one layer, and a policy edit that drops a `WITH CHECK`, or a new
 * table added without one, would turn a passing build into mass assignment with
 * no other signal. These tests fail the moment the client starts asserting
 * identity again.
 */

const SESSION_UID = '11111111-1111-4111-8111-111111111111';
const ATTACKER_SUPPLIED_UID = '99999999-9999-4999-8999-999999999999';

type Captured = { table: string; op: string; payload?: unknown; filters?: Record<string, unknown> };
const captured: Captured[] = [];

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

jest.mock('../supabase/client', () => {
  const builder = (table: string) => ({
    upsert: (payload: unknown) => {
      captured.push({ table, op: 'upsert', payload });
      return Promise.resolve({ error: null });
    },
    insert: (payload: unknown) => {
      captured.push({ table, op: 'insert', payload });
      return Promise.resolve({ error: null });
    },
    delete: () => {
      const entry: Captured = { table, op: 'delete', filters: {} };
      captured.push(entry);
      const chain = {
        eq(column: string, value: unknown) {
          entry.filters![column] = value;
          return chain;
        },
        // Awaiting the chain resolves like a PostgREST response.
        then(resolve: (v: { error: null }) => void) {
          resolve({ error: null });
        },
      };
      return chain;
    },
  });

  return {
    DEMO_MODE: false,
    isSupabaseConfigured: true,
    getSupabase: () => ({
      auth: {
        /*
          `getSession`, not `getUser`, since the auth/session sprint: `getUser`
          round-trips to the auth server on every call and `uid()` is hit by six
          of the eight repository calls `trainingStore.refresh()` fires at once.
          The access token is what RLS evaluates anyway.

          What this test asserts is unchanged by that: identity still comes from
          the session and never from the caller.
        */
        getSession: async () => ({
          data: { session: { user: { id: SESSION_UID } } },
          error: null,
        }),
      },
      from: (table: string) => builder(table),
      /*
        `save_workout_graph` (0003_workout_write_integrity.sql). Captured under
        the function name so the sweep at the bottom of this file covers RPC
        arguments as well as table writes -- moving a write behind an RPC must
        not move it out of this test's reach.
      */
      rpc: (fn: string, args: unknown) => {
        captured.push({ table: fn, op: 'rpc', payload: args });
        return Promise.resolve({ error: null });
      },
    }),
  };
});

import { getRepository } from '../repository';
import type { PersonalRecord, Workout } from '@/domain/types';

const repo = getRepository();

beforeEach(() => {
  captured.length = 0;
});

/** A workout that claims to belong to someone else. */
function hostileWorkout(): Workout {
  return {
    id: '22222222-2222-4222-8222-222222222222',
    profileId: ATTACKER_SUPPLIED_UID,
    routineDayId: null,
    title: 'Open session',
    status: 'completed',
    startedAt: '2026-07-30T10:00:00.000Z',
    endedAt: '2026-07-30T11:00:00.000Z',
    reflection: null,
    sessionRating: null,
    exercises: [],
  };
}

function hostileRecord(): PersonalRecord {
  return {
    id: '33333333-3333-4333-8333-333333333333',
    profileId: ATTACKER_SUPPLIED_UID,
    exerciseId: '44444444-4444-4444-8444-444444444444',
    kind: 'e1rm',
    value: 100,
    reps: 5,
    weightKg: 90,
    achievedAt: '2026-07-30T11:00:00.000Z',
    workoutId: '22222222-2222-4222-8222-222222222222',
  };
}

const payloadFor = (table: string) =>
  captured.find((c) => c.table === table)?.payload as Record<string, unknown>;

describe('the repository is the source of truth for ownership', () => {
  /*
    Saving a workout no longer sends `profile_id` at all.

    It used to stamp the session uid onto the payload client-side. Since
    0003_workout_write_integrity.sql the write goes through `save_workout_graph`,
    which reads `auth.uid()` itself and ignores anything the payload might say
    about ownership -- so the correct assertion changed from "the client sends
    the right owner" to "the client sends no owner." The second is stronger: it
    cannot be got wrong by a caller.
  */
  it('sends no caller-chosen owner when saving a workout', async () => {
    await repo.saveWorkout(hostileWorkout());

    const args = payloadFor('save_workout_graph');
    const graph = args.p_workout as Record<string, unknown>;
    expect(graph).toBeDefined();
    expect(graph.profile_id).toBeUndefined();
    expect(JSON.stringify(args)).not.toContain(ATTACKER_SUPPLIED_UID);
  });

  it('sends no caller-chosen owner when completing a workout with records', async () => {
    await repo.completeWorkout(hostileWorkout(), [hostileRecord()]);

    const args = payloadFor('save_workout_graph');
    const records = args.p_records as Record<string, unknown>[];
    expect(records).toHaveLength(1);
    expect(records[0].profile_id).toBeUndefined();
    expect(JSON.stringify(args)).not.toContain(ATTACKER_SUPPLIED_UID);
  });

  /*
    As with the workout graph above: since 0004 this goes through
    `save_check_in`, which reads `auth.uid()` itself, so the client sends no
    owner at all rather than sending the right one.
  */
  it('sends no caller-chosen owner when saving a check-in', async () => {
    await repo.saveCheckIn({
      id: '55555555-5555-4555-8555-555555555555',
      profileId: ATTACKER_SUPPLIED_UID,
      checkedInAt: '2026-07-30T07:00:00.000Z',
      sleepQuality: 4,
      energy: 4,
      soreness: 2,
      stress: 2,
    });

    const args = payloadFor('save_check_in');
    const patch = args.p_patch as Record<string, unknown>;
    expect(patch.profile_id).toBeUndefined();
    expect(patch.sleep_quality).toBe(4);
    expect(JSON.stringify(args)).not.toContain(ATTACKER_SUPPLIED_UID);
  });

  /*
    The distinction the whole jsonb payload exists for. An omitted property must
    not reach the database as a key, or the function cannot tell "leave my
    earlier answer alone" from "erase it".
  */
  it('sends only the scales the caller actually supplied', async () => {
    await repo.saveCheckIn({
      id: '55555555-5555-4555-8555-555555555555',
      profileId: ATTACKER_SUPPLIED_UID,
      checkedInAt: '2026-07-30T07:00:00.000Z',
      sleepQuality: 4,
      // energy and soreness omitted entirely; stress explicitly cleared.
      stress: null,
    });

    const patch = payloadFor('save_check_in').p_patch as Record<string, unknown>;
    expect(Object.keys(patch)).toContain('sleep_quality');
    expect(Object.keys(patch)).toContain('stress');
    expect(Object.keys(patch)).not.toContain('energy');
    expect(Object.keys(patch)).not.toContain('soreness');
    expect(patch.stress).toBeNull();
  });

  it('uses the session uid on every personal record in a batch', async () => {
    await repo.savePersonalRecords([hostileRecord(), { ...hostileRecord(), id: 'other' }]);

    const rows = payloadFor('personal_records') as unknown as Record<string, unknown>[];
    expect(rows).toHaveLength(2);
    // A batch write must not stamp only the first row correctly.
    for (const row of rows) expect(row.profile_id).toBe(SESSION_UID);
  });

  it('scopes a workout delete by owner as well as id', async () => {
    await repo.deleteWorkout('22222222-2222-4222-8222-222222222222');

    const del = captured.find((c) => c.op === 'delete');
    expect(del?.table).toBe('workouts');
    expect(del?.filters).toEqual({
      id: '22222222-2222-4222-8222-222222222222',
      profile_id: SESSION_UID,
    });
  });

  it('never sends a profile_id the caller chose, on any write path', async () => {
    await repo.saveWorkout(hostileWorkout());
    await repo.savePersonalRecords([hostileRecord()]);
    await repo.saveCheckIn({
      id: '55555555-5555-4555-8555-555555555555',
      profileId: ATTACKER_SUPPLIED_UID,
      checkedInAt: '2026-07-30T07:00:00.000Z',
      sleepQuality: 3,
      energy: 3,
      soreness: 3,
      stress: 3,
    });

    // One sweep over everything that was sent, so a future write path added
    // without server-derived ownership is caught here too.
    const serialised = JSON.stringify(captured);
    expect(serialised).not.toContain(ATTACKER_SUPPLIED_UID);
    expect(serialised).toContain(SESSION_UID);
  });
});
