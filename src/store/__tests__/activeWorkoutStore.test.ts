// jest-expo stubs expo-crypto's native module, so `randomUUID()` returns
// undefined under this preset and every generated id collides. Substitute
// Node's CSPRNG so the store's ids behave like they do on a device.
jest.mock('expo-crypto', () => ({
  randomUUID: () => require('node:crypto').randomUUID(),
}));

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import AsyncStorage from '@react-native-async-storage/async-storage';
import { useActiveWorkoutStore } from '../activeWorkoutStore';
import type { RoutineDay, Workout } from '@/domain/types';

const DRAFT_KEY = 'prism.activeWorkout.draft.v1';

/** The subscribe-based persistence is fire-and-forget; give it a tick to land. */
const flush = () => new Promise((r) => setTimeout(r, 0));

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

beforeEach(async () => {
  useActiveWorkoutStore.setState({
    workout: null,
    restTimer: null,
    lastCompletedSetId: null,
    hydrationStatus: 'idle',
    draftPendingReview: false,
  });
  // The previous test may still have a fire-and-forget AsyncStorage write in
  // flight (the persistence subscribe never awaits its own writes). Flush
  // first so it lands, then clear -- otherwise it can land *after* this
  // test's own setup and pollute what hydrate() reads back.
  await flush();
  await AsyncStorage.clear();
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

/**
 * Local draft persistence and recovery.
 *
 * The mechanism is a single module-level `subscribe` watching the `workout`
 * reference (see `activeWorkoutStore.ts`), not per-action code -- these tests
 * exercise it through the public actions exactly as the app does, plus
 * `hydrate()`'s own defensive handling of whatever it finds on disk.
 */
describe('local draft persistence', () => {
  it('persists the workout to AsyncStorage as it changes, and clears it on discard()', async () => {
    store().start({ profileId: 'p1', title: 'Lower — Hinge', routineDay: day });
    await flush();
    expect(JSON.parse((await AsyncStorage.getItem(DRAFT_KEY))!).status).toBe('in_progress');

    const setId = store().workout!.exercises[0].sets[0].id;
    store().updateSet(setId, { weightKg: 100 });
    await flush();
    expect(JSON.parse((await AsyncStorage.getItem(DRAFT_KEY))!).exercises[0].sets[0].weightKg).toBe(100);

    store().discard();
    await flush();
    expect(await AsyncStorage.getItem(DRAFT_KEY)).toBeNull();
  });

  it('does not persist anything when there is no session', async () => {
    await flush();
    expect(await AsyncStorage.getItem(DRAFT_KEY)).toBeNull();
  });
});

describe('hydrate()', () => {
  it('restores a persisted in-progress draft and flags it pending review', async () => {
    store().start({ profileId: 'p1', title: 'Lower — Hinge', routineDay: day });
    const workoutId = store().workout!.id;
    await flush();
    const onDisk = await AsyncStorage.getItem(DRAFT_KEY);

    // Simulate a fresh process: the JS heap resets to null, but the draft a
    // prior, killed process wrote is still sitting in AsyncStorage. Setting
    // `workout` to null here also fires the same persistence subscribe a real
    // discard() would (correctly -- it can't tell the difference), so the
    // on-disk draft has to be put back afterwards rather than assumed to
    // survive the reset untouched.
    useActiveWorkoutStore.setState({ workout: null, hydrationStatus: 'idle' });
    await flush();
    await AsyncStorage.setItem(DRAFT_KEY, onDisk!);

    await store().hydrate();

    expect(store().hydrationStatus).toBe('ready');
    expect(store().draftPendingReview).toBe(true);
    expect(store().workout?.id).toBe(workoutId);
  });

  it('ends clean when nothing is stored', async () => {
    await store().hydrate();

    expect(store().hydrationStatus).toBe('ready');
    expect(store().draftPendingReview).toBe(false);
    expect(store().workout).toBeNull();
  });

  it('ignores corrupt JSON rather than throwing', async () => {
    await AsyncStorage.setItem(DRAFT_KEY, '{not json');

    await expect(store().hydrate()).resolves.toBeUndefined();
    expect(store().workout).toBeNull();
    expect(store().hydrationStatus).toBe('ready');
  });

  it('ignores a stored workout that is not in_progress', async () => {
    const completed: Workout = {
      id: 'wk_1',
      profileId: 'p1',
      routineDayId: null,
      title: 'Stale',
      status: 'completed',
      startedAt: new Date().toISOString(),
      endedAt: new Date().toISOString(),
      reflection: null,
      sessionRating: null,
      exercises: [],
    };
    await AsyncStorage.setItem(DRAFT_KEY, JSON.stringify(completed));

    await store().hydrate();

    expect(store().workout).toBeNull();
    expect(store().draftPendingReview).toBe(false);
  });

  it('does not let a stale draft overwrite a workout started while the AsyncStorage read is still in flight', async () => {
    const staleDraft: Workout = {
      id: 'wk_stale',
      profileId: 'p1',
      routineDayId: null,
      title: 'Stale draft',
      status: 'in_progress',
      startedAt: new Date().toISOString(),
      endedAt: null,
      reflection: null,
      sessionRating: null,
      exercises: [],
    };

    // Hold the AsyncStorage read open so a `start()` can land while
    // `hydrate()` is still awaiting it -- this is the exact race the store
    // must resolve in the fresh workout's favour. `AsyncStorage.getItem` is
    // already a jest mock (see the module mock above); queueing a one-time
    // override directly on it -- rather than wrapping it in `jest.spyOn`,
    // whose `mockRestore()` does not cleanly restore an already-mocked
    // function and was observed to leave `getItem` permanently returning
    // `undefined` for every later test in this file -- self-reverts to the
    // real implementation the moment it's consumed, with nothing to restore.
    let resolveRead: (value: string | null) => void = () => {};
    const pendingRead = new Promise<string | null>((resolve) => {
      resolveRead = resolve;
    });
    (AsyncStorage.getItem as jest.Mock).mockImplementationOnce(() => pendingRead);

    const hydratePromise = store().hydrate();

    // A fresh session starts before the stale read resolves.
    store().start({ profileId: 'p1', title: 'Fresh session', routineDay: null });
    const freshId = store().workout!.id;

    // Now the stale, pre-existing draft resolves from disk.
    resolveRead(JSON.stringify(staleDraft));
    await hydratePromise;

    // The fresh session must win -- untouched, not merged, not replaced.
    expect(store().workout!.id).toBe(freshId);
    expect(store().workout!.title).toBe('Fresh session');
    expect(store().draftPendingReview).toBe(false);
    expect(store().hydrationStatus).toBe('ready');

    // The fresh session's own persistence write from `start()` above was
    // never awaited -- drain it before the test ends, or it can land during
    // a later test's `beforeEach` and pollute what it reads back.
    await flush();
  });

  it('is a no-op once already loading or ready', async () => {
    store().start({ profileId: 'p1', title: 'X', routineDay: null });
    await flush();
    const onDisk = await AsyncStorage.getItem(DRAFT_KEY);
    useActiveWorkoutStore.setState({ workout: null, hydrationStatus: 'idle' });
    await flush();
    await AsyncStorage.setItem(DRAFT_KEY, onDisk!);

    await store().hydrate();
    expect(store().workout).not.toBeNull();

    await AsyncStorage.removeItem(DRAFT_KEY);
    await store().hydrate(); // second call: hydrationStatus is already 'ready'

    // Nothing changed -- the second call returned early instead of re-reading.
    expect(store().workout).not.toBeNull();
  });
});

describe('resumeDraft()', () => {
  it('clears draftPendingReview without touching the workout', () => {
    useActiveWorkoutStore.setState({
      workout: store().start({ profileId: 'p1', title: 'X', routineDay: null }),
      draftPendingReview: true,
    });
    const before = store().workout;

    store().resumeDraft();

    expect(store().draftPendingReview).toBe(false);
    expect(store().workout).toBe(before);
  });
});
