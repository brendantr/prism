# Runbook: submitting PRism to the App Store and Google Play

## Document status

- **Status:** Repository side is complete. Every remaining step needs a dashboard, a credential, or a
  build service, so every one of them is **yours** — an agent holds none of those
  (`CLAUDE.md` § Scope discipline, `Docs/invariants.md` I-4).
- **Date:** 2026-08-09
- **Baseline:** the integration of `feature/v1-user-data-writes`, `fix/v1-zero-data-surfaces`,
  `feature/v1-observability` and `feature/v1-entitlements`.
- **Labels** follow I-15: `[fact]` / `[decision]` / `[assumption]` / `[open question]`.

**This runbook does not cover RevenueCat or the Edge Functions.** Those have their own, more detailed
procedure in `Docs/revenuecat-release-runbook.md`, and it is a prerequisite of §5 below. This document
covers everything else and says where the two meet.

---

## 1. What is already true

`[fact]` Verified on the integration branch:

| | Evidence |
|---|---|
| Typecheck + full suite | `npx tsc --noEmit` clean; **642/642 tests across 46 suites** |
| Database contract | **191/191 SQL assertions** from a clean Postgres 16.14 (57 RLS + 31 write-integrity + 23 check-in + 20 local-training-day + 17 entitlement + 21 deletion + 14 library seed + 8 exercise reference) |
| Expo config | `npx expo-doctor` **19/20** — see §2, this one is a real gate |
| Version | `app.json` `version` is **1.0.0** (was 0.1.0) |
| Account deletion + export (I-10) | Implemented, and the entitlement tables cascade with the account |
| Custom exercises, measurements, profile editing | Implemented — a real account can now supply its own data |
| Crash reporting (G-4) | Implemented, privacy-filtered, inert without a DSN |
| Entitlements (I-9) | Server-side: `select`-only RLS for clients, webhook-written |

`[fact]` **Nothing below has been done.** No migration has been applied to production, no EAS
environment variable exists for `production`, no build has been cut, and no store listing exists.

---

## 2. Fix the Expo SDK patch drift first

`[fact]` `npx expo-doctor` fails one of twenty checks: `expo`, `expo-asset`, `expo-constants`,
`expo-linking` and `expo-router` are each one patch behind what SDK 57 expects. `expo-doctor` is a
documented pre-release-build gate (`Docs/release-checklist.md` §1).

```bash
npm run fix-deps
```

Then re-verify — a dependency change is not complete until the suite says so:

```bash
npm run verify && npx expo-doctor
```

`[fact]` This is a dependency change, so it sits behind the approval gate in `CLAUDE.md`. It is
patch-level **within** SDK 57, not an SDK upgrade.

---

## 3. Bring the production Supabase project up to the schema

`[fact]` `Docs/architecture.md` records staging as carrying `0001`–`0007`. **Production has had no
such treatment**, and `0008` and `0009` are newer than that record.

There is no migration-tracking table and no `supabase db push` — migrations are applied by hand in the
SQL Editor. So first ask the project what it has, using the probe in
`Docs/tester-readiness-runbook.md` §2, extended for the two newer migrations:

```sql
-- PRism migration probe. READ-ONLY: creates nothing, changes nothing.
-- Safe to run on a completely empty project.
with fn as (
  select p.proname, pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
)
select
  to_regclass('public.profiles') is not null
    as "0001 schema + RLS",

  exists (select 1 from fn where proname = 'assert_exercise_visible')
    as "0002 hardening",

  exists (select 1 from fn where proname = 'save_workout_graph')
    as "0003 atomic writes",

  exists (select 1 from fn where proname = 'save_check_in')
    as "0004 partial check-ins",

  exists (select 1 from fn where proname = 'delete_my_account')
    as "0005 deletion",

  -- 0006 seeds rows and creates no objects of its own, so it can only be
  -- counted. `query_to_xml` defers parsing until execution, and the CASE
  -- short-circuits, so this stays safe when `exercises` does not exist yet.
  case
    when to_regclass('public.exercises') is null then false
    else coalesce(
      (xpath(
        '/row/c/text()',
        query_to_xml(
          'select count(*) as c from public.exercises where profile_id is null',
          false, true, ''
        )
      ))[1]::text::bigint >= 43,
      false)
  end as "0006 catalogue",

  exists (
    select 1 from pg_constraint
     where conname = 'workout_exercises_exercise_id_fkey'
       and condeferrable
       and confdeltype = 'a'
  ) as "0007 deletable w/ custom",

  exists (
    select 1
      from pg_attribute a
     where a.attrelid = to_regclass('public.check_ins')
       and a.attname  = 'local_date'
       and not a.attisdropped
  ) as "0008 local training day",

  to_regclass('public.entitlements') is not null
    as "0009 entitlements";
```

