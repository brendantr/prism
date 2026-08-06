import AsyncStorage from '@react-native-async-storage/async-storage';
import { getRepository, resetDemoData } from '../repository';
import type { CheckIn, CheckInPatch, PersonalRecord, Workout } from '@/domain/types';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

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
function patch(fields: Scales & { checkedInAt?: string } = {}): CheckInPatch {
  const { checkedInAt, ...scales } = fields;
  return {
    id: `sub_${Math.random().toString(36).slice(2)}`,
    profileId: 'p1',
    checkedInAt: checkedInAt ?? at('07:00:00'),
    ...scales,
  };
}

/** What actually made it to AsyncStorage, to prove a clear survives a reload. */
async function persisted(): Promise<CheckIn[]> {
  const raw = await AsyncStorage.getItem('prism.demo.checkins.v1');
  return raw ? (JSON.parse(raw) as CheckIn[]) : [];
}

const onDay = (all: CheckIn[], day: string) => all.filter((c) => c.checkedInAt.startsWith(day));

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
    await repo.saveCheckIn(patch({ sleepQuality: 2, checkedInAt: '2020-05-06T07:00:00.000Z' }));

    expect(onDay(await repo.listCheckIns(), DAY)).toHaveLength(1);
    expect(onDay(await repo.listCheckIns(), '2020-05-06')).toHaveLength(1);
  });

  it('merges onto a seeded check-in rather than shadowing it', async () => {
    const repo = getRepository();
    const seeded = (await repo.listCheckIns()).at(-1)!;

    await repo.saveCheckIn(patch({ energy: 1, checkedInAt: seeded.checkedInAt }));

    const all = await repo.listCheckIns();
    const sameDay = all.filter((c) => c.checkedInAt.slice(0, 10) === seeded.checkedInAt.slice(0, 10));
    expect(sameDay).toHaveLength(1);
    expect(sameDay[0].id).toBe(seeded.id);
    expect(sameDay[0].energy).toBe(1);
    // The rest of the seeded record survived the patch.
    expect(sameDay[0].sleepQuality).toBe(seeded.sleepQuality);
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
    const spy = jest.spyOn(AsyncStorage, 'multiSet').mockRejectedValueOnce(failure);

    await expect(repo.completeWorkout(workout(), [record('pr_1')])).rejects.toThrow('storage full');

    // The in-memory arrays must not have moved ahead of what is on disk. This
    // is the demo-mode form of the partial write: the process believing it had
    // saved a session that a relaunch would not find.
    expect((await repo.listWorkouts()).some((w) => w.id === 'w_complete_1')).toBe(false);
    expect(await mine(repo)).toHaveLength(0);

    spy.mockRestore();
  });
});
