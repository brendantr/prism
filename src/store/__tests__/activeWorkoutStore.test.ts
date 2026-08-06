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
import {
  selectCompletedSetCount,
  selectHasActiveWorkout,
  selectTotalSetCount,
  useActiveWorkoutStore,
} from '../activeWorkoutStore';
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

  /**
   * The logger calls this on mount whenever a draft is pending review, because
   * being on that screen IS resuming, whichever route arrived
   * (`Docs/ui-ux-foundation-v1.md` D5, §4.4). Today's Recovered card already
   * calls it before navigating, so the second call has to be free — and it must
   * not disturb the restored session, which is the whole thing being recovered.
   */
  it('is idempotent -- calling it again changes nothing', () => {
    useActiveWorkoutStore.setState({
      workout: store().start({ profileId: 'p1', title: 'X', routineDay: null }),
      draftPendingReview: true,
    });
    const before = store().workout;

    store().resumeDraft();
    store().resumeDraft();
    store().resumeDraft();

    expect(store().draftPendingReview).toBe(false);
    expect(store().workout).toBe(before);
  });

  it('is a no-op when no draft was pending, and still leaves the session intact', () => {
    useActiveWorkoutStore.setState({
      workout: store().start({ profileId: 'p1', title: 'X', routineDay: null }),
      draftPendingReview: false,
    });
    const before = store().workout;

    store().resumeDraft();

    expect(store().draftPendingReview).toBe(false);
    expect(store().workout).toBe(before);
  });

  /**
   * The logger's entry effect, in store terms: a draft restored by `hydrate()`
   * is resumed, and the workout it restored survives byte-for-byte. This is the
   * property that stops Today offering Resume/Discard for a session the lifter
   * is already logging in (L1).
   */
  it('resumes a hydrated draft and leaves every logged set exactly as restored', async () => {
    const draft = store().start({ profileId: 'p1', title: 'Lower — Squat', routineDay: null });
    store().addExercise('ex1', { sets: 2, reps: 5, rest: 90 });
    const setId = store().workout!.exercises[0].sets[0].id;
    store().updateSet(setId, { weightKg: 100, reps: 5 });
    store().toggleSetComplete(setId, 0);
    await flush();
    const persisted = (await AsyncStorage.getItem(DRAFT_KEY))!;

    // Simulate a fresh process. Nulling `workout` fires the same persistence
    // subscribe a real discard() would, so the draft has to be put back after
    // that write has landed -- see the note in the hydrate() suite above.
    useActiveWorkoutStore.setState({
      workout: null,
      draftPendingReview: false,
      hydrationStatus: 'idle',
    });
    await flush();
    await AsyncStorage.setItem(DRAFT_KEY, persisted);

    await store().hydrate();
    expect(store().draftPendingReview).toBe(true);
    const restored = store().workout;

    store().resumeDraft();

    expect(store().draftPendingReview).toBe(false);
    expect(store().workout).toBe(restored);
    expect(JSON.stringify(store().workout)).toBe(persisted);
    expect(store().workout!.id).toBe(draft.id);
  });
});

/**
 * Set and exercise editing.
 *
 * These actions had no coverage at all, and the logger now gates the two
 * destructive ones behind a confirmation whose condition is "would this lose
 * logged work?". That condition is only meaningful if the removals themselves
 * behave — in particular if they re-index what is left, since the set number
 * shown in the logger is `setIndex + 1` and a gap there would misnumber every
 * row below the one removed.
 */
/**
 * `start()` is the store's half of D4's "never two sessions at once".
 *
 * The three entry points each guard on `if (!activeWorkout)` before calling it
 * (`Docs/ui-ux-foundation-v1.md` D4), but the store is the single source of
 * truth for session state, so what matters here is that it cannot *hold* two:
 * a second call replaces, it never accumulates. It also has to reset the
 * continuity flags, or a fresh session would inherit the previous one's rest
 * timer and — the case that actually reaches a user — a recovered draft's
 * pending-review flag, leaving Today offering Resume/Discard for a session that
 * no longer exists (D5).
 */