**Corrected 2026-08-10** `[fact]`. The earlier version of this query selected from `public.exercises`
directly to count the seeded catalogue. Postgres resolves table references at **parse** time, so on a
project that does not yet have `0001` it failed with `relation "public.exercises" does not exist`
instead of reporting nine `false`s — it broke in exactly the situation it exists to diagnose. The
count now goes through `query_to_xml`, whose SQL is a string and is therefore not parsed until it
runs, behind a `case` that short-circuits when the table is absent.

`[fact]` Verified against local Postgres in all three states, which is the only way to know a probe
discriminates rather than merely runs: on an **empty** database it returns nine `false`s and no error;
on a database migrated to **`0007`** it returns seven `true` and the last two `false`; on one migrated
to **`0009`** it returns nine `true`.

**Before you paste anything, confirm which project you are in.** `[fact, 2026-08-10]` On the day this
was written, the probe, a failed `0008` paste, and the full `0001`–`0009` bundle were all run against
the wrong Supabase project — an unrelated app in the same account. The probe returned nine `false`s,
which was true of that project and said nothing about PRism's. **Nine `false`s means "wrong project"
at least as often as it means "empty project", and the output cannot tell you which.** The Supabase
dashboard shows the project name in the top-left of the SQL Editor; read it, and paste the project ref
next to any probe output you record.

The consequence was not trivial: `0001` creates `on_auth_user_created`, an `after insert on auth.users`
trigger, and `handle_new_user`/`set_updated_at` are created with `create or replace` under names that
are standard Supabase boilerplate. Applying PRism's schema to another app's project therefore installs
a trigger on its signups and can silently overwrite its own signup hook.

Apply every file the probe reports `false`, **in numeric order**, stopping at the first error.

`[fact]` **The probe is the arbiter, not this document and not any sprint record.** On 2026-08-10 the
`0008` migration was pasted into the PRism project and failed with `relation "public.check_ins" does
not exist` — meaning `0001` had never been applied there, while `Docs/architecture.md` and
`Docs/tester-readiness-runbook.md` both recorded the project as carrying `0001`–`0007`. Those records
were the owner's report; the database disagreed. Run the probe before believing any of them.

`[fact]` Two properties worth knowing before you run them: `0006` asserts 43 movements and 38 slots at
the end and **aborts the whole transaction** rather than seeding a half catalogue — if it raises,
nothing was written, so read the message before re-running. `0007` only acts while the constraint is
still `restrict`, so it is safe to re-run.

`[recommendation]` Re-run the probe afterwards. It is the only authority on what the project has; this
document is a report, not an observation.

---

## 4. Create the EAS environment variables

`[fact]` `eas.json` sets only `EXPO_PUBLIC_DEMO_MODE` per profile. Everything else lives in the EAS
environment, deliberately, because the values differ per environment and `eas.json` is committed.

```bash
eas env:create --environment production --name EXPO_PUBLIC_SUPABASE_URL --value 'https://YOUR-PROD-PROJECT.supabase.co'
eas env:create --environment production --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value 'YOUR-PROD-ANON-KEY'
eas env:create --environment production --name EXPO_PUBLIC_SENTRY_DSN --value 'YOUR-SENTRY-DSN'
eas env:create --environment production --name EXPO_PUBLIC_REVENUECAT_IOS_KEY --value 'YOUR-RC-IOS-PUBLIC-KEY'
eas env:create --environment production --name EXPO_PUBLIC_REVENUECAT_ANDROID_KEY --value 'YOUR-RC-ANDROID-PUBLIC-KEY'
eas env:list --environment production
```

`[fact]` **Every one of these is `EXPO_PUBLIC_*` and is therefore inlined into the client bundle and
readable by anyone with the app.** That is correct and safe for exactly these five: the Supabase anon
key (RLS is the boundary), the Sentry DSN (write-only ingestion), and the RevenueCat *platform* keys.
A Supabase service-role key, a RevenueCat **secret** API key, or the webhook auth value in this list
would be a serious breach of I-4 — those belong only in the Edge Function's server environment.

`[fact]` A production build with the Supabase variables missing does **not** silently fall back to
demo. It fails loudly with `SUPABASE_MISCONFIGURED_MESSAGE`, by design — a build that claims to be
live while writing to local storage is exactly the invisible data loss I-2/I-15 exist to prevent.

---

## 5. RevenueCat and the Edge Functions

