import { estimateOneRepMax, isE1rmExtrapolated, weightForReps, E1RM_REP_CAP } from '../oneRepMax';
import { setVolume, setsVolume, isVolumeSet } from '../volume';
import { evaluateSetForPr, detectWorkoutPrs, bestsFromHistory, e1rmSeries } from '../prs';
import { estimatedRecoveryWindowHours, estimateRecovery, recoveryStatus } from '../recovery';
import { recommendNextLoad, loadIncrementKg, roundToIncrement, comparableSessions } from '../loadRecommendation';
import {
  completedThisWeek,
  computeReadiness,
  startOfIsoWeek,
  READINESS_WEIGHTS,
} from '../readiness';
import { EXERCISE_BY_ID } from '@/data/exerciseLibrary';
import { generateDemoData } from '@/data/demoSeed';
import type { CheckIn, Exercise, Profile, Workout, WorkoutSet } from '../../types';

// --- Fixtures --------------------------------------------------------------

let setSeq = 0;
function set(partial: Partial<WorkoutSet> = {}): WorkoutSet {
  return {
    id: `s${setSeq++}`,
    workoutExerciseId: 'we1',
    setIndex: 0,
    type: 'working',
    weightKg: 100,
    reps: 5,
    rpe: 8,
    completed: true,
    restSeconds: 120,
    notes: null,
    ...partial,
  };
}

function workout(sets: WorkoutSet[], overrides: Partial<Workout> = {}): Workout {
  return {
    id: 'w1',
    profileId: 'p1',
    routineDayId: null,
    title: 'Test',
    status: 'completed',
    startedAt: '2026-06-01T18:00:00.000Z',
    endedAt: '2026-06-01T19:00:00.000Z',
    reflection: null,
    sessionRating: null,
    exercises: [{ id: 'we1', workoutId: 'w1', exerciseId: 'ex_bench_press', orderIndex: 0, notes: null, sets }],
    ...overrides,
  };
}

const BENCH = EXERCISE_BY_ID.get('ex_bench_press') as Exercise;

// --- Epley -----------------------------------------------------------------

describe('estimated 1RM (Epley)', () => {
  /*
    This test was previously named for the documented behaviour and asserted
    the opposite of it -- `toBeCloseTo(100 * (1 + 1 / 30))`, i.e. 103.33 under
    the heading "returns the weight itself for a single". It therefore locked
    in the bug under a name that read as a guarantee against it. Asserting the
    literal expected value, not a restatement of the implementation, is the
    point: a test that recomputes the formula can only ever agree with it.
  */
  it('returns the weight itself for a single', () => {
    expect(estimateOneRepMax(100, 1)).toBe(100);
    expect(estimateOneRepMax(142.5, 1)).toBe(142.5);
  });

  it('matches the formula weight * (1 + reps / 30) above one rep', () => {
    expect(estimateOneRepMax(100, 5)).toBeCloseTo(116.667, 3);
    expect(estimateOneRepMax(80, 8)).toBeCloseTo(101.333, 3);
  });

  it('never rates a single below a multi-rep set at the same weight', () => {
    // The ordering that matters to a lifter: two reps at 100 is a better
    // showing than one rep at 100, and the single is never inflated past it.
    expect(estimateOneRepMax(100, 1)).toBeLessThan(estimateOneRepMax(100, 2));
  });

  it('does not let an estimate from a single beat the lift itself', () => {
    // The regression this fix exists for. A completed 103 kg single must
    // out-rank a 100 kg single; under the old behaviour the 100 kg single
    // scored 103.33 and swallowed it.
    expect(estimateOneRepMax(103, 1)).toBeGreaterThan(estimateOneRepMax(100, 1));
  });

  it('returns 0 for non-positive input', () => {
    expect(estimateOneRepMax(0, 5)).toBe(0);
    expect(estimateOneRepMax(100, 0)).toBe(0);
    expect(estimateOneRepMax(-50, 5)).toBe(0);
  });

  it('caps reps so a 20-rep set cannot invent a max', () => {
    expect(estimateOneRepMax(60, 20)).toBe(estimateOneRepMax(60, E1RM_REP_CAP));
    expect(isE1rmExtrapolated(20)).toBe(true);
    expect(isE1rmExtrapolated(8)).toBe(false);
  });

  it('inverts cleanly', () => {
    const e1rm = estimateOneRepMax(100, 5);
    expect(weightForReps(e1rm, 5)).toBeCloseTo(100, 6);
  });

  it('inverts cleanly at one rep too', () => {
    // The single-rep rule has to hold on both sides or the round trip breaks.
    // With only `estimateOneRepMax` special-cased, this returned 96.77.
    const e1rm = estimateOneRepMax(100, 1);
    expect(weightForReps(e1rm, 1)).toBeCloseTo(100, 6);
    expect(weightForReps(140, 1)).toBe(140);
  });
});

