import AsyncStorage from '@react-native-async-storage/async-storage';
import { getRepository, resetDemoData, resetRepository } from '../repository';
import { ExerciseInUseError, RoutineNotSelectableError } from '../repositoryErrors';
import { DEMO_PROFILE_ID } from '../demoSeed';
import { deviceLocalDate } from '@/domain/trainingDay';
import type { BodyMeasurement, CheckIn, CheckInPatch, PersonalRecord, Workout } from '@/domain/types';
import type { CustomExerciseInput } from '@/domain/customExercise';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('expo-crypto', () => ({
  randomUUID: () => require('node:crypto').randomUUID(),
}));

/**
 * DemoRepository check-in semantics.
 *
 * The interesting behaviour is not "does it store a row" but "what happens the
 * second time the lifter taps something on the same day". Postgres already
 * enforces one check-in per day (`check_ins_one_per_day`); the demo path has to
 * agree with it, or demo and real modes diverge in a way no test would catch.
 */

const DAY = '2020-05-05';
const at = (time: string) => `${DAY}T${time}.000Z`;

type Scales = Partial<Pick<CheckIn, 'sleepQuality' | 'energy' | 'soreness' | 'stress'>>;

/**
 * A submission carrying ONLY the fields named by the caller.
 *
 * The distinction this helper exists to preserve: `patch({})` omits every
 * scale, while `patch({ sleepQuality: null })` sends sleep explicitly as null.
 * A helper that filled the gaps with nulls could not tell those apart, and
 * would quietly test the wrong thing.
 */
function patch(
  fields: Scales & { checkedInAt?: string; localDate?: string } = {},
): CheckInPatch {
  const { checkedInAt, localDate, ...scales } = fields;
  return {
    id: `sub_${Math.random().toString(36).slice(2)}`,
    profileId: 'p1',
    localDate: localDate ?? DAY,
    checkedInAt: checkedInAt ?? at('07:00:00'),
    ...scales,
  };
}

/** What actually made it to AsyncStorage, to prove a clear survives a reload. */
async function persisted(): Promise<CheckIn[]> {
  const raw = await AsyncStorage.getItem('prism.demo.checkins.v1');
  return raw ? (JSON.parse(raw) as CheckIn[]) : [];
}

const onDay = (all: CheckIn[], day: string) => all.filter((c) => c.localDate === day);

