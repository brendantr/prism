# Runbook: submitting PRism to the App Store and Google Play

## Document status

- **Status:** Repository side is complete. Every remaining step needs a dashboard, a credential, or a
  build service, so every one of them is **yours** — an agent holds none of those
  (`CLAUDE.md` § Scope discipline, `Docs/invariants.md` I-4).
- **Date:** 2026-08-09; reconciled 2026-08-11 for the free-first iOS binary
- **Baseline:** the integration of `feature/v1-user-data-writes`, `fix/v1-zero-data-surfaces`,
  `feature/v1-observability` and `feature/v1-entitlements`.
- **Labels** follow I-15: `[fact]` / `[decision]` / `[assumption]` / `[open question]`.

`[decision, owner, 2026-08-11]` The first submitted binary is iOS-only and free-first:
`EXPO_PUBLIC_DEMO_MODE=false`, `EXPO_PUBLIC_MONETIZATION_ENABLED=false`, and
`EXPO_PUBLIC_EMAIL_RECOVERY_ENABLED=false`. RevenueCat and custom SMTP/recovery activation are v1.x
work, not prerequisites for this binary. The deployed `delete-account` function and migration `0009`
remain prerequisites because current deletion and export paths depend on them.

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

`[open question, owner]` External release state is not proven by this repository. Do not assume the
production migrations, effective EAS environment, build artifact, policy URL or store listing exist;
verify each gate below against its authoritative system.

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

## 3a. Email delivery — v1.x recovery activation

`[decision, owner, 2026-08-11]` The first free-first binary keeps
`EXPO_PUBLIC_EMAIL_RECOVERY_ENABLED=false`. The "Forgot password?" control is hidden, so the delivery
work below is not a first-binary submission blocker. Complete and verify every step before a future
v1.x binary explicitly enables recovery; sign-up confirmation is a separate owner-controlled setting.

`[fact, 2026-08-10]` **Custom SMTP is required before password reset works at all**, and this was
absent from every list in this repository until it surfaced by accident, from a banner on the
Authentication → Emails page.

The chain, each link verified:

1. PRism's password reset is **code-based** — `confirmPasswordReset` calls
   `verifyOtp({ type: 'recovery' })`, so the lifter types a code from the email
   (`src/data/supabase/auth.ts`). No `redirectTo` is passed, deliberately, because this repository has
   no deep-link capture.
2. Supabase's **default recovery template sends only `{{ .ConfirmationURL }}`** — a link, and no code.
   Against that template the app reaches "Enter your code" with nothing to enter.
   `Docs/sprints/2026-08-09-password-reset.md` recorded this as an open question; it is still open.
3. The template must therefore expose **`{{ .Token }}`**.
4. **Supabase does not allow template editing without custom SMTP.** So the fix in (3) is gated on
   SMTP, which makes SMTP gate password reset.

`[fact]` Separately, the built-in sender is rate-limited and documented as being for testing rather
than production, so it is not a basis for a real cohort even where it technically delivers.

**The order matters, and the obvious order is wrong** `[decision, 2026-08-10]`:

| State | Sign-up | Password reset |
|---|---|---|
| Confirmation **off**, no SMTP — *today* | works | **broken** |
| Confirmation **on**, no SMTP | **broken** | **broken** |
| Confirmation **on**, custom SMTP + `{{ .Token }}` | works | works |

Turning on "Confirm email" before SMTP exists therefore makes things strictly worse: it adds a second
failure to the one already present. An earlier version of this runbook recommended exactly that, on the
assumption that confirmation was purely an auth-hardening toggle.

### Steps — explicit, in order `[decision, owner, 2026-08-10: Resend]`

Navigation below is written against the Supabase dashboard for project `gyxcjmitzktffyuroucz`.

**A. Resend: account and sending domain**

1. Sign up at `resend.com` and verify the sign-up email.
2. **Domains → Add Domain.** Enter a domain you control and can edit DNS for. The sender address must
   live on it.
3. Resend displays the DNS records to add — an `MX` for its sending subdomain plus `TXT` records for
   SPF and DKIM. Add them at whoever hosts your DNS, exactly as shown. Add a DMARC record too if
   Resend offers one.
4. Press **Verify**. This is usually minutes but DNS propagation can take longer; the domain must read
   **Verified** before anything else in this section will work.

`[fact]` **Without a domain you are limited to Resend's onboarding sender, which only delivers to your
own account address.** That is enough to prove the flow end to end and **not** enough for testers or
App Review, both of which receive mail at addresses you do not own.

