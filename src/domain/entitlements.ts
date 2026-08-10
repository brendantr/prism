/**
 * ENTITLEMENTS
 * ============
 * What a lifter has paid for, and which surfaces that unlocks. Pure on purpose,
 * for the same reason `routing.ts` and `account.ts` are: this repository has no
 * component-test tooling by decision (`Docs/sprints/2026-08-01-onboarding-ui-redesign.md`
 * Decision 6), so a gating rule left inside a screen is a rule with no coverage
 * at all — and this is the one class of rule where "no coverage" means either
 * giving paid surfaces away or locking a paying lifter out of them.
 *
 * WHAT THIS MODULE IS NOT
 * -----------------------
 * **It is not the authority on whether anyone has paid.** `Docs/invariants.md`
 * I-9 is explicit and has no exception process: an entitlement is established
 * server-side and never from a value the client can set. The authority is a row
 * in Postgres, written only by the RevenueCat webhook holding the service-role
 * key (`supabase/migrations/0009_entitlements.sql`,
 * `supabase/functions/revenuecat-webhook/`), and readable by its owner through a
 * select-only RLS policy.
 *
 * What lives here is the *rendering* consequence of that fact: given a phase the
 * store resolved from the server, which rows are locked. A modified client can
 * flip these predicates and see the Progress screen; it cannot manufacture the
 * row, and nothing behind the paywall is data it does not already own. That is
 * the honest boundary, and it is worth stating rather than implying that a
 * client-side predicate is a security control.
 */

/**
 * Mirrors `entitlementStore.phase`. Duplicated structurally so `src/domain`
 * imports no store — the same arrangement `SessionPhase` has in `routing.ts`.
 *
 * WHY THERE IS NO 'error' PHASE
 * -----------------------------
 * Exactly `sessionStore`'s argument, one domain over. A failed entitlement read
 * is behaviourally identical to not being entitled — you show the paywall either
 * way — so an error phase would be a state with no distinct UI and no clear
 * exit. Transient failures (a rejected purchase, a network drop during restore)
 * are surface state and live in the store's `lastFailure`, never in the phase.
 *
 * The four states, and what each one means for gating:
 *
 *  - `'unknown'`     nothing resolved yet. Gates as **locked**: an entitlement
 *                    nobody has confirmed is not an entitlement. This fails in
 *                    the direction that is recoverable — a paying lifter sees a
 *                    lock for the moment before `refresh()` lands, rather than
 *                    the paid surfaces being given away to every cold start.
 *  - `'entitled'`    a live, unrevoked row exists for this account.
 *  - `'notEntitled'` resolved, and there is no such row.
 *  - `'disabled'`    explicit demo mode only. Gates as **unlocked**, because a
 *                    demo has no account and intentionally demonstrates the
 *                    whole product. A real-backend build missing its public
 *                    store key does NOT use this phase: it still reads the
 *                    server and fails closed for paid surfaces.
 */
export type EntitlementPhase = 'unknown' | 'entitled' | 'notEntitled' | 'disabled';

/**
 * The one thing PRism sells.
 *
 * A **non-consumable**, not a subscription: a single purchase that unlocks the
 * paid surfaces permanently (`Docs/decisions/ADR-0005-monetization.md`). Named
 * here rather than in the store so the paywall, the purchase call and the
 * entitlement row cannot drift apart, and so a test can name it.
 *
 * `productId` is the identifier configured in App Store Connect and Google Play;
 * `entitlementId` is RevenueCat's own name for the thing the product grants.
 * They are deliberately different strings — the store sells a product, the
 * entitlement is what the product is for, and conflating them is what makes a
 * second product (a bundle, a promo) impossible to add later without a migration.
 */
export const PRO_PRODUCT_ID = 'app.prism.trainer.pro.lifetime';
export const PRO_ENTITLEMENT_ID = 'pro';

/**
 * The server's answer, as the client reads it back out of Postgres.
 *
 * `revokedAt` exists because a refund is not a deletion: the row stays, carrying
 * when the grant ended, so "never bought it" and "bought it and was refunded"
 * are distinguishable in support and in an export. Only the webhook ever writes
 * either timestamp.
 */
export interface EntitlementRecord {
  entitlementId: string;
  productId: string;
  grantedAt: string;
  revokedAt: string | null;
  /** Which server-side path wrote this row. Never a client. */
  source: string;
}

/**
 * Server row -> phase. Total, and deliberately boring.
 *
 * The absence of a row and the presence of a revoked one both resolve to
 * `'notEntitled'`: they differ in what happened, not in what the lifter may see.
 */
export function resolveEntitlementPhase(record: EntitlementRecord | null): EntitlementPhase {
  if (!record) return 'notEntitled';
  if (record.entitlementId !== PRO_ENTITLEMENT_ID || record.productId !== PRO_PRODUCT_ID) {
    return 'notEntitled';
  }
  return record.revokedAt == null ? 'entitled' : 'notEntitled';
}

/**
 * Whether a surface should be shown locked.
 *
 * **Takes a per-surface flag, never a blanket one.** `DEEPER_SURFACES` is one
 * array rendered by both Today and Insights, and `history` sits in it beside
 * `progress` and `body` while being free forever — a single "is this row
 * gated?" boolean applied to the array would have locked a lifter out of their
 * own finished sessions, which is precisely the thing this product promises
 * never to charge for.
 */
export function isSurfaceLocked(opts: {
  requiresPro: boolean;
  phase: EntitlementPhase;
}): boolean {
  if (!opts.requiresPro) return false;
  return opts.phase !== 'entitled' && opts.phase !== 'disabled';
}

/** The Insights window that stays free forever. */
export const FREE_INSIGHTS_WINDOW_DAYS = 7;

