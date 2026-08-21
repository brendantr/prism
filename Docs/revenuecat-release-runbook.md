# RevenueCat lifetime unlock — owner release runbook

> Owner-only external setup. Never paste a key, authorization value, receipt, user UUID or webhook
> payload into this repository, a prompt, a ticket or a command transcript. This document names
> settings and variables only. Repository work does not authorize charges, production changes or a
> store submission.

## 1. Contract to create in the stores and RevenueCat

1. In App Store Connect, create a **non-consumable** product with identifier
   `app.prism.trainer.pro.lifetime`. Complete price, localization and review metadata.
2. In Google Play Console, create a **one-time product** with the same identifier. Activate its
   purchase option and complete price/localization.
3. In a **dedicated Repello RevenueCat project**, add the iOS and Android apps using Repello's retained
   bundle/package id `app.prism.trainer` and connect the store credentials in RevenueCat's dashboard.
   Keep this project limited to the `pro` entitlement and the two platform representations of the
   exact lifetime product. RevenueCat TRANSFER events identify the accounts moved but do not identify
   individual products; the v1 webhook can handle them safely only while this one-product project
   contract remains true. Adding another product or entitlement requires a webhook design review first.
4. Import both products. Create entitlement `pro` and attach both store products to it.
5. Create the current/default Offering and add one lifetime/custom package containing those products.
   Verify the package's platform product identifier is exactly the contract above. Repello deliberately
   refuses every other package.
6. Set RevenueCat's project **restore behavior** for authenticated users to transfer purchases to the
   new App User ID. Record the selected behavior in the release evidence. A transfer removes access
   from the source Repello account and grants it to the destination.
7. Confirm the RevenueCat plan in use supports webhooks before any release/spend decision. Do not
   assume account creation alone includes that capability.

## 2. Deploy the server authority

For each Supabase environment (staging first, production only after staging evidence):

1. Apply every unapplied migration through `supabase/migrations/0009_entitlements.sql`. Do not rewrite
   an older migration. Confirm the `entitlements` and `revenuecat_event_targets` tables, owner SELECT
   policy, and service-role-only RPC exist.
2. Create a high-entropy dedicated webhook authorization value in the environment's secret manager
   under `REVENUECAT_WEBHOOK_AUTH`. It is not a RevenueCat API key. Do not add it to EAS or the mobile
   app.
3. Confirm the Edge Function runtime supplies `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and
   `SUPABASE_SERVICE_ROLE_KEY` as server-only values. Never create an `EXPO_PUBLIC_` form of the
   service-role credential. The delete function uses the runtime public anon key only to forward the
   platform-verified caller's JWT to the no-argument database deletion RPC.
4. Create a dedicated RevenueCat **secret** API key with only the customer-information
   `customers:read_write` permission needed to delete a customer. Store it as
   `REVENUECAT_SECRET_API_KEY`, and store the non-secret project identifier as
   `REVENUECAT_PROJECT_ID`, in the Edge Function environment. Neither belongs in EAS, the app, a
   prompt, or this repository.
5. Deploy `revenuecat-webhook` from `supabase/functions/revenuecat-webhook/`. Confirm
   `supabase/config.toml` makes `verify_jwt = false`; the handler performs its own exact
   `Authorization` comparison because RevenueCat cannot send a Supabase user JWT.
6. Deploy `delete-account` from `supabase/functions/delete-account/`. Confirm `verify_jwt = true`.
   It must derive the UUID only from the platform-verified user token, delete that RevenueCat
   customer, and then invoke the no-argument database deletion under the same JWT.
7. In RevenueCat, create the webhook URL:
   `https://<project-ref>.supabase.co/functions/v1/revenuecat-webhook`. Set its Authorization header
   to the same dedicated environment value. Use separate staging/production integrations or event
   environment filters so sandbox evidence cannot be mistaken for a production purchase.