**B. Resend: API key**

5. **API Keys → Create API Key.** Name it something like `supabase-smtp`; sending permission is
   sufficient. **Copy it now** — Resend shows it once.

**C. Supabase: SMTP**

6. **Authentication → Emails → SMTP Settings**, enable custom SMTP, and fill in:

   | Field | Value |
   |---|---|
   | Host | `smtp.resend.com` |
   | Port | `465` |
   | Username | `resend` |
   | Password | the API key from step 5 |
   | Sender email | an address on the domain verified in step 4 |
   | Sender name | `PRism` |

   `[recommendation]` Confirm host and port against Resend's own SMTP page rather than this table —
   providers do change them, and this document cannot notice when they do.

7. Save. The "set up custom SMTP to edit templates" banner on the Templates tab should disappear.

**D. Supabase: raise the email rate limit**

8. **Authentication → Rate Limits → emails.** The default is set for the built-in testing sender and
   is low enough to throttle a small cohort. Raise it to something your Resend plan supports.
   `[fact]` Missing this produces the confusing failure where email works, then abruptly does not,
   for reasons the app cannot see or report.

**E. Supabase: templates**

9. **Authentication → Emails → Templates → Reset password.** Replace subject and body with the
   version holding `{{ .Token }}`. **The preview must show six digits, not a button or a URL** — that
   is the whole point of this section.
10. **Confirm sign up.** Replace subject and body. Keep `{{ .ConfirmationURL }}` here: confirmation is
    a link opened in a browser, and unlike reset the app is not waiting on a typed value.

**F. Supabase: turn confirmation on — only now**

11. **Authentication → Sign In / Providers → Email → Confirm email**, on, and save.

**G. Rename the project**

12. **Project Settings → General → Project name.** `[fact]` The project **ref does not change**, so
    the API URL, anon key, EAS variables, deployed Edge Functions and the RevenueCat webhook URL are
    all unaffected. Nothing needs redoing afterwards.

`[recommendation]` Then exercise it once for real: request a reset for a throwaway account and confirm
a usable code arrives. Reset has never been executed against any hosted project, and a lifter who
forgets a password is otherwise a support ticket with no self-service path.

`[fact]` One interaction with §7a: with confirmation on, **App Review needs pre-confirmed demo
credentials**, or a reviewer must receive and click a confirmation mail on their own schedule.

---

## 4. Create the EAS environment variables

`[fact]` `eas.json` sets only `EXPO_PUBLIC_DEMO_MODE` per profile. Everything else lives in the EAS
environment, deliberately, because the values differ per environment and `eas.json` is committed.

```bash
eas env:create --environment production --name EXPO_PUBLIC_SUPABASE_URL --value 'https://YOUR-PROD-PROJECT.supabase.co'
eas env:create --environment production --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value 'YOUR-PROD-ANON-KEY'
eas env:list --environment production
```

`[open question, owner]` Decide whether the exact submitted binary includes
`EXPO_PUBLIC_SENTRY_DSN`. Add it only if diagnostics are intended for that binary, then verify the
restricted payload and align the store disclosure. Do not create RevenueCat variables for the
free-first build; its explicit monetization declaration is false.

`[fact]` **Every `EXPO_PUBLIC_*` value is inlined into the client bundle and readable by anyone with
the app.** That is appropriate for the Supabase anon key (RLS is the boundary), a Sentry DSN
(write-only ingestion), and future RevenueCat *platform* keys. A Supabase service-role key, a
RevenueCat **secret** API key, or a webhook authorization value in EAS/client configuration would be a
serious breach of I-4 — those belong only in an Edge Function's server environment.

`[fact]` A production build with the Supabase variables missing does **not** silently fall back to
demo. It fails loudly with `SUPABASE_MISCONFIGURED_MESSAGE`, by design — a build that claims to be
live while writing to local storage is exactly the invisible data loss I-2/I-15 exist to prevent.

---

## 5. Account deletion now; RevenueCat in v1.x

`[fact]` `supabase/functions/delete-account/` must be deployed and verified for the first binary.
Current in-app account deletion calls it even when RevenueCat is disabled; without it, the privacy
control fails. The function skips RevenueCat erasure when RevenueCat server configuration is absent,
then invokes the authenticated database deletion path.

`[fact]` Migration `0009_entitlements.sql` also remains required. The free-first export path reads the
server entitlement shape even though no purchase record is created, and the deletion cascade includes
the entitlement tables.

