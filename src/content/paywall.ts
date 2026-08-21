import type { PurchaseFailure } from '@/domain/entitlements';

/**
 * PAYWALL COPY
 * ============
 * Every string on the purchase surface, per D11: user-facing vocabulary lives in
 * `src/content/`, never in a screen or a store.
 *
 * Four constraints, all asserted by `src/content/__tests__/paywallCopy.test.ts`
 * rather than left to review:
 *
 *  1. **Nothing diagnostic, clinical or preventive** (I-8). A paywall is the
 *     single most tempting place in a training app to overclaim — "train
 *     smarter", "avoid setbacks", "know when to back off" all drift toward a
 *     health claim in exchange for a sale. The regex rejects the vocabulary; the
 *     rule is that this screen sells a *view of your own data*, nothing more.
 *  2. **Original wording** (I-13). No other product's paywall phrasing, framing
 *     or feature-list structure. The lists below name PRism's actual screens in
 *     PRism's own voice, and the offer is described in the plainest terms
 *     available: one payment, and here is exactly what it opens.
 *  3. **No configuration or vendor detail** (I-4/I-5). The payment processor,
 *     the backend, and the internal product identifiers are not a lifter's
 *     business and never appear. "Your app store" is the whole of what they need
 *     to know about the mechanism.
 *  4. **The free half is stated as loudly as the paid half.** Not a courtesy —
 *     the product decision is that logging and your own data are free forever
 *     (`Docs/decisions/ADR-0005-monetization.md`), and a paywall that only lists
 *     what it takes away misrepresents that. `FREE_FOREVER` is rendered on the
 *     same screen, above the fold's second half, not in a footnote.
 *
 * **No price is written here.** The store owns the price, in the lifter's own
 * currency, and it is shown by the system purchase sheet before anything is
 * charged. A number typed into this file would be wrong in most countries and
 * would go stale the first time it changed.
 */

/** Where the purchase surface lives. Named so screens cannot mistype it. */
export const PAYWALL_ROUTE = '/paywall';

export const PAYWALL = {
  eyebrow: 'One payment, once',
  title: 'The long view',

  /**
   * The offer in one sentence. Says what is being sold — a longer read of your
   * own training — rather than an aspiration about the lifter.
   */
  lede: 'Logging stays free, always. This opens the screens that read your training across months instead of a week.',

  unlocksHeading: 'What this opens',
  unlocks: [
    {
      icon: 'stats-chart' as const,
      title: '4-week and 12-week Insights',
      body: 'Volume, sessions, working sets and muscle balance across a whole training block, not just the last seven days.',
    },
    {
      icon: 'trending-up' as const,
      title: 'Progress',
      body: 'Estimated 1RM and volume for your key lifts, session by session, as far back as you have logged.',
    },
    {
      icon: 'body' as const,
      title: 'Body',
      body: 'Estimated recovery for every muscle group, ranked, from the sessions you actually logged.',
    },
  ],

  freeHeading: 'What stays free',
  freeForever: [
    'Logging every session, set, weight and RPE',
    'Your full History, however far back it goes',
    'Daily check-ins, body measurements and your own custom movements',
    'The 7-day Insights view',
  ],

  /**
   * The one thing people most want to know and most often have to hunt for.
   * Stated twice on the screen — here and next to the button — deliberately.
   */
  oneTimeNote: 'One payment. Not a subscription, and there is no second one.',
  storeNote: 'Your app store handles the payment and shows the price before anything is charged.',

  purchaseLabel: 'Unlock the long view',
  purchaseBusyLabel: 'Talking to your app store…',

  restoreLabel: 'Restore a previous purchase',
  restoreSubtitle: 'Already bought this? Bring it back on this device.',
  restoreBusyLabel: 'Looking for your purchase…',
  unavailableNotice:
    'Purchases are not available in this build right now. Your free logging and History are unaffected.',

  dismissLabel: 'Not now',
  closeLabel: 'Close',

  // --- Outcomes -----------------------------------------------------------

  purchasedTitle: 'Unlocked',
  purchasedMessage: 'Progress, Body and the longer Insights views are open on this account.',

  restoredTitle: 'Restored',
  restoredMessage: 'The longer views are available on this Repello account.',

  /** Shown where a locked surface is listed but not opened. */
  lockedBadge: 'Locked',
  lockedRowHint: 'Part of the one-time unlock',

  /** Shown on Insights when a locked window is chosen. */
  lockedWindowNotice:
    'The 4-week and 12-week views are part of the one-time unlock. The 7-day view stays free.',

  /** The whole-screen state for Progress and Body when they are locked. */
  lockedScreenTitle: 'Part of the one-time unlock',
  lockedScreenBody:
    'This screen reads across every session you have logged. Your sessions themselves stay where they are, in History, free.',
  lockedScreenAction: 'See what it opens',
} as const;

/** Add the store-localized price only when RevenueCat returned the exact product. */
export function paywallPurchaseLabel(priceString: string | null): string {
  return priceString ? `${PAYWALL.purchaseLabel} · ${priceString}` : PAYWALL.purchaseLabel;
}

/**
 * What went wrong, in the lifter's terms.
 *
 * Copy is deliberately cautious about store state. A network failure can occur
 * after the system sheet has done work, so unknown/network outcomes never claim
 * that no charge exists; they direct the lifter to Restore before retrying.
 * `'cancelled'` is not an error and has no sentence.
 */
export const PURCHASE_OUTCOME_COPY: Record<Exclude<PurchaseFailure, 'cancelled'>, string> = {
  network:
    'The app store could not confirm the result. When you are back online, use Restore before trying to buy again.',
  storeUnavailable: 'Your app store is not available on this device right now. Nothing was charged.',
  notAllowed: 'This device is not set up to make purchases. Nothing was charged.',
  nothingToRestore:
    'No purchase was found for the store account signed in on this device. If you bought Repello with a different one, sign into that account and try again.',
  /**
   * The one message here that must NOT say "nothing was charged", because
   * something was. It says what is true instead: the payment went through and
   * the unlock is still on its way.
   */
  awaitingServer:
    'Your app store confirmed the payment, but access has not reached your Repello account yet. Close and reopen this screen, or use Restore to check again.',
  unknown:
    'The app store did not confirm completion. Check your store purchase history or use Restore before trying again.',
};

/** Title over the message above. Kept short; the message carries the meaning. */
export const PURCHASE_OUTCOME_TITLE: Record<Exclude<PurchaseFailure, 'cancelled'>, string> = {
  network: 'No connection',
  storeUnavailable: 'Store unavailable',
  notAllowed: 'Purchases are turned off',
  nothingToRestore: 'Nothing to restore',
  awaitingServer: 'Almost there',
  unknown: 'Purchase not completed',
};
