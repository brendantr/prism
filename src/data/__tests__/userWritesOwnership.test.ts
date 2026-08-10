/** Ownership and owner-scoping for the user-data write methods added in this sprint. */

const SESSION_UID = '11111111-1111-4111-8111-111111111111';
const ATTACKER_UID = '99999999-9999-4999-8999-999999999999';

type Call = {
  table: string;
  op: 'insert' | 'update' | 'upsert' | 'delete';
  payload?: Record<string, unknown>;
  filters: Record<string, unknown>;
};
const calls: Call[] = [];

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

jest.mock('../supabase/client', () => {
  const exerciseRow = (payload: Record<string, unknown>) => ({
    id: '22222222-2222-4222-8222-222222222222',
    profile_id: SESSION_UID,
    name: payload.name,
    equipment: payload.equipment,
    primary_muscles: payload.primary_muscles,
    secondary_muscles: payload.secondary_muscles,
    is_unilateral: payload.is_unilateral,
    cue: payload.cue,
  });

  const mutation = (call: Call, returned: unknown) => {
    const chain = {
      eq(column: string, value: unknown) {
        call.filters[column] = value;
        return chain;
      },
      select() {
        return chain;
      },
      single: async () => ({ data: returned, error: null }),
      then(resolve: (value: { data?: unknown; error: null }) => void) {
        resolve({ data: call.op === 'delete' ? [{ id: call.filters.id }] : returned, error: null });
      },
    };
    return chain;
  };

  const builder = (table: string) => ({
    insert(payload: Record<string, unknown>) {
      const call: Call = { table, op: 'insert', payload, filters: {} };
      calls.push(call);
      return mutation(call, exerciseRow(payload));
    },
    update(payload: Record<string, unknown>) {
      const call: Call = { table, op: 'update', payload, filters: {} };
      calls.push(call);
      return mutation(call, exerciseRow(payload));
    },
    upsert(payload: Record<string, unknown>) {
      const call: Call = { table, op: 'upsert', payload, filters: {} };
      calls.push(call);
      return Promise.resolve({ error: null });
    },
    delete() {
      const call: Call = { table, op: 'delete', filters: {} };
      calls.push(call);
      return mutation(call, null);
    },
  });

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
      from: (table: string) => builder(table),
    }),
  };
});

import { getRepository } from '../repository';
import type { BodyMeasurement } from '@/domain/types';

const repo = getRepository();
const input = {
  name: 'My row',
  equipment: 'cable' as const,
  primaryMuscles: ['lats'] as const,
  secondaryMuscles: ['biceps'] as const,
  isUnilateral: true,
  cue: null,
};

beforeEach(() => {
  calls.length = 0;
});

describe('user-data write ownership', () => {
  it('stamps a created movement from the session and cannot create a system row', async () => {
    await repo.createExercise({
      ...input,
      primaryMuscles: [...input.primaryMuscles],
      secondaryMuscles: [...input.secondaryMuscles],
    });
    const call = calls[0];
    expect(call.table).toBe('exercises');
    expect(call.payload?.profile_id).toBe(SESSION_UID);
    expect(call.payload?.profile_id).not.toBeNull();
  });

  it('scopes an exercise update by session owner as well as id', async () => {
    await repo.updateExercise('exercise-id', {
      ...input,
      primaryMuscles: [...input.primaryMuscles],
      secondaryMuscles: [...input.secondaryMuscles],
    });
    expect(calls[0].filters).toEqual({ id: 'exercise-id', profile_id: SESSION_UID });
  });

  it('scopes an exercise delete by session owner as well as id', async () => {
    await repo.deleteExercise('exercise-id');
    expect(calls[0].filters).toEqual({ id: 'exercise-id', profile_id: SESSION_UID });
  });

  it('overwrites a caller-supplied measurement owner with the session owner', async () => {
    const measurement: BodyMeasurement = {
      id: '33333333-3333-4333-8333-333333333333',
      profileId: ATTACKER_UID,
      measuredAt: '2026-08-09T12:00:00.000Z',
      bodyweightKg: 82,
      bodyFatPct: null,
      circumferencesCm: {},
    };
    await repo.saveMeasurement(measurement);
    expect(calls[0].payload?.profile_id).toBe(SESSION_UID);
    expect(JSON.stringify(calls[0])).not.toContain(ATTACKER_UID);
  });

  it('scopes a measurement delete by session owner as well as id', async () => {
    await repo.deleteMeasurement('measurement-id');
    expect(calls[0].filters).toEqual({ id: 'measurement-id', profile_id: SESSION_UID });
  });
});
