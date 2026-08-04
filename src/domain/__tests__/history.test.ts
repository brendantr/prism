import {
  UNKNOWN_EXERCISE_NAME,
  buildSessionDetail,
  groupHistoryByMonth,
  historyTotals,
  listWorkoutHistory,
  monthKey,
  summariseWorkout,
  workoutDurationMinutes,
} from '../history';
import type {
  Exercise,
  PersonalRecord,
  Workout,
  WorkoutExercise,
  WorkoutSet,
  WorkoutStatus,
} from '@/domain/types';

// --- Factories -------------------------------------------------------------

function set(overrides: Partial<WorkoutSet> = {}): WorkoutSet {
  return {
    id: 's1',
    workoutExerciseId: 'we1',
    setIndex: 0,
    type: 'working',
    weightKg: 100,
    reps: 5,
    rpe: 8,
    completed: true,
    restSeconds: 120,
    notes: null,
    ...overrides,
  };
}

function workoutExercise(overrides: Partial<WorkoutExercise> = {}): WorkoutExercise {
  return {
    id: 'we1',
    workoutId: 'w1',
    exerciseId: 'ex_back_squat',
    orderIndex: 0,
    notes: null,
    sets: [set()],
    ...overrides,
  };
}

function workout(overrides: Partial<Workout> = {}): Workout {
  return {
    id: 'w1',
    profileId: 'p1',
    routineDayId: null,
    title: 'Lower — Squat',
    status: 'completed' as WorkoutStatus,
    startedAt: '2026-03-03T10:00:00.000Z',
    endedAt: '2026-03-03T11:00:00.000Z',
    reflection: null,
    sessionRating: null,
    exercises: [workoutExercise()],
    ...overrides,
  };
}

function record(overrides: Partial<PersonalRecord> = {}): PersonalRecord {
  return {
    id: 'pr1',
    profileId: 'p1',
    exerciseId: 'ex_back_squat',
    kind: 'e1rm',
    value: 116.7,
    reps: 5,
    weightKg: 100,
    achievedAt: '2026-03-03T10:00:00.000Z',
    workoutId: 'w1',
    ...overrides,
  };
}

function library(...exercises: Array<Pick<Exercise, 'id' | 'name'>>): Map<string, Exercise> {
  return new Map(
    exercises.map((e) => [
      e.id,
      {
        id: e.id,
        name: e.name,
        equipment: 'barbell',
        primaryMuscles: ['quads'],
        secondaryMuscles: [],
        isUnilateral: false,
        isSystem: true,
      } satisfies Exercise,
    ]),
  );
}

/** An ISO stamp for a local-time date, so month grouping is timezone-proof. */
function localIso(year: number, monthIndex: number, day: number): string {
  return new Date(year, monthIndex, day, 12, 0, 0).toISOString();
}

// --- Duration --------------------------------------------------------------

describe('workoutDurationMinutes', () => {
  it('measures the gap between the two stamps', () => {
    expect(workoutDurationMinutes(workout())).toBe(60);
  });

  it('is null when the session never ended', () => {
    expect(workoutDurationMinutes(workout({ endedAt: null }))).toBeNull();
  });

  it('is null rather than negative when the clock ran backwards', () => {
    const backwards = workout({
      startedAt: '2026-03-03T11:00:00.000Z',
      endedAt: '2026-03-03T10:00:00.000Z',
    });
    expect(workoutDurationMinutes(backwards)).toBeNull();
  });
});

// --- Summary ---------------------------------------------------------------

describe('summariseWorkout', () => {
  it('counts only completed working sets toward volume, sets and reps', () => {
    const entry = summariseWorkout(
      workout({
        exercises: [
          workoutExercise({
            sets: [
              set({ id: 's1', setIndex: 0, type: 'warmup', weightKg: 60, reps: 10 }),
              set({ id: 's2', setIndex: 1, weightKg: 100, reps: 5 }),
              set({ id: 's3', setIndex: 2, weightKg: 100, reps: 4, completed: false }),
            ],
          }),
        ],
      }),
    );

    expect(entry.volumeKg).toBe(500);
    expect(entry.workingSets).toBe(1);
    expect(entry.totalReps).toBe(5);
  });

  it('carries the identity fields the list row renders', () => {
    const entry = summariseWorkout(workout({ sessionRating: 4 }), 2);

    expect(entry).toMatchObject({
      workoutId: 'w1',
      title: 'Lower — Squat',
      exerciseCount: 1,
      durationMinutes: 60,
      prCount: 2,
      sessionRating: 4,
    });
  });

  it('reports no records when none are supplied', () => {
    expect(summariseWorkout(workout()).prCount).toBe(0);
  });
});