`[decision, owner, 2026-08-11]` Store products, the RevenueCat entitlement/offering, public SDK key,
webhook, purchase validation, processor-erasure credentials and the sandbox purchase/restore matrix
are deferred to v1.x. Before enabling `EXPO_PUBLIC_MONETIZATION_ENABLED=true`, follow
`Docs/revenuecat-release-runbook.md` end to end. None of that activation applies to the first binary.

---

## 6. Publish the privacy policy

`[fact]` Both stores require a **reachable public URL** before a listing can be submitted.

1. Fill every `[OWNER: ...]` placeholder in `Docs/privacy-policy-draft.md`. Publishing with
   placeholders intact is worse than having no policy — the draft says so itself.
2. Have it reviewed. The draft makes **no claim of compliance** with any regulation and is explicit
   that it has not been read by a lawyer. PRism stores health-adjacent data, which raises the stakes.
3. Host it, and put the URL in both store listings.

`[fact]` The policy and `Docs/privacy-data-inventory.md` describe the exact first binary: Supabase
processes account/training data; Sentry processes diagnostics only if that binary has a non-empty DSN;
RevenueCat and purchase history do not apply. Future monetization language is labelled v1.x.

---

## 7. Store listings and the privacy declarations

`[fact]` App identity, from `app.json`: bundle id and package are both `app.prism.trainer`, version
`1.0.0`, portrait only, `supportsTablet: false`, `ITSAppUsesNonExemptEncryption: false`.

**Apple — App Privacy.** Derive answers from `Docs/privacy-data-inventory.md`, not from memory. For the
free-first binary, the categories that are **Yes** are Contact Info → Email; Health & Fitness
(bodyweight, measurements, the four check-in scales, training data); User Content (session
reflections); and Diagnostics → Crash Data **only if the exact submitted build has a Sentry DSN**.
Purchases → Purchase History is **No**. Everything else is No.

**Google Play — Data Safety.** Same source. Note the two questions that are easy to get wrong:
whether the processor relationships present in the exact binary count as "sharing" under Google's
current definition, and the health-data declaration. Both are flagged `[OWNER: ...]` in the inventory.

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
all visibly thinner in a release build than in dev. The free-first declaration keeps Progress, Body
analysis and the longer Insights windows open; verify that exact presentation in TestFlight before
deciding what the listing promises.

---

## 7a. iOS first — Play Console is deferred `[decision, owner, 2026-08-10]`

There is no Google Play Console account, so the route is **TestFlight → App Store review**, and Android
is out of scope until that lands. What that changes:

**RevenueCat is not activated for the first binary** `[decision, owner, 2026-08-11]`. App Store
products, agreements, offerings and SDK keys belong to the v1.x monetization runbook. Do not configure
RevenueCat merely to submit this free-first build.

**iOS production submit identifiers are pinned** `[fact, repository, `3c09ea9`]`.
`eas.json` now contains account-specific `ascAppId` and `appleTeamId` fields under
`submit.production.ios`, enabling non-interactive identifier selection. Their values are not
credentials and are not repeated here. Signing and submission credentials remain external and must
never be committed.

`[open question, owner]` Confirm that the effective EAS configuration targets the intended App Store
Connect application before building. Repository presence does not prove external account state.

### Why the free-first declaration is a release gate

`[fact, verified in source 2026-08-11]` An absent RevenueCat key is not itself a free-edition signal.
If monetization is enabled without a usable offering, analysis surfaces can lock while purchasing is
unavailable. The first binary avoids that state through the explicit
`EXPO_PUBLIC_MONETIZATION_ENABLED=false` declaration: entitlement initialization returns before
RevenueCat configuration, analysis surfaces remain open, and paywall/purchase/restore controls do not
render. Effective production configuration must prove the declaration is false before TestFlight.

### Shipping free first: two build declarations `[decision, owner, 2026-08-10]`

Neither RevenueCat nor custom SMTP is on the critical path to collecting real training data. Two
flags let a free build ship honestly while both are still outstanding. Both default **off**, and both
are **declarations the build makes**, never inferences from missing configuration.

| Variable | Default | Effect while off | Set to `"true"` when |
|---|---|---|---|
| `EXPO_PUBLIC_MONETIZATION_ENABLED` | off | Progress, Body's recovery estimate and the 28/84-day Insights windows are **open**. No paywall. | RevenueCat has a **synced offering** — §5 |
| `EXPO_PUBLIC_EMAIL_RECOVERY_ENABLED` | off | "Forgot password?" is **hidden** rather than dead-ending on a code that cannot arrive | Custom SMTP **and** `{{ .Token }}` are live — §3a |

