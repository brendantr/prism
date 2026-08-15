import { create } from 'zustand';
import { getRepository } from '@/data/repository';
import {
  configurePurchases,
  detachDeletedPurchaseUser,
  getProPriceString,
  identifyPurchaseUser,
  isEntitlementBackendEnabled,
  isEntitlementDisabled,
  isPurchaseTransportEnabled,
  purchasePro,
  restorePurchases,
} from '@/data/purchases';
import {
  ENTITLEMENT_POLL_DELAYS_MS,
  resolveEntitlementPhase,
  toPurchaseFailure,
  type EntitlementPhase,
  type PurchaseFailure,
} from '@/domain/entitlements';

/**
 * ENTITLEMENT
 * ===========
 * Whether this account has paid, and what the app is allowed to show because of
 * it. Modelled directly on `sessionStore`, which is the closest existing thing:
 * a small phase machine over a fact the client cannot decide for itself.
 *
 * THE ONE RULE THIS FILE EXISTS TO KEEP
 * -------------------------------------
 * `Docs/invariants.md` **I-9**, whose exception process is "None": the phase
 * below moves **only** on an answer from Postgres. Not on what the store SDK
 * returned, not on what a previous session cached, not on a boolean anyone set.
 * `purchasePro()` and `restorePurchases()` appear in this file and neither of
 * them sets `phase` — they cause a re-read, and the re-read sets it. If a future
 * edit makes `purchase()` optimistically set `'entitled'`, the invariant is gone
 * and the tests in `src/store/__tests__/entitlementStore.test.ts` say so.
 *
 * WHY THERE IS NO 'error' PHASE
 * -----------------------------
 * `sessionStore`'s argument, unchanged: a failed entitlement read is
 * behaviourally identical to not being entitled — you show the paywall either
 * way — so an error phase would be a state with no distinct UI and no exit.
 * Transient failures (a rejected purchase, a dropped connection during a
 * restore) are surface state and live in `lastFailure`.
 *
 * WHAT A FAILED READ DOES *NOT* DO
 * --------------------------------
 * It does not change the phase. The rule is one line: **the phase only ever
 * moves on a server answer.** A first read that fails leaves `'unknown'`, which
 * gates locked, which is right — nobody has confirmed anything. A later read
 * that fails leaves the last server answer standing, which is also right: a
 * lifter whose connection drops mid-session should not have the screens they
 * paid for taken away by a timeout. Neither direction is ever an *upgrade* on a
 * failure, and that is the property that matters.
 */

export interface EntitlementState {
  phase: EntitlementPhase;
  /** Native SDK configured for the authenticated custom App User ID. */
  purchaseReady: boolean;
  /** Store-localized price for the exact lifetime product, when available. */
  priceString: string | null;
  /** Which store operation is in flight, if any. Two can never run at once. */
  pending: 'purchase' | 'restore' | null;
  /**
   * Outcome of the last attempt. Note `'cancelled'` rides this channel while
   * being a non-event — the surface renders nothing for it, the same way
   * `AUTH_OUTCOME_TONE` keeps `'checkEmail'` from rendering as an error.
   */
  lastFailure: PurchaseFailure | null;
  /** Set once, for the surface to acknowledge, then cleared by `clearOutcome`. */
  lastSuccess: 'purchased' | 'restored' | null;

  /**
   * Resolve the phase for this build and this account.
   *
   * `userId` is the Supabase user id and becomes RevenueCat's `appUserID`, which
   * is what lets the webhook write the row against the right profile. It is
   * **not** used to scope the entitlement query — that comes from `auth.uid()`
   * inside RLS, as every other read does (I-6).
   */
  initialize: (userId: string | null) => Promise<void>;

  /** Re-read the server. The only thing in this store that can set the phase. */
  refresh: () => Promise<void>;

  purchase: (opts?: { pollDelaysMs?: readonly number[] }) => Promise<boolean>;
  restore: (opts?: { pollDelaysMs?: readonly number[] }) => Promise<boolean>;

  clearOutcome: () => void;

  /** Sign-out teardown (I-19). Forgets this account's server answer locally. */
  reset: () => Promise<void>;

  /** Account-deletion teardown: also detaches the erased SDK identity. */
  resetAfterAccountDeletion: () => Promise<void>;
}

/**
 * Process-lifetime latch, matching `sessionStore`'s `authSubscribed` and
 * `getRepository()`'s once-per-process posture.
 *
 * It guards `Purchases.configure()` specifically, which the SDK permits **once
 * per process**. A second lifter signing in on the same device is `logIn`'s job,
 * not a second `configure` — so this latch is not merely an optimisation, and
 * clearing it outside a test would produce a genuinely broken SDK state. That is
 * why sign-out deliberately does not clear it (`reset` below).
 */
