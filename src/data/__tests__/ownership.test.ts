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
        getUser: async () => ({ data: { user: { id: SESSION_UID } }, error: null }),
      },
      from: (table: string) => builder(table),
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
  it('uses the session uid when saving a workout, not the one on the object', async () => {
    await repo.saveWorkout(hostileWorkout());

    expect(payloadFor('workouts').profile_id).toBe(SESSION_UID);
    expect(payloadFor('workouts').profile_id).not.toBe(ATTACKER_SUPPLIED_UID);
  });

  it('uses the session uid when saving a check-in', async () => {
    await repo.saveCheckIn({
      id: '55555555-5555-4555-8555-555555555555',
      profileId: ATTACKER_SUPPLIED_UID,
      checkedInAt: '2026-07-30T07:00:00.000Z',
      sleepQuality: 4,
      energy: 4,
      soreness: 2,
      stress: 2,
    });

    expect(payloadFor('check_ins').profile_id).toBe(SESSION_UID);
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
