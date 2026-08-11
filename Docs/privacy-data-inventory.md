# PRism — Privacy Data Inventory

> **Engineering draft. Not legal advice, and not reviewed by a lawyer.**
> This document is an evidence-based audit of what the PRism codebase actually collects, stores and
> transmits, produced by reading the code and the SQL migrations. Every row cites a `file:line`.
> It exists so the App Store Privacy Nutrition Labels and the Google Play Data Safety form can be
> filled in from verified fact rather than from memory. The owner is responsible for the legal
> sufficiency of anything derived from it.
>
> **Scope of evidence:** the integration of four sprints cut in parallel from `main` at `6d8e4d9` —
> `feature/v1-user-data-writes`, `fix/v1-zero-data-surfaces`, `feature/v1-observability` and
> `feature/v1-entitlements`. Line numbers are indicative and will drift.
>
> **This document was reconciled at integration, and that reconciliation is the point.** The
> observability and entitlement sprints each wrote this file as though it were the only change in
> flight, so each described a world with **two** third-party processors. The app now has **three**
> (Supabase, Sentry, RevenueCat) and collects **both** crash diagnostics and purchase history. Either
> branch's text, taken alone, would have produced an App Store privacy label and a Play Data Safety
> form that were wrong about a whole vendor. Re-verify against the final integration commit before
> submitting store forms.
>
> **Status placeholders the owner must fill:** `[OWNER: ...]` markers below.

---

## 1. How to read this

Four things determine what belongs in a store privacy form, and they are separate questions:

| Question | Answered by |
| --- | --- |
| Does the schema have a column for it? | `supabase/migrations/*.sql` |
| Does the shipped app ever write it? | `src/data/repository.ts`, `src/data/supabase/mappers.ts`, the screens |
| Where does it physically live? | Postgres table, device Keychain, or device AsyncStorage |
| Does the user have to provide it? | The screen that collects it |

A column that exists but has no write path in the client is **dormant**, not collected. Those are
listed separately in §7 rather than mixed in, because declaring data you do not collect is as wrong
as omitting data you do.

### Which build are you declaring? `[fact, 2026-08-10]`

**A store privacy form describes one binary, not the repository.** Two build flags change what is
collected, both default **off**, and the first planned release ships with both off — so several rows
below are *supported by the code and not collected by that build*. Declaring them anyway is as wrong
as omitting data you do collect.

| Flag | Default | When off |
|---|---|---|
| `EXPO_PUBLIC_MONETIZATION_ENABLED` | off | **No purchase data of any kind.** Verified in code: `alignPurchaseIdentity` has exactly one call site (`entitlementStore.ts:177`) and it sits behind the `isEntitlementDisabled()` early return. RevenueCat is never configured — no SDK initialisation, no customer created, no network call. §5.1 does not apply. |
| `EXPO_PUBLIC_EMAIL_RECOVERY_ENABLED` | off | "Forgot password?" is hidden, so no recovery email is ever requested. Sign-up confirmation is separate and follows the project's own setting. |
| `EXPO_PUBLIC_SENTRY_DSN` | unset | **No diagnostics leave the device.** `TELEMETRY_ENABLED` is true only in a release, non-demo build with a DSN. §6's crash diagnostics do not apply. |

**For the first release, therefore:** the processors are **Supabase**, plus **Sentry only if a DSN is
set**, plus Apple for distribution. **RevenueCat processes nothing**, and Purchases / Financial Info
are **not collected**. When the paid unlock ships, that changes and so must both store forms — it is a
listing update, not only a build.

**Two build modes exist and they collect differently.** Demo builds (`__DEV__`, or an explicit
`EXPO_PUBLIC_DEMO_MODE=true`) make **zero network calls** and keep everything on the device
(`src/data/supabase/client.ts:25-33`). Release builds set `EXPO_PUBLIC_DEMO_MODE=false`
(`eas.json:20-25`) and use the real Supabase backend. Everything in §3–§5 describes the release path
unless marked otherwise.

---

## 2. Account and identity