describe('DemoRepository check-ins', () => {
  beforeEach(async () => {
    await resetDemoData();
  });

  it('accepts a check-in with only some fields answered', async () => {
    const repo = getRepository();
    await repo.saveCheckIn(patch({ sleepQuality: 4 }));

    const [stored] = onDay(await repo.listCheckIns(), DAY);
    expect(stored.sleepQuality).toBe(4);
    // Unanswered fields stay null. They are not neutral, and not zero.
    expect(stored.energy).toBeNull();
    expect(stored.soreness).toBeNull();
    expect(stored.stress).toBeNull();
  });

  it('merges a later submission on the same day instead of adding another', async () => {
    const repo = getRepository();
    await repo.saveCheckIn(patch({ sleepQuality: 4, checkedInAt: at('07:00:00') }));
    await repo.saveCheckIn(patch({ energy: 2, checkedInAt: at('18:30:00') }));

    const sameDay = onDay(await repo.listCheckIns(), DAY);
    expect(sameDay).toHaveLength(1);
    expect(sameDay[0].sleepQuality).toBe(4);
    expect(sameDay[0].energy).toBe(2);
    // The record carries the most recent submission time.
    expect(sameDay[0].checkedInAt).toBe(at('18:30:00'));
  });

  it('preserves an answered field when a later patch omits that property', async () => {
    const repo = getRepository();
    await repo.saveCheckIn(patch({ sleepQuality: 5, energy: 5, soreness: 1, stress: 1 }));
    await repo.saveCheckIn(patch({ soreness: 4, checkedInAt: at('19:00:00') }));

    const [stored] = onDay(await repo.listCheckIns(), DAY);
    expect(stored.soreness).toBe(4); // present in the patch -> overwritten
    expect(stored.sleepQuality).toBe(5); // omitted -> untouched
    expect(stored.energy).toBe(5);
    expect(stored.stress).toBe(1);
  });

  it('clears an answered field when the patch sends that property as null', async () => {
    const repo = getRepository();
    await repo.saveCheckIn(patch({ sleepQuality: 5, energy: 5, soreness: 1, stress: 1 }));
    await repo.saveCheckIn(patch({ sleepQuality: null, checkedInAt: at('19:00:00') }));

    const [stored] = onDay(await repo.listCheckIns(), DAY);
    expect(stored.sleepQuality).toBeNull(); // explicitly cleared
    expect(stored.energy).toBe(5); // omitted -> survives
    expect(stored.soreness).toBe(1);
    expect(stored.stress).toBe(1);
  });

  it('keeps a cleared field null after the record is read back from storage', async () => {
    const repo = getRepository();
    await repo.saveCheckIn(patch({ sleepQuality: 5, energy: 4 }));
    await repo.saveCheckIn(patch({ sleepQuality: null, checkedInAt: at('19:00:00') }));

    // Re-read through the repository, and again from the raw persisted payload
    // a fresh launch would hydrate from. The clear has to survive both.
    const [reread] = onDay(await repo.listCheckIns(), DAY);
    expect(reread.sleepQuality).toBeNull();

    const [onDisk] = onDay(await persisted(), DAY);
    expect(onDisk.sleepQuality).toBeNull();
    expect(onDisk.energy).toBe(4);
  });

  it('distinguishes an omitted property from one sent as null', async () => {
    const repo = getRepository();
    await repo.saveCheckIn(patch({ sleepQuality: 3, energy: 3 }));

    // Omitting sleep leaves it at 3...
    await repo.saveCheckIn(patch({ energy: 4, checkedInAt: at('12:00:00') }));
    expect(onDay(await repo.listCheckIns(), DAY)[0].sleepQuality).toBe(3);

    // ...while sending it as null clears it. Same helper, different meaning.
    await repo.saveCheckIn(patch({ sleepQuality: null, checkedInAt: at('13:00:00') }));
    expect(onDay(await repo.listCheckIns(), DAY)[0].sleepQuality).toBeNull();
    expect(onDay(await repo.listCheckIns(), DAY)[0].energy).toBe(4);
  });

  it('overwrites a field the lifter actually changed', async () => {
    const repo = getRepository();
    await repo.saveCheckIn(patch({ energy: 2 }));
    await repo.saveCheckIn(patch({ energy: 5, checkedInAt: at('20:00:00') }));

    const [stored] = onDay(await repo.listCheckIns(), DAY);
    expect(stored.energy).toBe(5);
  });

  it('keeps a different day as its own check-in', async () => {
    const repo = getRepository();
    await repo.saveCheckIn(patch({ sleepQuality: 4 }));
    await repo.saveCheckIn(
      patch({
        sleepQuality: 2,
        localDate: '2020-05-06',
        checkedInAt: '2020-05-06T07:00:00.000Z',
      }),
    );

    expect(onDay(await repo.listCheckIns(), DAY)).toHaveLength(1);
    expect(onDay(await repo.listCheckIns(), '2020-05-06')).toHaveLength(1);
  });

  it('merges onto a seeded check-in rather than shadowing it', async () => {
    const repo = getRepository();
    const seeded = (await repo.listCheckIns()).at(-1)!;

    await repo.saveCheckIn(
      patch({ energy: 1, localDate: seeded.localDate, checkedInAt: seeded.checkedInAt }),
    );

    const all = await repo.listCheckIns();
    const sameDay = all.filter((c) => c.localDate === seeded.localDate);
    expect(sameDay).toHaveLength(1);
    expect(sameDay[0].id).toBe(seeded.id);
    expect(sameDay[0].energy).toBe(1);
    // The rest of the seeded record survived the patch.
    expect(sameDay[0].sleepQuality).toBe(seeded.sleepQuality);
  });

  it('keeps adjacent local dates separate even when both timestamps share one UTC date', async () => {
    const repo = getRepository();
    await repo.saveCheckIn(
      patch({
        sleepQuality: 4,
        localDate: '2026-03-02',
        checkedInAt: '2026-03-03T03:30:00.000Z',
      }),
    );
    await repo.saveCheckIn(
      patch({
        energy: 2,
        localDate: '2026-03-03',
        checkedInAt: '2026-03-03T04:30:00.000Z',
      }),
    );

    expect(onDay(await repo.listCheckIns(), '2026-03-02')).toHaveLength(1);
    expect(onDay(await repo.listCheckIns(), '2026-03-03')).toHaveLength(1);
  });

  it('merges one local date even when its timestamps fall on different UTC dates', async () => {
    const repo = getRepository();
    await repo.saveCheckIn(
      patch({
        sleepQuality: 4,
        localDate: '2026-03-02',
        checkedInAt: '2026-03-01T22:00:00.000Z',
      }),
    );
    await repo.saveCheckIn(
      patch({
        energy: 2,
        localDate: '2026-03-02',
        checkedInAt: '2026-03-02T08:00:00.000Z',
      }),
    );

    const sameDay = onDay(await repo.listCheckIns(), '2026-03-02');
    expect(sameDay).toHaveLength(1);
    expect(sameDay[0].sleepQuality).toBe(4);
    expect(sameDay[0].energy).toBe(2);
    expect(sameDay[0].checkedInAt).toBe('2026-03-02T08:00:00.000Z');
  });

  it('backfills the local date on demo check-ins stored before the field existed', async () => {
    const checkedInAt = '2020-05-05T07:00:00.000Z';
    await AsyncStorage.setItem(
      'prism.demo.checkins.v1',
      JSON.stringify([
        {
          id: 'legacy_ci',
          profileId: 'p1',
          checkedInAt,
          sleepQuality: 4,
          energy: null,
          soreness: null,
          stress: null,
        },
      ]),
    );
    resetRepository();

    const legacy = (await getRepository().listCheckIns()).find((c) => c.id === 'legacy_ci');
    expect(legacy?.localDate).toBe(deviceLocalDate(checkedInAt));
  });

  it('rejects an impossible local date instead of diverging from Postgres date', async () => {
    const repo = getRepository();
    await expect(
      repo.saveCheckIn(patch({ localDate: '2026-02-30', energy: 3 })),
    ).rejects.toThrow(RangeError);
    expect(onDay(await repo.listCheckIns(), '2026-02-30')).toHaveLength(0);
  });

  it('derives a local date for a legacy caller that predates the required field', async () => {
    const checkedInAt = '2020-05-05T07:00:00.000Z';
    const legacyPatch = {
      id: 'legacy_submission',
      profileId: 'p1',
      checkedInAt,
      energy: 3,
    } as CheckInPatch;

    await getRepository().saveCheckIn(legacyPatch);

    const stored = (await getRepository().listCheckIns()).find(
      (c) => c.id === 'legacy_submission',
    );
    expect(stored?.localDate).toBe(deviceLocalDate(checkedInAt));
  });
});

