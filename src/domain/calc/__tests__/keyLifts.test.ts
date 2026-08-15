import {
  KEY_LIFT_LIMIT,
  KEY_LIFT_MIN_SESSIONS,
  KEY_LIFT_WINDOW_DAYS,
  KEY_LIFT_WINDOW_WEEKS,
  selectKeyLifts,
} from '../keyLifts';
import { EXERCISE_BY_ID } from '@/data/exerciseLibrary';
import type { Exercise, SetType, Workout, WorkoutSet } from '../../types';

/**
 * KEY-LIFT SELECTION
 *
 * The defect these cover: Progress chose its four lifts from a hard-coded list
 * of `exerciseLibrary` slugs, which are demo-mode ids. Supabase seeds the same
 * movements with `gen_random_uuid()`, so on a real account nothing matched and
 * the panel was blank forever. Several tests below therefore use UUID-shaped
 * ids on purpose -- a fixture that used the bundled slugs could pass while the
 * original bug was still present.
 */

// --- Fixtures --------------------------------------------------------------

const NOW = new Date('2026-08-09T12:00:00.000Z');

/** UUIDs, deliberately: these are what `0006_seed_library.sql` produces. */
const SQUAT_UUID = '7f3b1c2e-0a4d-4d8a-9c11-2b6e5f8a1d33';
const BENCH_UUID = 'c4e2a9f1-8b7d-4c3e-a6f0-15d9e7b2c084';
const ROW_UUID = '1a9d5e77-3c62-4b40-8f19-6e0c4a2d9b55';

function daysAgo(n: number): string {
  return new Date(NOW.getTime() - n * 86_400_000).toISOString();
}

function exercise(id: string, name: string): Exercise {
  return {
    id,
    name,
    equipment: 'barbell',
    primaryMuscles: ['quads'],
    secondaryMuscles: [],
    isUnilateral: false,
    isSystem: true,
  };
}

const LIBRARY = new Map<string, Exercise>([
  [SQUAT_UUID, exercise(SQUAT_UUID, 'Barbell Back Squat')],
  [BENCH_UUID, exercise(BENCH_UUID, 'Barbell Bench Press')],
  [ROW_UUID, exercise(ROW_UUID, 'Barbell Row')],
]);

interface Entry {
  exerciseId: string;
  weightKg: number;
  reps: number;
  type?: SetType;
  completed?: boolean;
}

let seq = 0;

function session(ago: number, entries: Entry[]): Workout {
  const workoutId = `w${seq++}`;
  return {
    id: workoutId,
    profileId: 'p1',
    routineDayId: null,
    title: 'Session',
    status: 'completed',
    startedAt: daysAgo(ago),
    endedAt: daysAgo(ago),
    reflection: null,
    sessionRating: null,
    exercises: entries.map((entry, i) => ({
      id: `${workoutId}-we${i}`,
      workoutId,
      exerciseId: entry.exerciseId,
      orderIndex: i,
      notes: null,
      sets: [
        {
          id: `${workoutId}-s${i}`,
          workoutExerciseId: `${workoutId}-we${i}`,
          setIndex: 0,
          type: entry.type ?? 'working',
          weightKg: entry.weightKg,
          reps: entry.reps,
          rpe: 8,
          completed: entry.completed ?? true,
          restSeconds: null,
          notes: null,
        } satisfies WorkoutSet,
      ],
    })),
  };
}

const names = (workouts: Workout[], map = LIBRARY) =>
  selectKeyLifts(workouts, map, NOW).map((l) => l.name);

// --- The defect ------------------------------------------------------------

