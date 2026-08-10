# PRism v1 production posture

## Document status

- **Status:** Decision recorded. **The client-side account lifecycle and repository path are verified
  against staging** — 19/19 integration tests and a cold-started first-run/device deletion path on
  2026-08-08. Production remains unverified; the next release-tooling dependency is the two EAS
  `preview` variables. See §4, §4.1 and §7.
- **Date:** 2026-08-06; revised 2026-08-06 (`feature/v1-auth-session-docs`), 2026-08-08
  (`feature/v1-signout-surface`) and 2026-08-09 (`feature/v1-password-reset`)
- **Branch:** opened on `feature/v1-production-posture`; reconciled on
  `docs/live-backend-reconciliation` after the auth, write-integrity, deletion/export, staging and
  library work landed on `main`, and based on open PR #58's first-run fix.
- **Decision owner:** Engineer/owner
- **Labelling** per `Docs/invariants.md` I-15: `[fact]` / `[decision]` / `[assumption]` / `[open question]`.

---

## 1. The decision

**v1 ships to real users against a real Supabase project. It is not a demo-only release.**
`[decision, engineer/owner, 2026-08-06]`

This supersedes the prior implicit posture, in which no one had decided and the default decided for
them: `EXPO_PUBLIC_DEMO_MODE` defaulted to `true` everywhere, so an EAS production build with no
environment configured would have shipped in demo mode — deterministic seed data, no network, every
session written to a single device `[fact, prior `src/data/supabase/client.ts:12`]`.

---

## 2. The blocker, and what remains

### 2.1 The auth blocker is resolved

**Resolved 2026-08-06** (`feature/v1-auth-and-session`, commit `0af00cd`) `[fact]`.

This section previously read *"there is no authentication path in this repository"*, and described the
consequence: `trainingStore.refresh()` fired eight repository calls in parallel on mount, every one
reached `uid()`, every one rejected, and **every screen rendered "Could not load this" — permanently,
with no retry that could succeed and no route to a sign-in screen, because none existed.**

That failure is now unreachable, and by construction rather than by patching. `refresh()` no longer runs
on mount at all: an effect keyed on the session phase calls it only when the phase is `'authenticated'`
or `'disabled'`, so no repository call is ever attempted without a session. A signed-out lifter gets the
sign-in screen; a signed-in one gets their data. Separately, `uid()` now throws a typed
`AuthRequiredError`, which `refresh()` routes to the auth gate instead of to `ScreenState` — so even in
the case where a token dies mid-session, the outcome is a redirect to sign-in rather than a retry button
that cannot work. Detail: `Docs/architecture.md` §Runtime Architecture 1/3/4 and
`Docs/sprints/2026-08-06-auth-and-session.md`.

### 2.2 What this does not mean

~~**Nothing in this repository had been executed against a live Supabase project.**~~ **Superseded for
staging 2026-08-08** `[fact, engineer/owner handoff]`. A staging project exists with migrations
`0001`–`0007` applied. `npm run test:integration` passes **19/19** locally and in the separate staging
workflow; a wiped, cold-started simulator completed sign-up → setup → Today → account deletion. This
does not prove production, and it does not verify the recovery-email template described in §4.1.

Current posture after the staging follow-up `[fact]`:

- ~~**I-10 — account deletion and data export were absent.**~~ **Closed in the client and verified on
  staging.** Both ran in the integration lane; deletion also ran on device. Migration `0007` fixed the
  custom-exercise FK case the first live run exposed.
- ~~**I-2 / G-2 — `saveWorkout` was non-atomic.**~~ **Closed.** `save_workout_graph` is one transaction
  with reconciliation and retry idempotency, covered locally and through staging.
- **G-4** — the crash-reporting half is implemented on `feature/v1-observability`, but remains
  unverified against an owner-configured release project; product analytics remains deliberately
  absent.
- **No deep-link session capture** `[fact]`. `detectSessionInUrl` is false and no `Linking` handler
  exists, so email confirmation still ends in a manual sign-in — and password reset is code-based for
  the same reason. See §4.1.