`[fact]` The monetization default is chosen against the failure, not the happy path. Forgetting it
while you do sell gives paid features away — noticed within a day, harms nobody. Forgetting it the
other way ships locked features with no way to buy them, which every user sees and App Review rejects.

`[fact]` **The flag is not permission to infer.** `entitlementStore.initialize()` still refuses to
treat a *missing* RevenueCat key as free, because that would make deleting a key the way to unlock the
paid product. `isMonetizationEnabled()` is a different statement — the build declaring it has no paid
tier — and only that statement unlocks. It also requires the literal string `"true"`, so a stray value
cannot quietly start gating.

`[recommendation]` **Setting `EXPO_PUBLIC_MONETIZATION_ENABLED=true` without a synced offering is a
release stop condition**, not a state to debug in the field: it reproduces exactly the
locked-but-unbuyable build described above. The client cannot distinguish a missing offering from one
that has not synced, so this is checked by a sandbox purchase before submission, never at runtime.

### What App Review will do that testing does not

`[recommendation]` Three things worth preparing, because each is a common rejection:

1. **Provide demo credentials in App Review notes.** PRism requires an account, and Apple requires
   working credentials when it does. If email confirmation is on, a reviewer signing up themselves has
   to receive and click a confirmation email — avoidable friction on a reviewer's schedule, not yours.
2. **Expect the reviewer to delete that account.** Apple actively tests account deletion, and PRism's
   deletion works now — so the demo account can vanish mid-review and a second review attempt then
   fails to sign in. Prepare two accounts, or be ready to recreate one immediately.
3. **The free-first surfaces must be reachable and honest.** Insights' 28/84-day windows, Progress and
   Body's recovery estimate must open without a lock or paywall. Purchase and restore controls must be
   absent, matching the binary's declaration and store metadata.

`[fact]` Also relevant to review: `PhasePanel` renders `null` when `!__DEV__`, so Progress and Body are
thinner in the build a reviewer sees than in dev. Look at them in a real release build before deciding
what the listing promises.

---

## 8. Build and submit

`[fact]` Resolve the config without building first; it is free and catches a missing variable:

```bash
npx eas config --platform ios --profile production
```

Then build:

```bash
eas build --platform ios --profile production
```

Then submit:

```bash
eas submit --platform ios --profile production
```

`[decision, 2026-08-09]` **`eas.json`'s Android submit config deliberately targets the `internal`
track with `releaseStatus: "draft"`.** A first automated submission that goes straight to production
is one misconfiguration away from a public release of an unverified build; promoting internal → production
is one action in the Play Console. Change those two fields when you actually want the public rollout.

`[fact, repository, `3c09ea9`]` iOS `ascAppId` and `appleTeamId` are pinned under
`submit.production.ios` in `eas.json`. This selects the intended account/application identifiers for
non-interactive submit; it does not provide credentials or prove external App Store Connect access.

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
6a. Confirm "Forgot password?" is absent; do not request a recovery email in this binary.
7. **Free-first analysis:** Insights' 28/84-day windows, Progress and Body's recovery section must be
   open. No paywall, purchase or restore control may appear.
8. Sign out and back in; confirm the workout, custom movement and measurement persist.
9. Export the account data and inspect that the user-entered categories are present.
10. Delete the account and confirm the deployed function removes access. No RevenueCat customer check
    applies because this binary never creates one.

---

## 10. Stop conditions

Stop and reconsider rather than working around it if:

- The §3 probe reports `false` for `0001`–`0005` on a project you believed was migrated. The project
  is not what the records describe, and applying newer migrations on top would be guessing.
- `0006` raises. It is telling you the catalogue would have been seeded incomplete. Nothing was written.
- `EXPO_PUBLIC_MONETIZATION_ENABLED` resolves true, a paywall appears, or an analysis surface is
  locked in the free-first candidate. That is the wrong binary posture; do not ship past it.
- You are tempted to put a service-role key, a RevenueCat secret key, or the webhook auth value into
  an `EXPO_PUBLIC_*` variable to make something work. That is I-4, and it has no exception process.
- You are about to enable "Confirm email" without custom SMTP configured (§3a). That does not harden
  sign-up, it breaks it, on top of the password reset that is already broken.
- A password-reset email arrives containing a link rather than a code. The recovery template is still
  the Supabase default; the app has no deep-link capture and cannot use a link, so reset is
  unusable until the template exposes `{{ .Token }}`.
- Account deletion fails against the production target. The `delete-account` deployment and migration
  chain must be verified before submission.