describe('selectKeyLifts against ids that are not bundled slugs', () => {
  /*
    The whole point. Before this function, Progress asked `e1rmSeries` for
    'ex_back_squat' and three siblings; against Supabase every exercise id is a
    UUID, so every series came back empty, every entry failed the two-point
    check, and the panel stayed blank however much the lifter trained.
  */
  it('finds lifts whose ids are UUIDs, which is every real account', () => {
    const history = [
      session(20, [{ exerciseId: SQUAT_UUID, weightKg: 100, reps: 5 }]),
      session(10, [{ exerciseId: SQUAT_UUID, weightKg: 110, reps: 5 }]),
    ];

    const lifts = selectKeyLifts(history, LIBRARY, NOW);

    expect(lifts).toHaveLength(1);
    expect(lifts[0].exerciseId).toBe(SQUAT_UUID);
    expect(lifts[0].name).toBe('Barbell Back Squat');
  });

  it('is not secretly coupled to the bundled catalogue either', () => {
    // The same history under demo mode's slug ids must work identically --
    // the fix must not swap one id space for the other.
    const bench = EXERCISE_BY_ID.get('ex_bench_press') as Exercise;
    const history = [
      session(20, [{ exerciseId: 'ex_bench_press', weightKg: 80, reps: 5 }]),
      session(6, [{ exerciseId: 'ex_bench_press', weightKg: 90, reps: 5 }]),
    ];

    const lifts = selectKeyLifts(history, new Map([['ex_bench_press', bench]]), NOW);

    expect(lifts.map((l) => l.exerciseId)).toEqual(['ex_bench_press']);
  });

  it('never names a lift by a raw id when the exercise is unknown', () => {
    /*
      The old code fell back to `?? id`, which on Supabase would have rendered a
      36-character UUID as the name of a movement. Omitting the row is the
      honest failure: the panel's empty state explains itself, a UUID does not.
    */
    const history = [
      session(20, [{ exerciseId: 'orphaned-id', weightKg: 100, reps: 5 }]),
      session(10, [{ exerciseId: 'orphaned-id', weightKg: 105, reps: 5 }]),
    ];

    expect(selectKeyLifts(history, LIBRARY, NOW)).toEqual([]);
  });
});

// --- Enough data to plot ---------------------------------------------------

describe('selectKeyLifts data thresholds', () => {
  it('returns nothing for an account that has logged nothing', () => {
    expect(selectKeyLifts([], LIBRARY, NOW)).toEqual([]);
  });

  it('needs the movement repeated -- one session is a reading, not a trend', () => {
    const history = [session(5, [{ exerciseId: SQUAT_UUID, weightKg: 100, reps: 5 }])];
    expect(selectKeyLifts(history, LIBRARY, NOW)).toEqual([]);
    expect(KEY_LIFT_MIN_SESSIONS).toBe(2);
  });

  it('counts sessions, not sets: two sets in one session is still one point', () => {
    const history = [
      session(5, [
        { exerciseId: SQUAT_UUID, weightKg: 100, reps: 5 },
        { exerciseId: SQUAT_UUID, weightKg: 105, reps: 5 },
      ]),
    ];
    expect(selectKeyLifts(history, LIBRARY, NOW)).toEqual([]);
  });

  it('ignores sets that do not count toward volume', () => {
    // A warm-up and an unticked set are not evidence of a session's top effort,
    // and `isVolumeSet` already says so -- this pins that the panel agrees.
    const history = [
      session(20, [{ exerciseId: SQUAT_UUID, weightKg: 100, reps: 5 }]),
      session(10, [{ exerciseId: SQUAT_UUID, weightKg: 60, reps: 10, type: 'warmup' }]),
      session(5, [{ exerciseId: SQUAT_UUID, weightKg: 120, reps: 5, completed: false }]),
    ];

    expect(selectKeyLifts(history, LIBRARY, NOW)).toEqual([]);
  });

  it('uses only completed sessions that have actually happened', () => {
    const valid = session(20, [{ exerciseId: SQUAT_UUID, weightKg: 100, reps: 5 }]);
    const inProgress = {
      ...session(10, [{ exerciseId: SQUAT_UUID, weightKg: 110, reps: 5 }]),
      status: 'in_progress' as const,
    };
    const future = session(-1, [{ exerciseId: SQUAT_UUID, weightKg: 120, reps: 5 }]);

    // Only one point is admissible, so there is no trend.
    expect(selectKeyLifts([valid, inProgress, future], LIBRARY, NOW)).toEqual([]);
  });
});

// --- The window ------------------------------------------------------------

