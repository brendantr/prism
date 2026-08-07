# PRism v1 production posture

## Document status

- **Status:** Decision recorded. **Auth blocker resolved 2026-08-06 (§2); sign-out surface added
  2026-08-08; still not executable**, now for configuration and support reasons rather than a missing
  auth path — see §4, §4.1 and §7.
- **Date:** 2026-08-06; revised 2026-08-06 (`feature/v1-auth-session-docs`) and 2026-08-08
  (`feature/v1-signout-surface`)
- **Branch:** `feature/v1-production-posture`, revised on `feature/v1-auth-session-docs` after
  `feature/v1-auth-and-session` (commit `0af00cd`), and again on `feature/v1-signout-surface`
  (commit `0029a7f`). `[fact]` **None** of these branches is merged to `main` as of this writing, so this
  document describes branch state, not `main`.
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

**Nothing in this repository has been executed against a live Supabase project** `[fact]`. The
integration lane (`npm run test:integration`) is gated on `PRISM_INTEGRATION_SUPABASE_*`, no credentials
were created, and it reports 5 tests skipped. Sign-in has never obtained a real token here. The 287
passing tests are hermetic: they prove the state machine, the gate, the teardown and the copy rules, and
they prove nothing about a real project's behaviour.

Still open, and none of them advanced by this sprint `[fact]`:

- **I-10** — account deletion and data export. Blocking for store submission, and now *more* exposed
  rather than less: accounts can be created and signed into, and still not deleted or exported. Its own
  branch.
- **I-2 / G-2** — `saveWorkout` is still three sequential non-transactional upserts. The severity rose
  with this sprint: a partial write used to corrupt device-local demo data a lifter could reset, and now
  corrupts a real account's history.
- **G-4** — no crash reporting or analytics. Explicitly untouched, so a failed sign-in in the field
  would be invisible.
- **No password reset and no deep-link session capture** `[fact]`. A lifter who forgets their password
  is recoverable only by hand in the Supabase dashboard, and email confirmation still ends in a manual
  sign-in. See §4.1 and §7.

**Closed since this section was written** `[fact, 2026-08-08, `feature/v1-signout-surface`]`: sign-out is
no longer unreachable. Today's header carries an Account control — gated by `canOfferSignOut`, so it
appears only for an authenticated session in a build with credentials — which opens the `account` modal
and calls `signOutAndTearDown`, confirming first when logged work would be lost. A lifter can now both
sign in and sign out. This closes §7's third decision and removes the "a lifter can sign in and cannot
sign out" gap this list previously carried.

---

## 3. Which build runs which backend

| Profile | `EXPO_PUBLIC_DEMO_MODE` | Backend | Set where |
|---|---|---|---|
| Local dev (Metro) | unset → `__DEV__` → **demo** | Demo seed, no network | Default, or `.env` |
| Jest | unset → `__DEV__` → **demo** | Demo seed | Default |
| EAS `development` | `"true"` | Demo seed | `eas.json` `[fact]` |
| EAS `preview` | `"true"` | Demo seed | `eas.json` `[fact]` |
| EAS `production` | `"false"` | **Real Supabase** | `eas.json` `[fact]` |

**Why `preview` is still demo** `[decision]`: it is the internal-tester profile, and until auth lands a
real-backend build cannot get past the launch screen (§2). It flips to `"false"` alongside production in
the same one-line change, and should — testing the real path before submission is exactly its job.

**Updated 2026-08-06** `[fact]`: the auth precondition above is met, so the flip is unblocked *in code*.
It is **not** a one-line change in practice, and §4 now lists what it actually depends on — EAS variables
for the `preview` environment as well as `production`, migrations applied to the real project, and the
project's email-confirmation setting.

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

## 4. Required environment variables for a production build

`eas.json` sets the mode flag. It does **not** carry the Supabase credentials, and must not: those are
project-specific values this repository has no business hardcoding, and the person with the real
project is the one who should enter them.