- **Password reset is unverified end to end** `[fact, 2026-08-09]`. It exists in the client (below), but
  whether the recovery email actually carries a six-digit code depends on an **owner-side edit to the
  Supabase recovery template** (`{{ .Token }}`) that this repository did not and cannot make. If the
  template still sends only a link, the flow reaches "Enter your code" with nothing to enter. This is
  the first thing to test once the template lands.

**Closed since this section was written** `[fact]`, in two steps:

- **2026-08-08 (`feature/v1-signout-surface`)** — sign-out is no longer unreachable. Today's header
  carries an Account control, gated by `canOfferSignOut` so it appears only for an authenticated session
  in a build with credentials, which opens the `account` modal and calls `signOutAndTearDown`,
  confirming first when logged work would be lost.
- **2026-08-09 (`feature/v1-password-reset`)** — a forgotten password is no longer a dead end. A
  "Forgot password?" control in sign-in mode opens a code-based reset inside the same screen:
  `resetPasswordForEmail` (no `redirectTo`), then `verifyOtp({ type: 'recovery' })` →
  `updateUser({ password })` → `signOut()`, ending on sign-in so the lifter proves the new password
  works. Code-based rather than link-based **because** deep-link capture is out of scope — see §4.1.

Together these close §7's decisions 2 and 3, and the "a lifter can sign in and cannot sign out"
and "recoverable only by hand in the Supabase dashboard" gaps this list previously carried. **The
client-side account lifecycle is complete: sign up, sign in, sign out, recover.** That is a statement
about code, not about a working release — see the two bullets above it, which are the ones that still
bite.

---

## 3. Which build runs which backend

| Profile | `EXPO_PUBLIC_DEMO_MODE` | Backend | Set where |
|---|---|---|---|
| Local dev (Metro) | unset → `__DEV__` → **demo** | Demo seed, no network | Default, or `.env` |
| Jest | unset → `__DEV__` → **demo** | Demo seed | Default |
| EAS `development` | `"true"` | Demo seed | `eas.json` `[fact]` |
| EAS `preview` | `"false"` | **Real-backend path**, staging target, **variables set and a build produced** `[fact, owner, 2026-08-09]` | `eas.json` `[fact, PR #57]` |
| EAS `production` | `"false"` | **Real Supabase** | `eas.json` `[fact]` |

~~**`preview` was still demo while authentication was absent.**~~ **Flipped in PR #57** `[fact]`:
internal testers now select the real-backend path by profile. Staging exists, `0001`–`0007` are applied, and the
real path is green outside EAS. ~~The only remaining prerequisite to cutting the preview artifact is its
two public Supabase environment values (§4).~~ **Done 2026-08-09** `[fact, owner]`: both values are set
on the EAS `preview` environment, `eas config` confirms all three resolve into that profile, and a
preview artifact has been produced (Android, commit `048114b`). G-7 is closed for `preview`.

### 3.1 Startup behaviour, by build

Three states, decided at module load and resolved before the splash lifts `[fact,
`src/data/supabase/auth.ts` `isAuthEnabled()`, `src/store/sessionStore.ts` `initialize()`]`:

| Build | Session phase | What happens |
|---|---|---|
| **Demo** (`DEMO_MODE` truthy, or unset under `__DEV__`) | `'disabled'` | No auth gate. No Supabase client constructed, no Keychain read, no network call. `DemoRepository` and the `DEMO_PROFILE_ID` literal, unchanged. Today's "Demo data" chip, unchanged. The onboarding account step is skipped entirely (`Docs/ui-ux-foundation-v1.md` D2a). |
| **Misconfigured** (demo off, credentials absent) | `'disabled'` | The auth gate **does not intercept**, deliberately. Startup proceeds to `getRepository()`, which still throws `SUPABASE_MISCONFIGURED_MESSAGE`, surfaced as the ordinary retryable `ScreenState` error naming the two variables to set. |
| **Configured** (demo off, credentials present) | `'authenticated'` or `'unauthenticated'`, from the persisted Keychain session | The gate routes a signed-out lifter to `/auth` and a signed-in one to Today. `SupabaseRepository` is reached only when authenticated. **Added 2026-08-08:** once authenticated, Today's header carries the Account control, which opens the `account` modal and is the only route to sign-out. It is absent while unauthenticated (the gate has already sent them to `/auth`) and in both rows above. |

