import { computeReadiness, estimateRecovery } from '@/domain/calc';
import { getRepository, resetDemoData } from '@/data/repository';
import { EXERCISE_BY_ID } from '@/data/exerciseLibrary';
import {
  selectCompletedWorkouts,
  selectTodaysCheckIn,
  useTrainingStore,
} from '../trainingStore';
import type { CheckIn } from '@/domain/types';

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
  return {
    id: existing?.id ?? 'ci_test',
    profileId: useTrainingStore.getState().profile!.id,
    checkedInAt: todayAt(23, 30),
    sleepQuality: null,
    energy: null,
    soreness: null,
    stress: null,
    note: existing?.note ?? null,
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
});
