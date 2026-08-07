import {
  ACCOUNT_EXPORT_FORMAT_VERSION,
  accountExportFilename,
  buildAccountExport,
  isEmptyExport,
  serialiseAccountExport,
  summariseAccountExport,
  type AccountExportSource,
} from '../accountExport';
import type { BodyMeasurement, CheckIn, Exercise, PersonalRecord, Profile, Workout } from '../types';

/**
 * ACCOUNT EXPORT
 * ==============
 * `Docs/invariants.md` I-10's export half. The property under test is
 * **completeness and stability**, not formatting: an export a lifter cannot
 * trust to contain everything, or cannot diff against last month's, does not do
 * the job the invariant asks of it.
 */

const profile: Profile = {
  id: 'p1',
  displayName: 'Lifter',
  goal: 'hypertrophy',
  experience: 'intermediate',
  trainingDaysPerWeek: 4,
  preferredWeekdays: [1, 2, 4, 5],
  availableEquipment: ['barbell'],
  unit: 'kg',
  bodyweightKg: 80,
  createdAt: '2026-01-01T00:00:00.000Z',
};

const exercise = (id: string, isSystem: boolean): Exercise => ({
  id,
  name: id,
  equipment: 'barbell',
  primaryMuscles: ['chest'],
  secondaryMuscles: [],
  isUnilateral: false,
  isSystem,
});

const workout = (id: string, startedAt: string, setCount: number): Workout => ({
  id,
  profileId: 'p1',
  routineDayId: null,
  title: id,
  status: 'completed',
  startedAt,
  endedAt: startedAt,
  reflection: null,
  sessionRating: null,
  exercises: [
    {
      id: `${id}-we`,
      workoutId: id,
      exerciseId: 'ex1',
      orderIndex: 0,
      notes: null,
      sets: Array.from({ length: setCount }, (_, i) => ({
        id: `${id}-s${i}`,
        workoutExerciseId: `${id}-we`,
        setIndex: i,
        type: 'working' as const,
        weightKg: 100,
        reps: 5,
        rpe: 8,
        completed: true,
        restSeconds: 120,
        notes: null,
      })),
    },
  ],
});

const checkIn = (id: string, at: string): CheckIn => ({
  id,
  profileId: 'p1',
  checkedInAt: at,
  sleepQuality: 4,
  energy: 4,
  soreness: 2,
  stress: 2,
});

const measurement = (id: string, at: string): BodyMeasurement => ({
  id,
  profileId: 'p1',
  measuredAt: at,
  bodyweightKg: 80,
  bodyFatPct: null,
  circumferencesCm: {},
});

const record = (id: string, at: string): PersonalRecord => ({
  id,
  profileId: 'p1',
  exerciseId: 'ex1',
  kind: 'e1rm',
  value: 116.67,
  reps: 5,
  weightKg: 100,
  achievedAt: at,
  workoutId: 'w1',
});

const source = (overrides: Partial<AccountExportSource> = {}): AccountExportSource => ({
  profile,
  exercises: [exercise('sys1', true), exercise('mine1', false)],
  workouts: [workout('w2', '2026-02-01T10:00:00.000Z', 2), workout('w1', '2026-01-01T10:00:00.000Z', 3)],
  checkIns: [checkIn('c2', '2026-02-01T07:00:00.000Z'), checkIn('c1', '2026-01-01T07:00:00.000Z')],
  measurements: [measurement('m1', '2026-01-01T07:00:00.000Z')],
  personalRecords: [record('r1', '2026-01-01T10:00:00.000Z')],
  ...overrides,
});

const AT = '2026-08-06T12:00:00.000Z';