// --- List ------------------------------------------------------------------

describe('listWorkoutHistory', () => {
  it('returns nothing for no workouts', () => {
    expect(listWorkoutHistory([])).toEqual([]);
  });

  it('excludes sessions that are not completed', () => {
    const entries = listWorkoutHistory([
      workout({ id: 'w_done' }),
      workout({ id: 'w_open', status: 'in_progress', endedAt: null }),
      workout({ id: 'w_gone', status: 'abandoned' }),
    ]);

    expect(entries.map((e) => e.workoutId)).toEqual(['w_done']);
  });

  it('orders most recent first', () => {
    const entries = listWorkoutHistory([
      workout({ id: 'w_mid', startedAt: '2026-03-02T10:00:00.000Z' }),
      workout({ id: 'w_old', startedAt: '2026-03-01T10:00:00.000Z' }),
      workout({ id: 'w_new', startedAt: '2026-03-03T10:00:00.000Z' }),
    ]);

    expect(entries.map((e) => e.workoutId)).toEqual(['w_new', 'w_mid', 'w_old']);
  });

  it('breaks a same-instant tie on id so the order cannot shift between renders', () => {
    const at = '2026-03-03T10:00:00.000Z';
    const forward = listWorkoutHistory([workout({ id: 'w_a', startedAt: at }), workout({ id: 'w_b', startedAt: at })]);
    const reversed = listWorkoutHistory([workout({ id: 'w_b', startedAt: at }), workout({ id: 'w_a', startedAt: at })]);

    expect(forward.map((e) => e.workoutId)).toEqual(['w_b', 'w_a']);
    expect(reversed.map((e) => e.workoutId)).toEqual(forward.map((e) => e.workoutId));
  });

  it('does not mutate the array it was given', () => {
    const workouts = [
      workout({ id: 'w_old', startedAt: '2026-03-01T10:00:00.000Z' }),
      workout({ id: 'w_new', startedAt: '2026-03-03T10:00:00.000Z' }),
    ];

    listWorkoutHistory(workouts);

    expect(workouts.map((w) => w.id)).toEqual(['w_old', 'w_new']);
  });

  it('counts records against the session that set them', () => {
    const entries = listWorkoutHistory(
      [workout({ id: 'w1' }), workout({ id: 'w2', startedAt: '2026-03-01T10:00:00.000Z' })],
      [
        record({ id: 'pr1', workoutId: 'w1' }),
        record({ id: 'pr2', workoutId: 'w1', kind: 'weight' }),
        record({ id: 'pr3', workoutId: 'w_unrelated' }),
      ],
    );

    expect(entries.find((e) => e.workoutId === 'w1')?.prCount).toBe(2);
    expect(entries.find((e) => e.workoutId === 'w2')?.prCount).toBe(0);
  });
});

// --- Grouping --------------------------------------------------------------

describe('monthKey', () => {
  it('reads the month in local time, matching the date shown on the row', () => {
    expect(monthKey(localIso(2026, 2, 3))).toBe('2026-03');
    expect(monthKey(localIso(2026, 11, 31))).toBe('2026-12');
  });
});

describe('groupHistoryByMonth', () => {
  const entryOn = (id: string, iso: string) => summariseWorkout(workout({ id, startedAt: iso }));

  it('returns nothing for an empty list', () => {
    expect(groupHistoryByMonth([])).toEqual([]);
  });

  it('collects consecutive entries from the same month, preserving their order', () => {
    const months = groupHistoryByMonth([
      entryOn('w3', localIso(2026, 2, 20)),
      entryOn('w2', localIso(2026, 2, 6)),
      entryOn('w1', localIso(2026, 1, 27)),
    ]);

    expect(months.map((m) => m.key)).toEqual(['2026-03', '2026-02']);
    expect(months[0].entries.map((e) => e.workoutId)).toEqual(['w3', 'w2']);
    expect(months[1].entries.map((e) => e.workoutId)).toEqual(['w1']);
  });

  it('groups runs rather than buckets, so an unsorted list is never silently reordered', () => {
    const months = groupHistoryByMonth([
      entryOn('a', localIso(2026, 2, 20)),
      entryOn('b', localIso(2026, 1, 6)),
      entryOn('c', localIso(2026, 2, 1)),
    ]);

    expect(months.map((m) => m.key)).toEqual(['2026-03', '2026-02', '2026-03']);
  });
});

