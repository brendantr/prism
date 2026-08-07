import AsyncStorage from '@react-native-async-storage/async-storage';
import { DEMO_PROFILE_ID } from '@/data/demoSeed';
import { AuthRequiredError } from '@/data/authRequired';
import { canOfferSignOut, shouldConfirmSignOut } from '@/domain/account';
import type { Workout } from '@/domain/types';
import { DRAFT_STORAGE_KEY, useActiveWorkoutStore } from '../activeWorkoutStore';
import { deleteAccountAndTearDown, signOutAndTearDown } from '../authActions';
import { useSessionStore } from '../sessionStore';
import { useTrainingStore } from '../trainingStore';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

jest.mock('@/data/supabase/auth', () => ({
  isAuthEnabled: jest.fn(() => true),
  getCurrentUser: jest.fn(async () => null),
  signInWithPassword: jest.fn(),
  signUpWithPassword: jest.fn(),
  signOut: jest.fn(async () => undefined),
  subscribeToAuthState: jest.fn(() => null),
}));

/**
 * Wraps the real repository module so `getRepository` can be made to throw on
 * demand. A bare `jest.spyOn` will not do it: without this factory,
 * `jest.requireMock` hands back an automock rather than the instance
 * `trainingStore` actually imported, and the override silently does nothing --
 * which is exactly how these tests failed on their first run.
 */
jest.mock('@/data/repository', () => {
  const actual = jest.requireActual('@/data/repository');
  return { ...actual, getRepository: jest.fn(actual.getRepository) };
});

const { getRepository: mockGetRepository } = jest.requireMock('@/data/repository') as {
  getRepository: jest.Mock;
};

const ONBOARDING_KEY = 'prism.onboarding.v1';

function draftFor(profileId: string): Workout {
  return {
    id: 'wk_draft',
    profileId,
    routineDayId: null,
    title: 'Open session',
    status: 'in_progress',
    startedAt: new Date().toISOString(),
    endedAt: null,
    reflection: null,
    sessionRating: null,
    exercises: [],
  };
}

/** A store that looks like it has been loaded for a real, signed-in lifter. */
function seedLoadedTrainingData() {
  useTrainingStore.setState({
    status: 'ready',
    error: null,
    profile: { id: 'user_a', displayName: 'A' } as never,
    workouts: [draftFor('user_a')],
    checkIns: [{ id: 'ci_1' }] as never,
    measurements: [{ id: 'bm_1' }] as never,
    personalRecords: [{ id: 'pr_1' }] as never,
    exercises: [{ id: 'ex_1' }] as never,
    exerciseById: new Map([['ex_1', { id: 'ex_1' } as never]]),
    routines: [{ id: 'rt_1' }] as never,
    favouriteExerciseIds: ['ex_only_user_a_likes'],
  });
}

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  useSessionStore.setState({
    phase: 'authenticated',
    userId: 'user_a',
    email: 'user_a@example.com',
    pending: null,
    lastFailure: null,
  });
  useActiveWorkoutStore.setState({
    workout: null,
    restTimer: null,
    lastCompletedSetId: null,
    hydrationStatus: 'idle',
    draftPendingReview: false,
    draftDiscardedForOwner: false,
  });
  useTrainingStore.getState().reset();
});

/**
 * SIGN-OUT LEAVES NOTHING BEHIND
 * ==============================
 * Proposed as `Docs/invariants.md` I-19. The failure this guards against is
 * concrete: a shared phone where the next lifter sees the previous one's
 * sessions painted on Today before their own load resolves.
 */