describe('start()', () => {
  it('seeds one incomplete set per prescribed set, carrying the day’s reps and rest', () => {
    store().start({ profileId: 'p1', title: 'Lower — Hinge', routineDay: day });

    const sets = store().workout!.exercises[0].sets;
    expect(sets).toHaveLength(2);
    expect(sets.map((s) => s.setIndex)).toEqual([0, 1]);
    for (const s of sets) {
      expect(s.reps).toBe(5);
      expect(s.restSeconds).toBe(120);
      // A seeded set is a plan, never a record -- nothing arrives pre-ticked.
      expect(s.completed).toBe(false);
      expect(s.type).toBe('working');
    }
  });

  it('starts an open session with no exercises when there is no routine day', () => {
    const workout = store().start({ profileId: 'p1', title: 'Open session', routineDay: null });

    expect(workout.exercises).toEqual([]);
    expect(workout.routineDayId).toBeNull();
    expect(workout.status).toBe('in_progress');
    expect(workout.endedAt).toBeNull();
  });

  it('replaces any existing session rather than accumulating a second one', () => {
    const first = store().start({ profileId: 'p1', title: 'First', routineDay: day });
    const second = store().start({ profileId: 'p1', title: 'Second', routineDay: null });

    expect(second.id).not.toBe(first.id);
    // One session, and it is the new one -- the store cannot hold both.
    expect(store().workout).toBe(second);
    expect(store().workout!.title).toBe('Second');
  });

  it('clears the rest timer, the last-completed marker and a pending draft review', () => {
    startWithOneCompletedSet();
    useActiveWorkoutStore.setState({ draftPendingReview: true });
    expect(store().restTimer).not.toBeNull();
    expect(store().lastCompletedSetId).not.toBeNull();

    store().start({ profileId: 'p1', title: 'Fresh', routineDay: null });

    expect(store().restTimer).toBeNull();
    expect(store().lastCompletedSetId).toBeNull();
    expect(store().draftPendingReview).toBe(false);
  });
});