let purchasesConfigured = false;
let identifiedPurchaseUserId: string | null = null;
/** Account whose Postgres answer `phase` currently represents. */
let resolvedEntitlementUserId: string | null = null;
let purchaseIdentityTail: Promise<void> = Promise.resolve();

const INITIAL: Pick<
  EntitlementState,
  'phase' | 'purchaseReady' | 'priceString' | 'pending' | 'lastFailure' | 'lastSuccess'
> = {
  phase: 'unknown',
  purchaseReady: false,
  priceString: null,
  pending: null,
  lastFailure: null,
  lastSuccess: null,
};

export const useEntitlementStore = create<EntitlementState>((set, get) => ({
  ...INITIAL,

  initialize: async (userId) => {
    /*
      MODE FIRST, and before anything that could construct an SDK client or
      touch the network. This is `sessionStore.initialize()`'s opening move and
      its reasoning transfers exactly:

        - A **demo** build has no account to attach a purchase to and no server
          to record one against. It must not construct a purchases client, and
          it must not be paywalled — 'disabled' unlocks every surface, so demo
          shows the whole app without anyone inventing an entitlement to do it.
      A real-backend build does not enter this branch merely because its public
      RevenueCat key is absent. It must still ask Postgres whether the account
      is entitled; otherwise missing client configuration would unlock every
      paid surface.
    */
    if (isEntitlementDisabled()) {
      resolvedEntitlementUserId = null;
      set({ ...INITIAL, phase: 'disabled' });
      return;
    }

    // A non-demo build without a backend is a broken release configuration,
    // not a free edition. Stay unknown (locked) and let the existing repository
    // posture surface its configuration error.
    if (!isEntitlementBackendEnabled()) return;

    // Enabled, but the session has not resolved yet. Stay 'unknown' (which gates
    // locked) and let the caller come back — `app/_layout.tsx` re-runs this when
    // the phase and the user id land.
    if (!userId) return;

    // The phase is an account-scoped answer, not a process-scoped cache. A
    // direct A -> B session transition (including one caused by an unexpected
    // auth event rather than the explicit sign-out action) must lock
    // immediately and resolve B from the server; B may never inherit A's paid
    // phase for even one completed initialization.
    if (resolvedEntitlementUserId === userId && get().phase !== 'unknown') return;
    if (resolvedEntitlementUserId !== userId) {
      resolvedEntitlementUserId = userId;
      set({ ...INITIAL });
    }

    let purchaseReady = false;
    let priceString: string | null = null;
    if (isPurchaseTransportEnabled()) {
      try {
        await alignPurchaseIdentity(userId);
        purchaseReady = true;
        priceString = await getProPriceString();
      } catch {
        // The server read below still runs. A transport failure may prevent a
        // new payment; it may never erase an entitlement already on Postgres.
      }
    }
    set({ purchaseReady, priceString });

    await get().refresh();
  },

  refresh: async () => {
    // A build with no store has nothing to read and nothing to be entitled to.
    if (get().phase === 'disabled') return;
    try {
      const record = await getRepository().getEntitlement();
      set({ phase: resolveEntitlementPhase(record) });
    } catch {
      // Deliberately no phase change and deliberately no logging of the error
      // object: it can carry schema detail (I-5). See the header — the phase
      // only ever moves on a server answer, and a failure is not one.
    }
  },

  /**
   * Take the payment, then find out from the server what it meant.
   *
   * The order is the invariant. `purchasePro()` resolving means the *store*
   * charged the card; the entitlement is written by RevenueCat's webhook into
   * Postgres, independently and asynchronously, and that write is the only thing
   * that can unlock anything. So this polls rather than asserts.
   */
  purchase: async (opts) => {
    if (get().phase === 'disabled' || get().pending !== null) return false;
    // A configured SDK is not enough to sell. The exact package must also have
    // resolved a store-localized price; otherwise the offering is missing,
    // drifted or temporarily unreadable and the app must not open a sheet for
    // an offer it cannot describe.
    if (!get().purchaseReady || !get().priceString) {
      set({ lastFailure: 'storeUnavailable', lastSuccess: null });
      return false;
    }
    set({ pending: 'purchase', lastFailure: null, lastSuccess: null });

    try {
      await purchasePro();
    } catch (e) {
      const failure = toPurchaseFailure(e);
      set({ pending: null, lastFailure: failure });
      return false;
    }

    const entitled = await pollForEntitlement(get, opts?.pollDelaysMs);
    set({
      pending: null,
      // Charged, but the grant has not arrived. The one outcome whose copy must
      // not claim nothing was charged.
      lastFailure: entitled ? null : 'awaitingServer',
      lastSuccess: entitled ? 'purchased' : null,
    });
    return entitled;
  },

  /**
   * Guideline 3.1.1: a non-consumable must be restorable.
   *
   * The SDK's answer is used to decide *what to say*, never to grant anything.
   * `false` means the store has no record for the store account on this device,
   * which is a different problem from a slow webhook and deserves a different
   * sentence — telling someone to wait when there is nothing coming is worse
   * than telling them to check which store account they are signed into.
   */
  restore: async (opts) => {
    if (get().phase === 'disabled' || get().pending !== null) return false;
    if (!get().purchaseReady) {
      set({ lastFailure: 'storeUnavailable', lastSuccess: null });
      return false;
    }
    set({ pending: 'restore', lastFailure: null, lastSuccess: null });

    let storeHasIt = false;
    try {
      storeHasIt = await restorePurchases();
    } catch (e) {
      set({ pending: null, lastFailure: toPurchaseFailure(e) });
      return false;
    }

    if (!storeHasIt) {
      // Still re-read the server before saying no: a lifter whose grant exists
      // in Postgres but whose store account has since changed is entitled, and
      // telling them otherwise would be wrong in the direction that costs them
      // money.
      await get().refresh();
      const alreadyEntitled = get().phase === 'entitled';
      set({
        pending: null,
        lastFailure: alreadyEntitled ? null : 'nothingToRestore',
        lastSuccess: alreadyEntitled ? 'restored' : null,
      });
      return alreadyEntitled;
    }

    const entitled = await pollForEntitlement(get, opts?.pollDelaysMs);
    set({
      pending: null,
      lastFailure: entitled ? null : 'awaitingServer',
      lastSuccess: entitled ? 'restored' : null,
    });
    return entitled;
  },

  clearOutcome: () => set({ lastFailure: null, lastSuccess: null }),

  /**
   * Sign-out teardown (I-19).
   *
   * Back to `'unknown'`, not to `'notEntitled'`: the next lifter on this device
   * has had nothing confirmed about them, and `'unknown'` is the state that says
   * so. It also re-arms `initialize`, which returns early on any other phase.
   *
   * RevenueCat is deliberately not logged out. This app uses custom IDs only;
   * `logOut` would create an anonymous customer and introduce a purchase-
   * transfer path. The SDK stays configured for the process and a different
   * next account is re-pointed with `logIn`.
   */
  reset: async () => {
    resolvedEntitlementUserId = null;
    set({ ...INITIAL });
  },

  /**
   * The only path that calls RevenueCat `logOut`.
   *
   * The authenticated server deletion has already erased this UUID. Detaching
   * now prevents the still-running native SDK from recreating that customer on
   * a later refresh. Even if native cleanup fails, local state is cleared and
   * the latch is re-armed so the next account is identified with `logIn`.
   */
  resetAfterAccountDeletion: async () => {
    try {
      if (purchasesConfigured) await detachDeletedPurchaseUser();
    } finally {
      identifiedPurchaseUserId = null;
      resolvedEntitlementUserId = null;
      set({ ...INITIAL });
    }
  },
}));

