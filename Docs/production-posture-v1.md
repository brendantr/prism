# PRism v1 production posture

## Document status

- **Status:** Decision recorded; **not yet executable — see §2.**
- **Date:** 2026-08-06
- **Branch:** `feature/v1-production-posture`
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

## 2. This posture is blocked, and the blocker is not configuration

**`Docs/architecture.md` G-1 — there is no authentication path in this repository** `[fact]`.

Verified this session by repo-wide search: **zero** occurrences of `signInWithPassword`, `signUp`,
`signOut`, or `setSession` anywhere in `app/` or `src/` outside tests. `SupabaseRepository.uid()`
throws `'Not signed in.'` (`src/data/repository.ts:215-219`), and it is the first call inside
`getProfile`, `updateProfile`, and every read and write below them.

What that means concretely for a real-backend build today `[fact, traced through
`src/store/trainingStore.ts:60-90`]`: `trainingStore.refresh()` fires eight repository calls in
parallel on mount. Every one reaches `uid()`. Every one rejects. The store lands in `status: 'error'`
and **every screen renders "Could not load this" — permanently, with no retry that can succeed and no
route to a sign-in screen, because none exists.**

**So: do not build or submit the `production` profile until an authentication sprint lands.** The
configuration in §3 is wired and correct, and flipping it on is then a zero-code change. Shipping it
before that is not a degraded experience; it is a non-functional app.

Also still open and independent of auth `[fact, `Docs/ui-ux-foundation-v1.md` §8]`: **I-10** (account
deletion and data export — blocking for store submission), **I-2** (non-atomic `saveWorkout`, which
starts mattering the moment writes are real and shared), and **G-4** (no crash reporting or analytics).

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

## 7. The exact next decision needed

**Scope the authentication sprint (G-1).** Every other item in this document is ready and waiting on it:
the flags are wired, the profiles are explicit, the misconfiguration is loud, and the credential
commands are written down. Until sign-in exists, the `production` profile must not be built or
submitted.