8. Send the RevenueCat dashboard TEST event. Expect HTTP 200 and no entitlement mutation; TEST is
   deliberately ignored. Then use a real store sandbox purchase for the mutation test below.

## 3. Configure build-time public keys

Set these EAS variables in both preview and production environments using the RevenueCat **public SDK
keys** for the matching app:

- `EXPO_PUBLIC_REVENUECAT_IOS_KEY`
- `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY`

Keep the existing Supabase public variables and `EXPO_PUBLIC_DEMO_MODE=false`. Before building, run
`npx eas config --platform ios --profile production` and the Android equivalent; confirm the variable
names resolve without printing their values. A real build with a missing RevenueCat public key stays
locked and cannot sell—it does not silently unlock paid analysis.

## 4. Staging/store-sandbox acceptance matrix

Use dedicated test accounts and store sandbox/test-track accounts. Record outcome and timestamp; do
not record UUIDs, receipts or payloads.

| Case | Required result |
| --- | --- |
| New account, no purchase | Logging, History and 7-day Insights work; Progress, Body and 28/84-day Insights show the unlock path |
| Buy lifetime product | Native sheet shows localized product/price; after webhook, the same Repello account opens paid surfaces |
| Force-quit/relaunch | Paid access returns from Postgres without another purchase |
| Restore after reinstall/new device | Restore re-delivers the purchase; access opens only after the server row appears |
| Store says purchase exists but webhook is delayed | App never grants from CustomerInfo alone; it reports that server access is still pending |
| Sign out A, sign in B on one device | A's access is cleared before routing; B remains locked unless B owns/transfers the purchase |
| Transfer/restore to B | One TRANSFER revokes A and grants B; no separate lifecycle event is assumed |
| Refund in sandbox where supported | CANCELLATION sets `revoked_at`; paid surfaces lock while free data remains available |
| Refund reversal where supported | REFUND_REVERSED grants again only after the server event |
| Wrong/missing Offering product | Repello refuses before opening a purchase sheet; it never buys the first package |
| Account export | JSON format version 3 includes `entitlement` (active or revoked) |
| Account deletion | RevenueCat customer/history is erased first; then profile, entitlement and processed event targets are gone. The SDK detaches from the deleted UUID, and neither a delayed webhook nor an idle SDK refresh recreates it |
| Account deletion with RevenueCat unavailable | UI reports failure; Supabase account/data remain intact so "all data deleted" is never claimed falsely |
| Account deletion with a database failure after RevenueCat erasure | UI reports that deletion did not complete; the account and training data remain, and retry can complete deletion without falsely claiming all data was unchanged |

## 5. Read-only server checks

Run checks in the Supabase SQL editor without copying result rows out of the controlled environment:

- An authenticated test user's client session can SELECT only its own `pro` row.
- The authenticated/anon roles cannot INSERT, UPDATE or DELETE `entitlements` and cannot execute
  `apply_revenuecat_entitlement_event`.
- The latest row's `last_event_type` and `revoked_at` agree with the sandbox action.
- Duplicate delivery leaves one event-target key and one entitlement row.
- No raw RevenueCat body, user id, receipt or database error appears in Edge Function logs.

## 6. Release stop conditions

Stop the release if any of these is unverified: dedicated one-entitlement RevenueCat project; exact
store product type/id; product attached to entitlement; default Offering; restore behavior; webhook
authorization; migration 0009 in the target project; both deployed functions; least-privilege
RevenueCat deletion key/project id; both public SDK keys; sandbox purchase, restore, transfer and
refund path; privacy/store forms updated for purchase history; or in-app account deletion (including
confirmed RevenueCat customer erasure) after deployment.

Primary references: [Expo in-app purchases](https://docs.expo.dev/guides/in-app-purchases/),
[RevenueCat entitlements](https://www.revenuecat.com/docs/getting-started/entitlements),
[restore behavior](https://www.revenuecat.com/docs/projects/restore-behavior), and
[webhooks](https://www.revenuecat.com/docs/integrations/webhooks).
