import AsyncStorage from '@react-native-async-storage/async-storage';
import { getRepository, resetRepository } from '@/data/repository';
import { signOut as signOutRemote } from '@/data/supabase/auth';
import { DRAFT_STORAGE_KEY, flushDraftWrites, useActiveWorkoutStore } from './activeWorkoutStore';
import { useEntitlementStore } from './entitlementStore';
import { useSessionStore } from './sessionStore';
import { useTrainingStore } from './trainingStore';

/**
 * SIGN-OUT TEARDOWN
 * =================
 * The one operation that has to touch every store, which is why it lives here
 * rather than in any of them: `trainingStore` already imports `sessionStore`,
 * and having `sessionStore` reach back for the other two would close a cycle.
 * This module sits above all three and imports downward only.
 *
 * THE ORDER IS THE POINT
 * ----------------------
 * The phase flips **last**. `app/_layout.tsx` redirects on phase, so making it
 * the final step means navigation cannot happen until every store is already
 * empty -- there is no window in which a screen re-renders against half-cleared
 * data. Enforced by the sequence below rather than by this comment: move the
 * phase change earlier and the guarantee is gone.
 *
 * What is deliberately NOT cleared:
 *  - `prism.onboarding.v1` -- first-run state belongs to the device, not the
 *    account. Clearing it would replay the carousel for a returning lifter.
 *  - `prism.demo.*` -- unreachable from a build that has a session to end.
 */
export async function signOutAndTearDown(): Promise<void> {
  await tearDownLocalState({ endRemoteSession: true, accountDeleted: false });
}

/**
 * Raised when the account WAS deleted and the device was not fully cleaned up.
 *
 * The distinction is the whole reason this type exists. `deleteAccountAndTearDown`
 * has two failure regions with opposite meanings, and collapsing them into one
 * `catch` is how a lifter gets told "your account and your data are unchanged"
 * over an account that no longer exists -- which is exactly what shipped, and
 * what a review caught.
 */
export class AccountDeletedLocalCleanupError extends Error {
  constructor(cause: unknown) {
    super('Account deleted, but local teardown did not complete');
    this.name = 'AccountDeletedLocalCleanupError';
    this.cause = cause;
  }
}

/**
 * Every local step, each attempted regardless of the ones before it.
 *
 * Previously these ran unguarded in sequence, so a rejected
 * `AsyncStorage.removeItem` skipped the read-model reset, the repository reset
 * AND `markUnauthenticated` -- leaving a half-cleared device still believing it
 * was signed in. That is tolerable for sign-out (the user can try again) and
 * unacceptable after deletion (there is nothing left to sign back into).
 *
 * Returns the first failure rather than throwing, so the caller decides what a
 * partial teardown means. Ordering is unchanged and still load-bearing: the
 * phase flips LAST, so the route gate cannot navigate against half-cleared data.
 */
async function tearDownLocalState(opts: {
  endRemoteSession: boolean;
  accountDeleted: boolean;
}): Promise<unknown | null> {
  let firstFailure: unknown = null;
  const attempt = async (step: () => Promise<void> | void) => {
    try {
      await step();
    } catch (e) {
      if (firstFailure === null) firstFailure = e;
    }
  };

  if (opts.endRemoteSession) {
    // Already best-effort: a lifter left signed in on a shared phone because the
    // network was down is the worst outcome available here.
    await attempt(() => signOutRemote());
  }

  await attempt(async () => {
    useActiveWorkoutStore.getState().discard();
    await flushDraftWrites();
    await AsyncStorage.removeItem(DRAFT_STORAGE_KEY);
  });
  await attempt(() => useTrainingStore.getState().reset());
  await attempt(() =>
    opts.accountDeleted
      ? useEntitlementStore.getState().resetAfterAccountDeletion()
      : useEntitlementStore.getState().reset(),
  );
  await attempt(() => resetRepository());
  // Not inside `attempt`: if this throws the app is unrecoverable anyway, and
  // swallowing it would leave the route gate pointing at a dead session.
  useSessionStore.getState().markUnauthenticated();

  return firstFailure;
}


/**
 * DELETE THE ACCOUNT, then tear down exactly as sign-out does.
 *
 * `Docs/invariants.md` I-10. Irreversible, and the ordering matters as much as
 * it does above, for a different reason.
 *
 * **The remote delete goes first, and its failure is NOT swallowed.** That is
 * the one place this deliberately diverges from `signOutAndTearDown`, which
 * ignores a failed `signOut` because local teardown must happen regardless.
 * Here the opposite is true: if the server did not delete the account, wiping
 * the device and returning the lifter to a sign-in screen would tell them their
 * data was erased when it is all still there. A failed deletion has to surface
 * as a failed deletion, so the error propagates and the caller keeps the person
 * on a screen that can say so.
 *
 * Once the delete succeeds there is no session left to end cleanly, so the
 * local half runs unconditionally -- including `signOutAndTearDown`'s own
 * best-effort `signOut`, which will simply fail against a user that no longer
 * exists and be ignored, which is correct.
 */
export async function deleteAccountAndTearDown(): Promise<void> {
  // REGION 1 -- nothing irreversible has happened yet.
  //
  // A throw here means the account still exists, the device is untouched, and
  // the lifter is exactly where they were. The screen may say so.
  await getRepository().deleteAccount();

  // REGION 2 -- the account is gone. Nothing below can undo that.
  //
  // The remote session is deliberately NOT ended first: there is no user left
  // to sign out, and the call would fail against a deleted account and waste a
  // round trip on the one path where the lifter is waiting.
  //
  // Every local step is attempted even if an earlier one fails, and the phase
  // still flips last. A failure here is real and worth telling the truth
  // about, but it is a *cleanup* failure -- reporting it as "your account is
  // unchanged" is a lie, and reporting nothing leaves stale data on the device
  // with no explanation.
  const failure = await tearDownLocalState({ endRemoteSession: false, accountDeleted: true });
  if (failure !== null) throw new AccountDeletedLocalCleanupError(failure);
}