/** Serialize configure/logIn so React Strict Mode cannot race SDK identity. */
async function alignPurchaseIdentity(userId: string): Promise<void> {
  const work = purchaseIdentityTail.then(async () => {
    if (!purchasesConfigured) {
      await configurePurchases(userId);
      purchasesConfigured = true;
      identifiedPurchaseUserId = userId;
      return;
    }
    if (identifiedPurchaseUserId !== userId) {
      await identifyPurchaseUser(userId);
      identifiedPurchaseUserId = userId;
    }
  });
  purchaseIdentityTail = work.catch(() => undefined);
  await work;
}

/**
 * Ask the server, repeatedly, until it agrees or the schedule runs out.
 *
 * Free function rather than a store action: it is a retry loop over `refresh`,
 * it has no state of its own, and exposing it on the store would invite a screen
 * to call it directly and start a second poll over the first.
 */
async function pollForEntitlement(
  get: () => EntitlementState,
  delaysMs: readonly number[] = ENTITLEMENT_POLL_DELAYS_MS,
): Promise<boolean> {
  for (const delay of delaysMs) {
    if (delay > 0) await sleep(delay);
    await get().refresh();
    if (get().phase === 'entitled') return true;
  }
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Test seam. Resets the module-level latch alongside the store, matching
 * `__resetSessionSubscriptionForTests` in `sessionStore.ts`.
 */
export function __resetEntitlementSubscriptionForTests(): void {
  purchasesConfigured = false;
  identifiedPurchaseUserId = null;
  resolvedEntitlementUserId = null;
  purchaseIdentityTail = Promise.resolve();
}

/** Test seam. Whether `Purchases.configure` has already run in this process. */
export function __isPurchasesConfiguredForTests(): boolean {
  return purchasesConfigured;
}
