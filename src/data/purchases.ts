import { Platform } from 'react-native';
import { PRO_ENTITLEMENT_ID, PRO_PRODUCT_ID } from '@/domain/entitlements';
import { DEMO_MODE, isSupabaseConfigured } from './supabase/client';

/**
 * PURCHASE TRANSPORT
 * ==================
 * The only place in the app that touches the RevenueCat SDK, mirroring
 * `src/data/supabase/auth.ts`'s relationship to the Supabase auth API.
 *
 * `entitlementStore` drives the flow but must not reach for the SDK itself:
 * stores sit above `src/data` in the layering, and this module throws on a build
 * with no purchase configuration. Keeping the calls here means the store handles
 * entitlement *state* and this file handles purchase *transport* — and a demo
 * build never loads the native module at all.
 *
 * THIS FILE DOES NOT DECIDE WHO IS ENTITLED
 * -----------------------------------------
 * `Docs/invariants.md` I-9, which has no exception process: an entitlement is
 * established server-side and never from a value the client can set. What the
 * SDK does here is *take a payment* and *ask the store to re-deliver a previous
 * one*. The answer to "is this account entitled?" is a row in Postgres, written
 * by the RevenueCat webhook holding the service-role key, and read back through
 * a select-only RLS policy (`src/data/repository.ts` `getEntitlement`).
 *
 * `restorePurchases` below returns a boolean, and that boolean is used to
 * *decide whether to wait and re-read the server*, never as the entitlement
 * itself. The distinction is the whole invariant.
 *
 * KEYS
 * ----
 * `EXPO_PUBLIC_REVENUECAT_IOS_KEY` and `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY` are
 * RevenueCat's **public SDK keys** — inlined into the bundle by design, exactly
 * like `EXPO_PUBLIC_SUPABASE_ANON_KEY`, and safe there for the same reason: they
 * can start a purchase and read a customer's own state, and nothing else.
 *
 * **The RevenueCat secret key is never here, never in `.env.example`, and never
 * anywhere in this repository** (I-4, which names it explicitly and has no
 * exception process). It lives only in the Edge Function's environment, on the
 * server, where the client cannot reach it.
 */

const iosKey = process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY ?? '';
const androidKey = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY ?? '';

type PurchasesSdk = typeof import('react-native-purchases').default;
let purchasesSdkOverride: PurchasesSdk | null = null;

/** The public SDK key for the platform this bundle is running on. */
function publicSdkKey(): string {
  return Platform.select({ ios: iosKey, android: androidKey, default: '' }) ?? '';
}

/** A key is present for this platform. Says nothing about whether it is *correct*. */
export function hasPurchaseCredentials(): boolean {
  return publicSdkKey().length > 0;
}

/**
 * Whether this build has the server-side entitlement path.
 *
 * Two conditions, and each excludes a build for its own reason:
 *
 *  - **Demo** — there is no account to attach a purchase to and no server to
 *    record it against. A demo build must never show a paywall; it would be an
 *    offer that cannot be accepted.
 *  - **Supabase unconfigured** — the entitlement lives in Postgres. Taking money
 *    with nowhere to write the result down is the worst failure available in
 *    this module, so it is excluded structurally rather than handled.
 * Read as a function rather than a constant so the platform key lookup happens
 * at call time; `DEMO_MODE` and `isSupabaseConfigured` are already resolved at
 * module load in `client.ts`.
 */
export function isEntitlementBackendEnabled(): boolean {
  return !DEMO_MODE && isSupabaseConfigured;
}

/**
 * Whether this build sells anything at all.
 *
 * **A declaration, never an inference — and the distinction is the whole
 * point.** `entitlementStore.initialize()` deliberately refuses to treat a
 * *missing* RevenueCat key as "free", because that would make deleting a key
 * the way to unlock the paid product. This flag is different in kind: it is the
 * build stating, on purpose, that it has no paid tier.
 *
 * Default **off**. A build with no monetization configured therefore ships as a
 * free app with every analysis surface open, instead of gating Progress, Body's
 * recovery estimate and the 28/84-day Insights windows behind a paywall that
 * cannot complete a sale — which is a Guideline 2.1 rejection and, before that,
 * a lifter tapping a locked feature with no way to buy it.
 *
 * The default is chosen against the *failure*, not the happy path. Forgetting
 * to set it when you do sell gives paid features away, which you will notice in
 * a day and which harms nobody. Forgetting it the other way ships an app that
 * looks broken to every user and to App Review.
 *
 * `[open question]` Setting this to `true` **without** a usable RevenueCat
 * offering reproduces exactly the locked-but-unbuyable state described above.
 * That combination is a misconfiguration; `Docs/store-submission-runbook.md`
 * §7a treats it as a release stop condition rather than something the client
 * tries to detect, because the client cannot tell a missing offering from one
 * that has not synced yet.
 */
export function isMonetizationEnabled(): boolean {
  return process.env.EXPO_PUBLIC_MONETIZATION_ENABLED === 'true';
}

/**
 * Modes that intentionally unlock paid UI: explicit demo mode, and any build
 * that declares it has no paid tier.
 */
