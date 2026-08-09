# PRism — Privacy Data Inventory

> **Engineering draft. Not legal advice, and not reviewed by a lawyer.**
> This document is an evidence-based audit of what the PRism codebase actually collects, stores and
> transmits, produced by reading the code and the SQL migrations. Every row cites a `file:line`.
> It exists so the App Store Privacy Nutrition Labels and the Google Play Data Safety form can be
> filled in from verified fact rather than from memory. The owner is responsible for the legal
> sufficiency of anything derived from it.
>
> **Scope of evidence:** the repository at branch `claude/reconciliation-cherry-pick`, HEAD `d5c44ef`.
> Line numbers are correct as of that commit and will drift. Re-verify before submitting store forms.
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
| Account id (UUID) | `auth.users.id`, mirrored to `profiles.id` | Owns every row; the value RLS checks | **Required**, server-generated | `supabase/migrations/0001_init.sql:43`; `:256-268` (`handle_new_user`) |
| Display name | `profiles.display_name` (text, 1–60 chars, default `'Lifter'`) | Greeting on Today; fallback identity on the Account sheet | **Required by schema**, but never asked for — see note below | `supabase/migrations/0001_init.sql:44`, `:259-260`; `supabase/migrations/0002_security_hardening.sql:50-51`; `app/(tabs)/index.tsx:182`; `app/account.tsx:59` |
| Account creation timestamp | `profiles.created_at` | Record keeping | Automatic | `supabase/migrations/0001_init.sql:55` |
| Profile last-modified timestamp | `profiles.updated_at` | Record keeping | Automatic (trigger) | `supabase/migrations/0001_init.sql:56`, `:248-250` |

**Note on display name.** `signUpWithPassword` sends no `display_name` metadata
(`src/data/supabase/auth.ts:96`), so `handle_new_user` always falls back to the literal `'Lifter'`
(`supabase/migrations/0001_init.sql:260`). No screen calls `updateProfile` — the only callers are the
repository and store definitions themselves (`src/store/trainingStore.ts:199-200`). **In the shipped
app today, the display name is not user-supplied personal data; it is a constant.** If a profile
editor ships later, this row changes from "not collected" to "collected", and the store forms must
be updated with it.

---

## 3. Training preferences

All six live on `profiles`, all have non-null defaults, and — as with display name — **none has a UI
write path today**.

| Data item | Stored where | Purpose | Required? | Evidence |
| --- | --- | --- | --- | --- |
| Training goal | `profiles.goal` (enum) | Tailors plan suggestions | Defaulted (`hypertrophy`) | `supabase/migrations/0001_init.sql:45` |
| Experience level | `profiles.experience` (enum) | Tailors plan suggestions | Defaulted (`intermediate`) | `supabase/migrations/0001_init.sql:46` |
| Training days per week | `profiles.training_days_per_week` (1–7) | Weekly schedule | Defaulted (4) | `supabase/migrations/0001_init.sql:47-48` |
| Preferred weekdays | `profiles.preferred_weekdays` (ISO weekday numbers) | Weekly schedule | Defaulted | `supabase/migrations/0001_init.sql:50` |
| Available equipment | `profiles.available_equipment` (enum array) | Filters exercise suggestions | Defaulted | `supabase/migrations/0001_init.sql:51` |
| Unit preference (kg/lb) | `profiles.unit` (enum) | **Display only.** All weights are stored in kilograms | Defaulted (`kg`) | `supabase/migrations/0001_init.sql:52`, `:5-8` |