/**
 * DemoRepository.completeWorkout
 * ==============================
 * Demo mode is the rehearsal for the real write path, so it has to hold the
 * same two properties `save_workout_graph` holds in Postgres
 * (`supabase/migrations/0003_workout_write_integrity.sql`): the workout and the
 * records it set land together, and running it twice does not produce two
 * copies of the same record.
 *
 * The idempotency case is not hypothetical. `app/workout/active.tsx` re-derives
 * the records on every attempt and mints a fresh `id` each time, so a retry
 * after a failure arrives looking like a brand new set of records.
 */
describe('DemoRepository.completeWorkout', () => {
  beforeEach(async () => {
    await resetDemoData();
  });

  const workout = (): Workout => ({
    id: 'w_complete_1',
    profileId: 'p1',
    routineDayId: null,
    title: 'Session',
    status: 'completed',
    startedAt: '2020-05-05T10:00:00.000Z',
    endedAt: '2020-05-05T11:00:00.000Z',
    reflection: null,
    sessionRating: null,
    exercises: [],
  });

  const record = (id: string): PersonalRecord => ({
    id,
    profileId: 'p1',
    exerciseId: 'ex_1',
    kind: 'e1rm',
    value: 116.67,
    reps: 5,
    weightKg: 100,
    achievedAt: '2020-05-05T10:00:00.000Z',
    workoutId: 'w_complete_1',
  });

  const mine = async (repo: ReturnType<typeof getRepository>) =>
    (await repo.listPersonalRecords()).filter((r) => r.workoutId === 'w_complete_1');

  it('stores the workout and its records together', async () => {
    const repo = getRepository();
    await repo.completeWorkout(workout(), [record('pr_1')]);

    expect((await repo.listWorkouts()).some((w) => w.id === 'w_complete_1')).toBe(true);
    expect(await mine(repo)).toHaveLength(1);
  });

  it('does not duplicate a record when the same session is saved twice', async () => {
    const repo = getRepository();
    await repo.completeWorkout(workout(), [record('pr_1')]);
    // The retry: same session, same PR, new id -- exactly what the logger sends
    // on a second attempt.
    await repo.completeWorkout(workout(), [record('pr_2')]);

    expect(await mine(repo)).toHaveLength(1);
    expect((await mine(repo))[0].id).toBe('pr_1');
    expect((await repo.listWorkouts()).filter((w) => w.id === 'w_complete_1')).toHaveLength(1);
  });

  it('leaves nothing behind when the write to storage fails', async () => {
    const repo = getRepository();
    const failure = new Error('storage full');
    // AsyncStorage's Jest module is already a mock. Spying on that mock and
    // calling `mockRestore()` removes its implementation for later tests;
    // queue one rejection on the existing mock so it falls back naturally.
    (AsyncStorage.multiSet as jest.Mock).mockRejectedValueOnce(failure);

    await expect(repo.completeWorkout(workout(), [record('pr_1')])).rejects.toThrow('storage full');

    // The in-memory arrays must not have moved ahead of what is on disk. This
    // is the demo-mode form of the partial write: the process believing it had
    // saved a session that a relaunch would not find.
    expect((await repo.listWorkouts()).some((w) => w.id === 'w_complete_1')).toBe(false);
    expect(await mine(repo)).toHaveLength(0);

  });
});