describe('historyTotals', () => {
  it('is all zeroes for an empty history', () => {
    expect(historyTotals([])).toEqual({ sessions: 0, volumeKg: 0, workingSets: 0 });
  });

  it('adds up sessions, volume and working sets', () => {
    const totals = historyTotals([
      summariseWorkout(workout({ id: 'w1' })),
      summariseWorkout(
        workout({
          id: 'w2',
          exercises: [workoutExercise({ sets: [set({ weightKg: 50, reps: 10 }), set({ id: 's2', setIndex: 1 })] })],
        }),
      ),
    ]);

    expect(totals).toEqual({ sessions: 2, volumeKg: 500 + 500 + 500, workingSets: 3 });
  });
});

// --- Detail ----------------------------------------------------------------

describe('buildSessionDetail', () => {
  const exercises = library(
    { id: 'ex_back_squat', name: 'Back Squat' },
    { id: 'ex_leg_press', name: 'Leg Press' },
  );

  it('orders exercises by their logged position and renumbers sets from one', () => {
    const detail = buildSessionDetail(
      workout({
        exercises: [
          workoutExercise({
            id: 'we2',
            exerciseId: 'ex_leg_press',
            orderIndex: 1,
            sets: [set({ id: 's_b', setIndex: 1 }), set({ id: 's_a', setIndex: 0 })],
          }),
          workoutExercise({ id: 'we1', exerciseId: 'ex_back_squat', orderIndex: 0 }),
        ],
      }),
      exercises,
    );

    expect(detail.exercises.map((e) => e.name)).toEqual(['Back Squat', 'Leg Press']);
    expect(detail.exercises[1].sets.map((s) => s.id)).toEqual(['s_a', 's_b']);
    expect(detail.exercises[1].sets.map((s) => s.position)).toEqual([1, 2]);
  });

  it('names an exercise it cannot resolve instead of showing its id', () => {
    const detail = buildSessionDetail(
      workout({ exercises: [workoutExercise({ exerciseId: 'ex_deleted' })] }),
      exercises,
    );

    expect(detail.exercises[0].name).toBe(UNKNOWN_EXERCISE_NAME);
  });

  it('keeps warm-up and unticked sets visible but out of the totals', () => {
    const detail = buildSessionDetail(
      workout({
        exercises: [
          workoutExercise({
            sets: [
              set({ id: 's1', setIndex: 0, type: 'warmup', weightKg: 60, reps: 10 }),
              set({ id: 's2', setIndex: 1, weightKg: 100, reps: 5 }),
              set({ id: 's3', setIndex: 2, weightKg: 100, reps: 3, completed: false }),
            ],
          }),
        ],
      }),
      exercises,
    );

    const line = detail.exercises[0];
    expect(line.sets).toHaveLength(3);
    expect(line.sets.map((s) => s.countsTowardVolume)).toEqual([false, true, false]);
    expect(line.volumeKg).toBe(500);
    expect(line.workingSets).toBe(1);
  });

  it('reports the heaviest counted set, breaking a tie on reps', () => {
    const detail = buildSessionDetail(
      workout({
        exercises: [
          workoutExercise({
            sets: [
              set({ id: 's1', setIndex: 0, weightKg: 100, reps: 5 }),
              set({ id: 's2', setIndex: 1, weightKg: 100, reps: 8 }),
              set({ id: 's3', setIndex: 2, weightKg: 120, reps: 1, completed: false }),
            ],
          }),
        ],
      }),
      exercises,
    );

    expect(detail.exercises[0].topSet).toEqual({ weightKg: 100, reps: 8 });
  });

  it('has no top set when nothing counted', () => {
    const detail = buildSessionDetail(
      workout({ exercises: [workoutExercise({ sets: [set({ completed: false })] })] }),
      exercises,
    );

    expect(detail.exercises[0].topSet).toBeNull();
  });

  it('keeps only the records banked in this session', () => {
    const detail = buildSessionDetail(workout({ id: 'w1' }), exercises, [
      record({ id: 'pr1', workoutId: 'w1' }),
      record({ id: 'pr2', workoutId: 'w9' }),
    ]);

    expect(detail.records.map((r) => r.id)).toEqual(['pr1']);
    expect(detail.entry.prCount).toBe(1);
  });

  it('carries the session reflection and rating through unchanged', () => {
    const detail = buildSessionDetail(
      workout({ reflection: 'Bar speed held all the way up.', sessionRating: 4 }),
      exercises,
    );

    expect(detail.reflection).toBe('Bar speed held all the way up.');
    expect(detail.sessionRating).toBe(4);
  });

  it('handles a session with no exercises at all', () => {
    const detail = buildSessionDetail(workout({ exercises: [] }), exercises);

    expect(detail.exercises).toEqual([]);
    expect(detail.entry.volumeKg).toBe(0);
  });
});