**Where the onboarding answers actually go.** The onboarding flow asks for goal, experience, training
days and equipment — and stores the answers **on the device only**, in AsyncStorage under
`prism.onboarding.v1`. They are deliberately not applied to the server-side profile
(`src/store/onboardingStore.ts:11-14`, `:17`, `:91-100`). See §6.

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
| Bodyweight (profile) | `profiles.bodyweight_kg` (nullable) | Load calculations for bodyweight movements | **Not collected today** — mapper supports it (`mappers.ts:45`) but no screen writes it | `supabase/migrations/0001_init.sql:53`; `src/data/supabase/mappers.ts:31`, `:45` |
| Bodyweight (measurement) | `body_measurements.bodyweight_kg` | Bodyweight trend | **Not collected today** — read-only, see below | `supabase/migrations/0001_init.sql:184`; `src/data/supabase/mappers.ts:201` |
| Body-fat percentage | `body_measurements.body_fat_pct` | Composition trend | **Not collected today** — read-only | `supabase/migrations/0001_init.sql:185`; `src/data/supabase/mappers.ts:202` |
| Body circumferences (cm) | `body_measurements.circumferences_cm` (jsonb, e.g. `{"waist": 82, "chest": 104.5}`) | Composition trend | **Not collected today** — read-only | `supabase/migrations/0001_init.sql:186-187`; `src/data/supabase/mappers.ts:203` |
| Measurement timestamp | `body_measurements.measured_at` | Trend ordering | Automatic | `supabase/migrations/0001_init.sql:183` |

**Body measurements are read-only in the shipped app.** The `Repository` interface exposes
`listMeasurements()` and **no save method at all** (`src/data/repository.ts:78`, `:516-525`). Against
a real Supabase account this table is therefore empty unless rows are inserted outside the app. The
Body screen renders whatever is there; in demo builds it renders synthetic seed data
(`src/data/demoSeed.ts`, surfaced via `src/data/repository.ts:261-263`).

**Consequence for the store forms:** the schema is built for body measurements and the export
includes them, but the current binary cannot collect them. `[OWNER: decide whether to declare body
measurements on the store forms now — declaring a category you do not yet collect is conservative
and avoids a re-submission when the feature ships, but must not be described in the policy as
something the app does today.]`

---

## 6. Device-local state

Nothing in this section is transmitted anywhere. It is listed because it is data about the user held
on their device, which both store forms and a complete policy have to account for.

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
| Error diagnostics | `console.warn` on the device only. Six call sites across `src/` and `app/`. **No remote log sink** | Local debugging | Process exit | e.g. `app/account.tsx:141`, `:167`, `:205`; `app/workout/summary.tsx:113` |

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
| `body_measurements.*` | No repository save method — see §5 | `src/data/repository.ts:50-101` |
| Custom `exercises` rows | No create path in the client; named as an open product gap | `src/data/repository.ts:372-376`; `Docs/architecture.md:227-228` |

**Any sprint that starts writing one of these must update this inventory and the store forms.**

---

## 8. What is NOT collected — verified

Each of these was checked, not assumed. All are true of the code at HEAD `d5c44ef`.