// --- Volume ----------------------------------------------------------------

describe('training volume', () => {
  it('is weight times reps', () => {
    expect(setVolume(set({ weightKg: 100, reps: 5 }))).toBe(500);
  });

  it('excludes warm-ups', () => {
    expect(setVolume(set({ type: 'warmup' }))).toBe(0);
    expect(isVolumeSet(set({ type: 'warmup' }))).toBe(false);
  });

  it('excludes incomplete sets', () => {
    expect(setVolume(set({ completed: false }))).toBe(0);
  });

  it('counts drop sets and back-offs', () => {
    expect(setVolume(set({ type: 'dropset', weightKg: 60, reps: 10 }))).toBe(600);
    expect(setVolume(set({ type: 'backoff', weightKg: 70, reps: 8 }))).toBe(560);
  });

  it('sums a cluster', () => {
    expect(
      setsVolume([
        set({ weightKg: 100, reps: 5 }),
        set({ weightKg: 100, reps: 4 }),
        set({ weightKg: 60, reps: 5, type: 'warmup' }),
      ]),
    ).toBe(900);
  });
});

// --- PRs -------------------------------------------------------------------

describe('PR detection', () => {
  it('flags an e1RM PR against a lower prior best', () => {
    const result = evaluateSetForPr(set({ weightKg: 100, reps: 5 }), { bestE1rm: 110, bestWeightKg: 105 });
    expect(result.isE1rmPr).toBe(true);
    expect(result.isWeightPr).toBe(false);
  });

  it('flags a weight PR independently of e1RM', () => {
    const result = evaluateSetForPr(set({ weightKg: 120, reps: 1 }), { bestE1rm: 130, bestWeightKg: 115 });
    expect(result.isWeightPr).toBe(true);
    expect(result.isE1rmPr).toBe(false);
  });

  it('refuses an e1RM PR from an extrapolated high-rep set', () => {
    const result = evaluateSetForPr(set({ weightKg: 90, reps: 20 }), { bestE1rm: 100, bestWeightKg: 200 });
    expect(result.isE1rmPr).toBe(false);
  });

  it('reports only the highest PR when a lift improves twice in one session', () => {
    const w = workout([
      set({ weightKg: 105, reps: 5, setIndex: 0 }),
      set({ weightKg: 110, reps: 5, setIndex: 1 }),
    ]);
    const prs = detectWorkoutPrs(w, new Map([['ex_bench_press', { bestE1rm: 100, bestWeightKg: 100 }]]));
    const e1rmPr = prs.find((p) => p.kind === 'e1rm');
    expect(e1rmPr?.weightKg).toBe(110);
    expect(prs.filter((p) => p.kind === 'e1rm')).toHaveLength(1);
  });

  it('ignores warm-ups when rolling up bests', () => {
    const bests = bestsFromHistory([workout([set({ weightKg: 200, reps: 5, type: 'warmup' })])]);
    expect(bests.get('ex_bench_press')?.bestWeightKg ?? 0).toBe(0);
  });
});

// --- Recovery --------------------------------------------------------------