const customInput = (name = 'My cable press'): CustomExerciseInput => ({
  name,
  equipment: 'cable',
  primaryMuscles: ['chest'],
  secondaryMuscles: ['triceps'],
  isUnilateral: true,
  cue: 'Reach forward',
});

describe('DemoRepository user-owned writes', () => {
  beforeEach(async () => {
    await resetDemoData();
  });

  it('creates, edits, and persists a custom movement across repository instances', async () => {
    const created = await getRepository().createExercise(customInput());
    expect(created.isSystem).toBe(false);
    expect(created.name).toBe('My cable press');
    expect(JSON.parse((await AsyncStorage.getItem('prism.demo.exercises.v1')) ?? '[]')).toEqual([
      created,
    ]);

    resetRepository();
    expect(await AsyncStorage.getItem('prism.demo.exercises.v1')).not.toBeNull();
    expect((await getRepository().listExercises()).find((e) => e.id === created.id)).toEqual(created);

    const updated = await getRepository().updateExercise(created.id, customInput('My press'));
    expect(updated.name).toBe('My press');
    resetRepository();
    expect((await getRepository().listExercises()).find((e) => e.id === created.id)?.name).toBe('My press');

    await getRepository().deleteExercise(created.id);
    resetRepository();
    expect((await getRepository().listExercises()).some((e) => e.id === created.id)).toBe(false);
  });

  it('does not let the demo edit or delete a shared PRism movement', async () => {
    const system = (await getRepository().listExercises()).find((e) => e.isSystem)!;
    await expect(getRepository().updateExercise(system.id, customInput())).rejects.toThrow(/not yours/i);
    await expect(getRepository().deleteExercise(system.id)).rejects.toThrow(/not yours/i);
  });

  it('refuses to delete a custom movement referenced by logged history', async () => {
    const created = await getRepository().createExercise(customInput());
    const workout: Workout = {
      id: 'custom_workout',
      profileId: 'p1',
      routineDayId: null,
      title: 'Custom work',
      status: 'completed',
      startedAt: '2026-08-09T10:00:00.000Z',
      endedAt: '2026-08-09T11:00:00.000Z',
      reflection: null,
      sessionRating: null,
      exercises: [{
        id: 'custom_block',
        workoutId: 'custom_workout',
        exerciseId: created.id,
        orderIndex: 0,
        notes: null,
        sets: [],
      }],
    };
    await getRepository().saveWorkout(workout);

    await expect(getRepository().deleteExercise(created.id)).rejects.toBeInstanceOf(ExerciseInUseError);
    expect((await getRepository().listExercises()).some((e) => e.id === created.id)).toBe(true);
  });

  it('selects a shared plan through profile training days and refuses a shared-row flag', async () => {
    await getRepository().updateProfile({ trainingDaysPerWeek: 3 });
    expect((await getRepository().getActiveRoutine())?.daysPerWeek).toBe(3);
    const shared = (await getRepository().listRoutines())[0];
    await expect(getRepository().setActiveRoutine(shared.id)).rejects.toBeInstanceOf(RoutineNotSelectableError);
  });

  it('does not move its profile ahead of a rejected storage write', async () => {
    const repo = getRepository();
    const before = await repo.getProfile();
    (AsyncStorage.setItem as jest.Mock).mockRejectedValueOnce(new Error('storage unavailable'));

    await expect(repo.updateProfile({ displayName: 'Not stored' })).rejects.toThrow(
      'storage unavailable',
    );

    expect(await repo.getProfile()).toEqual(before);
  });

  it('saves, updates, and persists a body measurement', async () => {
    const measurement: BodyMeasurement = {
      id: 'measurement_user',
      profileId: 'p1',
      measuredAt: '2026-08-09T12:00:00.000Z',
      bodyweightKg: 82.5,
      bodyFatPct: null,
      circumferencesCm: { waist: 80 },
    };
    await getRepository().saveMeasurement(measurement);
    await getRepository().saveMeasurement({ ...measurement, bodyweightKg: 83 });
    expect(await AsyncStorage.getItem('prism.demo.measurements.v1')).not.toBeNull();

    resetRepository();
    const saved = (await getRepository().listMeasurements()).filter((m) => m.id === measurement.id);
    expect(saved).toHaveLength(1);
    expect(saved[0].bodyweightKg).toBe(83);
    expect(saved[0].profileId).toBe(DEMO_PROFILE_ID);
  });

  it('keeps a deleted seeded measurement deleted after a relaunch', async () => {
    const seeded = (await getRepository().listMeasurements())[0];
    await getRepository().deleteMeasurement(seeded.id);
    expect(await AsyncStorage.getItem('prism.demo.measurements.v1')).not.toBeNull();
    resetRepository();
    expect((await getRepository().listMeasurements()).some((m) => m.id === seeded.id)).toBe(false);
  });
});