describe('signOutAndTearDown', () => {
  it('empties the read model', async () => {
    seedLoadedTrainingData();

    await signOutAndTearDown();

    const s = useTrainingStore.getState();
    expect(s.workouts).toEqual([]);
    expect(s.checkIns).toEqual([]);
    expect(s.measurements).toEqual([]);
    expect(s.personalRecords).toEqual([]);
    expect(s.exercises).toEqual([]);
    expect(s.routines).toEqual([]);
    expect(s.exerciseById.size).toBe(0);
    expect(s.profile).toBeNull();
    expect(s.status).toBe('idle');
    expect(s.error).toBeNull();
  });

  it('resets even preferences that were never persisted', async () => {
    // Favourites live only in memory, which is exactly why they would have
    // survived into the next lifter's session unnoticed.
    seedLoadedTrainingData();

    await signOutAndTearDown();

    expect(useTrainingStore.getState().favouriteExerciseIds).not.toContain('ex_only_user_a_likes');
  });

  it('removes the in-progress workout draft from the device', async () => {
    await AsyncStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draftFor('user_a')));
    useActiveWorkoutStore.setState({ workout: draftFor('user_a') });

    await signOutAndTearDown();

    expect(await AsyncStorage.getItem(DRAFT_STORAGE_KEY)).toBeNull();
    expect(useActiveWorkoutStore.getState().workout).toBeNull();
  });

  it('leaves the onboarding flag alone', async () => {
    // First-run state belongs to the device, not the account: clearing it would
    // replay the carousel for a returning lifter. A deliberate exception.
    await AsyncStorage.setItem(ONBOARDING_KEY, JSON.stringify({ completed: true }));

    await signOutAndTearDown();

    expect(await AsyncStorage.getItem(ONBOARDING_KEY)).not.toBeNull();
  });

  it('ends unauthenticated', async () => {
    await signOutAndTearDown();

    expect(useSessionStore.getState().phase).toBe('unauthenticated');
    expect(useSessionStore.getState().userId).toBeNull();
  });

  it('flips the phase only after the stores are already empty', async () => {
    /*
      The ordering guarantee, asserted rather than commented. `_layout.tsx`
      redirects on phase, so if the flip happened first there would be a window
      in which the auth route mounts while Today still holds the previous
      lifter's sessions.
    */
    seedLoadedTrainingData();
    let workoutsWhenPhaseFlipped: unknown[] | null = null;

    const unsubscribe = useSessionStore.subscribe((state) => {
      if (state.phase === 'unauthenticated' && workoutsWhenPhaseFlipped === null) {
        workoutsWhenPhaseFlipped = useTrainingStore.getState().workouts;
      }
    });

    await signOutAndTearDown();
    unsubscribe();

    expect(workoutsWhenPhaseFlipped).toEqual([]);
  });

  it('discards an in-progress session, which is why the surface confirms first', async () => {
    /*
      The reason `shouldConfirmSignOut` exists. Teardown is indiscriminate by
      design -- leaving one lifter's unfinished session on a shared device is
      worse than losing it -- so the warning has to happen before this runs, not
      inside it.
    */
    const draft = draftFor('user_a');
    draft.exercises = [
      {
        id: 'we_1',
        workoutId: draft.id,
        exerciseId: 'ex_1',
        orderIndex: 0,
        notes: null,
        sets: [
          {
            id: 'st_1',
            workoutExerciseId: 'we_1',
            setIndex: 0,
            type: 'working',
            weightKg: 100,
            reps: 5,
            rpe: null,
            completed: true,
            restSeconds: null,
            notes: null,
          },
        ],
      },
    ];
    useActiveWorkoutStore.setState({ workout: draft });
    await AsyncStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft));
    expect(shouldConfirmSignOut(draft)).toBe(true);

    await signOutAndTearDown();

    expect(useActiveWorkoutStore.getState().workout).toBeNull();
    expect(await AsyncStorage.getItem(DRAFT_STORAGE_KEY)).toBeNull();
  });

  it('leaves no session for the control to be offered against', async () => {
    // The affordance cannot survive its own action.
    seedLoadedTrainingData();

    await signOutAndTearDown();

    expect(
      canOfferSignOut({ authEnabled: true, sessionPhase: useSessionStore.getState().phase }),
    ).toBe(false);
  });

  it('clears the signed-in identity, not just the phase', async () => {
    // The account sheet renders `email`. A stale one would name the previous
    // lifter on the next sign-in's first frame.
    useSessionStore.setState({ phase: 'authenticated', userId: 'user_a', email: 'a@example.com' });

    await signOutAndTearDown();

    expect(useSessionStore.getState().userId).toBeNull();
    expect(useSessionStore.getState().email).toBeNull();
  });

  it('completes teardown even when the server sign-out fails', async () => {
    // Offline, or an already-revoked token. Leaving someone signed in because
    // the network was down is the worse outcome on a shared phone.
    const { signOut } = jest.requireMock('@/data/supabase/auth');
    (signOut as jest.Mock).mockRejectedValueOnce(new Error('offline'));
    seedLoadedTrainingData();

    await expect(signOutAndTearDown()).resolves.toBeUndefined();
    expect(useTrainingStore.getState().workouts).toEqual([]);
    expect(useSessionStore.getState().phase).toBe('unauthenticated');
  });
});

