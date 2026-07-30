// jest-expo stubs expo-crypto's native module, so `randomUUID()` returns
// undefined under this preset and every generated id collides. Substitute
// Node's CSPRNG so the store's ids behave like they do on a device.
jest.mock('expo-crypto', () => ({
  randomUUID: () => require('node:crypto').randomUUID(),
}));

import { useActiveWorkoutStore } from '../activeWorkoutStore';
import type { RoutineDay } from '@/domain/types';

/**
 * `finish()` must not clear the session.
 *
 * It used to. That meant the only copy of the lifter's sets was gone before the
 * save had even been attempted, so a rejected write -- the server refusing it,
 * an expired session, no signal -- destroyed the workout with nothing left to
 * retry and nothing shown on screen. Clearing is the caller's job now, once the
 * write has actually come back clean.
 *
 * These tests exist to stop that behaviour coming back quietly.
 */

const day: RoutineDay = {
  id: 'day-1',
  routineId: 'routine-1',
  name: 'Lower — Hinge',
  dayIndex: 0,
  weekday: null,
  exercises: [
    {
      id: 're-1',
      routineDayId: 'day-1',
      exerciseId: 'ex-1',
      orderIndex: 0,
      targetSets: 2,
      targetRepsLow: 5,
      targetRepsHigh: 8,
      targetRpe: null,
      restSeconds: 120,
    },
  ],
};

const store = () => useActiveWorkoutStore.getState();

function startWithOneCompletedSet() {
  store().start({ profileId: 'p1', title: 'Lower — Hinge', routineDay: day });
  const setId = store().workout!.exercises[0].sets[0].id;
  store().updateSet(setId, { weightKg: 100, reps: 5 });
  store().toggleSetComplete(setId, 120);
}

beforeEach(() => {
  useActiveWorkoutStore.setState({ workout: null, restTimer: null, lastCompletedSetId: null });
});

describe('finish()', () => {
  it('returns the completed workout without clearing the session', () => {
    startWithOneCompletedSet();

    const finished = store().finish();

    expect(finished).not.toBeNull();
    expect(finished!.status).toBe('completed');
    expect(finished!.endedAt).not.toBeNull();
    // The point of the whole test file: the session survives.
    expect(store().workout).not.toBeNull();
    expect(store().workout!.exercises[0].sets[0].completed).toBe(true);
  });

  it('can be called twice and still leaves the session intact', () => {
    startWithOneCompletedSet();

    // A failed save followed by a retry means finish() runs again. It must be
    // safe to call repeatedly and must not erode the session on the way.
    const first = store().finish();
    const second = store().finish();

    expect(first!.exercises).toHaveLength(1);
    expect(second!.exercises).toHaveLength(1);
    expect(store().workout).not.toBeNull();
  });

  it('keeps only completed sets in the record but leaves the live session whole', () => {
    store().start({ profileId: 'p1', title: 'Lower — Hinge', routineDay: day });
    const sets = store().workout!.exercises[0].sets;
    store().toggleSetComplete(sets[0].id, 120); // one of two

    const finished = store().finish();

    // The saved record drops the untouched set...
    expect(finished!.exercises[0].sets).toHaveLength(1);
    // ...while the session the lifter is still looking at keeps both.
    expect(store().workout!.exercises[0].sets).toHaveLength(sets.length);
  });

  it('returns null and changes nothing when there is no session', () => {
    expect(store().finish()).toBeNull();
    expect(store().workout).toBeNull();
  });

  it('discard() is what actually clears the session', () => {
    startWithOneCompletedSet();
    store().finish();
    expect(store().workout).not.toBeNull();

    store().discard();

    expect(store().workout).toBeNull();
  });
});
