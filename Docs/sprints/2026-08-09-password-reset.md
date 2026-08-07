# Sprint: v1 password reset (code-based)

## 1. Document status

- **Date:** 2026-08-09
- **Branch:** `feature/v1-password-reset` (commit `954d075`), based on `feature/v1-signout-surface`
  (`eb2873f`) — **not** on `main`. One branch, one purpose, per `Docs/invariants.md` I-14.
- **Owner:** Engineer/owner.
- **Labelling** per I-15: `[fact]` / `[decision]` / `[assumption]` / `[open question]`.
- **Provenance** `[fact]`: `main` remains at `ecfd1f1`. The chain `5c18d93` → `0af00cd` → `d8c206d` →
  `0029a7f` → `954d075` is unmerged, each commit based on the one before it.

---

## 2. Scope

Close the supportability gap named in `Docs/production-posture-v1.md` §7 decision 2: a lifter who
forgot their password was recoverable only by hand in the Supabase dashboard.

Delivered: a "Forgot password?" affordance in sign-in mode, a reset mode inside the existing auth screen,
`requestPasswordReset` and `confirmPasswordReset`, and the copy and tests around them. **No new route**
— reset is a third mode of `app/auth/index.tsx`, so the route map is unchanged.

---

## 3. The decision that shaped everything: code, not link

`[decision]` This is the part most likely to look like an odd choice later, so the reasoning is recorded
before the implementation.

The SDK states its own contract (`@supabase/auth-js` 2.110.8, `GoTrueClient.d.ts`): *"The password reset
flow consist of 2 broad steps: (i) Allow the user to login via the password reset link; (ii) Update the
user's password"*, that `resetPasswordForEmail()` *"only sends a password reset link"*, and that *"in
order to use the `updateUser()` method, the user needs to be signed in first"*.

Step (i)'s **return leg** — the emailed link redirecting back into the app with a recovery session — is
deep-link capture, which this repository does not have and which `Docs/production-posture-v1.md` §4.1
defers to its own sprint: `detectSessionInUrl` is false, and a repo-wide search finds no `expo-linking`
import and no `Linking` listener in `app/` or `src/` `[fact]`. Without it, `updateUser` has no session
and the flow cannot complete. There is no web app to fall back to.

So the link is not used at all. `resetPasswordForEmail` is called with **no `redirectTo`**, and the code
in the recovery email is exchanged via `verifyOtp({ type: 'recovery' })`. This needs no redirect URL
allow-listed and no linking infrastructure — and it is the only variant that a lifter can actually
finish today.

**The sign-up analogy does not carry, which is why this needed its own decision.** Confirmation-then-
manual-sign-in works for sign-up because the credential already exists: the link confirms the account
server-side and the lifter signs in with the password they chose. Reset has no new password yet — the
credential *is* the thing being changed, and it has to be set somewhere.

---

## 4. Guardrails that shaped the implementation

- **Layering** (`app/` → stores → `src/data`). The screen calls `sessionStore.requestReset` /
  `confirmReset`, never `src/data` directly, so the store layer is not skipped.
- **D2a** — reset is a mode of the auth screen, not a new surface, and the "Forgot password?" control
  appears in **sign-in mode only**: on sign-up there is no password to have forgotten, and offering one
  there would be a second way to ask the server whether an address is registered.
- **I-4/I-5** — the OTP is user-supplied and transient. It is never written to the Keychain,
  `AsyncStorage`, a log or a doc, and no `redirectTo` embeds project configuration in the call.
- **I-8** — no diagnostic or clinical language. Note the near-collision the copy avoids deliberately:
  PRism uses "recovery" for a *training* concept (`estimateRecovery`, the Body screen), so the reset
  copy says "reset your password" and "code" and never "recovery".
- **I-10** — reset changes a credential and removes nothing. Copy constrained by test against implying
  deletion or export.
- **I-19** — sign-out teardown is untouched. Reset ends by signing out through the same
  `src/data/supabase/auth.ts` `signOut`, and the teardown contract is unchanged.
- **No component-test tooling**, by decision. This is why the stage machine and the field rules are pure
  functions in `src/domain/authReset.ts` rather than logic inside the screen.

---

## 5. Implementation summary

**New**

| File | What it does |
|---|---|
| `src/domain/authReset.ts` | `ResetStage`/`ResetEvent`, `nextResetStage`, `isResetBusy`, and the three validators — all pure |
| `src/domain/__tests__/authReset.test.ts`, `src/data/__tests__/authReset.test.ts` | See §6 |

**Modified**

| File | Change |
|---|---|
| `src/data/supabase/auth.ts` | `requestPasswordReset`, `confirmPasswordReset` |
| `src/domain/authErrors.ts` | `AuthFailure` gains `resetSent` and `invalidCode`; `toAuthFailure` gains an optional `AuthContext` |
| `src/store/sessionStore.ts` | `requestReset`, `confirmReset`, `pending` widened, `passwordResetInFlight` |
| `src/content/onboarding.ts` | `AUTH_RESET`, `AUTH_RESET_ERROR_COPY`, two new outcome entries and tones |
| `app/auth/index.tsx` | Three-way mode, "Forgot password?", the three reset stages |

### 5.1 Three decisions worth their own note