export function isEntitlementDisabled(): boolean {
  return DEMO_MODE || !isMonetizationEnabled();
}

/** Whether the native purchase transport can be configured on this platform. */
export function isPurchaseTransportEnabled(): boolean {
  return isEntitlementBackendEnabled() && hasPurchaseCredentials();
}

/**
 * The SDK, loaded on first use.
 *
 * Dynamic rather than a top-level import, and for the same reason `getSupabase()`
 * constructs its client lazily: a demo build, and every Jest run, must not load
 * a native module they will never call. A static import would pull the native
 * bridge into the bundle graph of a build that has no store.
 */
async function sdk() {
  if (purchasesSdkOverride) return purchasesSdkOverride;
  const module = await import('react-native-purchases');
  return module.default;
}

/** Test seam: avoids loading a native bridge in Jest. Never used by app code. */
export function __setPurchasesSdkForTests(value: PurchasesSdk | null): void {
  purchasesSdkOverride = value;
}

/**
 * Point the SDK at this account. Called **once per process**.
 *
 * `appUserID` is the Supabase user id, and that is the single most load-bearing
 * line in this file: it is what makes RevenueCat's `app_user_id` — the field the
 * webhook receives — equal to `profiles.id`. Without it the webhook would have
 * no way to know whose entitlement it had just been told about, and would need a
 * mapping table that could go stale.
 *
 * It also means anonymous purchases cannot happen: the SDK is never configured
 * before a session exists, so there is no anonymous id for a purchase to land
 * against and later need merging.
 */
export async function configurePurchases(appUserId: string): Promise<void> {
  const Purchases = await sdk();
  Purchases.configure({ apiKey: publicSdkKey(), appUserID: appUserId });
}

/**
 * Re-point an already-configured SDK at a different account.
 *
 * `configure` may only run once per process; switching lifters on a shared
 * device is `logIn`'s job. RevenueCat's custom-ID guidance is explicit that an
 * app using only custom ids should call `logIn` directly for ordinary account
 * changes and should not call `logOut`, because `logOut` creates an anonymous
 * id. Permanent account deletion is the one exception documented below.
 */
export async function identifyPurchaseUser(appUserId: string): Promise<void> {
  const Purchases = await sdk();
  await Purchases.logIn(appUserId);
}

/**
 * Detach the native SDK from an account that has just been permanently erased.
 *
 * This is the sole deliberate `logOut` call in PRism. Ordinary sign-out must
 * never use it: that would create anonymous identities on every account switch.
 * Account deletion is different. The server has already erased the custom UUID
 * from RevenueCat, and leaving the process configured with that UUID could let a
 * later SDK refresh recreate the customer that the user asked us to delete.
 * RevenueCat creates a fresh anonymous SDK identity here; it is not a PRism
 * account and the next authenticated user is immediately identified by `logIn`.
 */
export async function detachDeletedPurchaseUser(): Promise<void> {
  const Purchases = await sdk();
  await Purchases.logOut();
}

/**
 * Locate the one package this binary is allowed to sell.
 *
 * There is deliberately no "first package" fallback. Offerings are remotely
 * configurable; buying the first unknown package would let a dashboard mistake
 * charge for a different product than the paywall promises. Missing or drifted
 * configuration fails before the store sheet opens.
 */
async function proPackage() {
  const Purchases = await sdk();
  const offerings = await Purchases.getOfferings();
  const packages = offerings.current?.availablePackages ?? [];

  const target = packages.find((p) => p.product.identifier === PRO_PRODUCT_ID) ?? null;

  if (!target) {
    // Shaped so `toPurchaseFailure` reads it as a store problem rather than as
    // an unknown error: it is a configuration state on the store side, and the
    // honest sentence for the lifter is "not available right now".
    throw { code: 'store_problem', message: 'No purchasable package is configured.' };
  }

  return target;
}

/** The store-localized price, or null when the exact lifetime product is absent. */
export async function getProPriceString(): Promise<string | null> {
  try {
    return (await proPackage()).product.priceString;
  } catch {
    return null;
  }
}

/**
 * Buy the one non-consumable this app sells.
 *
 * Resolves when the store reports the purchase completed. **That resolution is
 * not the entitlement** — it is the signal to go and re-read the server, which
 * the webhook will have been told about independently. See `entitlementStore`.
 */
export async function purchasePro(): Promise<void> {
  const Purchases = await sdk();
  const target = await proPackage();

  await Purchases.purchasePackage(target);
}

/**
 * Ask the store to re-deliver a previous purchase.
 *
 * **Mandatory** for a non-consumable under App Store Review Guideline 3.1.1 —
 * a lifter on a new device, or after a reinstall, must have a way to get back
 * what they paid for without paying again.
 *
 * Returns whether the store now reports the unlock as active for this store
 * account. Used only to decide whether the caller should expect the server to
 * agree, and what to say if it does not; the entitlement itself still comes from
 * Postgres (I-9).
 */
export async function restorePurchases(): Promise<boolean> {
  const Purchases = await sdk();
  const info = await Purchases.restorePurchases();
  return info.entitlements.active[PRO_ENTITLEMENT_ID] != null;
}