`[fact]` Follow `Docs/revenuecat-release-runbook.md` end to end. It covers the store products, the
entitlement and offering, the webhook, the two Edge Functions and their server secrets, and a
sandbox acceptance matrix.

**Do not skip its sandbox matrix.** `[recommendation]` The failure it exists to catch is the one that
costs the most: a missing or misrouted webhook takes the customer's money while the app keeps the
feature locked, because the client reads the entitlement from Postgres and Postgres never heard about
the purchase.

`[fact]` `supabase/functions/delete-account/` must be deployed and configured too, not only the
webhook. It deletes the RevenueCat customer when a lifter deletes their PRism account. Without it,
account deletion still succeeds in Postgres but leaves personal data at a processor — which makes
I-10 incomplete and the privacy policy inaccurate.

---

## 6. Publish the privacy policy

`[fact]` Both stores require a **reachable public URL** before a listing can be submitted.

1. Fill every `[OWNER: ...]` placeholder in `Docs/privacy-policy-draft.md`. Publishing with
   placeholders intact is worse than having no policy — the draft says so itself.
2. Have it reviewed. The draft makes **no claim of compliance** with any regulation and is explicit
   that it has not been read by a lawyer. PRism stores health-adjacent data, which raises the stakes.
3. Host it, and put the URL in both store listings.

`[fact]` The policy and `Docs/privacy-data-inventory.md` were reconciled at integration and now
describe **three** processors (Supabase, Sentry, RevenueCat) and **both** crash diagnostics and
purchase history. Earlier per-branch versions of those files each described two. Use the integrated
version.

---

## 7. Store listings and the privacy declarations

`[fact]` App identity, from `app.json`: bundle id and package are both `app.prism.trainer`, version
`1.0.0`, portrait only, `supportsTablet: false`, `ITSAppUsesNonExemptEncryption: false`.

**Apple — App Privacy.** Derive answers from `Docs/privacy-data-inventory.md`, not from memory. The
categories that are **Yes**: Contact Info → Email; Health & Fitness (bodyweight, measurements, the
four check-in scales, training data); User Content (session reflections); Diagnostics → Crash Data;
and **Purchases → Purchase History**. Everything else is No.

**Google Play — Data Safety.** Same source. Note the two questions that are easy to get wrong:
whether the three processors count as "sharing" under Google's current definition, and the
health-data declaration. Both are flagged `[OWNER: ...]` in the inventory.

**Age rating.** `[assumption]` PRism has no user-generated content visible to others, no ads, and no
social features (the Social tab is a shell). That points at the lowest rating band, but the
health/fitness data collection is what the questionnaires actually ask about — answer them from the
inventory.

**Screenshots.** `[recommendation]` Take them against a **demo-mode build** (`EXPO_PUBLIC_DEMO_MODE=true`),
which generates eight weeks of deterministic training history. A real new account is empty by design
now, so production-mode screenshots would show empty states. This is a legitimate use of the demo
seed and the reason to keep it.

`[fact]` **One thing to look at before you write the listing copy.** `PhasePanel` renders `null` when
`!__DEV__` (`src/components/ui/PhasePanel.tsx:47`), so Progress, Body, Plans, Insights and Social are
all visibly thinner in a release build than in dev. Two of those — Progress and Body — are behind the
paid unlock. Look at them in a real release build before deciding what the listing promises.

---

## 7a. iOS first — Play Console is deferred `[decision, owner, 2026-08-10]`

There is no Google Play Console account, so the route is **TestFlight → App Store review**, and Android
is out of scope until that lands. What that changes:

**RevenueCat needs only the App Store side.** Create the project with the iOS app
(`app.prism.trainer`) and the non-consumable `app.prism.trainer.pro.lifetime`; leave the Android app
out entirely. `publicSdkKey()` (`src/data/purchases.ts`) resolves per platform, so an unset
`EXPO_PUBLIC_REVENUECAT_ANDROID_KEY` disables purchasing on a platform you are not shipping — the
correct behaviour, not a gap. Set `EXPO_PUBLIC_REVENUECAT_IOS_KEY` only.

**`eas.json`'s `submit.production` is currently the wrong way round for this plan** `[fact]`: it
configures Android (a Play service account that does not exist yet) and deliberately omits iOS so
`eas submit` prompts for `ascAppId`/`appleTeamId` and caches them. That is workable — the prompt is
one-time — but the Android block is **staged for later, not live**. It is harmless because it is read
only by `eas submit --platform android`.

**The Paid Applications Agreement is the long pole.** In App Store Connect it must be active, with
banking and tax details complete, before **any** in-app purchase can be created. Start it first; it
gates the RevenueCat product, which gates the entitlement, which gates the paywall.

