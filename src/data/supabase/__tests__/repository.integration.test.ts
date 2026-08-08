/**
 * SUPABASE REPOSITORY — INTEGRATION LANE
 * ======================================
 * `SupabaseRepository` against a **real** project: the sign-up trigger, the
 * three RPCs, RLS as PostgREST actually enforces it, and the two irreversible
 * paths (deletion, export).
 *
 * Excluded from `npm test`. Run with a staging project configured:
 *
 *     npm run test:integration
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS NOT REDUNDANT WITH `supabase/tests/rls/`
 * ---------------------------------------------------------------------------
 * Those 132 SQL assertions are the stronger test of the *migrations*, and they
 * run in CI on every push. They cannot be the test of the *product*, for three
 * reasons this lane exists to cover:
 *
 *   1. They run against plain Postgres with a hand-built imitation of Supabase's
 *      auth schema (`00_setup_auth_emulation.sql`). The real `auth.users`, its
 *      triggers, and the real `authenticated` role's grants are all outside
 *      what that file reconstructs.
 *   2. They speak SQL. Every call the app makes goes through **PostgREST**, so
 *      a function that exists and works can still be unreachable — a missing
 *      `grant execute`, a stale schema cache, or an argument name PostgREST
 *      cannot bind. None of that is visible from psql.
 *   3. They never execute a line of TypeScript. The payload builders
 *      (`fromWorkoutGraph`, the `save_check_in` key-presence patch) are asserted
 *      only against mocks in the default lane.
 *
 * So: SQL suite proves the schema is right, this proves the app can use it.
 */

import type { CheckInPatch, PersonalRecord, Workout } from '@/domain/types';
import {
  INTEGRATION_TIMEOUT_MS,
  createDisposableAccount,
  integrationSuite,
  restWithToken,
  type DisposableAccount,
} from './support/integrationProject';
import { keychainStore } from './support/nativeMocks';

jest.setTimeout(INTEGRATION_TIMEOUT_MS);

/** A uuid that belongs to nobody, for the forged-ownership assertions. */
const FOREIGN_PROFILE_ID = '00000000-0000-4000-8000-0000000000ff';

/**
 * `node:crypto` rather than the app's `newId()`, which is `expo-crypto` and
 * would need its own mock here. The values are uuid v4 either way — the format
 * the `uuid` primary keys require.
 */
const newUuid = (): string => require('node:crypto').randomUUID();

async function accessToken(account: DisposableAccount): Promise<string> {
  const { data } = await account.app.client.getSupabase().auth.getSession();
  if (!data.session) throw new Error('No session — the harness is not signed in.');
  return data.session.access_token;
}

/**
 * A user-owned exercise, created the way a lifter creating a custom movement
 * would.
 *
 * Deliberately not a system exercise: a fresh project has **none**, because
 * nothing in this repository seeds the shared library — see the sprint record's
 * finding F-1. Depending on a seeded row here would make this suite pass or
 * fail on a manual step nobody has automated.
 */
async function createOwnExercise(account: DisposableAccount): Promise<string> {
  const id = newUuid();
  const { status, body } = await restWithToken('exercises', await accessToken(account), {
    method: 'POST',
    body: JSON.stringify({
      id,
      profile_id: account.userId,
      name: `Integration Press ${id.slice(0, 8)}`,
      equipment: 'barbell',
      primary_muscles: ['chest'],
      secondary_muscles: ['triceps'],
      cue: 'Created by the integration lane.',
    }),
  });
  if (status >= 300) throw new Error(`Could not create test exercise: ${status} ${JSON.stringify(body)}`);
  return id;
}

