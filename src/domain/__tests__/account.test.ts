import { canOfferSignOut, countCompletedSets, shouldConfirmSignOut } from '../account';
import type { SessionPhase } from '../routing';
import type { SetType, Workout, WorkoutSet } from '../types';

/**
 * The two rules behind the sign-out surface.
 *
 * Both are pure precisely so they can be tested at all: there is no
 * component-test tooling in this repo by decision
 * (`Docs/sprints/2026-08-01-onboarding-ui-redesign.md` Decision 6), so a rule
 * left inside the screen would have no coverage.
 */

const ALL_PHASES: SessionPhase[] = ['unknown', 'unauthenticated', 'authenticated', 'disabled'];

function set(overrides: Partial<WorkoutSet> = {}): WorkoutSet {
  return {
    id: 'st_1',
    workoutExerciseId: 'we_1',
    setIndex: 0,
    type: 'working',
    weightKg: 100,
    reps: 5,
    rpe: null,
    completed: false,
    restSeconds: null,
    notes: null,
    ...overrides,
  };
}

function workoutWith(sets: WorkoutSet[]): Workout {
  return {
    id: 'wk_1',
    profileId: 'user_a',
    routineDayId: null,
    title: 'Lower A',
    status: 'in_progress',
    startedAt: new Date().toISOString(),
    endedAt: null,
    reflection: null,
    sessionRating: null,
    exercises: [
      { id: 'we_1', workoutId: 'wk_1', exerciseId: 'ex_1', orderIndex: 0, notes: null, sets },
    ],
  };
}

describe('canOfferSignOut', () => {
  it('is false for every phase when the build has no accounts', () => {
    // Covers demo AND misconfigured in one table -- both report authEnabled
    // false, and both must hide the control for the same reason: there is no
    // account to leave.
    for (const sessionPhase of ALL_PHASES) {
      expect(canOfferSignOut({ authEnabled: false, sessionPhase })).toBe(false);
    }
  });

  it('is false until the session actually resolves to authenticated', () => {
    for (const sessionPhase of ALL_PHASES.filter((p) => p !== 'authenticated')) {
      expect(canOfferSignOut({ authEnabled: true, sessionPhase })).toBe(false);
    }
  });

  it('is true only for an authenticated session in a build with accounts', () => {
    expect(canOfferSignOut({ authEnabled: true, sessionPhase: 'authenticated' })).toBe(true);
  });

  it('cannot be true in a build where auth is disabled, even if a phase leaked through', () => {
    // Belt to the braces above: 'authenticated' should be unreachable when auth
    // is disabled, and if it ever were, the control still must not appear.
    expect(canOfferSignOut({ authEnabled: false, sessionPhase: 'authenticated' })).toBe(false);
  });
});

describe('shouldConfirmSignOut', () => {
  it('does not interrupt when there is no session at all', () => {
    expect(shouldConfirmSignOut(null)).toBe(false);
  });

  it('does not interrupt for a session where nothing has been ticked off', () => {
    // D6: an untouched block is a plan, not a record. Confirming its loss is
    // friction with nothing behind it.
    expect(shouldConfirmSignOut(workoutWith([set(), set({ id: 'st_2' })]))).toBe(false);
  });

  it('interrupts as soon as one set is logged', () => {
    expect(
      shouldConfirmSignOut(workoutWith([set({ completed: true }), set({ id: 'st_2' })])),
    ).toBe(true);
  });

  it('counts a completed warm-up as logged work', () => {
    /*
      Warm-ups do not count toward volume, and that is a different question from
      whether the lifter did them. This is the one case where "counts" and "is
      logged work" diverge, so it is pinned rather than left to whoever next
      edits the predicate.
    */
    const warmup: SetType = 'warmup';
    expect(shouldConfirmSignOut(workoutWith([set({ type: warmup, completed: true })]))).toBe(true);
  });

  it('sees completed sets in any exercise, not just the first', () => {
    const workout = workoutWith([set()]);
    workout.exercises.push({
      id: 'we_2',
      workoutId: 'wk_1',
      exerciseId: 'ex_2',
      orderIndex: 1,
      notes: null,
      sets: [set({ id: 'st_9', workoutExerciseId: 'we_2', completed: true })],
    });

    expect(shouldConfirmSignOut(workout)).toBe(true);
  });

  it('does not interrupt for a session with no exercises yet', () => {
    // "Start empty" then immediately signing out.
    expect(shouldConfirmSignOut(workoutWith([]))).toBe(false);
  });
});

describe('countCompletedSets', () => {
  it('is what the confirmation sentence counts, so it agrees with the predicate', () => {
    const workout = workoutWith([
      set({ completed: true }),
      set({ id: 'st_2', completed: true }),
      set({ id: 'st_3' }),
    ]);

    expect(countCompletedSets(workout)).toBe(2);
    expect(shouldConfirmSignOut(workout)).toBe(true);
  });

  it('is zero for no session', () => {
    expect(countCompletedSets(null)).toBe(0);
  });
});