describe('set and exercise editing', () => {
  const firstExercise = () => store().workout!.exercises[0];

  /**
   * `updateSet` is a partial patch, and the field it must never touch by
   * accident is `completed`. The logger patches load and reps from the
   * steppers and the copy-previous affordance while sets are already ticked,
   * so a patch that dropped the flag would silently un-log finished work --
   * and `finish()` keeps only completed sets, so that loss would reach the
   * saved record, not just the screen.
   */
  describe('updateSet()', () => {
    it('patches only the target set and leaves its siblings alone', () => {
      store().start({ profileId: 'p1', title: 'X', routineDay: day });
      const [first, second] = firstExercise().sets;

      store().updateSet(first.id, { weightKg: 60, reps: 3 });

      expect(firstExercise().sets[0].weightKg).toBe(60);
      expect(firstExercise().sets[0].reps).toBe(3);
      expect(firstExercise().sets[1].weightKg).toBe(second.weightKg);
      expect(firstExercise().sets[1].reps).toBe(second.reps);
    });

    it('leaves sets under other exercises untouched', () => {
      store().start({ profileId: 'p1', title: 'X', routineDay: day });
      store().addExercise('ex-2', { sets: 1, reps: 8, rest: 90 });
      const target = firstExercise().sets[0].id;

      store().updateSet(target, { weightKg: 80 });

      expect(store().workout!.exercises[1].sets[0].weightKg).toBe(0);
    });

    it('never silently un-completes a set it was not asked to un-complete', () => {
      startWithOneCompletedSet();
      const setId = firstExercise().sets[0].id;
      expect(firstExercise().sets[0].completed).toBe(true);

      store().updateSet(setId, { weightKg: 102.5 });

      expect(firstExercise().sets[0].completed).toBe(true);
      expect(firstExercise().sets[0].weightKg).toBe(102.5);
    });

    it('does nothing when there is no session', () => {
      store().updateSet('st-nope', { weightKg: 100 });
      expect(store().workout).toBeNull();
    });
  });

  describe('addSet()', () => {
    it('inherits the last set’s load and reps rather than starting empty', () => {
      // Inheritance is from the LAST set, not from the last *completed* one --
      // "same weight, one more set" is the case it is built for. Fill the
      // trailing set so the assertion reflects how a lifter actually works down
      // an exercise, top to bottom.
      startWithOneCompletedSet();
      const sets = firstExercise().sets;
      const last = sets[sets.length - 1];
      store().updateSet(last.id, { weightKg: 100, reps: 5 });
      const before = firstExercise().sets.length;

      store().addSet(firstExercise().id);

      const after = firstExercise().sets;
      expect(after).toHaveLength(before + 1);
      const added = after[after.length - 1];
      expect(added.weightKg).toBe(100);
      expect(added.reps).toBe(5);
      // Inheriting the numbers must not inherit the tick.
      expect(added.completed).toBe(false);
    });

    it('numbers the new set after the ones already there', () => {
      startWithOneCompletedSet();

      store().addSet(firstExercise().id);

      expect(firstExercise().sets.map((s) => s.setIndex)).toEqual([0, 1, 2]);
    });

    it('does nothing when there is no session', () => {
      store().addSet('whatever');
      expect(store().workout).toBeNull();
    });
  });

  describe('removeSet()', () => {
    it('drops the set and re-indexes the ones left, so numbering has no gap', () => {
      startWithOneCompletedSet();
      const middle = firstExercise().sets[0].id;

      store().removeSet(middle);

      const sets = firstExercise().sets;
      expect(sets.map((s) => s.id)).not.toContain(middle);
      expect(sets.map((s) => s.setIndex)).toEqual(sets.map((_, i) => i));
    });

    it('leaves other exercises untouched', () => {
      startWithOneCompletedSet();
      store().addExercise('ex-2', { sets: 2, reps: 8, rest: 90 });
      const otherBefore = store().workout!.exercises[1].sets.length;

      store().removeSet(firstExercise().sets[0].id);

      expect(store().workout!.exercises[1].sets).toHaveLength(otherBefore);
    });
  });

  describe('removeExercise()', () => {
    it('removes the exercise and every set logged under it', () => {
      startWithOneCompletedSet();
      store().addExercise('ex-2', { sets: 2, reps: 8, rest: 90 });
      const target = firstExercise().id;

      store().removeExercise(target);

      expect(store().workout!.exercises.map((e) => e.id)).not.toContain(target);
      expect(store().workout!.exercises).toHaveLength(1);
    });

    it('re-indexes the exercises left behind', () => {
      startWithOneCompletedSet();
      store().addExercise('ex-2', { sets: 1, reps: 8, rest: 90 });
      store().addExercise('ex-3', { sets: 1, reps: 8, rest: 90 });

      store().removeExercise(firstExercise().id);

      expect(store().workout!.exercises.map((e) => e.orderIndex)).toEqual([0, 1]);
    });

    it('can empty the session without clearing it', () => {
      startWithOneCompletedSet();

      store().removeExercise(firstExercise().id);

      // An empty session is still a session -- the logger shows its own empty
      // state rather than bouncing the lifter back to Today.
      expect(store().workout).not.toBeNull();
      expect(store().workout!.exercises).toHaveLength(0);
    });
  });

  describe('addExercise()', () => {
    it('applies the given defaults to every set it generates', () => {
      store().start({ profileId: 'p1', title: 'X', routineDay: null });

      store().addExercise('ex-9', { sets: 2, reps: 6, rest: 90 });

      expect(firstExercise().exerciseId).toBe('ex-9');
      expect(firstExercise().sets).toHaveLength(2);
      for (const s of firstExercise().sets) {
        expect(s.reps).toBe(6);
        expect(s.restSeconds).toBe(90);
        expect(s.completed).toBe(false);
      }
      expect(firstExercise().sets.map((s) => s.setIndex)).toEqual([0, 1]);
    });

    it('appends after whatever is already in the session, leaving it untouched', () => {
      startWithOneCompletedSet();
      const original = firstExercise().id;

      store().addExercise('ex-2', { sets: 1, reps: 8, rest: 90 });

      expect(store().workout!.exercises).toHaveLength(2);
      expect(store().workout!.exercises[0].id).toBe(original);
      expect(store().workout!.exercises[1].exerciseId).toBe('ex-2');
      expect(store().workout!.exercises[1].orderIndex).toBe(1);
    });

    it('does nothing when there is no session', () => {
      store().addExercise('ex-9', { sets: 2, reps: 6, rest: 90 });
      expect(store().workout).toBeNull();
    });
  });

  describe('toggleSetComplete()', () => {
    it('marks the set complete, records it as the last one, and starts the rest timer', () => {
      store().start({ profileId: 'p1', title: 'Lower — Hinge', routineDay: day });
      const setId = firstExercise().sets[0].id;

      store().toggleSetComplete(setId, 90);

      expect(firstExercise().sets[0].completed).toBe(true);
      expect(store().lastCompletedSetId).toBe(setId);
      expect(store().restTimer).not.toBeNull();
      expect(store().restTimer!.setId).toBe(setId);
      expect(store().restTimer!.durationSeconds).toBe(90);
    });

    it('does not start a rest timer when restSeconds is zero', () => {
      store().start({ profileId: 'p1', title: 'Lower — Hinge', routineDay: day });
      const setId = firstExercise().sets[0].id;

      store().toggleSetComplete(setId, 0);

      expect(firstExercise().sets[0].completed).toBe(true);
      expect(store().restTimer).toBeNull();
    });

    it('un-completing clears both the last-completed marker and the rest timer', () => {
      store().start({ profileId: 'p1', title: 'Lower — Hinge', routineDay: day });
      const setId = firstExercise().sets[0].id;
      store().toggleSetComplete(setId, 90);
      expect(store().restTimer).not.toBeNull(); // sanity: the first toggle did start one

      store().toggleSetComplete(setId, 90);

      expect(firstExercise().sets[0].completed).toBe(false);
      expect(store().lastCompletedSetId).toBeNull();
      expect(store().restTimer).toBeNull();
    });

    it('does nothing when there is no session', () => {
      store().toggleSetComplete('whatever', 90);
      expect(store().workout).toBeNull();
      expect(store().restTimer).toBeNull();
    });
  });

  describe('reorderExercise()', () => {
    function startWithThreeExercises() {
      store().start({ profileId: 'p1', title: 'X', routineDay: null });
      store().addExercise('ex-a', { sets: 1, reps: 8, rest: 90 });
      store().addExercise('ex-b', { sets: 1, reps: 8, rest: 90 });
      store().addExercise('ex-c', { sets: 1, reps: 8, rest: 90 });
    }
    const exerciseIds = () => store().workout!.exercises.map((e) => e.exerciseId);
    const orderIndexes = () => store().workout!.exercises.map((e) => e.orderIndex);

    it('swaps a middle exercise with the one above it', () => {
      startWithThreeExercises();
      const middle = store().workout!.exercises[1].id;

      store().reorderExercise(middle, 'up');

      expect(exerciseIds()).toEqual(['ex-b', 'ex-a', 'ex-c']);
      // Re-indexed to match the new positions, not left stale.
      expect(orderIndexes()).toEqual([0, 1, 2]);
    });

    it('swaps a middle exercise with the one below it', () => {
      startWithThreeExercises();
      const middle = store().workout!.exercises[1].id;

      store().reorderExercise(middle, 'down');

      expect(exerciseIds()).toEqual(['ex-a', 'ex-c', 'ex-b']);
      expect(orderIndexes()).toEqual([0, 1, 2]);
    });

    it('does nothing when asked to move the top exercise up', () => {
      startWithThreeExercises();
      const top = store().workout!.exercises[0].id;

      store().reorderExercise(top, 'up');

      expect(exerciseIds()).toEqual(['ex-a', 'ex-b', 'ex-c']);
    });

    it('does nothing when asked to move the bottom exercise down', () => {
      startWithThreeExercises();
      const bottom = store().workout!.exercises[2].id;

      store().reorderExercise(bottom, 'down');

      expect(exerciseIds()).toEqual(['ex-a', 'ex-b', 'ex-c']);
    });

    it('does nothing for an id that is not in the session', () => {
      startWithThreeExercises();

      store().reorderExercise('not-a-real-id', 'up');

      expect(exerciseIds()).toEqual(['ex-a', 'ex-b', 'ex-c']);
    });

    it('does nothing when there is no session', () => {
      store().reorderExercise('whatever', 'up');
      expect(store().workout).toBeNull();
    });
  });

  describe('setExerciseNotes()', () => {
    it('sets notes on the matching exercise only', () => {
      startWithOneCompletedSet();
      store().addExercise('ex-2', { sets: 1, reps: 8, rest: 90 });
      const [a, b] = store().workout!.exercises;

      store().setExerciseNotes(a.id, 'Felt heavy today');

      expect(store().workout!.exercises.find((e) => e.id === a.id)!.notes).toBe(
        'Felt heavy today',
      );
      expect(store().workout!.exercises.find((e) => e.id === b.id)!.notes).toBeNull();
    });

    it('does nothing when there is no session', () => {
      store().setExerciseNotes('whatever', 'x');
      expect(store().workout).toBeNull();
    });
  });
});