function buildWorkout(opts: {
  profileId: string;
  exerciseIds: string[];
  startedAt?: string;
}): Workout {
  const workoutId = newUuid();
  return {
    id: workoutId,
    profileId: opts.profileId,
    routineDayId: null,
    title: 'Integration session',
    status: 'completed',
    startedAt: opts.startedAt ?? new Date(Date.now() - 3_600_000).toISOString(),
    endedAt: new Date().toISOString(),
    reflection: null,
    sessionRating: 4,
    exercises: opts.exerciseIds.map((exerciseId, index) => {
      const workoutExerciseId = newUuid();
      return {
        id: workoutExerciseId,
        workoutId,
        exerciseId,
        orderIndex: index,
        notes: null,
        sets: [
          {
            id: newUuid(),
            workoutExerciseId,
            setIndex: 0,
            type: 'working' as const,
            weightKg: 100,
            reps: 5,
            rpe: 8,
            completed: true,
            restSeconds: 180,
            notes: null,
          },
          {
            id: newUuid(),
            workoutExerciseId,
            setIndex: 1,
            type: 'working' as const,
            weightKg: 100,
            reps: 4,
            rpe: 9,
            completed: true,
            restSeconds: 180,
            notes: null,
          },
        ],
      };
    }),
  };
}

// ---------------------------------------------------------------------------