/*
  The bounded startup read, against the real demo implementation.

  Parity with Postgres is the property under test, not the number: demo mode is
  what every developer and every screenshot runs on, so a bound that behaves
  differently in the two implementations is a bug that only ever appears in
  production. The Supabase side of the same contract is pinned in
  `src/data/__tests__/workoutWindow.test.ts`.
*/
describe('DemoRepository.listWorkouts windowing', () => {
  beforeEach(async () => {
    await resetDemoData();
  });

  it('returns every session, oldest first, when unbounded', async () => {
    const all = await getRepository().listWorkouts();
    expect(all.length).toBeGreaterThan(3);
    for (let i = 1; i < all.length; i++) {
      expect(all[i - 1].startedAt <= all[i].startedAt).toBe(true);
    }
  });

  it('returns the newest sessions when bounded, still oldest first', async () => {
    const repo = getRepository();
    const all = await repo.listWorkouts();
    const window = await repo.listWorkouts({ limit: 3 });

    expect(window).toHaveLength(3);
    // The newest three, in the same order they appear at the end of the full list.
    expect(window.map((w) => w.id)).toEqual(all.slice(-3).map((w) => w.id));
  });

  it('is a no-op when the account has fewer sessions than the limit', async () => {
    const repo = getRepository();
    const all = await repo.listWorkouts();
    const window = await repo.listWorkouts({ limit: all.length + 50 });
    expect(window.map((w) => w.id)).toEqual(all.map((w) => w.id));
  });

  it('keeps the export complete, which is what I-10 promises', async () => {
    const repo = getRepository();
    const all = await repo.listWorkouts();
    const exported = await repo.exportAccountData();
    expect(exported.workouts).toHaveLength(all.length);
  });
});