**The owner runs these once**, with real values, before the first production build `[open question —
not run by this branch]`:

```
eas env:create --environment production --name EXPO_PUBLIC_SUPABASE_URL      --value "https://<project-ref>.supabase.co" --visibility plaintext
eas env:create --environment production --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value "<anon key>"                        --visibility plaintext
```

`plaintext` is correct and deliberate `[fact]`: both are `EXPO_PUBLIC_*`, so they are inlined into the
client bundle by design and are readable in any install. RLS is the authorization boundary, not their
secrecy (`Docs/invariants.md` I-4, I-6). **A service-role key must never be created as an EAS variable,
placed in `eas.json`, or committed anywhere** (I-4, I-5).

**Current state, verified** `[fact, `npx eas config --platform ios --profile production`, 2026-08-06]`:
`No environment variables with visibility "Plain text" and "Sensitive" found for the "production"
environment on EAS.` Neither variable exists yet.

**Consequence, by design:** a production build made right now has demo off and no credentials, which is
the misconfigured state — and it now **refuses to start the data layer** with a message naming the
missing variables, instead of silently downgrading to demo. See §5.

**Added 2026-08-06** `[open question — owner action]`: the two commands above target
`--environment production` only. **`preview` needs its own pair.** A preview build carries
`EXPO_PUBLIC_DEMO_MODE=false` once flipped, so without credentials in *its* environment it lands in the
misconfigured state — loud, correct, and useless for testing. Whichever profile flips first needs its
variables created first.

### 4.1 Email confirmation and deep links

**Assumption this sprint was built on** `[assumption, not verified against the project]`: Supabase email
confirmation is **ON**, which is the default. Sign-up therefore creates the user and returns **no
session** until the address is verified.

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
Supabase project setting, and `CLAUDE.md` puts those behind explicit approval. It also determines whether
a password-reset flow is nearly free (email delivery already working) or a separate problem.

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
- **`app.json` `version` is still `0.1.0`** `[open question]` — what PRism calls its first public
  version is a product decision, not made here.

## 7. The exact next decisions needed

~~**Scope the authentication sprint (G-1).**~~ **Done 2026-08-06.** Four decisions now sit where that one
did. They are listed in the order I would take them, with the reasoning, not as a menu:

1. **Does email confirmation stay ON?** Owner; Supabase project setting, so it is behind `CLAUDE.md`'s
   approval gate. It decides whether the current manual-sign-in flow is the shipping flow, and it gates
   decision 2. This is the cheapest decision here and it blocks the most.
2. **Is password reset in v1 or v1.x?** A v1 with real accounts and no reset means a lifter who forgets
   their password is locked out permanently, recoverable only by hand in the Supabase dashboard — a
   support dead end for a release whose stated purpose is real user feedback. `resetPasswordForEmail` is
   small once email delivery is settled by decision 1. **Recommendation: v1.**
3. ~~**Where does sign-out live?**~~ **Done 2026-08-08** (`feature/v1-signout-surface`). An Account
   control in Today's `headerRight` — the slot `Screen` already exposed and nothing used — opening the
   `account` modal, which calls `signOutAndTearDown` and confirms first only when logged work would be
   lost (D6). No settings screen was created and no tab was added; D1 is untouched. The decision that
   made it minimal: three items on the sheet, and a fourth would have made it the settings surface this
   was scoped to avoid.
4. **I-10 (deletion and export), and the release checklist.** Both still absent, both blocking for
   submission, both their own branches. `Docs/release-checklist.md` and an `npm run verify` script were
   expected from `feature/release-and-summary-hardening` and were never delivered — that branch merged
   without them, and neither has any git history `[fact]`.

**Until 1, 2 and 4 are answered, the `production` profile still must not be built or submitted.** The
reason has changed twice now, and the direction is worth naming: it was that the app could not function
(no auth), then that it could not be supported (no way out, no reset). Sign-out closed half of the
second. **Password reset is now the single largest supportability gap**, and decision 1 is what unblocks
it.