describe('selectKeyLifts window', () => {
  it('is eight weeks, the span the section heading quotes', () => {
    expect(KEY_LIFT_WINDOW_DAYS).toBe(56);
    expect(KEY_LIFT_WINDOW_WEEKS).toBe(8);
  });

  it('excludes sessions older than the window', () => {
    /*
      The heading said "8 weeks" while `e1rmSeries` was handed every workout
      ever logged. Demo mode seeds exactly eight weeks, so the label happened to
      be true there and would have quietly lied to anyone with a longer history.
    */
    const history = [
      session(400, [{ exerciseId: SQUAT_UUID, weightKg: 100, reps: 5 }]),
      session(300, [{ exerciseId: SQUAT_UUID, weightKg: 105, reps: 5 }]),
      session(3, [{ exerciseId: SQUAT_UUID, weightKg: 140, reps: 5 }]),
    ];

    // Only one in-window session remains, so there is no trend to draw.
    expect(selectKeyLifts(history, LIBRARY, NOW)).toEqual([]);
  });

  it('measures change from the oldest in-window session, not the oldest ever', () => {
    const history = [
      session(200, [{ exerciseId: SQUAT_UUID, weightKg: 60, reps: 5 }]),
      session(50, [{ exerciseId: SQUAT_UUID, weightKg: 100, reps: 5 }]),
      session(2, [{ exerciseId: SQUAT_UUID, weightKg: 110, reps: 5 }]),
    ];

    const [squat] = selectKeyLifts(history, LIBRARY, NOW);
    expect(squat.points).toHaveLength(2);
    // 110/100 on identical reps: a 10% gain, not the 83% the 60kg start implies.
    // `e1rmSeries` stores each point to two decimals; the displayed percentage
    // is therefore approximately, not mathematically exactly, ten percent.
    expect(squat.change).toBeCloseTo(0.1, 3);
  });

  it('takes a caller-supplied window so callers are not stuck with the default', () => {
    const history = [
      session(30, [{ exerciseId: SQUAT_UUID, weightKg: 100, reps: 5 }]),
      session(2, [{ exerciseId: SQUAT_UUID, weightKg: 110, reps: 5 }]),
    ];

    expect(selectKeyLifts(history, LIBRARY, NOW, { windowDays: 7 })).toEqual([]);
    expect(selectKeyLifts(history, LIBRARY, NOW, { windowDays: 60 })).toHaveLength(1);
  });
});

// --- Ordering --------------------------------------------------------------