/**
 * Rest timer control.
 *
 * `toggleSetComplete()` is the usual way a timer starts (covered above); these
 * exercise the three actions the rest bar itself calls directly -- the ±15s
 * adjustment buttons and skip.
 */
describe('rest timer control', () => {
  describe('startRest()', () => {
    it('sets a timer ending the given number of seconds from now', () => {
      const before = Date.now();

      store().startRest(60, 'set-1');

      const after = Date.now();
      expect(store().restTimer).toMatchObject({ durationSeconds: 60, setId: 'set-1' });
      expect(store().restTimer!.endsAt).toBeGreaterThanOrEqual(before + 60_000);
      expect(store().restTimer!.endsAt).toBeLessThanOrEqual(after + 60_000);
    });
  });

  describe('adjustRest()', () => {
    it('moves the end time and the displayed duration together', () => {
      store().startRest(60, 'set-1');
      const before = store().restTimer!.endsAt;

      store().adjustRest(15);

      expect(store().restTimer!.durationSeconds).toBe(75);
      expect(store().restTimer!.endsAt).toBe(before + 15_000);
    });

    it('clamps the duration at zero rather than going negative', () => {
      store().startRest(10, 'set-1');

      store().adjustRest(-999);

      expect(store().restTimer!.durationSeconds).toBe(0);
    });

    it('clamps the end time so it can never move into the past', () => {
      store().startRest(5, 'set-1');
      // What the end time would be with no clamp at all -- used only to prove
      // the clamp actually engaged, not just that the result looks plausible.
      const unclamped = store().restTimer!.endsAt - 120_000;
      // Captured before the store computes its own Date.now() inside
      // adjustRest(), not after -- asserting against a bound taken afterward
      // races the two calls and can fail by a stray millisecond.
      const before = Date.now();

      store().adjustRest(-120);

      expect(store().restTimer!.endsAt).toBeGreaterThanOrEqual(before);
      expect(store().restTimer!.endsAt).toBeGreaterThan(unclamped);
    });

    it('does nothing when there is no active rest timer', () => {
      store().adjustRest(15);
      expect(store().restTimer).toBeNull();
    });
  });

  describe('clearRest()', () => {
    it('clears an active timer', () => {
      store().startRest(60, 'set-1');

      store().clearRest();

      expect(store().restTimer).toBeNull();
    });

    it('is safe to call when there is no timer', () => {
      store().clearRest();
      expect(store().restTimer).toBeNull();
    });
  });
});

