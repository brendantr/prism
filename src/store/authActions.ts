import AsyncStorage from '@react-native-async-storage/async-storage';
import { resetRepository } from '@/data/repository';
import { signOut as signOutRemote } from '@/data/supabase/auth';
import { DRAFT_STORAGE_KEY, useActiveWorkoutStore } from './activeWorkoutStore';
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
 *
 * TODO(docs): propose this as `Docs/invariants.md` I-19 ("sign-out leaves no
 * prior user's data on the device"), with the tests in
 * `src/store/__tests__/authActions.test.ts` as its enforcement evidence.
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
  //    the store's own subscriber turns into a `removeItem`; that write is
  //    fire-and-forget, so the key is removed explicitly here too. Otherwise
  //    teardown would be complete only eventually, which is not a property a
  //    test can assert or a user can rely on.
  useActiveWorkoutStore.getState().discard();
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