describe('selectKeyLifts ordering', () => {
  it('puts the most-trained movement first', () => {
    const history = [
      session(30, [{ exerciseId: BENCH_UUID, weightKg: 80, reps: 5 }]),
      session(25, [{ exerciseId: BENCH_UUID, weightKg: 82.5, reps: 5 }]),
      session(20, [
        { exerciseId: BENCH_UUID, weightKg: 85, reps: 5 },
        { exerciseId: SQUAT_UUID, weightKg: 140, reps: 5 },
      ]),
      session(10, [{ exerciseId: SQUAT_UUID, weightKg: 145, reps: 5 }]),
    ];

    // Squat is much heavier; bench was trained more often, and that wins.
    expect(names(history)).toEqual(['Barbell Bench Press', 'Barbell Back Squat']);
  });

  it('breaks a tie on session count with the heavier lift', () => {
    const history = [
      session(30, [
        { exerciseId: BENCH_UUID, weightKg: 80, reps: 5 },
        { exerciseId: SQUAT_UUID, weightKg: 140, reps: 5 },
      ]),
      session(10, [
        { exerciseId: BENCH_UUID, weightKg: 85, reps: 5 },
        { exerciseId: SQUAT_UUID, weightKg: 145, reps: 5 },
      ]),
    ];

    expect(names(history)).toEqual(['Barbell Back Squat', 'Barbell Bench Press']);
  });

  it('is deterministic when count and load are identical', () => {
    /*
      Candidate ids come out of a Set, whose iteration order follows insertion.
      Without the name tie-break the panel could reorder itself between renders
      for no visible reason, which reads as a bug. Same data, opposite logging
      order, same output.
    */
    const forward = [
      session(30, [
        { exerciseId: ROW_UUID, weightKg: 100, reps: 5 },
        { exerciseId: BENCH_UUID, weightKg: 100, reps: 5 },
      ]),
      session(10, [
        { exerciseId: ROW_UUID, weightKg: 110, reps: 5 },
        { exerciseId: BENCH_UUID, weightKg: 110, reps: 5 },
      ]),
    ];
    const reversed = [
      session(30, [
        { exerciseId: BENCH_UUID, weightKg: 100, reps: 5 },
        { exerciseId: ROW_UUID, weightKg: 100, reps: 5 },
      ]),
      session(10, [
        { exerciseId: BENCH_UUID, weightKg: 110, reps: 5 },
        { exerciseId: ROW_UUID, weightKg: 110, reps: 5 },
      ]),
    ];

    expect(names(forward)).toEqual(['Barbell Bench Press', 'Barbell Row']);
    expect(names(reversed)).toEqual(names(forward));
  });

  it('shows no more lifts than the panel has rows', () => {
    const ids = Array.from({ length: 7 }, (_, i) => `id-${i}`);
    const map = new Map(ids.map((id, i) => [id, exercise(id, `Lift ${i}`)]));
    const history = [
      session(30, ids.map((exerciseId) => ({ exerciseId, weightKg: 100, reps: 5 }))),
      session(10, ids.map((exerciseId) => ({ exerciseId, weightKg: 110, reps: 5 }))),
    ];

    expect(selectKeyLifts(history, map, NOW)).toHaveLength(KEY_LIFT_LIMIT);
    expect(selectKeyLifts(history, map, NOW, { limit: 2 })).toHaveLength(2);
  });
});

// --- What each row reports -------------------------------------------------

describe('selectKeyLifts row values', () => {
  it('reports the latest session as current and the span as points', () => {
    const history = [
      session(30, [{ exerciseId: SQUAT_UUID, weightKg: 100, reps: 5 }]),
      session(20, [{ exerciseId: SQUAT_UUID, weightKg: 105, reps: 5 }]),
      session(4, [{ exerciseId: SQUAT_UUID, weightKg: 110, reps: 5 }]),
    ];

    const [squat] = selectKeyLifts(history, LIBRARY, NOW);
    // Epley at 5 reps: 110 * (1 + 5/30) = 128.33.
    expect(squat.current).toBeCloseTo(128.33, 2);
    expect(squat.points).toHaveLength(3);
    expect(squat.points[0].date < squat.points[2].date).toBe(true);
  });

  it('reports a decline as a negative change rather than hiding it', () => {
    const history = [
      session(30, [{ exerciseId: SQUAT_UUID, weightKg: 120, reps: 5 }]),
      session(5, [{ exerciseId: SQUAT_UUID, weightKg: 100, reps: 5 }]),
    ];

    const [squat] = selectKeyLifts(history, LIBRARY, NOW);
    expect(squat.change).toBeLessThan(0);
    expect(squat.change).toBeCloseTo(-1 / 6, 3);
  });

  it('never divides by a zero baseline', () => {
    // Bodyweight movements log 0 kg. `e1rmSeries` drops those points because
    // their estimate is 0, so a series never starts from zero -- pinned here
    // because `change` would be Infinity if that ever changed.
    const history = [
      session(30, [{ exerciseId: SQUAT_UUID, weightKg: 0, reps: 10 }]),
      session(20, [{ exerciseId: SQUAT_UUID, weightKg: 0, reps: 12 }]),
      session(10, [{ exerciseId: SQUAT_UUID, weightKg: 60, reps: 5 }]),
      session(5, [{ exerciseId: SQUAT_UUID, weightKg: 70, reps: 5 }]),
    ];

    for (const lift of selectKeyLifts(history, LIBRARY, NOW)) {
      expect(Number.isFinite(lift.change)).toBe(true);
      expect(lift.points.every((p) => p.e1rm > 0)).toBe(true);
    }
  });
});