describe('recovery estimate', () => {
  it('stretches the window for a harder session', () => {
    const light = estimatedRecoveryWindowHours('chest', 3);
    const heavy = estimatedRecoveryWindowHours('chest', 12);
    expect(heavy).toBeGreaterThan(light);
  });

  it('clamps the load factor at both ends', () => {
    expect(estimatedRecoveryWindowHours('chest', 0)).toBe(estimatedRecoveryWindowHours('chest', 1));
    expect(estimatedRecoveryWindowHours('chest', 40)).toBe(estimatedRecoveryWindowHours('chest', 20));
  });

  it('reports untrained muscles as fully fresh', () => {
    const recovery = estimateRecovery([], EXERCISE_BY_ID, new Date('2026-06-10T12:00:00Z'));
    expect(recovery.every((r) => r.readiness === 1)).toBe(true);
    expect(recovery.every((r) => r.status === 'fresh')).toBe(true);
  });

  it('recovers monotonically as time passes', () => {
    const w = workout([set()], { startedAt: '2026-06-01T18:00:00.000Z' });
    const at6h = estimateRecovery([w], EXERCISE_BY_ID, new Date('2026-06-02T00:00:00Z'));
    const at48h = estimateRecovery([w], EXERCISE_BY_ID, new Date('2026-06-03T18:00:00Z'));
    const chest6 = at6h.find((r) => r.muscle === 'chest')!;
    const chest48 = at48h.find((r) => r.muscle === 'chest')!;
    expect(chest48.readiness).toBeGreaterThan(chest6.readiness);
  });

  it('maps readiness to a status band', () => {
    expect(recoveryStatus(1)).toBe('fresh');
    expect(recoveryStatus(0.85)).toBe('ready');
    expect(recoveryStatus(0.6)).toBe('moderate');
    expect(recoveryStatus(0.4)).toBe('fatigued');
    expect(recoveryStatus(0.1)).toBe('depleted');
  });
});

// --- Load recommendation ---------------------------------------------------

describe('next-load recommendation', () => {
  const base = (startedAt: string, weightKg: number, reps: number, rpe: number | null): Workout =>
    workout([set({ weightKg, reps, rpe })], { id: `w-${startedAt}`, startedAt });

  it('asks for a first set when there is no history', () => {
    const rec = recommendNextLoad({ exercise: BENCH, workouts: [], targetReps: 5, unit: 'kg' });
    expect(rec.action).toBe('establish');
    expect(rec.confidence).toBe('low');
    expect(rec.rationale.length).toBeGreaterThan(0);
  });

  it('adds load after easy sessions with reps met', () => {
    const rec = recommendNextLoad({
      exercise: BENCH,
      workouts: [
        base('2026-05-20T18:00:00Z', 100, 6, 7),
        base('2026-05-27T18:00:00Z', 100, 6, 7),
        base('2026-06-03T18:00:00Z', 100, 6, 7),
      ],
      targetReps: 5,
      unit: 'kg',
    });
    expect(rec.action).toBe('increase');
    expect(rec.suggestedWeightKg).toBeGreaterThan(100);
    expect(rec.confidence).toBe('high');
  });

  it('holds when RPE is high but reps were met', () => {
    const rec = recommendNextLoad({
      exercise: BENCH,
      workouts: [base('2026-06-03T18:00:00Z', 100, 6, 8.5), base('2026-05-27T18:00:00Z', 100, 6, 9)],
      targetReps: 5,
      unit: 'kg',
    });
    expect(rec.action).toBe('hold');
    expect(rec.suggestedWeightKg).toBe(100);
    expect(rec.deltaKg).toBe(0);
  });

  it('deloads when top sets sit at RPE 9.5+', () => {
    const rec = recommendNextLoad({
      exercise: BENCH,
      workouts: [
        base('2026-06-03T18:00:00Z', 100, 5, 9.5),
        base('2026-05-27T18:00:00Z', 100, 5, 9.5),
        base('2026-05-20T18:00:00Z', 100, 5, 9.5),
      ],
      targetReps: 5,
      unit: 'kg',
    });
    expect(rec.action).toBe('deload');
    expect(rec.suggestedWeightKg).toBeLessThan(100);
  });

  it('deloads after repeatedly missing the rep target', () => {
    const rec = recommendNextLoad({
      exercise: BENCH,
      workouts: [
        base('2026-06-03T18:00:00Z', 100, 3, 7),
        base('2026-05-27T18:00:00Z', 100, 3, 7),
        base('2026-05-20T18:00:00Z', 100, 3, 7),
      ],
      targetReps: 5,
      unit: 'kg',
    });
    expect(rec.action).toBe('deload');
  });

  it('never lets rounding cancel an increase', () => {
    // 1 kg + 5% rounds back to 1 kg on a 2.5 kg barbell increment.
    const rec = recommendNextLoad({
      exercise: BENCH,
      workouts: [base('2026-06-03T18:00:00Z', 1, 8, 6.5), base('2026-05-27T18:00:00Z', 1, 8, 6.5)],
      targetReps: 5,
      unit: 'kg',
    });
    expect(rec.suggestedWeightKg).toBeGreaterThan(1);
  });

  it('only considers the last 3 comparable sessions', () => {
    const workouts = Array.from({ length: 8 }, (_, i) =>
      base(`2026-0${i < 4 ? 5 : 6}-${String((i % 4) * 7 + 1).padStart(2, '0')}T18:00:00Z`, 100, 5, 8),
    );
    expect(comparableSessions(workouts, 'ex_bench_press')).toHaveLength(3);
  });

  it('uses loadable increments per equipment and unit', () => {
    expect(loadIncrementKg('barbell', 'kg')).toBe(2.5);
    expect(loadIncrementKg('dumbbell', 'kg')).toBe(2);
    expect(loadIncrementKg('barbell', 'lb')).toBeCloseTo(2.268, 2);
    // Rounds to the nearest loadable step in both directions.
    expect(roundToIncrement(101, 2.5)).toBe(100);
    expect(roundToIncrement(101.3, 2.5)).toBe(102.5);
    expect(roundToIncrement(103.8, 2.5)).toBe(105);
  });
});

