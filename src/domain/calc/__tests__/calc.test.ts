import { estimateOneRepMax, isE1rmExtrapolated, weightForReps, E1RM_REP_CAP } from '../oneRepMax';
import { setVolume, setsVolume, isVolumeSet } from '../volume';
import { evaluateSetForPr, detectWorkoutPrs, bestsFromHistory, e1rmSeries } from '../prs';
import { estimatedRecoveryWindowHours, estimateRecovery, recoveryStatus } from '../recovery';
import { recommendNextLoad, loadIncrementKg, roundToIncrement, comparableSessions } from '../loadRecommendation';
import { completedThisWeek, computeReadiness, startOfIsoWeek } from '../readiness';
import { EXERCISE_BY_ID } from '@/data/exerciseLibrary';
import { generateDemoData } from '@/data/demoSeed';
import type { Exercise, Profile, Workout, WorkoutSet } from '../../types';

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
  it('returns the weight itself for a single', () => {
    expect(estimateOneRepMax(100, 1)).toBeCloseTo(100 * (1 + 1 / 30), 6);
  });

  it('matches the formula weight * (1 + reps / 30)', () => {
    expect(estimateOneRepMax(100, 5)).toBeCloseTo(116.667, 3);
    expect(estimateOneRepMax(80, 8)).toBeCloseTo(101.333, 3);
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

  it('stays within 0-100 and exposes all four factors', () => {
    const result = computeReadiness({
      profile,
      workouts: [],
      recovery: estimateRecovery([], EXERCISE_BY_ID),
      targetMuscles: [],
      latestCheckIn: null,
    });
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
    expect(result.factors).toHaveLength(4);
    expect(result.factors.every((f) => f.detail.length > 0)).toBe(true);
  });

  it('weights sum to 1', () => {
    const result = computeReadiness({
      profile,
      workouts: [],
      recovery: estimateRecovery([], EXERCISE_BY_ID),
      targetMuscles: [],
      latestCheckIn: null,
    });
    expect(result.factors.reduce((s, f) => s + f.weight, 0)).toBeCloseTo(1, 6);
  });

  it('scores a rested lifter above a fatigued one', () => {
    const now = new Date('2026-06-10T09:00:00Z');
    const yesterday = workout([set()], { startedAt: '2026-06-09T18:00:00.000Z' });

    const rested = computeReadiness({
      profile,
      workouts: [],
      recovery: estimateRecovery([], EXERCISE_BY_ID, now),
      targetMuscles: ['chest'],
      latestCheckIn: null,
      now,
    });
    const fatigued = computeReadiness({
      profile,
      workouts: [yesterday],
      recovery: estimateRecovery([yesterday], EXERCISE_BY_ID, now),
      targetMuscles: ['chest'],
      latestCheckIn: null,
      now,
    });
    expect(rested.score).toBeGreaterThan(fatigued.score);
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