describe('draft ownership on hydrate', () => {
  it('discards a draft belonging to another account', async () => {
    await AsyncStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draftFor('user_b')));

    await useActiveWorkoutStore.getState().hydrate({ enforce: true, profileId: 'user_a' });

    expect(useActiveWorkoutStore.getState().workout).toBeNull();
    expect(useActiveWorkoutStore.getState().draftDiscardedForOwner).toBe(true);
    expect(await AsyncStorage.getItem(DRAFT_STORAGE_KEY)).toBeNull();
  });

  it('discards a demo draft once the device has a real session', async () => {
    await AsyncStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draftFor(DEMO_PROFILE_ID)));

    await useActiveWorkoutStore.getState().hydrate({ enforce: true, profileId: 'user_a' });

    expect(useActiveWorkoutStore.getState().workout).toBeNull();
  });

  it('keeps a draft that belongs to the signed-in lifter', async () => {
    await AsyncStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draftFor('user_a')));

    await useActiveWorkoutStore.getState().hydrate({ enforce: true, profileId: 'user_a' });

    expect(useActiveWorkoutStore.getState().workout?.id).toBe('wk_draft');
    expect(useActiveWorkoutStore.getState().draftPendingReview).toBe(true);
  });

  it('does not enforce ownership in a build with one identity', async () => {
    // Demo: `DEMO_PROFILE_ID` is a constant and there is nobody to confuse it
    // with, so the check would only ever throw away a valid draft.
    await AsyncStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draftFor(DEMO_PROFILE_ID)));

    await useActiveWorkoutStore.getState().hydrate({ enforce: false });

    expect(useActiveWorkoutStore.getState().workout?.id).toBe('wk_draft');
  });

  it('defaults to not enforcing, so existing callers are unchanged', async () => {
    await AsyncStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draftFor('anyone')));

    await useActiveWorkoutStore.getState().hydrate();

    expect(useActiveWorkoutStore.getState().workout?.id).toBe('wk_draft');
  });
});

/**
 * AUTH FAILURES ARE NOT LOAD FAILURES
 * ===================================
 * Before this split, "no session" rendered `ScreenState`'s "Could not load
 * this" behind a Retry that could never succeed.
 */
describe('refresh error routing', () => {
  it('routes AuthRequiredError to sign-in instead of the error screen', async () => {
    mockGetRepository.mockImplementationOnce(() => {
      throw new AuthRequiredError();
    });
    useSessionStore.setState({ phase: 'authenticated', userId: 'user_a' });

    await useTrainingStore.getState().refresh();

    expect(useTrainingStore.getState().status).toBe('idle');
    expect(useTrainingStore.getState().error).toBeNull();
    expect(useSessionStore.getState().phase).toBe('unauthenticated');
  });

  it('routes an AuthRequiredError thrown by a repository method, not just the factory', async () => {
    // The realistic shape: the repository builds fine and `uid()` rejects
    // inside one of the eight parallel calls `refresh()` fires.
    mockGetRepository.mockImplementationOnce(() => ({
      kind: 'supabase' as const,
      getProfile: async () => {
        throw new AuthRequiredError();
      },
      listExercises: async () => [],
      listRoutines: async () => [],
      getActiveRoutine: async () => null,
      listWorkouts: async () => [],
      listCheckIns: async () => [],
      listMeasurements: async () => [],
      listPersonalRecords: async () => [],
    }));
    useSessionStore.setState({ phase: 'authenticated', userId: 'user_a' });

    await useTrainingStore.getState().refresh();

    expect(useTrainingStore.getState().status).toBe('idle');
    expect(useSessionStore.getState().phase).toBe('unauthenticated');
  });

  it('leaves a genuine data failure as a retryable error state', async () => {
    mockGetRepository.mockImplementationOnce(() => {
      throw new Error('This build is configured for a real backend but has no credentials.');
    });

    await useTrainingStore.getState().refresh();

    expect(useTrainingStore.getState().status).toBe('error');
    expect(useTrainingStore.getState().error).toContain('real backend');
    expect(useSessionStore.getState().phase).not.toBe('unauthenticated');
  });

  it('does not leave a status that would block the load after signing back in', async () => {
    // `load()` returns early on 'loading'/'ready'. A stale status here would
    // silently swallow the first load of the next session.
    mockGetRepository.mockImplementationOnce(() => {
      throw new AuthRequiredError();
    });

    await useTrainingStore.getState().refresh();
    expect(useTrainingStore.getState().status).toBe('idle');

    // Back to the real (demo) repository for the post-sign-in load.
    await useTrainingStore.getState().load();

    expect(useTrainingStore.getState().status).toBe('ready');
  });
});