### What App Review will do that testing does not

`[recommendation]` Three things worth preparing, because each is a common rejection:

1. **Provide demo credentials in App Review notes.** PRism requires an account, and Apple requires
   working credentials when it does. If email confirmation is on, a reviewer signing up themselves has
   to receive and click a confirmation email — avoidable friction on a reviewer's schedule, not yours.
2. **Expect the reviewer to delete that account.** Apple actively tests account deletion, and PRism's
   deletion works now — so the demo account can vanish mid-review and a second review attempt then
   fails to sign in. Prepare two accounts, or be ready to recreate one immediately.
3. **The paid surfaces must be reachable and honest.** Insights' 28/84-day windows, Progress and Body's
   recovery estimate sit behind the unlock. A reviewer who taps them gets the paywall, which must show
   a real price from a real offering — an offering that has not synced yet reads as a broken purchase,
   which is Guideline 2.1. Verify a sandbox purchase before submitting, not after.

`[fact]` Also relevant to review: `PhasePanel` renders `null` when `!__DEV__`, so Progress and Body are
thinner in the build a reviewer sees than in dev. Look at them in a real release build before deciding
what the listing promises.

---

## 8. Build and submit

`[fact]` Resolve the config without building first; it is free and catches a missing variable:

```bash
npx eas config --platform ios --profile production
npx eas config --platform android --profile production
```

Then build:

```bash
eas build --platform ios --profile production
eas build --platform android --profile production
```

Then submit:

```bash
eas submit --platform ios --profile production
eas submit --platform android --profile production
```

`[decision, 2026-08-09]` **`eas.json`'s Android submit config deliberately targets the `internal`
track with `releaseStatus: "draft"`.** A first automated submission that goes straight to production
is one misconfiguration away from a public release of an unverified build; promoting internal → production
is one action in the Play Console. Change those two fields when you actually want the public rollout.

`[fact]` iOS submit config is intentionally **absent** from `eas.json`. `ascAppId` and `appleTeamId`
are account-specific, and `eas submit` prompts for them and caches the answers — which is better than
committing a guess. Add them to `eas.json` later if you want it non-interactive.

`[fact]` The Play service account key goes at `./credentials/play-service-account.json`. That path is
git-ignored (along with `*.p8`, `*.p12`, `*.mobileprovision`) because it is a privileged credential
that can publish as PRism — I-4, I-5.

---

## 9. Before you submit — the check no test performs

`[recommendation]` Run the cold-start walkthrough from `Docs/tester-readiness-runbook.md` §6 on a
**fresh install of a real production build**, against the production project. It is the only check in
this repository that sees what a lifter sees: the integration lane drives `SupabaseRepository`
directly and touches no screen, so a completely broken first run can coexist with 642 green unit
tests and 191 green SQL assertions. That is not hypothetical — it is exactly what #58 was, and it
reached `main`.

Everything in the original walkthrough, plus what this release adds:

1. Install, open, complete onboarding, create an account. **Confirm the onboarding answers actually
   land on the profile** — they used to be discarded.
2. Settings: change units to lb and confirm weights re-render; set a bodyweight.
3. Create a custom movement. Log a session with it. Confirm it appears in the picker.
4. Add a body measurement on Body.
5. Force-quit mid-session, reopen, confirm the session survived.
6. Submit a check-in.
7. **Paid surfaces while unentitled:** Insights' 28/84-day windows, Progress, and Body's recovery
   section should show the lock; Body's measurements and History must **not**.
8. **Buy the unlock in sandbox.** Confirm the paid surfaces open. Force-quit and reopen — the
   entitlement must survive, because it comes from Postgres, not the SDK.
9. **Restore purchases** from Account on a second install.
10. Export the account data, then delete the account. Confirm the RevenueCat customer is deleted too.

---

## 10. Stop conditions

Stop and reconsider rather than working around it if:

- The §3 probe reports `false` for `0001`–`0005` on a project you believed was migrated. The project
  is not what the records describe, and applying newer migrations on top would be guessing.
- `0006` raises. It is telling you the catalogue would have been seeded incomplete. Nothing was written.
- A sandbox purchase succeeds but the app stays locked. That is the webhook, and it is the failure
  mode that takes money without delivering the product. Do not ship past it.
- You are tempted to put a service-role key, a RevenueCat secret key, or the webhook auth value into
  an `EXPO_PUBLIC_*` variable to make something work. That is I-4, and it has no exception process.
- Deleting a test account leaves its RevenueCat customer behind. I-10 is not met, and the privacy
  policy would be describing something the app does not do.
