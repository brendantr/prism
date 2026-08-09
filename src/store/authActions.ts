import AsyncStorage from '@react-native-async-storage/async-storage';
import { getRepository, resetRepository } from '@/data/repository';
import { signOut as signOutRemote } from '@/data/supabase/auth';
import { DRAFT_STORAGE_KEY, flushDraftWrites, useActiveWorkoutStore } from './activeWorkoutStore';
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
  // 1. End the session and clear it from the Keychain.
  //
  //    `auth.signOut` already swallows its own errors, and this catches anyway:
  //    every step below is a local guarantee, and none of them should depend on
  //    a transport call in another module continuing to never reject. A lifter
  //    left signed in on a shared phone because the network was down is the
  //    worst outcome available here, and it must not be one bad promise away.
  try {
    await signOutRemote();
  } catch {
    // Deliberately ignored -- local teardown is not optional.
  }

  // 2. Drop the in-progress draft. `discard()` sets `workout` to null, which
  //    the store's own subscriber turns into a queued `removeItem`.
  //
  //    `flushDraftWrites()` then waits for the queue to drain. Removing the key
  //    without that wait was not enough on its own: a `setItem` from the last
  //    logged set could still be in flight, and landing after this line would
  //    put the draft back on disk for whoever signs in next. Draining first and
  //    removing after makes the order total.
  useActiveWorkoutStore.getState().discard();
  await flushDraftWrites();
  await AsyncStorage.removeItem(DRAFT_STORAGE_KEY);

  // 3. Empty the read model. This is the actual leak fix: the arrays here are
  //    what would otherwise still be in memory when the next lifter signs in.
  useTrainingStore.getState().reset();

  // 4. Defence in depth. `SupabaseRepository` is stateless today, so this
  //    changes nothing observable -- it is here so that a future cached field
  //    on the instance is covered by a teardown path that already exists.
  resetRepository();

  // 5. Last. This is what the route gate watches.
  useSessionStore.getState().markUnauthenticated();
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
  // 1. The irreversible part. Throws on failure; nothing local has happened yet,
  //    so a failure here leaves the lifter exactly where they were.
  await getRepository().deleteAccount();

  // 2. Everything else is the sign-out path, unchanged. Reusing it rather than
  //    repeating it is deliberate: a store added to the teardown later must not
  //    be cleared on sign-out and forgotten on deletion, which is precisely the
  //    kind of divergence that leaves a deleted account's data on a device.
  await signOutAndTearDown();
}