/**
 * ACCOUNT DELETION
 * ================
 * `Docs/invariants.md` I-10. The ordering here is the safety property, and it
 * is the *opposite* of sign-out's in one specific way: sign-out swallows a
 * failed remote call because local teardown must happen regardless, and
 * deletion must not, because wiping the device after a failed server delete
 * would tell a lifter their data was erased while all of it is still there.
 */
describe('deleteAccountAndTearDown()', () => {
  beforeEach(() => {
    mockGetRepository.mockClear();
    useSessionStore.setState({ phase: 'authenticated', email: 'a@example.com' });
  });

  /** A repository whose deleteAccount resolves or rejects on demand. */
  function repositoryWhoseDeleteWill(outcome: 'succeed' | 'fail') {
    const actual = jest.requireActual('@/data/repository');
    const real = actual.getRepository();
    const deleteAccount = jest.fn(async () => {
      if (outcome === 'fail') throw new Error('network');
    });
    mockGetRepository.mockImplementation(() => ({ ...real, deleteAccount }));
    return deleteAccount;
  }

  it('deletes remotely, then tears the device down', async () => {
    const deleteAccount = repositoryWhoseDeleteWill('succeed');
    useActiveWorkoutStore.setState({ workout: draftFor('user-1') });
    await AsyncStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draftFor('user-1')));

    await deleteAccountAndTearDown();

    expect(deleteAccount).toHaveBeenCalledTimes(1);
    expect(useActiveWorkoutStore.getState().workout).toBeNull();
    expect(await AsyncStorage.getItem(DRAFT_STORAGE_KEY)).toBeNull();
    expect(useTrainingStore.getState().workouts).toEqual([]);
    // Last, as with sign-out: the route gate watches this.
    expect(useSessionStore.getState().phase).toBe('unauthenticated');
  });

  it('does NOT touch the device when the remote delete fails', async () => {
    /*
      The assertion this whole flow exists for. If the server still holds the
      account, the lifter must still be signed into it -- being returned to a
      sign-in screen with an intact account and an emptied phone is the single
      most misleading outcome available here.
    */
    const deleteAccount = repositoryWhoseDeleteWill('fail');
    useActiveWorkoutStore.setState({ workout: draftFor('user-1') });

    await expect(deleteAccountAndTearDown()).rejects.toThrow('network');

    expect(deleteAccount).toHaveBeenCalledTimes(1);
    expect(useActiveWorkoutStore.getState().workout).not.toBeNull();
    expect(useSessionStore.getState().phase).toBe('authenticated');
  });

  it('sends no account identifier -- the server derives it from the session', async () => {
    // The containment on the one `security definer` function in the schema is
    // that it takes no arguments. This pins the client half of that.
    const deleteAccount = repositoryWhoseDeleteWill('succeed');

    await deleteAccountAndTearDown();

    expect(deleteAccount).toHaveBeenCalledWith();
  });

  it('clears the read model, so no deleted account’s data survives in memory', async () => {
    repositoryWhoseDeleteWill('succeed');
    // Seeded directly rather than via `load()`: that returns early once the
    // status is 'ready', which an earlier test in this file leaves it at. What
    // is under test is the teardown, not the loader.
    useTrainingStore.setState({
      workouts: [draftFor('user-1')],
      checkIns: [
        {
          id: 'c1',
          profileId: 'user-1',
          checkedInAt: '2026-01-01T07:00:00.000Z',
          sleepQuality: 4,
          energy: 4,
          soreness: 2,
          stress: 2,
        },
      ],
    });
    expect(useTrainingStore.getState().workouts.length).toBeGreaterThan(0);

    await deleteAccountAndTearDown();

    expect(useTrainingStore.getState().workouts).toEqual([]);
    expect(useTrainingStore.getState().checkIns).toEqual([]);
    expect(useTrainingStore.getState().personalRecords).toEqual([]);
  });
});