| Claim | How it was verified |
| --- | --- |
| **No analytics or product-analytics SDK** | Full dependency list is `package.json:17-51` — Expo modules, `@supabase/supabase-js`, `zustand`, React Native, `react-native-svg`, `@expo/vector-icons`. A case-insensitive repo search for `sentry\|bugsnag\|crashlytics\|firebase\|amplitude\|segment\|posthog\|mixpanel\|appsflyer\|adjust\|onesignal\|datadog\|newrelic\|logrocket\|smartlook\|admob` returns **nothing** in `package.json` and nothing in `src/` or `app/` (only false positives: `SegmentedControl`, `useSegments`, and comments describing Insights as an "analytics hub") |
| **No crash reporting** | Same search. Corroborated independently by `Docs/architecture.md:260` and gap **G-4** at `Docs/architecture.md:650` — "No crash reporting, analytics, or logging framework found in dependencies" |
| **No advertising SDK, no ad identifiers (IDFA / AAID), no ATT prompt** | No ad or attribution dependency; no `expo-tracking-transparency`; no `NSUserTrackingUsageDescription` in `app.json:11-25` |
| **No third-party trackers of any kind** | The only network destination reachable from app code is the configured Supabase project URL (`src/data/supabase/client.ts:9-10`, `:62`). A repo-wide search for `fetch(`, `axios`, `XMLHttpRequest` and `WebSocket` outside `supabase-js` returns **nothing** in `src/` or `app/` |
| **No device permissions requested** | `app.json:11-25` declares **no** iOS usage-description strings and **no** Android permissions. No `expo-notifications`, `expo-location`, `expo-camera`, `expo-image-picker`, `expo-contacts`, `expo-calendar`, `expo-media-library`, `expo-av` or `expo-sensors` in `package.json` |
| **No health-platform integration** | No HealthKit, Google Fit, Health Connect or `react-native-health` dependency. All body/wellbeing data is typed by the user |
| **No photos, camera, microphone, contacts, calendar** | Same — no such module is a dependency |
| **No precise or coarse location** | No location module. The only location-adjacent value is the device's **timezone**, used locally to compute a `YYYY-MM-DD` check-in date; the date is stored, the timezone is not (`supabase/migrations/0008_local_training_day.sql:23-30`; `src/domain/trainingDay.ts`) |
| **No over-the-air update service** | No `expo-updates` dependency; no `updates` block in `app.json` |
| **No social graph, no feed, no sharing backend** | The Social tab is an explicit shell: "there is no account, no network call, and no persisted state behind this screen" (`app/(tabs)/social.tsx:11-30`) |
| **No push notifications** | No `expo-notifications` dependency; no push token is ever obtained |
| **No service-role or other privileged credential in the client** | Only `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` are read (`src/data/supabase/client.ts:9-10`); `.env.example:24-28` states the rule explicitly |

**One honest caveat to keep in the policy.** Apple and Google collect their own crash and usage
diagnostics at the OS and store level, governed by the device owner's own settings and by each
store's terms. PRism's code adds nothing to that and receives nothing from it. Similarly, the EAS
build service processes **source code** at build time; it does not process user data at runtime.

---

## 9. Third parties

| Party | Role | What they hold |
| --- | --- | --- |
| **Supabase** | Hosting and processing — the database, the auth service, and the API the app talks to | Everything in §2–§5: `auth.users` (email, password hash) plus the eleven application tables |
| **Apple / Google** | App distribution | Whatever their own store terms cover — purchase/download records, OS-level diagnostics. Nothing sent by PRism |
| **The OS share sheet** | Export delivery only | The export JSON is handed to the OS share sheet; **the destination is chosen by the user**, not by the app (`app/account.tsx:134-137`) |

**No other party.** No data broker, no advertiser, no analytics vendor, no partner integration.

`[OWNER: confirm the Supabase project's hosting region and record it here — it is required by the
policy and by some store questionnaires. Read it from the Supabase dashboard; it cannot be
determined from this repository.]`

`[OWNER: confirm whether a Supabase Data Processing Addendum has been executed, and record the
answer here.]`

---

## 10. User rights that are already implemented

Both are reachable in-app today, with no support ticket and no email.

### Export (portability)

**Path:** Today → account control → **Account** → **Export my data**.

Produces a versioned, deterministically sorted JSON document containing the profile, custom
exercises, every workout with its exercises and sets, every check-in, every body measurement and
every personal record — then hands it to the OS share sheet.

- Screen: `app/account.tsx:123-146`, `:251-260`
- Assembly: `src/domain/accountExport.ts:45-62`, `:81-96`
- Serialisation and filename (`prism-export-YYYY-MM-DD.json`): `src/domain/accountExport.ts:105-107`, `:116-119`
- Data fan-out: `src/data/repository.ts:564-579`

The export deliberately excludes PRism's own seeded exercise library, which is the app's data rather
than the lifter's (`src/domain/accountExport.ts:52-57`).

### Erasure

**Path:** Today → account control → **Account** → **Delete account**, then two separate confirmations.

Calls `delete_my_account()`, which takes **no arguments** and derives the account solely from
`auth.uid()`. It deletes one row from `auth.users`; `profiles.id references auth.users(id) on delete
cascade` and all user tables cascade from `profiles`, so the whole account goes with it.