/**
 * The subjective half of a session -- captured on the summary screen, stored
 * on the workout itself so it round-trips through the same save as everything
 * else (`Docs/sprints/2026-08-03-workout-history-v1.md`).
 */
describe('session reflection and rating', () => {
  describe('setReflection()', () => {
    it('sets the reflection text on the session', () => {
      store().start({ profileId: 'p1', title: 'X', routineDay: null });

      store().setReflection('Bar speed held all the way up.');

      expect(store().workout!.reflection).toBe('Bar speed held all the way up.');
    });

    it('does nothing when there is no session', () => {
      store().setReflection('x');
      expect(store().workout).toBeNull();
    });
  });

  describe('setRating()', () => {
    it('sets the session rating', () => {
      store().start({ profileId: 'p1', title: 'X', routineDay: null });

      store().setRating(4);

      expect(store().workout!.sessionRating).toBe(4);
    });

    it('does nothing when there is no session', () => {
      store().setRating(4);
      expect(store().workout).toBeNull();
    });
  });
});

/**
 * Selectors.
 *
 * These are not incidental helpers: they are what two user-facing counts are
 * built from. `selectCompletedSetCount`/`selectTotalSetCount` render the
 * logger's "Sets done n/m" header and the "n/m sets logged" line on Today's
 * recovered-session card (`Docs/ui-ux-foundation-v1.md` §4.2, §4.4), so a
 * miscount here is a miscount a lifter reads mid-session.
 *
 * Note "Sets done" counts every ticked set INCLUDING warm-ups, which is
 * deliberately not the summary's warm-up-excluding "Working sets" -- the two
 * numbers are different on purpose and the labels were split so they stop
 * looking equivalent (`logger-ux-polish` §2 B).
 */
describe('selectors', () => {
  it('count completed and total sets across every exercise, warm-ups included', () => {
    store().start({ profileId: 'p1', title: 'X', routineDay: day });
    store().addExercise('ex-2', { sets: 3, reps: 8, rest: 90 });

    const first = store().workout!.exercises[0].sets[0];
    const warmup = store().workout!.exercises[1].sets[0];
    store().updateSet(warmup.id, { type: 'warmup' });
    store().toggleSetComplete(first.id, 0);
    store().toggleSetComplete(warmup.id, 0);

    expect(selectTotalSetCount(store())).toBe(5);
    // Two ticked, one of which is a warm-up -- "Sets done" counts it.
    expect(selectCompletedSetCount(store())).toBe(2);
  });

  it('report zero and no active workout when there is no session', () => {
    expect(selectHasActiveWorkout(store())).toBe(false);
    expect(selectCompletedSetCount(store())).toBe(0);
    expect(selectTotalSetCount(store())).toBe(0);
  });

  it('report an active workout once one is started, and none again after discard', () => {
    store().start({ profileId: 'p1', title: 'X', routineDay: day });
    expect(selectHasActiveWorkout(store())).toBe(true);

    store().discard();
    expect(selectHasActiveWorkout(store())).toBe(false);
  });
});