The middle row is the one worth stating explicitly. Routing a misconfigured build to a sign-in screen
would ask someone to type a password into a form that cannot work, while hiding the message that names
the actual problem — so `'disabled'` is what *preserves* §5's loud failure rather than bypassing it.
Asserted by `src/data/__tests__/authPosture.test.ts`.

**The default now follows the build, not a constant** `[decision, `src/data/supabase/client.ts`]`. An
unset flag means demo in development (`__DEV__` is true under Metro and Jest) and **real** in any
release bundle. An explicit value still wins in both directions, so a demo-mode release build or a
real-backend dev build both remain one variable away.

---

## 4. Required environment variables for real-backend EAS builds

`preview` and `production` both run the real backend. Each EAS environment therefore needs the same
two **names**, populated with values for the project that profile is meant to use:

| EAS environment | Required names | Current role |
|---|---|---|
| `preview` | `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Staging/internal testers |
| `production` | `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Store release |

`EXPO_PUBLIC_DEMO_MODE` is **not** an EAS-environment variable in this design. It is set per profile in
`eas.json` (`true` for `development`, `false` for `preview` and `production`) so backend selection stays
reviewable in Git and cannot drift independently in the dashboard.

Plaintext visibility is correct and deliberate `[fact]`: both required values are `EXPO_PUBLIC_*`, so
they are inlined into the client bundle and readable in any install. RLS is the authorization boundary,
not their secrecy (`Docs/invariants.md` I-4, I-6). **A service-role key must never be created as an EAS
variable, placed in `eas.json`, or committed anywhere** (I-4, I-5).

**State 2026-08-08** `[fact, engineer/owner handoff]`: staging exists, migrations `0001`–`0007`
are applied, and the non-EAS integration/device paths are green. The engineer is adding the two
`preview` values; until both resolve in that environment, the profile reaches the deliberate
misconfiguration error. This branch did not inspect, create, or print either value.

**Updated 2026-08-09** `[fact, owner]`: both `preview` values are set and a preview artifact has been
produced, so the misconfiguration path above is no longer what a preview build reaches. **One item
opened in the same window and is still open:** `0008_local_training_day.sql` is on `main` but **has not
been applied to staging**. Its `save_check_in` raises `22023` on a missing `local_date` and the mapper
reads `row.local_date`, so until it is applied, check-in reads return `undefined` and the nightly
integration lane fails. Code and migration were merged on the understanding they land together.

**Consequence, by design:** a real-backend profile missing either value refuses to start the data layer
instead of silently downgrading to demo. See §5.

### 4.1 Email confirmation and deep links

**Original assumption** `[assumption]`: production email confirmation is **ON**. Staging has now issued
real sessions and supported the cold-started first-run path, but that test-project setting is not a
decision about production. Whether production confirmation stays on remains owner-controlled.

The implementation handles that honestly rather than papering over it. `sessionStore.signUp` does not
treat sign-up as sign-in: it reports a `checkEmail` outcome and the lifter stays on the auth screen,
because reporting success would send the route gate to Today, where every query would fail on a session
that does not exist. If confirmation is ever disabled, the same code path receives a live session and
signs them straight in — there is no second branch to maintain `[fact, `src/store/sessionStore.ts`]`.

**`detectSessionInUrl` remains `false`, and this was reconsidered rather than inherited** `[decision,
`src/data/supabase/client.ts`]`. It reads `window.location`, a web mechanism, and **nothing in this
repository handles an incoming deep link**: `app.json` declares `scheme: "prism"`, but a repo-wide search
finds no `expo-linking` import and no `Linking` listener anywhere in `app/` or `src/` `[fact]`. Setting
it true would change nothing on device except imply a capture path that does not exist.

**Consequence, stated rather than implied: confirmation ends in a manual sign-in.** The app's
"Confirm your email" screen says exactly that — open the link, come back, sign in — and a copy test pins
the wording so it cannot drift into implying automatic capture.