describe('buildAccountExport', () => {
  it('carries a format version, so a file can say what it is years later', () => {
    expect(buildAccountExport(source(), AT).formatVersion).toBe(ACCOUNT_EXPORT_FORMAT_VERSION);
  });

  it('includes every stored table', () => {
    const exported = buildAccountExport(source(), AT);

    // The completeness guarantee I-10 actually asks for. A table silently
    // missing from an export is the failure this assertion exists to catch.
    expect(exported.profile).toEqual(profile);
    expect(exported.workouts).toHaveLength(2);
    expect(exported.checkIns).toHaveLength(2);
    expect(exported.measurements).toHaveLength(1);
    expect(exported.personalRecords).toHaveLength(1);
    expect(exported.customExercises).toHaveLength(1);
  });

  it('includes the lifter’s own exercises and excludes PRism’s library', () => {
    // The seeded library is the app's data, not theirs, and several hundred
    // system rows would bury the handful that are personal.
    const exported = buildAccountExport(source(), AT);
    expect(exported.customExercises.map((e) => e.id)).toEqual(['mine1']);
  });

  it('sorts everything, so two exports of unchanged data are byte-identical', () => {
    /*
      Part of the contract, not incidental tidiness. A lifter comparing this
      month's file with last month's should see only real changes -- if the
      repository happened to return rows in a different order, a diff of two
      identical exports would be unreadable.
    */
    const a = serialiseAccountExport(buildAccountExport(source(), AT));

    const shuffled = source();
    shuffled.workouts.reverse();
    shuffled.checkIns.reverse();
    shuffled.exercises.reverse();
    const b = serialiseAccountExport(buildAccountExport(shuffled, AT));

    expect(a).toBe(b);
  });

  it('does not mutate the arrays it was given', () => {
    const input = source();
    const workoutOrder = input.workouts.map((w) => w.id);
    buildAccountExport(input, AT);
    expect(input.workouts.map((w) => w.id)).toEqual(workoutOrder);
  });

  it('orders records oldest first', () => {
    const exported = buildAccountExport(source(), AT);
    expect(exported.workouts.map((w) => w.id)).toEqual(['w1', 'w2']);
    expect(exported.checkIns.map((c) => c.id)).toEqual(['c1', 'c2']);
  });
});

describe('serialiseAccountExport', () => {
  it('produces indented JSON a person can read without tooling', () => {
    const text = serialiseAccountExport(buildAccountExport(source(), AT));
    expect(text).toContain('\n  "formatVersion"');
    expect(JSON.parse(text).workouts).toHaveLength(2);
  });

  it('round-trips through JSON without losing anything', () => {
    const exported = buildAccountExport(source(), AT);
    expect(JSON.parse(serialiseAccountExport(exported))).toEqual(exported);
  });
});

describe('accountExportFilename', () => {
  it('names the file for the day, not the second', () => {
    // Two exports on the same day colliding by name is the correct outcome:
    // the second is a newer copy of the same thing.
    expect(accountExportFilename(buildAccountExport(source(), AT))).toBe(
      'prism-export-2026-08-06.json',
    );
  });
});

describe('summariseAccountExport', () => {
  it('counts sets across every exercise of every workout', () => {
    // The deletion confirmation names this number. Counting it here rather than
    // in the screen is what keeps the sentence and the file in agreement.
    const summary = summariseAccountExport(buildAccountExport(source(), AT));
    expect(summary.workouts).toBe(2);
    expect(summary.sets).toBe(5);
    expect(summary.checkIns).toBe(2);
    expect(summary.customExercises).toBe(1);
  });
});

describe('isEmptyExport', () => {
  it('is true for a fresh account', () => {
    const empty = buildAccountExport(
      { profile, exercises: [exercise('sys1', true)], workouts: [], checkIns: [], measurements: [], personalRecords: [] },
      AT,
    );
    expect(isEmptyExport(empty)).toBe(true);
  });

  it('is false as soon as anything has been logged', () => {
    const oneCheckIn = buildAccountExport(
      {
        profile,
        exercises: [],
        workouts: [],
        checkIns: [checkIn('c1', '2026-01-01T07:00:00.000Z')],
        measurements: [],
        personalRecords: [],
      },
      AT,
    );
    expect(isEmptyExport(oneCheckIn)).toBe(false);
  });

  it('does not count the profile as data worth exporting on its own', () => {
    // Every account has a profile. If it counted, the empty state would never
    // show and a new lifter would get a share sheet full of defaults.
    const empty = buildAccountExport(
      { profile, exercises: [], workouts: [], checkIns: [], measurements: [], personalRecords: [] },
      AT,
    );
    expect(isEmptyExport(empty)).toBe(true);
  });
});