**`toAuthFailure` needed a context argument** `[decision]`. A rejected password and a rejected recovery
code both come back as 400/401/403/422; the error cannot reliably distinguish them and the two want
different sentences. The caller knows which call it made, so it passes that. Defaults to `'credentials'`,
so every existing call site is unchanged — pinned by a test.

**`confirmPasswordReset` signs out at the end** `[decision]`. `verifyOtp` leaves the app authenticated —
the only way `updateUser` can work — and continuing into Today off the back of an emailed code is a
surprising way to end a password reset, especially on a shared device. The lifter lands on sign-in with
the address pre-filled and proves the new password works, which is the one moment they should.

**The store suppresses auth events for the duration** `[decision]`, and this is the subtlest part of the
change. Without `passwordResetInFlight`, the `SIGNED_IN` that `verifyOtp` causes would flip the phase to
`'authenticated'`, the route gate in `app/_layout.tsx` would redirect to Today, and the following
`SIGNED_OUT` would bounce back to `/auth` — the lifter would watch the app flash through the home screen
mid-reset. Cleared in a `finally`, because a stuck flag would leave the app deaf to every later sign-in
and sign-out for the rest of the process.

---

## 6. Testing

`[fact]` **367 tests, 24 suites, all passing** (`npm test`). `npm run typecheck` exits 0.
`npm run test:integration` reports **5 skipped** — unchanged, credential-gated, no credentials created.

| Suite | Covers |
|---|---|
| `src/domain/__tests__/authReset.test.ts` (new) | The stage machine, including that a **failed code returns to the code form, not the start** — a mistyped digit should cost a correction, not a whole new email; `startOver` from any stage; every stage × event pair returning a known stage rather than throwing; code shape and whitespace tolerance; the new password held to the same `PASSWORD_MIN_LENGTH` as sign-up, imported rather than retyped |
| `src/data/__tests__/authReset.test.ts` (new) | A call log pinning `verifyOtp → updateUser → signOut` in that order; that **no `redirectTo`** is passed; that `updateUser` never runs on a rejected code; that raw Supabase errors are thrown for the domain to map rather than formatted here |
| `src/domain/__tests__/authErrors.test.ts` (extended) | The 4xx family under `'resetCode'`; a wrong code and an expired code reaching the **same** value; rate-limit and network still winning; the default context unchanged |
| `src/store/__tests__/sessionStore.test.ts` (extended) | Reset ending `'unauthenticated'`, with `resolveInitialRoute` returning null rather than Today; a `SIGNED_IN` emitted mid-reset ignored; the flag clearing on both success and throw |
| `src/content/__tests__/authCopy.test.ts` (extended) | The same outcome reported whether or not the address has an account; wrong and expired merged; copy that says "code" and never "follow the link"; no env vars, nothing clinical, no deletion/export |

**Not covered, and not claimed** `[fact]`: the reset screens' rendering, the OTP field's AutoFill
behaviour, and — the one that matters most — **whether a recovery email arrives containing a code**.
That depends on the template edit in §8 and can only be verified against a live project. **No on-device
verification was performed**, so no rendering or layout claim is made here.

---

## 7. Explicitly out of scope

`[fact]` None of these were touched:

- **Deep-link session capture** — its own sprint, and the reason reset is code-based. `detectSessionInUrl`
  is still false.
- **Account deletion and export (I-10)** — still absent, still blocking for store submission. A complete
  account *lifecycle* is not account *control*.
- **Live Supabase verification** — see §8.
- **`Docs/release-checklist.md` and `npm run verify`** — both still absent repo-wide.
- **I-2 / G-2** (non-transactional `saveWorkout`), **G-4** (observability), **G-9** (offline), OAuth,
  phone, and any settings surface.

---

## 8. Known incompleteness

- **The recovery email template is an owner action, and the flow is inert without it**
  `[open question — not done by this repository]`. Supabase's default recovery template sends only
  `{{ .ConfirmationURL }}`. Against that template, the flow reaches "Enter your code" with nothing to
  enter. The template must expose `{{ .Token }}`. This is a project setting, so it is behind
  `CLAUDE.md`'s approval gate — a template edit, not the confirmation ON/OFF setting.
- **Nothing has run against a live Supabase project** `[fact]`. Unchanged across all three auth sprints.
- **No rendering coverage, no on-device run** `[fact]`.

---

## 9. Validation evidence

Per `Docs/agents.md` "Required handoff" — commands run and their actual results:

| Command | Result |
|---|---|
| `npm run typecheck` | Exit 0, clean |
| `npm test` | 24 suites, 367 tests, all passing |
| `npm run test:integration` | 1 suite, 5 tests, **skipped** (credential-gated) |
| On-device cold start | **Not run.** No rendering or layout claim is made in this record. |

**Changed files:** 3 new, 8 modified — enumerated in §5.

---

## 10. The exact next decision

**Not a decision — an operational step.** Every client-side account flow now exists, and not one has been
run against a real Supabase project. The next thing is a **`preview` build against a real project**,
exercising sign-up → confirm → sign-in → reset → sign-out end to end. It needs three owner actions first:
EAS variables for the `preview` environment, the migrations applied, and `{{ .Token }}` in the recovery
template. Everything after that — I-10, the release checklist, deep links — is scheduling.
See `Docs/production-posture-v1.md` §7.