integrationSuite('SupabaseRepository against a real project', () => {
  let account: DisposableAccount;
  let exerciseA: string;
  let exerciseB: string;

  beforeAll(async () => {
    keychainStore().clear();
    account = await createDisposableAccount();
    exerciseA = await createOwnExercise(account);
    exerciseB = await createOwnExercise(account);
  });

  afterAll(async () => {
    await account?.destroy();
  });

  const repo = () => account.app.repository.getRepository();

  it('is the Supabase repository, not the demo one', () => {
    // The failure this guards against is silent and total: `DEMO_MODE` falls
    // back to `__DEV__` when unset, and `__DEV__` is true under Jest — so a
    // harness that forgot to set the flag would run every assertion below
    // against local seed data and pass.
    expect(repo().kind).toBe('supabase');
  });

  it('created a profile via the sign-up trigger', async () => {
    const profile = await repo().getProfile();

    // `handle_new_user` is `security definer` and fires on `auth.users` — a
    // table the local SQL suite only imitates. This is the first evidence it
    // runs on the real thing.
    expect(profile.id).toBe(account.userId);
    expect(profile.displayName).toBe('Lifter');
    expect(profile.unit).toBe('kg');
  });

  it('has a catalogue to log against, and no history logged in it', async () => {
    // This assertion was the inverse one sprint ago, pinning finding F-1: a
    // fresh project had no exercises and no routines, so a real lifter could
    // not log anything. `0006_seed_library.sql` closed that, and the two halves
    // below are the product decision it implements — a dictionary is seeded,
    // training data never is.
    const exercises = await repo().listExercises();
    const system = exercises.filter((e) => e.isSystem);

    expect(system.length).toBeGreaterThanOrEqual(43);
    expect((await repo().listRoutines()).filter((r) => r.isTemplate)).toHaveLength(2);
    expect(await repo().getActiveRoutine()).not.toBeNull();

    // The account itself is empty, and stays empty until its owner logs.
    expect(await repo().listWorkouts()).toEqual([]);
    expect(await repo().listCheckIns()).toEqual([]);
    expect(await repo().listPersonalRecords()).toEqual([]);
  });

  describe('completeWorkout through save_workout_graph', () => {
    let workout: Workout;
    let records: PersonalRecord[];

    beforeAll(async () => {
      workout = buildWorkout({ profileId: account.userId, exerciseIds: [exerciseA, exerciseB] });
      records = [
        {
          id: newUuid(),
          profileId: account.userId,
          exerciseId: exerciseA,
          kind: 'e1rm',
          value: 116.7,
          reps: 5,
          weightKg: 100,
          achievedAt: workout.startedAt,
          workoutId: workout.id,
        },
      ];
      await repo().completeWorkout(workout, records);
    });

    it('commits the whole graph and reads it back', async () => {
      const stored = (await repo().listWorkouts()).find((w) => w.id === workout.id);

      expect(stored).toBeDefined();
      expect(stored?.exercises).toHaveLength(2);
      expect(stored?.exercises.flatMap((e) => e.sets)).toHaveLength(4);
      expect(stored?.sessionRating).toBe(4);
      // The RPC reached PostgREST at all: a missing `grant execute` or a stale
      // schema cache fails here with PGRST202, which psql can never show.
      expect(stored?.exercises[0].sets[0].weightKg).toBe(100);
    });

    it('stamps ownership from the session, ignoring the payload', async () => {
      const forged = buildWorkout({ profileId: FOREIGN_PROFILE_ID, exerciseIds: [exerciseA] });
      await repo().completeWorkout(forged, []);

      const stored = (await repo().listWorkouts()).find((w) => w.id === forged.id);
      expect(stored?.profileId).toBe(account.userId);
    });

    it('treats an exact retry as a no-op rather than a duplicate', async () => {
      const before = await repo().listPersonalRecords();

      await repo().completeWorkout(workout, records);

      const workouts = (await repo().listWorkouts()).filter((w) => w.id === workout.id);
      const after = await repo().listPersonalRecords();

      expect(workouts).toHaveLength(1);
      expect(workouts[0].exercises).toHaveLength(2);
      // The `(profile_id, workout_id, exercise_id, kind)` unique index doing its
      // job against a real database, not against a mock that agreed to.
      expect(after).toHaveLength(before.length);
    });

    it('deletes children the payload no longer contains', async () => {
      const trimmed: Workout = { ...workout, exercises: [workout.exercises[0]] };

      await repo().saveWorkout(trimmed);

      const stored = (await repo().listWorkouts()).find((w) => w.id === workout.id);
      expect(stored?.exercises).toHaveLength(1);
      expect(stored?.exercises[0].exerciseId).toBe(exerciseA);
    });
  });

  describe('saveCheckIn through save_check_in', () => {
    // One calendar day, far enough back that the suite cannot collide with a
    // same-day record it wrote in an earlier describe.
    const checkedInAt = new Date(Date.UTC(2026, 0, 15, 9, 0, 0)).toISOString();
    const DAY = '2026-01-15';

    /**
     * Found by this suite: **the timestamp you send is not the string you get
     * back.** The client sends ISO-8601 (`2026-01-15T09:00:00.000Z`); Postgres
     * stores `timestamptz` and PostgREST returns its own rendering. Matching on
     * the exact string therefore finds nothing.
     *
     * `DemoRepository` stores what it was handed verbatim, so any code comparing
     * `checkedInAt` by string equality would behave differently in demo than
     * against a real backend. Nothing does today — the readiness code parses to
     * `Date` — but it is a real divergence and it is recorded in the sprint.
     */
    const onDay = (c: { checkedInAt: string }) => c.checkedInAt.slice(0, 10) === DAY;

    it('stores only the answers given, leaving the rest null', async () => {
      const patch: CheckInPatch = {
        id: newUuid(),
        profileId: FOREIGN_PROFILE_ID, // ignored — the function reads auth.uid()
        checkedInAt,
        sleepQuality: 4,
      };

      await repo().saveCheckIn(patch);

      const stored = (await repo().listCheckIns()).find(onDay);
      expect(stored?.profileId).toBe(account.userId);
      expect(stored?.sleepQuality).toBe(4);
      expect(stored?.energy).toBeNull();
      expect(stored?.soreness).toBeNull();
      expect(stored?.stress).toBeNull();
    });

    it('merges a later answer into the same day, under a NEW id', async () => {
      // The id is deliberately fresh. Before `0004`, this upserted on the
      // primary key and would have inserted a second row for the same day —
      // it only worked because the UI happened to reuse a cached id.
      await repo().saveCheckIn({
        id: newUuid(),
        profileId: account.userId,
        checkedInAt,
        energy: 2,
      });

      const sameDay = (await repo().listCheckIns()).filter(onDay);
      expect(sameDay).toHaveLength(1);
      expect(sameDay[0].energy).toBe(2);
      expect(sameDay[0].sleepQuality).toBe(4); // untouched, because it was omitted
    });

    it('clears an answer sent as explicit null', async () => {
      await repo().saveCheckIn({
        id: newUuid(),
        profileId: account.userId,
        checkedInAt,
        sleepQuality: null,
      });

      const stored = (await repo().listCheckIns()).find(onDay);
      // Omit vs. explicit null surviving the jsonb round trip is the property
      // `0004` exists for, and this is the first time it has been checked
      // against a real PostgREST rather than a stubbed `rpc()`.
      expect(stored?.sleepQuality).toBeNull();
      expect(stored?.energy).toBe(2);
    });
  });

  it('exports every table the account owns', async () => {
    const exported = await repo().exportAccountData();

    expect(exported.profile.id).toBe(account.userId);
    expect(exported.workouts.length).toBeGreaterThan(0);
    expect(exported.checkIns.length).toBeGreaterThan(0);
    // The lifter's own movements, and only those. `isSystem` is derived from a
    // null `profile_id` by the mapper, so this also confirms the mapper reads a
    // real row the way it reads a fixture.
    expect(exported.customExercises.map((e) => e.id).sort()).toEqual([exerciseA, exerciseB].sort());
    expect(exported.personalRecords.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------

integrationSuite('RLS between two real accounts', () => {
  let alice: DisposableAccount;
  let bob: DisposableAccount;
  let aliceWorkoutId: string;

  beforeAll(async () => {
    keychainStore().clear();
    alice = await createDisposableAccount();
    const exercise = await createOwnExercise(alice);
    const workout = buildWorkout({ profileId: alice.userId, exerciseIds: [exercise] });
    aliceWorkoutId = workout.id;
    await alice.app.repository.getRepository().completeWorkout(workout, []);

    // A second module graph would clobber the first's client singleton, so Bob
    // is driven over REST with his own token rather than through the app's
    // repository. The question here is what the *server* returns, not how the
    // client maps it.
    keychainStore().clear();
    bob = await createDisposableAccount();
  });

  afterAll(async () => {
    await bob?.destroy();
    // Alice's session is not the one currently in the Keychain, so she is
    // deleted over REST rather than through the repository singleton.
    await alice?.destroy();
  });

  it("does not return another account's workout, by id or otherwise", async () => {
    const token = await accessToken(bob);

    const byId = await restWithToken(`workouts?id=eq.${aliceWorkoutId}&select=*`, token);
    const all = await restWithToken('workouts?select=id', token);

    // RLS filters rather than errors: the row is invisible, not forbidden.
    expect(byId.status).toBe(200);
    expect(byId.body).toEqual([]);
    expect(all.body).toEqual([]);
  });

  it('rejects a write that forges another account as owner', async () => {
    const token = await accessToken(bob);

    const { status } = await restWithToken('workouts', token, {
      method: 'POST',
      body: JSON.stringify({
        id: newUuid(),
        profile_id: alice.userId,
        title: 'Forged',
        status: 'completed',
        started_at: new Date().toISOString(),
      }),
    });

    // The assumption `src/data/__tests__/ownership.test.ts` has been taking on
    // trust since there was no database to ask.
    expect(status).toBeGreaterThanOrEqual(400);
  });
});

// ---------------------------------------------------------------------------

integrationSuite('delete_my_account against a real project', () => {
  let account: DisposableAccount;

  beforeAll(async () => {
    keychainStore().clear();
    account = await createDisposableAccount();
    const exercise = await createOwnExercise(account);
    await account.app.repository
      .getRepository()
      .completeWorkout(buildWorkout({ profileId: account.userId, exerciseIds: [exercise] }), []);
  });

  afterAll(async () => {
    await account?.destroy(); // no-op if the test below already ran
  });

  it('erases the account and everything it owned', async () => {
    const token = await accessToken(account);
    expect((await account.app.repository.getRepository().listWorkouts()).length).toBeGreaterThan(0);

    await account.app.repository.getRepository().deleteAccount();

    // The access token outlives the account — it is a stateless JWT and the
    // server does not consult a user table to validate it. What must be gone is
    // the DATA, and the cascade from `auth.users` is what removes it.
    const profiles = await restWithToken(`profiles?id=eq.${account.userId}&select=id`, token);
    const workouts = await restWithToken('workouts?select=id', token);

    expect(profiles.body).toEqual([]);
    expect(workouts.body).toEqual([]);
  });
});