| Data item | Stored where | Purpose | Required? | Evidence |
| --- | --- | --- | --- | --- |
| Email address | Supabase-managed `auth.users` (not in PRism's own schema); held in app memory while signed in | Sign-in identifier; password-reset delivery; answers "which account am I in?" on a shared device | **Required** to create an account | `src/data/supabase/auth.ts:67-79`, `:92-103`; `app/auth/index.tsx:61`, `:293-306`; `src/store/sessionStore.ts:44-55` |
| Password | **Never stored by PRism.** Transmitted to Supabase Auth, which stores a hash | Authentication | **Required** | `src/data/supabase/auth.ts:71`, `:96`, `:180-184`; `app/auth/index.tsx:62` |
| Password-reset code (one-time) | **Never stored.** React component state only, for the duration of the flow | Verify a reset request | Optional (reset flow only) | `src/data/supabase/auth.ts:162` ("user-supplied, transient, and never stored"), `:164-193`; `app/auth/index.tsx:74`, `:314-328` |
| Account id (UUID) | `auth.users.id`, mirrored to `profiles.id`; used as RevenueCat's custom App User ID when purchase transport is configured | Owns every row; the value RLS checks; connects a store event to the correct PRism account without sending an email address | **Required**, server-generated | `supabase/migrations/0001_init.sql:43`; `:256-268` (`handle_new_user`); `src/data/purchases.ts` |
| Display name | `profiles.display_name` (text, 1–60 chars, default `'Lifter'`) | Greeting on Today; fallback identity on the Account sheet | **Required by schema**, but never asked for — see note below | `supabase/migrations/0001_init.sql:44`, `:259-260`; `supabase/migrations/0002_security_hardening.sql:50-51`; `app/(tabs)/index.tsx:182`; `app/account.tsx:59` |
| Account creation timestamp | `profiles.created_at` | Record keeping | Automatic | `supabase/migrations/0001_init.sql:55` |
| Profile last-modified timestamp | `profiles.updated_at` | Record keeping | Automatic (trigger) | `supabase/migrations/0001_init.sql:56`, `:248-250` |

**Note on display name.** `signUpWithPassword` sends no `display_name` metadata
(`src/data/supabase/auth.ts:96`), so `handle_new_user` always falls back to the literal `'Lifter'`
(`supabase/migrations/0001_init.sql:260`) at sign-up. **Corrected at integration 2026-08-09:** this
paragraph used to end "the display name is not user-supplied personal data; it is a constant", and
predicted that "if a profile editor ships later, this row changes from *not collected* to
*collected*". That editor has shipped — `app/settings.tsx` calls `updateProfile`. The display name is
now **user-supplied personal data** and is declared as collected.

---

## 3. Training preferences

All six live on `profiles` and all have non-null defaults. **Corrected at integration 2026-08-09:**
this line previously read "**none has a UI write path today**". All six are now user-editable in
`app/settings.tsx`, so all six are collected personal data rather than server-side constants.

| Data item | Stored where | Purpose | Required? | Evidence |
| --- | --- | --- | --- | --- |
| Training goal | `profiles.goal` (enum) | Tailors plan suggestions | Defaulted (`hypertrophy`) | `supabase/migrations/0001_init.sql:45` |
| Experience level | `profiles.experience` (enum) | Tailors plan suggestions | Defaulted (`intermediate`) | `supabase/migrations/0001_init.sql:46` |
| Training days per week | `profiles.training_days_per_week` (1–7) | Weekly schedule | Defaulted (4) | `supabase/migrations/0001_init.sql:47-48` |
| Preferred weekdays | `profiles.preferred_weekdays` (ISO weekday numbers) | Weekly schedule | Defaulted | `supabase/migrations/0001_init.sql:50` |
| Available equipment | `profiles.available_equipment` (enum array) | Filters exercise suggestions | Defaulted | `supabase/migrations/0001_init.sql:51` |
| Unit preference (kg/lb) | `profiles.unit` (enum) | **Display only.** All weights are stored in kilograms | Defaulted (`kg`) | `supabase/migrations/0001_init.sql:52`, `:5-8` |

**Where the onboarding answers actually go. Corrected at integration 2026-08-09.** This paragraph
said the answers were stored "**on the device only**" and were "deliberately not applied to the
server-side profile". `feature/v1-user-data-writes` changed that: the goal, experience, training-day
and equipment answers are now applied to the server-side `profiles` row when onboarding completes.
The device copy under `prism.onboarding.v1` still exists (see §6), but it is no longer the only
place those answers live.

---

## 4. Training data (server-side, user-owned)

| Data item | Stored where | Purpose | Required? | Evidence |
| --- | --- | --- | --- | --- |
| Workout session record | `workouts` — `title`, `status`, `started_at`, `ended_at`, `routine_day_id`, `created_at` | The training log itself | Created when the user starts a session | `supabase/migrations/0001_init.sql:128-140` |
| Session reflection (free text) | `workouts.reflection` | The lifter's own words about a session; shown on the summary and history screens | **Optional** | `supabase/migrations/0001_init.sql:136`; `app/workout/summary.tsx:38`, `:103-107`; `app/history/[id].tsx:177-180` |
| Session rating (1–5) | `workouts.session_rating` | Subjective session quality | **Optional** | `supabase/migrations/0001_init.sql:137`; `app/workout/summary.tsx:37`, `:105` |
| Exercises performed | `workout_exercises` — `exercise_id`, `order_index` | Which movements, in what order | Required per logged exercise | `supabase/migrations/0001_init.sql:145-152` |
| Sets performed | `sets` — `set_index`, `type`, `weight_kg`, `reps`, `rpe`, `completed`, `rest_seconds`, `logged_at` | The core log: load, reps, effort, rest | Required per set; `rpe` and `rest_seconds` optional | `supabase/migrations/0001_init.sql:157-172` |
| Personal records | `personal_records` — `kind`, `value`, `reps`, `weight_kg`, `achieved_at`, `workout_id` | Progress tracking; derived from logged sets and stored | Automatic on qualifying sets | `supabase/migrations/0001_init.sql:219-231`; `src/data/repository.ts:437-451` |
| Routines / plans | `routines`, `routine_days`, `routine_exercises` | Training plans. Rows with `profile_id = null` are PRism's own templates and are **not** user data | User rows only exist if created — **no in-app editor today** | `supabase/migrations/0001_init.sql:85-122`; `src/data/repository.ts:50-101` (interface has no routine write method) |
| Custom exercises | `exercises` with `profile_id` set | Movements the lifter defines | **No in-app create path today** — see §7 | `supabase/migrations/0001_init.sql:63-73`; `src/domain/accountExport.ts:52-57`; `Docs/architecture.md:227-228` |

All of the above are written through one transactional function, `save_workout_graph`, which is
`security invoker` — RLS applies and ownership comes from `auth.uid()`, never from the client
payload (`src/data/supabase/mappers.ts:130-134`, `:158-159`; `src/data/repository.ts:441-451`).

---

## 5. Body and health-adjacent data — SENSITIVE CATEGORY

> **Flagged deliberately.** Bodyweight, body-fat percentage, body circumferences and self-reported
> sleep / energy / soreness / stress are treated by both Apple and Google as **health or fitness
> data**, a sensitive category with stricter disclosure requirements than ordinary app data. They are
> not medical records and PRism makes no diagnostic claim, but they must be disclosed as health/
> fitness data on both store forms and described plainly in the policy.

| Data item | Stored where | Purpose | Required? | Evidence |
| --- | --- | --- | --- | --- |
| Sleep quality (1–5) | `check_ins.sleep_quality` (nullable) | Feeds the readiness estimate | **Optional**, independently of the other three | `supabase/migrations/0001_init.sql:198`; `supabase/migrations/0004_partial_check_ins.sql:42`; `src/components/today/CheckInPrompt.tsx:12`, `:82-90` |
| Energy (1–5) | `check_ins.energy` (nullable) | Readiness estimate | **Optional** | `supabase/migrations/0001_init.sql:199`; `0004:43`; `src/components/today/CheckInPrompt.tsx:13` |
| Soreness (1–5) | `check_ins.soreness` (nullable) | Readiness estimate | **Optional** | `supabase/migrations/0001_init.sql:200`; `0004:44`; `src/components/today/CheckInPrompt.tsx:14` |
| Stress (1–5) | `check_ins.stress` (nullable) | Readiness estimate | **Optional** | `supabase/migrations/0001_init.sql:201`; `0004:45`; `src/components/today/CheckInPrompt.tsx:15` |
| Check-in local date | `check_ins.local_date` (date) | One check-in per device-local calendar day | Required when a check-in is saved | `supabase/migrations/0008_local_training_day.sql:39-47`, `:61-90`; `src/domain/types.ts:169` |
| Check-in instant | `check_ins.checked_in_at` (timestamptz) | Ordering and readiness staleness | Automatic | `supabase/migrations/0001_init.sql:196` |
| Bodyweight (profile) | `profiles.bodyweight_kg` (nullable) | Load calculations for bodyweight movements | **Optional.** User-entered in Settings | `supabase/migrations/0001_init.sql:53`; `src/data/supabase/mappers.ts:31`, `:45`; `app/settings.tsx` |
| Bodyweight (measurement) | `body_measurements.bodyweight_kg` | Bodyweight trend | **Optional.** User-entered on Body | `supabase/migrations/0001_init.sql:184`; `src/data/supabase/mappers.ts:201`; `app/measurement.tsx` |
| Body-fat percentage | `body_measurements.body_fat_pct` | Composition trend | **Optional.** User-entered on Body | `supabase/migrations/0001_init.sql:185`; `src/data/supabase/mappers.ts:202`; `app/measurement.tsx` |
| Body circumferences (cm) | `body_measurements.circumferences_cm` (jsonb, e.g. `{"waist": 82, "chest": 104.5}`) | Composition trend | **Optional.** User-entered on Body | `supabase/migrations/0001_init.sql:186-187`; `src/data/supabase/mappers.ts:203`; `app/measurement.tsx` |
| Measurement timestamp | `body_measurements.measured_at` | Trend ordering | Automatic | `supabase/migrations/0001_init.sql:183` |

**Corrected at integration 2026-08-09 — body measurements are now written by the app.** This section
previously read "**Body measurements are read-only in the shipped app**", and the open question
beneath it asked whether to declare a category the binary could not yet collect. Both are obsolete:
`feature/v1-user-data-writes` added `saveMeasurement`/`deleteMeasurement` to the `Repository`
interface and both implementations, and `app/measurement.tsx` is a real entry surface reached from
Body. `app/settings.tsx` likewise writes `profiles.bodyweight_kg`.

**The open question is therefore closed by fact rather than by decision:** bodyweight, body-fat
percentage and circumferences **must** be declared as collected health/fitness data on both store
forms, and the policy must describe them as something the app does today. This is the sensitive
category, so an out-of-date claim here is the most costly kind in this document — which is precisely
why the sprint that added the writer and the sprint that owned this file ran in parallel and neither
saw the other.

---

## 5.1 Purchase and access data — **only when `EXPO_PUBLIC_MONETIZATION_ENABLED=true`**

> `[fact]` Not applicable to the first release. With the flag off, RevenueCat is never configured and
> nothing in this section is collected. Kept here because it becomes accurate the day the paid unlock
> ships, and a section deleted now would be a section rewritten from memory later.

| Data item | Stored where | Purpose | Required? | Evidence |
| --- | --- | --- | --- | --- |
| Store transaction and purchase history | Apple App Store or Google Play; processed by RevenueCat | Complete, validate and restore the one-time Pro unlock | Only if the user chooses to buy | `src/data/purchases.ts`; `package.json` (`react-native-purchases`) |
| PRism account id (UUID) | RevenueCat custom App User ID | Associate the store event with the correct authenticated PRism account | Required for purchase/restore; server-generated | `src/data/purchases.ts` (`configurePurchases`, `identifyPurchaseUser`) |
| Entitlement record | Supabase `entitlements`: account id, entitlement id, product id, active/revoked state, event time and update time | Server-established access truth read by the client | Automatic after a supported purchase event | `supabase/migrations/0009_entitlements.sql`; `src/data/repository.ts` (`getEntitlement`) |
| Processed event target | Supabase `revenuecat_event_targets`: RevenueCat event id, target account, entitlement id, event time and resulting action | Idempotent webhook delivery and replay protection | Automatic after a supported purchase event | `supabase/migrations/0009_entitlements.sql`; `supabase/functions/revenuecat-webhook/` |

PRism does **not** receive card or bank details. PRism sends RevenueCat the account UUID, but not the
account email, password, workouts, check-ins, body information, or free-text notes. The app contains
only RevenueCat's public platform SDK key; the webhook authorization value and Supabase service-role
credential are server environment values and must never enter the client or repository.

The client has owner-select access to its entitlement record and no insert/update/delete policy.
Only the server-side webhook RPC may write entitlement and event-target rows. In explicit demo mode
the purchase module is not configured, no RevenueCat call is made, and paid surfaces are available
without a fabricated entitlement.

---

## 6. Device-local state and crash diagnostics

The first table is device-local and is not transmitted. The subsection after it records the narrow
diagnostic payload that can leave an eligible release build.

| Data item | Stored where | Purpose | Cleared when? | Evidence |
| --- | --- | --- | --- | --- |
| Supabase session (access token **and** long-lived refresh token) | **iOS Keychain / Android Keystore** via `expo-secure-store`, split across numbered keys with a commit marker written last | Keeps the user signed in; refreshes silently | Sign-out and account deletion | `src/data/supabase/client.ts:62-89`; `src/data/supabase/secureStorage.ts:51-53`, `:110-163` |
| — Keychain accessibility | `AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY`: hardware-encrypted, **excluded from iCloud and from encrypted backups restored to another device** | Threat model is backup extraction | — | `src/data/supabase/secureStorage.ts:39-53` |
| — Web fallback | On web only, the session falls back to AsyncStorage (`localStorage`). Explicitly **not a hardened path**; web is not a supported target for real accounts | — | — | `src/data/supabase/secureStorage.ts:93-101`, `:112`, `:139`, `:154` |
| In-progress workout draft | AsyncStorage, key `prism.activeWorkout.draft.v1`. Contains the full in-progress workout graph including every set | Recovers a session if the app is killed mid-workout | Sign-out, account deletion, and on finishing/discarding the session | `src/store/activeWorkoutStore.ts:13`, `:23-27`, `:497-505`; `src/store/authActions.ts:79-83` |
| Onboarding completion flag and selections | AsyncStorage, key `prism.onboarding.v1`. Contains `{completed, goal, experience, trainingDaysPerWeek, availableEquipment}` | Stops the first-run carousel replaying | **Deliberately not cleared on sign-out** — treated as device state, not account state | `src/store/onboardingStore.ts:17`, `:91-100`; `src/store/authActions.ts:24-27` |
| Demo-mode data (demo builds only) | AsyncStorage, keys `prism.demo.workouts.v1`, `prism.demo.profile.v1`, `prism.demo.records.v1`, `prism.demo.checkins.v1` | Makes demo mode survive a restart | `resetDemo()` | `src/data/repository.ts:107-112`, `:302-314` |
| Signed-in user id and email | **In memory only**, never written to disk by app code | Display and routing; never used to scope a query | Process exit; sign-out | `src/store/sessionStore.ts:39-55`, `:166-172` |
| Favourite exercise ids | **In memory only**, never persisted | UI convenience | Sign-out (`reset()`) | `src/store/trainingStore.ts:37`, `:65-68` |
| Local error diagnostics | Six handled-error sites and the root render boundary retain a device console warning | Development debugging | Process exit | `src/observability/telemetry.ts`; e.g. `app/account.tsx`, `app/workout/summary.tsx` |

### Crash diagnostics in an eligible release build

`@sentry/react-native` is initialised only when all three conditions hold: the bundle is a release
bundle, demo mode is off, and `EXPO_PUBLIC_SENTRY_DSN` is non-empty. Development, Jest, demo, and an
unconfigured release initialise no Sentry client. A qualifying failure can transmit:

- event time/id, platform, release/build metadata, and the fixed failure surface;
- app version, OS version, and a restricted device context (model/family, architecture, memory and
  battery/charging state — never the device name);
- code stack frames and, for a render failure, React component names;
- a restricted breadcrumb tail: request method/path/status only.

The outbound event is rebuilt from an allowlist in `src/domain/telemetry.ts`. Account identity,
email, IP address, request/response bodies, state, arbitrary tags/contexts, exception text, local
variables, console/navigation/click breadcrumbs, URL query/fragment values, and all unknown future
SDK fields are excluded. Screenshots, view hierarchy, session replay, performance tracing, automatic sessions,
failed-request capture, product analytics, and user attachment are disabled in
`src/observability/telemetry.ts`. The SDK receives neither training/health values nor reflections.
`beforeBreadcrumb` applies the breadcrumb restriction before either JavaScript or native crash state
can retain it; `beforeSend` applies the event allowlist to JavaScript events.

Retention and hosted-region settings live in the Sentry project, not this repository:
`[OWNER: record Sentry retention, hosting region, and data-processing terms before publication.]`

---

## 7. Dormant schema columns — present in the database, never written by the client

These matter because the export document and any raw database dump can contain them, and because a
future sprint could start writing them without anyone revisiting the store forms.

| Column | Status | Evidence |
| --- | --- | --- |
| `check_ins.note` (free text) | Declared in 0001. **Absent from the domain type and from the mapper** — never read, never written | `supabase/migrations/0001_init.sql:202`; absent from `src/data/supabase/mappers.ts:183-194` and `src/domain/types.ts:166-184`; not handled by `save_check_in` (`0008:61-135`) |
| `sets.notes` (free text) | Mapped in both directions but **no UI writes it** — no note input exists in the workout logger | `supabase/migrations/0001_init.sql:169`; `src/data/supabase/mappers.ts:73`, `:88`; no match in `app/workout/` or `src/components/workout/` |
| `workout_exercises.notes` (free text) | Same: mapped, never entered | `supabase/migrations/0001_init.sql:149`; `src/data/supabase/mappers.ts:98`, `:109` |
| `profiles.onboarded_at` | Declared in 0001. **Not in `fromProfile`**, so nothing can write it | `supabase/migrations/0001_init.sql:54`; absent from `src/data/supabase/mappers.ts:36-47` |
| ~~`body_measurements.*`~~ | **No longer dormant (2026-08-09).** `saveMeasurement`/`deleteMeasurement` exist and `app/measurement.tsx` writes them — see §5 | `src/data/repository.ts`; `app/measurement.tsx` |
| ~~Custom `exercises` rows~~ | **No longer dormant (2026-08-09).** `createExercise`/`updateExercise`/`deleteExercise` exist and are reachable from Exercises and the picker | `src/data/repository.ts`; `app/exercise.tsx` |
| ~~`profiles.bodyweight_kg`, `display_name`, and the five training preferences~~ | **No longer dormant (2026-08-09).** `app/settings.tsx` calls `updateProfile` — see §2 and §3 | `app/settings.tsx`; `src/store/trainingStore.ts` |

**Any sprint that starts writing one of these must update this inventory and the store forms.**

---

## 8. What is NOT collected — verified

Each of these was checked, not assumed. They describe the integrated repository named in the scope
note above, not any one branch of it.

| Claim | How it was verified |
| --- | --- |
| **No analytics or product-analytics SDK** | Sentry is configured for failures only: automatic sessions, performance tracing, failed-request capture and client reports are off; replay sample rates are zero. There are no analytics, attribution or advertising dependencies (`src/observability/telemetry.ts`) |
| **Crash diagnostics contain no account or training payload** | `src/domain/telemetry.ts` rebuilds events/contexts/breadcrumbs from allowlists and replaces exception text; the realistic-event test asserts identity, free text and training numbers do not survive (`src/domain/__tests__/telemetry.test.ts`) |
| **No advertising SDK, no ad identifiers (IDFA / AAID), no ATT prompt** | No ad or attribution dependency; no `expo-tracking-transparency`; no `NSUserTrackingUsageDescription` in `app.json:11-25` |
| **No advertising, analytics, attribution, or cross-app tracking SDK** | Runtime network processors are **three**: Supabase for account/training data, Sentry for failure-only diagnostics, and RevenueCat for purchase/restore transport. `react-native-purchases` is used only for the Pro transaction and entitlement delivery, and `@sentry/react-native` only for handled/unhandled failures — neither for ads, attribution, product analytics, or cross-app tracking. There is no screen/tap/session tracking, no ad identifier, no session replay, and no marketing integration |
| **No device permissions requested** | `app.json:11-25` declares **no** iOS usage-description strings and **no** Android permissions. No `expo-notifications`, `expo-location`, `expo-camera`, `expo-image-picker`, `expo-contacts`, `expo-calendar`, `expo-media-library`, `expo-av` or `expo-sensors` in `package.json` |
| **No health-platform integration** | No HealthKit, Google Fit, Health Connect or `react-native-health` dependency. All body/wellbeing data is typed by the user |
| **No photos, camera, microphone, contacts, calendar** | Same — no such module is a dependency |
| **No precise or coarse location** | No location module. The only location-adjacent value is the device's **timezone**, used locally to compute a `YYYY-MM-DD` check-in date; the date is stored, the timezone is not (`supabase/migrations/0008_local_training_day.sql:23-30`; `src/domain/trainingDay.ts`) |
| **No over-the-air update service** | No `expo-updates` dependency; no `updates` block in `app.json` |
| **No social graph, no feed, no sharing backend** | The Social tab is an explicit shell: "there is no account, no network call, and no persisted state behind this screen" (`app/(tabs)/social.tsx:11-30`) |
| **No push notifications** | No `expo-notifications` dependency; no push token is ever obtained |
| **No service-role or other privileged credential in the client** | Client code reads only public values: the Supabase URL/anon key, the Sentry DSN, and the RevenueCat platform SDK keys. `SUPABASE_SERVICE_ROLE_KEY`, `REVENUECAT_WEBHOOK_AUTH` and `REVENUECAT_SECRET_API_KEY` are referenced only by Edge Function server environments; Sentry source-map upload credentials are build secrets. None of them is read by app code or present in `.env.example` (I-4, I-5) |

**One honest caveat to keep in the policy.** Apple and Google also collect diagnostics at the OS and
store level under their terms and device settings; that is separate from PRism's Sentry reporting.
The EAS build service processes source code at build time, not user data at runtime.

---

## 9. Third parties

| Party | Role | What they hold |
| --- | --- | --- |
| **Supabase** | Hosting and processing — the database, auth service, API and entitlement webhook write target | Everything in §2–§5.1: `auth.users` (email, password hash) plus the thirteen application tables |
| **Sentry** | Failure-only crash diagnostics processor | The restricted diagnostics described in §6; no account identity, training/health payload, screenshot, replay, or analytics |
| **RevenueCat** | Purchase and restore processor | The store transaction/entitlement data and the random PRism account UUID; no training, body, password, email, or free-text data is sent by PRism |
| **Apple / Google** | App distribution and payment processing | Purchase/download records, payment information handled by the store, and OS-level diagnostics under their own terms |
| **The OS share sheet** | Export delivery only | The export JSON is handed to the OS share sheet; **the destination is chosen by the user**, not by the app (`app/account.tsx:134-137`) |

**No other runtime party.** No data broker, advertiser, product-analytics vendor, or partner
integration receives PRism data.

`[OWNER: confirm the Supabase project's hosting region and record it here — it is required by the
policy and by some store questionnaires. Read it from the Supabase dashboard; it cannot be
determined from this repository.]`

`[OWNER: confirm whether a Supabase Data Processing Addendum has been executed, and record the
answer here.]`

`[OWNER: confirm RevenueCat's current data-processing terms, store-disclosure guidance, project
restore behavior, and whether the account plan supports webhooks before release configuration.]`

---

## 10. User rights that are already implemented

Both are reachable in-app today, with no support ticket and no email.

### Export (portability)

**Path:** Today → account control → **Account** → **Export my data**.

Produces a versioned, deterministically sorted JSON document containing the profile, custom
exercises, every workout with its exercises and sets, every check-in, every body measurement, every
personal record and the current entitlement record if one exists — then hands it to the OS share
sheet.

- Screen: `app/account.tsx:123-146`, `:251-260`
- Assembly: `src/domain/accountExport.ts:45-62`, `:81-96`
- Serialisation and filename (`prism-export-YYYY-MM-DD.json`): `src/domain/accountExport.ts:105-107`, `:116-119`
- Data fan-out: `src/data/repository.ts:564-579`

The export deliberately excludes PRism's own seeded exercise library, which is the app's data rather
than the lifter's (`src/domain/accountExport.ts:52-57`).
It also excludes `revenuecat_event_targets`, an internal idempotency ledger that is not client-
selectable. The public policy states this limitation rather than calling the in-app file a complete
backend dump; those rows are erased by account deletion.

### Erasure

**Path:** Today → account control → **Account** → **Delete account**, then two separate confirmations.

Calls the authenticated `delete-account` Edge Function with **no user id in the request**. The
function derives the UUID from the gateway-verified session, erases that RevenueCat customer first,
then invokes `delete_my_account()` under the same JWT. The RPC itself takes no arguments and derives
the account solely from `auth.uid()`. It deletes one row from `auth.users`; `profiles.id references
auth.users(id) on delete cascade` and all user tables cascade from `profiles`, including the
entitlement and processed-event-target rows introduced by `0009_entitlements.sql`.
After remote success, local teardown detaches the native purchase SDK from the erased UUID before the
session phase changes, preventing the live process from continuing to identify as the deleted customer.

- Screen and double confirmation: `app/account.tsx:158-212`
- Client call: `src/data/repository.ts:593-597`
- Processor erasure orchestration: `supabase/functions/delete-account/`
- Function: `supabase/migrations/0005_account_deletion.sql:65-89`; execute granted only to
  `authenticated` (`:97-98`)
- Local teardown after deletion: `src/store/authActions.ts:63-91`, `:114-119`
- Foreign-key change that makes an account with custom exercises deletable:
  `supabase/migrations/0007_deletable_account_with_custom_exercises.sql:76`, `:93`

Deletion is idempotent — deleting an already-deleted account succeeds, so a retry after a lost
response is safe (`supabase/migrations/0005_account_deletion.sql:84-87`).

> **BLOCKING OPERATIONAL RISK.** Migrations are applied to hosted projects **by hand**
> (`supabase/migrations/0008_local_training_day.sql:6-13`). `Docs/invariants.md:293-298` records that
> `0001`–`0007` are on **staging** but that **"Production has had no such treatment"**. If `0005` is
> not applied to the production project, the in-app **Delete account** button fails against a real
> account — which is both a broken promise in the privacy policy and a store-review failure.
> `[OWNER: apply and verify all migrations through 0009 on the production project before submission; the
> read-only probe in Docs/tester-readiness-runbook.md §2 answers this.]`

---

## 11. Security posture (facts, for the policy's security section)

| Control | Evidence |
| --- | --- |
| Row-level security enabled on **all thirteen** tables | `supabase/migrations/0001_init.sql:279-289`; `supabase/migrations/0009_entitlements.sql` |
| Every policy scopes rows to `auth.uid()`; child tables are guarded by an `EXISTS` walk to the owning parent | `supabase/migrations/0001_init.sql:291-391` |
| Only Supabase's anon/publishable key and RevenueCat's public platform SDK key ship in the client; RLS and the authenticated webhook are the authorization boundaries | `src/data/supabase/client.ts`; `src/data/purchases.ts`; `.env.example` |
| No service-role credential anywhere in the client or the repository | `Docs/invariants.md:108` (I-4), `:126` (I-5) |
| Writes never carry a client-supplied owner id — the database reads `auth.uid()` | `src/data/supabase/mappers.ts:130-134`, `:158-159`; `src/data/repository.ts:496` |
| Exactly one `security definer` function destroys data; it takes no arguments, so it can only ever delete the caller | `supabase/migrations/0005_account_deletion.sql:36-51`, `:65-89` |
| Account deletion erases the gateway-authenticated UUID from RevenueCat before invoking the no-argument database deletion; an unconfirmed processor failure stops the sequence | `supabase/functions/delete-account/`; `src/data/repository.ts` |
| `search_path` pinned to `''` on definer functions | `supabase/migrations/0005_account_deletion.sql:69`; `0002_security_hardening.sql:131-134` |
| Session tokens in the hardware-backed Keychain/Keystore, device-only, excluded from backups | `src/data/supabase/secureStorage.ts:39-53` |
| A partially written session reads as "signed out", never as a corrupt one | `src/data/supabase/secureStorage.ts:15-24`, `:138-151` |
| Client-side ids use the platform CSPRNG, not `Math.random()` | `src/utils/id.ts:10-27` |
| Display name length-bounded to defeat an unbounded-write vector at signup | `supabase/migrations/0002_security_hardening.sql:26-31`, `:50-51` |
| Sign-out tears down local state even when the network call fails | `src/data/supabase/auth.ts:105-121`; `src/store/authActions.ts:73-77` |
| Entitlement rows are owner-select-only to the client; event-target rows are invisible; a service-role-only security-invoker RPC applies each event atomically and idempotently | `supabase/migrations/0009_entitlements.sql`; `supabase/tests/rls/09_run_entitlement_tests.sql` |

---

## 12. Summary counts

- **13 Postgres tables**, all of which can hold rows linked to an account. `exercises` and `routines`
  also hold PRism's own library/template rows, distinguished by `profile_id is null`, while
  `revenuecat_event_targets` is an internal delivery ledger rather than user-facing content.
- **Account/identity items collected: 2** actually user-supplied (email, password), plus 4
  server-generated or defaulted.
- **Training-preference items: 6**, all defaulted, **0** currently user-editable in-app.
- **Training-data items: 7 groups** (workouts, reflections, ratings, exercises, sets, PRs, routines).
- **Health-adjacent items: 10 columns** across `check_ins`, `body_measurements` and
  `profiles.bodyweight_kg` — of which **4 are actually collected today** (the four wellbeing scales),
  the rest are read-only or dormant.
- **Purchase/access items: 4 groups** (store transaction, custom account UUID, entitlement row, and
  processed event target). PRism never receives payment-card details.
- **Device-local keys: 7** (1 Keychain-backed session, 6 AsyncStorage keys of which 4 are demo-only).
- **Dormant schema columns: 6** (§7).
- **Third-party runtime processors: 3** (Supabase, Sentry and RevenueCat). **Analytics/ads/tracking
  SDKs: 0.** The count is three and not two: each of the two sprints that added a vendor recorded
  "2" while the other was in flight beside it.
- **Device permissions requested: 0.**

---

## 13. Owner placeholders collected in one place

- `[OWNER: legal entity name and registered address]`
- `[OWNER: contact email for privacy enquiries]`
- `[OWNER: governing jurisdiction]`
- `[OWNER: effective date of the policy]`
- `[OWNER: Supabase project hosting region]`
- `[OWNER: whether a Supabase Data Processing Addendum is executed]`
- `[OWNER: Sentry hosting region, retention period, and data-processing terms]`
- `[OWNER: RevenueCat data-processing terms, current store-disclosure guidance, restore behavior,
  and webhook-capable plan]`
- `[OWNER: create a least-privilege RevenueCat secret key with customer read/write deletion
  permission and deploy/configure the authenticated delete-account function]`
- `[OWNER: minimum age for the app, and the age rating declared on each store]`
- `[OWNER: decide whether to declare body measurements on store forms before the feature ships]`
- `[OWNER: confirm all migrations through 0009 are applied to the production Supabase project]`
- `[OWNER: public URL where the policy will be hosted — both stores require a reachable URL]`
- `[OWNER: confirm Apple Diagnostics and Google App info and performance disclosures against the
  current store forms after the integrated release build is final]`
