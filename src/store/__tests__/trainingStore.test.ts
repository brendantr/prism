import { computeReadiness, estimateRecovery } from '@/domain/calc';
import { getRepository, resetDemoData } from '@/data/repository';
import { EXERCISE_BY_ID } from '@/data/exerciseLibrary';
import {
  selectCompletedWorkouts,
  selectLatestCheckIn,
  selectTodaysCheckIn,
  useTrainingStore,
} from '../trainingStore';
import type { CheckIn } from '@/domain/types';
import { deviceLocalDate } from '@/domain/trainingDay';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

/**
 * The check-in submit boundary.
 *
 * `CheckInPrompt` holds the 1-5 taps in local `useState` and only reaches the
 * store when the lifter presses "Update readiness". No component test framework
 * is installed (deliberately -- see the sprint's Decision 6), so the tap itself
 * cannot be driven here. What CAN be pinned down is the layer the component
 * crosses into: the store action is the only bridge to the repository, it fires
 * once per explicit submit, and what it writes is what readiness then reads.
 */

/** A fixed late-today timestamp, so the saved record always sorts newest. */
function todayAt(hour: number, minute: number): string {
  const d = new Date();
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

/** Exactly the object `CheckInPrompt.submit` builds from its draft. */
function submission(draft: Partial<CheckIn>): CheckIn {
  const existing = selectTodaysCheckIn(useTrainingStore.getState());
  const checkedInAt = todayAt(23, 30);
  return {
    id: existing?.id ?? 'ci_test',
    profileId: useTrainingStore.getState().profile!.id,
    localDate: deviceLocalDate(checkedInAt),
    checkedInAt,
    sleepQuality: null,
    energy: null,
    soreness: null,
    stress: null,
    ...draft,
  };
}

function readinessNow() {
  const s = useTrainingStore.getState();
  const completed = selectCompletedWorkouts(s);
  return computeReadiness({
    profile: s.profile!,
    workouts: completed,
    recovery: estimateRecovery(completed, s.exerciseById),
    targetMuscles: [],
    latestCheckIn: selectTodaysCheckIn(s),
  });
}

const wellbeingOf = (r: ReturnType<typeof readinessNow>) =>
  r.factors.find((f) => f.key === 'wellbeing')!;

describe('check-in submit boundary', () => {
  beforeEach(async () => {
    await resetDemoData();
    useTrainingStore.setState({ status: 'idle' });
    await useTrainingStore.getState().refresh();
  });

  it('reaches the repository only when the submit action is called', async () => {
    const spy = jest.spyOn(getRepository(), 'saveCheckIn');

    // Building a draft -- what every 1-5 tap does -- touches nothing outside
    // the component. No store write, no repository call.
    const draft = { sleepQuality: 5, energy: 4, soreness: null, stress: null };
    const before = useTrainingStore.getState().checkIns;
    expect(spy).not.toHaveBeenCalled();
    expect(useTrainingStore.getState().checkIns).toBe(before);

    await useTrainingStore.getState().saveCheckIn(submission(draft));

    expect(spy).toHaveBeenCalledTimes(1);
    expect(useTrainingStore.getState().checkIns).not.toBe(before);
    spy.mockRestore();
  });

  it('leaves the readiness score untouched until the submit action runs', async () => {
    const before = readinessNow();

    // A draft that would move the score a long way, if it were wired through.
    const draft = { sleepQuality: 1, energy: 1, soreness: 5, stress: 5 };
    expect(readinessNow().score).toBe(before.score);
    expect(wellbeingOf(readinessNow()).score).toBe(wellbeingOf(before).score);

    await useTrainingStore.getState().saveCheckIn(submission(draft));

    // Only now does the store hold it, and only now does readiness see it.
    expect(wellbeingOf(readinessNow()).score).toBe(0);
  });

  it('recomputes readiness from whatever the submit action saved', async () => {
    await useTrainingStore
      .getState()
      .saveCheckIn(submission({ sleepQuality: 5, energy: 5, soreness: 1, stress: 1 }));
    const best = readinessNow();
    expect(wellbeingOf(best).score).toBe(1);
    expect(wellbeingOf(best).sufficient).toBe(true);

    await useTrainingStore
      .getState()
      .saveCheckIn(submission({ sleepQuality: 1, energy: 1, soreness: 5, stress: 5 }));
    const worst = readinessNow();
    expect(wellbeingOf(worst).score).toBe(0);

    expect(best.score!).toBeGreaterThan(worst.score!);
  });

  it('drops a cleared field from readiness instead of resurrecting it', async () => {
    await useTrainingStore
      .getState()
      .saveCheckIn(submission({ sleepQuality: 1, energy: 5, soreness: 1, stress: 1 }));
    const before = wellbeingOf(readinessNow());
    expect(before.missing).toBeUndefined();

    // Clearing sleep is exactly what tapping the selected chip does.
    await useTrainingStore
      .getState()
      .saveCheckIn(submission({ sleepQuality: null, energy: 5, soreness: 1, stress: 1 }));

    // A full reload, so this proves the repository agrees -- not just the
    // in-memory copy the save happened to leave behind.
    useTrainingStore.setState({ status: 'idle' });
    await useTrainingStore.getState().refresh();

    const today = selectTodaysCheckIn(useTrainingStore.getState());
    expect(today!.sleepQuality).toBeNull();

    const after = wellbeingOf(readinessNow());
    expect(after.missing).toEqual(['Sleep quality']);
    expect(after.sufficient).toBe(true);
    // Sleep was the one weak input; dropping it honestly raises what is left,
    // rather than the old answer quietly coming back.
    expect(after.score).toBeGreaterThan(before.score);
  });

  it('exposes the saved check-in as today’s, so the compact state can show', async () => {
    await useTrainingStore.getState().saveCheckIn(submission({ sleepQuality: 4 }));

    const today = selectTodaysCheckIn(useTrainingStore.getState());
    expect(today).not.toBeNull();
    expect(today!.sleepQuality).toBe(4);
  });

  it('keeps the stored row id when a fresh-id submission reuses the local date', async () => {
    const first = submission({ sleepQuality: 4 });
    await useTrainingStore.getState().saveCheckIn(first);
    await useTrainingStore
      .getState()
      .saveCheckIn({ ...submission({ energy: 2 }), id: 'different_submission_id' });

    const today = selectTodaysCheckIn(useTrainingStore.getState());
    expect(today?.id).toBe(first.id);
    expect(
      useTrainingStore.getState().checkIns.filter((c) => c.localDate === first.localDate),
    ).toHaveLength(1);
  });
});

describe('check-in date selectors', () => {
  const checkIn = (id: string, localDate: string, checkedInAt: string): CheckIn => ({
    id,
    profileId: 'p1',
    localDate,
    checkedInAt,
    sleepQuality: 4,
    energy: 4,
    soreness: 2,
    stress: 2,
  });

  it('selects today by local date even when a later timestamp belongs to another date', () => {
    const reference = new Date('2026-03-03T12:00:00.000Z');
    const today = deviceLocalDate(reference);
    useTrainingStore.setState({
      checkIns: [
        checkIn('today', today, '2026-03-03T11:00:00.000Z'),
        checkIn('later', '2099-01-01', '2026-03-03T13:00:00.000Z'),
      ],
    });

    expect(selectLatestCheckIn(useTrainingStore.getState())?.id).toBe('later');
    expect(selectTodaysCheckIn(useTrainingStore.getState(), reference)?.id).toBe('today');
  });

  it('does not infer today from a matching UTC timestamp date', () => {
    const reference = new Date('2026-03-03T12:00:00.000Z');
    useTrainingStore.setState({
      checkIns: [checkIn('other-local-day', '1999-12-31', '2026-03-03T12:00:00.000Z')],
    });

    expect(selectTodaysCheckIn(useTrainingStore.getState(), reference)).toBeNull();
  });
});

describe('favourite exercises', () => {
  /*
    `favouriteExerciseIds` used to be seeded with four `exerciseLibrary` slugs --
    ids that exist only in the bundled catalogue demo mode reads from. Against
    Supabase the same movements carry `gen_random_uuid()` ids, so on a real
    account the four pre-set favourites matched nothing, and tapping the
    "Favourites" chip in the exercise list or the workout picker filtered a
    43-movement library down to "Nothing matches those filters".
  */
  beforeEach(() => {
    useTrainingStore.getState().reset();
  });

  it('starts empty rather than pre-starring ids that may not exist', () => {
    expect(useTrainingStore.getState().favouriteExerciseIds).toEqual([]);
  });

  it('stars and unstars whatever id the library actually uses', () => {
    // The half that always worked: `toggleFavourite` keys on the id it is
    // given, so a UUID from Supabase is as good as a bundled slug.
    const uuid = 'c4e2a9f1-8b7d-4c3e-a6f0-15d9e7b2c084';
    const { toggleFavourite } = useTrainingStore.getState();

    toggleFavourite(uuid);
    expect(useTrainingStore.getState().favouriteExerciseIds).toEqual([uuid]);

    toggleFavourite(uuid);
    expect(useTrainingStore.getState().favouriteExerciseIds).toEqual([]);
  });

  it('is cleared by reset, which sign-out relies on (I-19)', () => {
    // `reset()` restores the shared `INITIAL_DATA` constant, so this field is
    // torn down on sign-out for free. Changing its default must not break that.
    useTrainingStore.getState().toggleFavourite('ex_bench_press');
    useTrainingStore.getState().reset();

    expect(useTrainingStore.getState().favouriteExerciseIds).toEqual([]);
  });
});