/** Every window the selector offers, free one first. */
export const INSIGHTS_WINDOW_DAYS = [7, 28, 84] as const;
export type InsightsWindowDays = (typeof INSIGHTS_WINDOW_DAYS)[number];

/**
 * Whether an Insights window needs the unlock.
 *
 * 7 days is free at every phase, including `'unknown'`. That is not generosity —
 * it is what keeps the screen usable while the entitlement resolves, and it is
 * why the free window is also the selector's fallback when a locked one is
 * chosen.
 */
export function isInsightsWindowLocked(days: number, phase: EntitlementPhase): boolean {
  return isSurfaceLocked({ requiresPro: days > FREE_INSIGHTS_WINDOW_DAYS, phase });
}

/**
 * Where a locked selection lands instead.
 *
 * The window selector stays operable while locked: tapping 4 weeks opens the
 * paywall and leaves the screen showing the free window, rather than leaving a
 * dead segment selected over a blank card.
 */
export function resolveInsightsWindow(
  requested: number,
  phase: EntitlementPhase,
): InsightsWindowDays {
  if (isInsightsWindowLocked(requested, phase)) return FREE_INSIGHTS_WINDOW_DAYS;
  const match = INSIGHTS_WINDOW_DAYS.find((d) => d === requested);
  return match ?? FREE_INSIGHTS_WINDOW_DAYS;
}

/**
 * Whether this build may show a paywall or a purchase control at all.
 *
 * Same shape and same reasoning as `canOfferSignOut` in `account.ts`: absent
 * rather than disabled. A demo build has no account to attach a purchase to and
 * no store to take one, so it resolves to `'disabled'` and renders nothing.
 * A real build with incomplete purchase configuration stays fail-closed in
 * `'unknown'`/`'notEntitled'`; the paywall can explain that the store is
 * unavailable without unlocking anything.
 */
export function canOfferPurchase(phase: EntitlementPhase): boolean {
  return phase === 'notEntitled' || phase === 'unknown';
}

/**
 * PURCHASE AND RESTORE FAILURES
 * =============================
 * The closed set, in the spirit of `AuthFailure`: a raw store-kit or RevenueCat
 * rejection never reaches a screen. Those carry receipt identifiers, product
 * ids and provider internals, none of which mean anything to a lifter and some
 * of which are configuration detail (I-5).
 *
 * `'cancelled'` is a *success* of a kind — the person changed their mind — and
 * rides this channel so the caller has one outcome to switch on. The copy layer
 * is what keeps it from being rendered as an error.
 */
export type PurchaseFailure =
  | 'cancelled'
  | 'network'
  | 'storeUnavailable'
  | 'notAllowed'
  | 'nothingToRestore'
  /**
   * The store said yes and the server has not caught up.
   *
   * Its own outcome because it is the only one where the lifter **has** been
   * charged, and every other sentence on this screen promises they have not.
   * The grant arrives by webhook, which is asynchronous by nature — the poll
   * below usually outlives the gap, and when it does not, the honest thing to
   * say is "it is on its way", not "something went wrong".
   */
  | 'awaitingServer'
  | 'unknown';

/**
 * How long to keep asking the server after the store says a purchase completed.
 *
 * The entitlement is written by a webhook, so it does not exist at the instant
 * the purchase sheet dismisses — there is a real gap between "the store charged
 * me" and "Postgres knows". Refreshing once would show the paywall to somebody
 * who just paid, which is the worst moment in this whole flow to be wrong.
 *
 * Delays rather than a fixed interval: the first read is immediate because the
 * webhook is usually already in, and the rest back off so a genuinely slow
 * delivery is not hammered. Total wall time is under fifteen seconds, which is
 * about as long as anyone will watch a spinner after paying.
 *
 * Exported as data, and pure, so the schedule can be asserted without waiting
 * for it.
 */
export const ENTITLEMENT_POLL_DELAYS_MS: readonly number[] = [0, 1200, 2500, 4000, 6000];

/**
 * The shape read off a RevenueCat rejection.
 *
 * Structural rather than importing the SDK's error class: this module is in
 * `src/domain`, which imports nothing from `src/data` (`Docs/architecture.md`
 * §Layering), and the mapping is a rule about codes, not about a class.
 */
export interface PurchaseErrorLike {
  message?: unknown;
  code?: unknown;
  userCancelled?: unknown;
  readonly userInfo?: { readonly readableErrorCode?: unknown } | undefined;
}

function asText(value: unknown): string {
  return typeof value === 'string' ? value.toLowerCase() : '';
}

/**
 * Map any purchase/restore rejection onto one code.
 *
 * Unrecognised shapes become `'unknown'`, never a passed-through message —
 * an error nobody anticipated is exactly the one most likely to name something
 * internal.
 */
export function toPurchaseFailure(error: unknown): PurchaseFailure {
  if (error == null || typeof error !== 'object') return 'unknown';

  const { message, code, userCancelled, userInfo } = error as PurchaseErrorLike;
  const text = asText(message);
  const codeText = asText(code) || asText(userInfo?.readableErrorCode);

  // Cancellation first, and by its own flag: RevenueCat sets `userCancelled`
  // on the error rather than using a distinct code on every platform, and
  // reading a cancellation as a failure is how someone who tapped "Cancel" gets
  // told something went wrong.
  if (userCancelled === true || codeText.includes('purchase_cancelled')) return 'cancelled';

  if (codeText.includes('network') || text.includes('network') || text.includes('offline')) {
    return 'network';
  }
  if (codeText.includes('store_problem') || codeText.includes('unsupported')) {
    return 'storeUnavailable';
  }
  if (codeText.includes('not_allowed') || codeText.includes('payment_pending')) {
    return 'notAllowed';
  }

  return 'unknown';
}
