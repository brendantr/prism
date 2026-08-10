# ADR-0005: One-time native purchase for longer analysis, with server-established access

- Status: Accepted
- Date: 2026-08-09
- Sprint: `v1-entitlements`
- Decision owner: Engineer/owner
- Relates to: ADR-0001, ADR-0002, invariants I-4/I-5/I-6/I-8/I-9/I-10/I-13/I-19

## Context

PRism needs a sustainable v1 offer without charging a lifter to record or retrieve their own
training. The owner selected a one-time purchase rather than a recurring subscription and selected
the boundary **free logging, paid analysis**. Apple and Google require their native billing systems
for digital functionality consumed in the app, so a direct Stripe checkout is not the v1 purchase
path. RevenueCat provides one React Native API over both store systems and maps a non-consumable to a
lifetime entitlement.

The difficult decision is not the payment sheet. It is authority. A mobile return value, cached
customer information, or boolean in Zustand is client-controlled and cannot satisfy I-9. Refunds,
restores, transfers, delayed delivery, retries and account switching also occur outside the frame in
which the purchase button was tapped.

## Decision

1. **One non-consumable lifetime product.** The store product identifier is
   `app.prism.trainer.pro.lifetime`; RevenueCat entitlement identifier is `pro`. Both identifiers are
   pinned in the client, webhook parser, database function and contract tests.

2. **Logging and owned data remain free.** Workout logging, full History, seven-day Insights,
   check-ins, measurements, custom exercises, profile and settings are not gated. The purchase opens
   28/84-day Insights, Progress and Body. Paywall copy sells a longer view of the lifter's own data;
   it makes no health, prevention or diagnostic claim.

3. **RevenueCat is purchase transport, never entitlement authority.** `purchasePackage`,
   `restorePurchases` and `CustomerInfo` may trigger a server poll and influence outcome copy. They
   never set the app phase to entitled. In a real build, only an unrevoked row returned by
   `Repository.getEntitlement()` can do that.

4. **The server establishes access.** RevenueCat sends authenticated lifecycle events to a Supabase
   Edge Function. The function validates the exact contract and calls one service-role-only,
   security-invoker Postgres RPC. Authenticated/anonymous client roles receive select-only/no access:
   an owner can select their own entitlement row and cannot insert, update, delete, or execute the
   write RPC.

5. **Webhook application is atomic, idempotent and ordered.** One event applies every target in one
   transaction. The `(event_id, profile_id, entitlement_id)` target key absorbs at-least-once
   delivery; older events cannot overwrite newer state; a same-timestamp revoke wins over a grant.
   A transfer revokes every valid source UUID and grants exactly one unambiguous destination UUID in
   that transaction. Because RevenueCat's TRANSFER payload identifies accounts but not individual
   products, v1 requires a dedicated PRism RevenueCat project containing only the `pro` entitlement
   and exact lifetime products; adding another product/entitlement requires this parser and ADR to be
   revisited. A delayed event for a deleted profile is ignored and never recreates it.

6. **Supabase UUID is RevenueCat's custom App User ID.** The SDK is configured only after an
   authenticated session exists. Account switching calls `logIn(newUuid)` directly. PRism never
   calls RevenueCat `logOut` during ordinary sign-out: in a custom-ID-only app, that creates an
   anonymous ID and introduces an unnecessary transfer/alias path. Local sign-out instead clears
   PRism's entitlement state before the session phase changes. Permanent account deletion is the
   narrow exception: after the server erases the RevenueCat customer, the SDK logs out locally so a
   later refresh cannot recreate the deleted UUID; the next account is still identified by `logIn`.

7. **Configuration fails closed.** Explicit demo mode unlocks all screens and constructs no SDK or
   backend client. A real build missing its public RevenueCat key still asks Postgres for access and
   keeps paid surfaces locked; it never becomes a free edition. A remotely configured offering must
   contain the exact lifetime product. PRism never falls back to the first package.

8. **Restore is first-class.** Restore exists on both the paywall and Account surface. The selected
   RevenueCat restore behavior is an external release decision and must be set to the documented
   authenticated-app transfer behavior before submission. `TRANSFER` is handled explicitly because
   RevenueCat does not send separate revoke/grant lifecycle events for that move.

9. **Purchase data participates in privacy lifecycle.** The entitlement is included in the versioned
   account export. Account deletion calls a user-authenticated Edge Function with no caller-supplied
   id: it deletes the gateway-verified UUID from RevenueCat first, then invokes the existing
   no-argument `delete_my_account` RPC under that JWT. A processor failure stops before database
   deletion, so the app cannot claim that all data is gone while the RevenueCat customer remains.
   The database delete cascades through entitlement/event-target rows. Privileged RevenueCat and
   Supabase credentials remain server-only environment values.

## Consequences

### Positive

- One purchase works across iOS and Android through store-native billing.
- Logging remains useful without payment, including during entitlement resolution or outages.
- A modified client cannot mint the Postgres row that the real app trusts.
- Duplicate, stale, refund and transfer events have deterministic outcomes.
- Store-localized pricing is shown when the exact product is available; no currency amount is baked
  into the app.

### Negative or accepted

- Access after purchase is asynchronous because it waits for the webhook. The client polls briefly
  and then reports an honest "confirmed by store, waiting for account" state.
- RevenueCat dashboard configuration, store product creation, webhook availability/plan, Supabase
  deployment and real sandbox purchases remain external owner work. Repository tests cannot prove
  them.
- A transfer with multiple PRism UUIDs in the destination customer fails closed for manual
  investigation instead of guessing which account to grant.
- Account deletion now depends on both Edge Functions and a least-privilege RevenueCat customer-
  deletion secret; missing configuration fails without deleting the database account.
- UI gating is not a secrecy boundary. A modified client can render analysis over data it already
  owns; it cannot create a valid server entitlement.

## Alternatives considered

- **Subscription.** Rejected for v1 by the owner; the product does not yet promise recurring service
  sufficient to justify recurring billing.
- **Paid app download.** Rejected because it removes the free logging tier and makes an existing
  user's upgrade/restore state less explicit in the backend.
- **Stripe/direct web payment.** Rejected for the native v1 unlock because it does not fit the mobile
  stores' in-app digital-goods path.
- **Trust RevenueCat `CustomerInfo` directly.** Rejected by I-9 and because it makes the client the
  only durable view of refunds/transfers.
- **Call RevenueCat `logOut` on ordinary PRism sign-out.** Rejected because it creates an anonymous
  customer on every account switch. The post-erasure account-deletion exception is required to stop
  the still-running SDK from reusing a deleted UUID.

## Evidence and operations

- Implementation: `src/domain/entitlements.ts`, `src/data/purchases.ts`,
  `src/store/entitlementStore.ts`, `app/paywall.tsx`, gated analysis screens.
- Server: `supabase/migrations/0009_entitlements.sql`,
  `supabase/functions/revenuecat-webhook/`.
- Tests: entitlement domain/store/transport tests, pure webhook parser tests, and
  `supabase/tests/rls/09_run_entitlement_tests.sql`.
- Owner setup and sandbox validation: `Docs/revenuecat-release-runbook.md`.

External references: [RevenueCat React Native installation](https://www.revenuecat.com/docs/getting-started/installation/reactnative),
[identifying customers](https://www.revenuecat.com/docs/customers/identifying-customers),
[restore behavior](https://www.revenuecat.com/docs/projects/restore-behavior), and
[webhook delivery/security](https://www.revenuecat.com/docs/integrations/webhooks).