- Screen and double confirmation: `app/account.tsx:158-212`
- Client call: `src/data/repository.ts:593-597`
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
> `[OWNER: apply and verify all migrations on the production project before submission; the
> read-only probe in Docs/tester-readiness-runbook.md §2 answers this.]`

---

## 11. Security posture (facts, for the policy's security section)

| Control | Evidence |
| --- | --- |
| Row-level security enabled on **all eleven** tables | `supabase/migrations/0001_init.sql:279-289` |
| Every policy scopes rows to `auth.uid()`; child tables are guarded by an `EXISTS` walk to the owning parent | `supabase/migrations/0001_init.sql:291-391` |
| Only the anon/publishable key ships in the client; RLS is the authorization boundary | `src/data/supabase/client.ts:9-10`, `:62`; `.env.example:24-28` |
| No service-role credential anywhere in the client or the repository | `Docs/invariants.md:108` (I-4), `:126` (I-5) |
| Writes never carry a client-supplied owner id — the database reads `auth.uid()` | `src/data/supabase/mappers.ts:130-134`, `:158-159`; `src/data/repository.ts:496` |
| Exactly one `security definer` function destroys data; it takes no arguments, so it can only ever delete the caller | `supabase/migrations/0005_account_deletion.sql:36-51`, `:65-89` |
| `search_path` pinned to `''` on definer functions | `supabase/migrations/0005_account_deletion.sql:69`; `0002_security_hardening.sql:131-134` |
| Session tokens in the hardware-backed Keychain/Keystore, device-only, excluded from backups | `src/data/supabase/secureStorage.ts:39-53` |
| A partially written session reads as "signed out", never as a corrupt one | `src/data/supabase/secureStorage.ts:15-24`, `:138-151` |
| Client-side ids use the platform CSPRNG, not `Math.random()` | `src/utils/id.ts:10-27` |
| Display name length-bounded to defeat an unbounded-write vector at signup | `supabase/migrations/0002_security_hardening.sql:26-31`, `:50-51` |
| Sign-out tears down local state even when the network call fails | `src/data/supabase/auth.ts:105-121`; `src/store/authActions.ts:73-77` |

---

## 12. Summary counts

- **11 Postgres tables**, of which 9 hold user-owned rows (`exercises` and `routines` also hold
  PRism's own library/template rows, distinguished by `profile_id is null`).
- **Account/identity items collected: 2** actually user-supplied (email, password), plus 4
  server-generated or defaulted.
- **Training-preference items: 6**, all defaulted, **0** currently user-editable in-app.
- **Training-data items: 7 groups** (workouts, reflections, ratings, exercises, sets, PRs, routines).
- **Health-adjacent items: 10 columns** across `check_ins`, `body_measurements` and
  `profiles.bodyweight_kg` — of which **4 are actually collected today** (the four wellbeing scales),
  the rest are read-only or dormant.
- **Device-local keys: 7** (1 Keychain-backed session, 6 AsyncStorage keys of which 4 are demo-only).
- **Dormant schema columns: 6** (§7).
- **Third-party processors: 1** (Supabase). **Analytics/ads/tracking SDKs: 0.**
- **Device permissions requested: 0.**

---

## 13. Owner placeholders collected in one place

- `[OWNER: legal entity name and registered address]`
- `[OWNER: contact email for privacy enquiries]`
- `[OWNER: governing jurisdiction]`
- `[OWNER: effective date of the policy]`
- `[OWNER: Supabase project hosting region]`
- `[OWNER: whether a Supabase Data Processing Addendum is executed]`
- `[OWNER: minimum age for the app, and the age rating declared on each store]`
- `[OWNER: decide whether to declare body measurements on store forms before the feature ships]`
- `[OWNER: confirm all migrations, especially 0005, are applied to the production Supabase project]`
- `[OWNER: public URL where the policy will be hosted — both stores require a reachable URL]`