// --- Readiness -------------------------------------------------------------

describe('readiness score', () => {
  const profile: Profile = {
    id: 'p1',
    displayName: 'Test',
    goal: 'hypertrophy',
    experience: 'intermediate',
    trainingDaysPerWeek: 4,
    preferredWeekdays: [1, 2, 4, 5],
    availableEquipment: ['barbell'],
    unit: 'kg',
    bodyweightKg: 80,
    createdAt: '2026-01-01T00:00:00Z',
  };

  const NOW = new Date('2026-06-10T09:00:00Z');

  let checkInSeq = 0;
  function checkIn(partial: Partial<CheckIn> = {}): CheckIn {
    return {
      id: `ci${checkInSeq++}`,
      profileId: 'p1',
      checkedInAt: '2026-06-10T07:00:00.000Z',
      sleepQuality: 4,
      energy: 4,
      soreness: 2,
      stress: 2,
      ...partial,
    };
  }

  /** Enough 28-day volume that the workload factor has a trend to judge. */
  const HISTORY = [
    workout([set()], { id: 'h1', startedAt: '2026-05-18T18:00:00.000Z' }),
    workout([set()], { id: 'h2', startedAt: '2026-05-25T18:00:00.000Z' }),
    workout([set()], { id: 'h3', startedAt: '2026-06-01T18:00:00.000Z' }),
  ];

  /** A lifter with both history and a fresh check-in: every factor has data. */
  const fullyFed = (overrides: Partial<Parameters<typeof computeReadiness>[0]> = {}) =>
    computeReadiness({
      profile,
      workouts: HISTORY,
      recovery: estimateRecovery(HISTORY, EXERCISE_BY_ID, NOW),
      targetMuscles: [],
      latestCheckIn: checkIn(),
      now: NOW,
      ...overrides,
    });

  it('stays within 0-100 and exposes all four factors', () => {
    const result = fullyFed();
    expect(result.confidence).toBe('full');
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
    expect(result.factors).toHaveLength(4);
    expect(result.factors.every((f) => f.detail.length > 0)).toBe(true);
  });

  it('weights sum to 1', () => {
    const result = fullyFed();
    expect(result.factors.reduce((s, f) => s + f.weight, 0)).toBeCloseTo(1, 6);
  });

  it('scores a rested lifter above a fatigued one', () => {
    const yesterday = workout([set()], { id: 'y', startedAt: '2026-06-09T18:00:00.000Z' });
    const fatiguedHistory = [...HISTORY, yesterday];

    const rested = fullyFed({ targetMuscles: ['chest'] });
    const fatigued = fullyFed({
      targetMuscles: ['chest'],
      workouts: fatiguedHistory,
      recovery: estimateRecovery(fatiguedHistory, EXERCISE_BY_ID, NOW),
    });

    // Both sides have full data, so this compares scores, not confidence.
    expect(rested.confidence).toBe('full');
    expect(fatigued.confidence).toBe('full');
    expect(rested.score!).toBeGreaterThan(fatigued.score!);
  });

  // --- Honest insufficiency (ADR-0002 Phase A, invariant I-18) --------------

  it('publishes no score when both training load and check-in are missing', () => {
    const result = computeReadiness({
      profile,
      workouts: [],
      recovery: estimateRecovery([], EXERCISE_BY_ID, NOW),
      targetMuscles: [],
      latestCheckIn: null,
      now: NOW,
    });

    expect(result.score).toBeNull();
    expect(result.band).toBeNull();
    expect(result.confidence).toBe('insufficient');
    // Still explains itself: all four factors are reported, none counted.
    expect(result.factors).toHaveLength(4);
    expect(result.factors.every((f) => f.weight === 0)).toBe(true);
    expect(result.factors.every((f) => f.detail.length > 0)).toBe(true);
  });

  it('never substitutes the old neutral 0.7 for a missing factor', () => {
    const result = computeReadiness({
      profile,
      workouts: [],
      recovery: estimateRecovery([], EXERCISE_BY_ID, NOW),
      targetMuscles: [],
      latestCheckIn: null,
      now: NOW,
    });
    const excluded = result.factors.filter((f) => !f.sufficient);
    expect(excluded.map((f) => f.key).sort()).toEqual(['wellbeing', 'workload']);
    expect(excluded.every((f) => f.score !== 0.7)).toBe(true);
  });

  it('excludes a single insufficient factor and re-normalises the rest', () => {
    // History present (workload has data), no check-in (wellbeing does not).
    const result = computeReadiness({
      profile,
      workouts: HISTORY,
      recovery: estimateRecovery(HISTORY, EXERCISE_BY_ID, NOW),
      targetMuscles: [],
      latestCheckIn: null,
      now: NOW,
    });

    expect(result.score).not.toBeNull();
    expect(result.confidence).toBe('partial');

    const by = (key: string) => result.factors.find((f) => f.key === key)!;
    expect(by('wellbeing').sufficient).toBe(false);
    expect(by('wellbeing').weight).toBe(0);

    // The survivors keep their relative proportions, re-scaled to sum to 1.
    const surviving = 1 - READINESS_WEIGHTS.wellbeing;
    expect(by('recovery').weight).toBeCloseTo(READINESS_WEIGHTS.recovery / surviving, 12);
    expect(by('workload').weight).toBeCloseTo(READINESS_WEIGHTS.workload / surviving, 12);
    expect(by('consistency').weight).toBeCloseTo(READINESS_WEIGHTS.consistency / surviving, 12);
    expect(result.factors.reduce((s, f) => s + f.weight, 0)).toBeCloseTo(1, 12);
  });

  it('judges the workload trend at the history threshold, not below it', () => {
    // chronicWeekly = 28-day volume / 4. Exactly 1 is enough; just under is not.
    const at = (weightKg: number, reps: number) =>
      computeReadiness({
        profile,
        workouts: [workout([set({ weightKg, reps })], { startedAt: '2026-06-01T18:00:00.000Z' })],
        recovery: estimateRecovery([], EXERCISE_BY_ID, NOW),
        targetMuscles: [],
        latestCheckIn: checkIn(),
        now: NOW,
      }).factors.find((f) => f.key === 'workload')!;

    expect(at(1, 4).sufficient).toBe(true); // volume 4 -> chronicWeekly 1
    expect(at(1, 3).sufficient).toBe(false); // volume 3 -> chronicWeekly 0.75
  });

  it('counts a check-in up to 36 hours old and no further', () => {
    const wellbeingAt = (checkedInAt: string) =>
      computeReadiness({
        profile,
        workouts: HISTORY,
        recovery: estimateRecovery(HISTORY, EXERCISE_BY_ID, NOW),
        targetMuscles: [],
        latestCheckIn: checkIn({ checkedInAt }),
        now: NOW,
      }).factors.find((f) => f.key === 'wellbeing')!;

    // NOW is 2026-06-10T09:00Z.
    expect(wellbeingAt('2026-06-08T21:00:00.000Z').sufficient).toBe(true); // exactly 36h
    expect(wellbeingAt('2026-06-08T20:59:00.000Z').sufficient).toBe(false); // 36h 1m
    expect(wellbeingAt('2026-06-10T07:00:00.000Z').sufficient).toBe(true); // this morning
  });

  // --- Data-present behaviour is unchanged ---------------------------------

  it('reproduces the pre-change wellbeing score for a fully answered check-in', () => {
    // The formula this factor used before per-field weighting was introduced.
    const legacyWellbeing = (c: CheckIn) => {
      const n = (v: number) => Math.min(1, Math.max(0, (v - 1) / 4));
      const positives = (n(c.sleepQuality!) + n(c.energy!)) / 2;
      const negatives = (n(c.soreness!) + n(c.stress!)) / 2;
      return Math.min(1, Math.max(0, positives * 0.65 + (1 - negatives) * 0.35));
    };

    for (const c of [
      checkIn({ sleepQuality: 5, energy: 5, soreness: 1, stress: 1 }),
      checkIn({ sleepQuality: 1, energy: 1, soreness: 5, stress: 5 }),
      checkIn({ sleepQuality: 3, energy: 4, soreness: 2, stress: 5 }),
      checkIn({ sleepQuality: 4, energy: 2, soreness: 3, stress: 1 }),
    ]) {
      const factor = fullyFed({ latestCheckIn: c }).factors.find((f) => f.key === 'wellbeing')!;
      expect(factor.sufficient).toBe(true);
      expect(factor.missing).toBeUndefined();
      expect(factor.score).toBeCloseTo(legacyWellbeing(c), 12);
    }
  });

  it('reproduces the pre-change composite when every factor has data', () => {
    const result = fullyFed({ targetMuscles: ['chest'] });
    expect(result.confidence).toBe('full');

    // With nothing excluded, re-normalisation is a no-op: the applied weights
    // are the base weights, so this is the original composite arithmetic.
    const expected = Math.round(
      Math.min(
        1,
        Math.max(
          0,
          result.factors.reduce((sum, f) => sum + f.score * READINESS_WEIGHTS[f.key], 0),
        ),
      ) * 100,
    );
    expect(result.score).toBe(expected);
    for (const f of result.factors) {
      expect(f.weight).toBeCloseTo(READINESS_WEIGHTS[f.key], 12);
    }
  });

  // --- Partial check-ins ---------------------------------------------------

  it('scores a partial check-in from only the fields the lifter answered', () => {
    const factor = fullyFed({
      latestCheckIn: checkIn({ sleepQuality: 5, energy: null, soreness: null, stress: null }),
    }).factors.find((f) => f.key === 'wellbeing')!;

    expect(factor.sufficient).toBe(true);
    // Sleep at 5/5 is the only input, so it is the whole score -- not diluted
    // by a neutral stand-in for the three unanswered fields.
    expect(factor.score).toBeCloseTo(1, 12);
    expect(factor.missing).toEqual(['Energy', 'Soreness', 'Stress']);
  });

  it('distinguishes a partial check-in from a fully answered one', () => {
    const partial = fullyFed({
      latestCheckIn: checkIn({ sleepQuality: 4, energy: null, soreness: null, stress: null }),
    }).factors.find((f) => f.key === 'wellbeing')!;
    const complete = fullyFed({
      latestCheckIn: checkIn({ sleepQuality: 4, energy: 1, soreness: 5, stress: 5 }),
    }).factors.find((f) => f.key === 'wellbeing')!;

    expect(partial.missing).toHaveLength(3);
    expect(complete.missing).toBeUndefined();
    expect(partial.score).not.toBeCloseTo(complete.score, 6);
  });

  it('treats an unanswered field as absent, never as a neutral or zero value', () => {
    const soreOnly = fullyFed({
      latestCheckIn: checkIn({ sleepQuality: null, energy: null, soreness: 5, stress: null }),
    }).factors.find((f) => f.key === 'wellbeing')!;

    // Soreness at its worst is 0 on its own scale; a zero-filled sleep/energy
    // would drag this down further, and a neutral fill would prop it up.
    expect(soreOnly.score).toBeCloseTo(0, 12);
    expect(soreOnly.sufficient).toBe(true);
    expect(soreOnly.missing).toEqual(['Sleep quality', 'Energy', 'Stress']);
  });

  it('treats a check-in with nothing answered as no check-in at all', () => {
    const factor = fullyFed({
      latestCheckIn: checkIn({ sleepQuality: null, energy: null, soreness: null, stress: null }),
    }).factors.find((f) => f.key === 'wellbeing')!;

    expect(factor.sufficient).toBe(false);
    expect(factor.score).not.toBe(0.7);
    expect(factor.missing).toHaveLength(4);
  });

  it('counts only sessions inside the reference week, not everything after it', () => {
    // Three consecutive Mondays, one session each.
    const weeks = [
      workout([set()], { id: 'a', startedAt: '2026-06-01T18:00:00.000Z' }),
      workout([set()], { id: 'b', startedAt: '2026-06-08T18:00:00.000Z' }),
      workout([set()], { id: 'c', startedAt: '2026-06-15T18:00:00.000Z' }),
    ];

    // Each week must see exactly its own session. An unbounded window would
    // report 3 for the first week and silently inflate any streak calculation.
    expect(completedThisWeek(weeks, new Date('2026-06-03T12:00:00Z'))).toBe(1);
    expect(completedThisWeek(weeks, new Date('2026-06-10T12:00:00Z'))).toBe(1);
    expect(completedThisWeek(weeks, new Date('2026-06-17T12:00:00Z'))).toBe(1);
    // A week before any training happened is empty, not "all of it".
    expect(completedThisWeek(weeks, new Date('2026-05-20T12:00:00Z'))).toBe(0);
  });

  it('excludes abandoned and in-progress sessions from the weekly count', () => {
    const mixed = [
      workout([set()], { id: 'x', startedAt: '2026-06-01T18:00:00.000Z' }),
      workout([set()], { id: 'y', startedAt: '2026-06-02T18:00:00.000Z', status: 'in_progress' }),
      workout([set()], { id: 'z', startedAt: '2026-06-03T18:00:00.000Z', status: 'abandoned' }),
    ];
    expect(completedThisWeek(mixed, new Date('2026-06-03T20:00:00Z'))).toBe(1);
  });

  it('starts the ISO week on Monday', () => {
    // 2026-06-10 is a Wednesday.
    expect(startOfIsoWeek(new Date(2026, 5, 10)).getDay()).toBe(1);
    // Sunday must belong to the week that started the previous Monday.
    expect(startOfIsoWeek(new Date(2026, 5, 14)).getDate()).toBe(8);
  });
});