Automatic capture is a **future sprint** with three parts, two of them owner-only `[open question]`: a
link handler in the app, a redirect URL allow-listed in the Supabase project, and `detectSessionInUrl`
flipped alongside them. Whether confirmation stays on at all is likewise an **owner decision** — it is a
Supabase project setting, and `CLAUDE.md` puts those behind explicit approval.

**Password reset uses the same recovery channel, and the same constraint shaped it**
`[fact, 2026-08-09, `feature/v1-password-reset`]`. The SDK's contract is that reset is two steps — log in
via the emailed link, then update the password — and `updateUser` requires a signed-in user. The return
leg of that link *is* the deep-link capture deferred above, so the canonical flow cannot complete here.
Reset therefore uses the **code** in the recovery email rather than the link: `resetPasswordForEmail` is
called with **no `redirectTo`**, and the six digits the lifter types are exchanged via
`verifyOtp({ type: 'recovery' })`. Nothing about the project's redirect configuration is involved, which
is the point — it needs no URL allow-listed and no linking infrastructure.

**One owner action it does depend on** `[open question — not done by this repository]`: the Supabase
**recovery email template** must expose `{{ .Token }}`. The default template sends only
`{{ .ConfirmationURL }}`, and against that template the flow reaches "Enter your code" with nothing to
enter. This is a template edit, not the confirmation ON/OFF setting above, but it is still a project
setting and therefore behind `CLAUDE.md`'s approval gate.

---

## 5. The failure mode this branch deliberately introduced

Previously, `getRepository()` returned a `DemoRepository` whenever Supabase was not configured — for any
reason, including "someone set `DEMO_MODE=false` and forgot the credentials" `[fact, prior
`src/data/repository.ts:493-498`]`. A build in that state looks live, logs real sessions, and writes all
of them to local `AsyncStorage` only.

That is the worst available outcome: the lifter believes their training is backed up and it is not.
`getRepository()` now throws instead `[decision]`. Because `trainingStore.refresh()` calls it inside its
try block, the throw surfaces as the ordinary retryable error state every screen already renders via
`ScreenState` — no new UI, no crash, and the message names the two variables to set.

`isDemoMode()` was changed to read the flag directly rather than construct a repository, so the render
path behind Today's "Demo data" chip cannot throw on a misconfigured build `[fact]`.

---

## 6. What this branch did not do

- **No Supabase schema or RLS change** `[fact]`. `supabase/migrations/` is untouched; the 57-assertion
  isolation suite is unchanged and still runs in CI.
- **No authentication work** — that is G-1's own sprint, and it is the gate on everything here.
- **No credentials created, committed, or invented** — no EAS environment variable was created and no
  real project URL or key appears in this repository.
- **No build or submission was run.**
- **No functional/UX change.** No v2 behaviour: no undo, no editing or deleting completed sessions, no
  offline handling.
- ~~**`app.json` `version` is still `0.1.0`** `[open question]`~~ — **closed 2026-08-09**
  `[decision]`. It is **1.0.0**: the store submission this posture was written for is the first
  public release, and a listing numbered 0.1.0 would misdescribe it. See
  `Docs/release-checklist.md` §2 and `Docs/store-submission-runbook.md`.

## 7. The exact next decisions needed

~~Authentication, sign-out, password reset, I-2, I-10, migration application, and first live-project
execution were the prior construction gates.~~ **They are closed for the client and staging** `[fact,
2026-08-08]`: migrations `0001`–`0007`, 19/19 integration tests, and a cold-started first run through
account deletion.

The next gate is operational: finish the two `preview` environment values in §4, then build and
cold-start the EAS artifact against staging. Separately, the owner must decide or verify before
production:

1. **Recovery-email template:** does it expose `{{ .Token }}` so the code-based reset can complete?
   This is still unverified.
2. **Production email confirmation:** does it stay on? Staging's test setting does not decide this.
3. **Deep-link capture:** still deferred and non-blocking; confirmation is manual and reset is
   code-based until a handler, allow-listed redirect and client setting land together.
4. **Privacy policy and observability:** the branch-level implementation and disclosure draft exist;
   owner configuration, a release test event/source-map check, and legal review remain release work.

No production build or submission is authorized by staging verification alone.