// --- Seed data -------------------------------------------------------------

describe('demo seed', () => {
  const now = new Date('2026-06-10T09:00:00Z');

  it('is deterministic across calls', () => {
    const a = generateDemoData(now);
    const b = generateDemoData(now);
    expect(JSON.stringify(a.workouts)).toBe(JSON.stringify(b.workouts));
  });

  it('covers at least 8 weeks of completed training', () => {
    const data = generateDemoData(now);
    expect(data.workouts.length).toBeGreaterThanOrEqual(25);
    expect(data.workouts.every((w) => w.status === 'completed')).toBe(true);

    const first = new Date(data.workouts[0].startedAt).getTime();
    const last = new Date(data.workouts[data.workouts.length - 1].startedAt).getTime();
    expect((last - first) / 86_400_000).toBeGreaterThanOrEqual(48);
  });

  it('never generates a session in the future', () => {
    const data = generateDemoData(now);
    expect(data.workouts.every((w) => new Date(w.startedAt).getTime() < now.getTime())).toBe(true);
  });

  it('produces personal records and check-ins', () => {
    const data = generateDemoData(now);
    expect(data.personalRecords.length).toBeGreaterThan(0);
    expect(data.checkIns.length).toBeGreaterThan(50);
    expect(data.measurements.length).toBe(8);
  });

  it('builds a chartable e1RM series, one point per session, in date order', () => {
    const data = generateDemoData(now);
    const series = e1rmSeries(data.workouts, 'ex_back_squat');
    // The squat is programmed once a week; 8 weeks minus a skipped session.
    expect(series.length).toBeGreaterThanOrEqual(6);
    expect(series.length).toBeLessThanOrEqual(8);
    expect(series).toEqual([...series].sort((a, b) => a.date.localeCompare(b.date)));
    expect(series.every((p) => p.e1rm > 0 && p.reps > 0)).toBe(true);
  });

  it('shows progressive overload on the main lifts', () => {
    const data = generateDemoData(now);
    const squatSets = data.workouts.flatMap((w) =>
      w.exercises.filter((e) => e.exerciseId === 'ex_back_squat').flatMap((e) => e.sets),
    );
    const firstWeight = squatSets[0].weightKg;
    const lastWeight = squatSets[squatSets.length - 1].weightKg;
    expect(lastWeight).toBeGreaterThan(firstWeight);
  });
});
