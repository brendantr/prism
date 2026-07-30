# Sprint: security-foundation

- **Status:** **Complete.** All three tasks met their success outcomes, and the two runtime checks
  that were blocked at the end of the first session now pass on a device (see "Runtime
  verification"). One limitation is recorded rather than closed: SEC-1's Keychain path cannot be
  exercised until authentication exists. Success outcomes below were written before any code changed.
- **Date:** 2026-07-29
- **Branch:** `security-foundation` (new branch off `main` — no UI branch is reused; see "Why a new branch")
- **Type:** Security hardening. Client-side only. **No schema, migration, or RLS change in this
  sprint** — see "Explicitly out of scope".
- **Input:** Security audit, 2026-07-29 (this session). Findings referenced below by their audit
  severity and file:line.

## Why a new branch

The three UI branches (`ui-ux-foundation`, `-expansion` via PR #7, `-verification` via PR #8) are
merged and closed. `CLAUDE.md`'s "one branch, one sprint, one clear purpose" means security work gets
its own branch rather than riding on a finished UI one. This is a different body of work with a
different risk profile, and it needs to be reviewable on its own.

## Goal

Establish a secure foundation **before** the backend database work starts, so that the first real
user session is created into an already-hardened client. Every item here is cheap to fix now and
expensive to retrofit once real accounts and real tokens exist:

- A session token written to disk in plaintext cannot be un-leaked after the fact; fixing it later
  means a forced global token revocation.
- Identifiers minted by a predictable PRNG become permanent primary keys the moment they are written.
- A credential form that reaches the OS keychain while doing nothing trains users to save passwords
  for an account that does not exist.

The audit's own framing applies: PRism's backend design (RLS, injection resistance, secrets
discipline) is already strong. What is weak is everything *around the session*. This sprint closes
that gap while the blast radius is still zero.

## Why now, and not with the backend sprint

All three items are latent today — authentication is not implemented (`auth.getUser()` at
`src/data/repository.ts:216` is the only auth call in the codebase) and `EXPO_PUBLIC_DEMO_MODE`
defaults to `true`, so the Supabase path is unreachable in a shipped build. That is exactly why this
is the right moment: **there are no live sessions to migrate and no existing rows whose ids would
have to be rewritten.** Doing it during or after the backend sprint means data migration; doing it
now is a pure code change.

## Tasks

Ordered. Each has a success outcome defined before implementation. Status is updated in this document
as each lands.

### SEC-1 — Move Supabase session storage off AsyncStorage

**Status:** ☑ **Done** (`src/data/supabase/secureStorage.ts`, `client.ts`, + 6 tests)

**Audit finding:** HIGH — `src/data/supabase/client.ts:27-35` passes `AsyncStorage` as the Supabase
auth storage. AsyncStorage is an unencrypted SQLite/plist store in the app container. Supabase
persists the access token *and* the long-lived refresh token there, so filesystem read access
(jailbreak/root, unencrypted backup extraction, lost-device forensics) yields persistent account
takeover that survives a password change.

**Success outcome — all of these must hold:**

1. `createClient` in `src/data/supabase/client.ts` is passed a storage adapter backed by
   `expo-secure-store` (iOS Keychain / Android Keystore), not `AsyncStorage`.
2. The adapter handles values larger than SecureStore's ~2048-byte per-item ceiling. A Supabase
   session exceeds it, so an adapter that ignores this silently fails to persist the session.
3. The adapter is **fail-safe under partial writes**: an interrupted write must read back as "no
   session" (user signs in again), never as a corrupt or half-restored session.
4. Keychain items are marked device-only so tokens are not carried into iCloud backups.
5. Running on web does not crash. `app.json` declares a web target and `expo-secure-store` has no web
   implementation, so the adapter must degrade rather than throw.
6. `npm run typecheck`, `npm test`, and `npx expo export --platform ios` all pass.

**Explicit non-goal:** no migration path from AsyncStorage-stored sessions. None can exist — auth has
never run, so no session has ever been written. Writing migration code for a case that cannot occur
would be dead code on day one.

**Outcome — met, 6/6.**

| # | Outcome | Evidence |
| --- | --- | --- |
| 1 | Keychain-backed adapter, not AsyncStorage | `client.ts:29` now passes `secureSessionStorage`; the `AsyncStorage` import is gone from that file |
| 2 | Handles >2048-byte values | `secureStorage.ts` packs chunks to a 1800-byte ceiling by **UTF-8 byte length**, not character count. The test's SecureStore mock *throws* above 2048 bytes, so a regression to single-value storage fails the suite rather than only failing on device |
| 3 | Fail-safe under partial writes | Chunk count is written **last** as a commit marker. Two tests cover it: orphaned chunks with no marker read as `null`, and a missing chunk under a *valid* marker also reads `null` rather than returning a truncated token |
| 4 | Excluded from iCloud backups | `AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY` — see the deviation note below |
| 5 | Web does not crash | `Platform.OS !== 'web'` guard falls back to AsyncStorage, preserving prior web behaviour instead of throwing |
| 6 | Validation green | `typecheck` pass · `npm test` 84/84, 5 suites (was 78/4) · `expo export --platform ios` pass, 5.1 MB |

**Deviation from the plan, recorded rather than absorbed.** The audit recommended
`WHEN_UNLOCKED_THIS_DEVICE_ONLY`. The implementation uses `AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY`
instead. Reason: the client sets `autoRefreshToken: true`, and a refresh firing while the screen is
locked cannot read a `WHEN_UNLOCKED` item — it would fail the read and silently sign the user out.
Both constants are hardware-encrypted at rest and both are device-only, so the backup-extraction path
in the threat model is closed either way; the difference is only whether a *powered-on, already-once
-unlocked* device is readable, which is not the scenario this finding was about. The stricter constant
would trade a real functional failure for no meaningful gain. Documented in the file so the choice is
not silently reversed.

**Follow-up left open:** web remains on `localStorage` and is therefore XSS-readable. `app.json`
declares a web target but PRism does not ship one; if that changes, web needs its own decision
(no real accounts on web, or a different storage strategy). Carried as follow-up 1.

---

### SEC-2 — Replace predictable ID generation with a CSPRNG

**Status:** ☑ **Done** (`src/utils/id.ts`, + 4 tests)

**Audit finding:** MEDIUM (CWE-338) — `src/utils/id.ts:19,21` builds UUIDs from `Math.random()`, a
non-cryptographic PRNG whose internal state is recoverable from observed output. These values become
**primary keys** in `workouts`, `sets`, `workout_exercises`, `check_ins`, and `personal_records`.
Primary keys are globally unique per table independent of RLS, so predictable ids allow an attacker
to pre-insert rows carrying a victim's forthcoming ids under their own `profile_id` (which passes
`WITH CHECK`), causing the victim's later insert to fail on a primary-key collision.

**Success outcome — all of these must hold:**

1. `newId()` returns a UUID sourced from the platform CSPRNG, with no `Math.random()` anywhere in
   `src/utils/id.ts`.
2. The exported signature of `newId(prefix?)` is unchanged, so **no call site is edited** — the blast
   radius stays inside one file.
3. Output is still a syntactically valid RFC 4122 v4 UUID (version nibble `4`, variant `8|9|a|b`) so
   it drops into Postgres `uuid` columns unchanged.
4. A test asserts format validity and basic uniqueness, so a future refactor cannot silently
   reintroduce a weak or malformed generator.
5. `npm run typecheck`, `npm test`, and `npx expo export --platform ios` all pass.

**Outcome — met, 5/5.**

| # | Outcome | Evidence |
| --- | --- | --- |
| 1 | CSPRNG-sourced, no `Math.random()` | `id.ts` now delegates to `Crypto.randomUUID()`. `grep -rn "Math.random" src app` returns only comments and one unrelated test fixture (`repository.test.ts:34`, a throwaway sub-id, not a security boundary) |
| 2 | No call site edited | `newId(prefix?)` signature unchanged; the eight call sites across `activeWorkoutStore.ts`, `CheckInPrompt.tsx` and `workout/active.tsx` are untouched |
| 3 | Valid RFC 4122 v4 | Regex assertion over 100 samples pins the version and variant nibbles |
| 4 | Regression-guarding test | 4 tests. The load-bearing one asserts **delegation** — see the deviation note |
| 5 | Validation green | `typecheck` pass · `npm test` 88/88, 6 suites · `expo export --platform ios` pass |

**Deviation from the plan, recorded rather than absorbed.** Outcome 4 was written expecting a
statistical check on generated ids. That turned out to be untestable *and* misleading here:
`jest-expo` auto-stubs expo-crypto's native module, so `Crypto.randomUUID()` returns `undefined`
under the preset. A sampled-entropy assertion would therefore have been measuring Node's generator
substituted in by the mock, not the device's — a test that looks like it proves randomness while
proving nothing about the shipped code.

The suite asserts **delegation** instead: that `newId` routes through the platform CSPRNG at all.
That is strictly the better guard, because the regression actually worth catching is someone swapping
`Crypto.randomUUID()` back for `Math.random()` — which this catches and an entropy sample would not
(a seeded PRNG passes entropy sampling fine). The limitation is stated in the test file header rather
than papered over.

**Follow-up left open:** the device generator is unexercised by the suite by construction. One
runtime check on a simulator — log a handful of `newId()` values and confirm they are well-formed and
distinct — would close it. Carried as follow-up 2, and it is gated behind the native rebuild noted at
the end of this document.

---

### SEC-3 — Make the auth UI honest until real auth exists

**Status:** ☑ **Done — confirmed on device.** See "Runtime verification" below.

**Audit finding:** MEDIUM — `app/onboarding/auth.tsx:102-119` sets `textContentType="newPassword"`
and `autoComplete` on a password field whose submit handler only calls `router.push()`. This was
observed live during the UI verification sprint: iOS raises a native **"Save Password?"** dialog
after submit. Users are prompted to commit a credential to iCloud Keychain for an account that does
not exist, and the screen's own notice ("Accounts are not connected yet") contradicts its behaviour.

**Success outcome — all of these must hold:**

1. Submitting the form no longer causes iOS to offer to save a password.
2. The screen's behaviour matches its own copy: nothing it does implies an account was created or a
   credential was stored.
3. No new dependency, and no change to `src/domain/authValidation.ts` — the validation *rules* are
   correct and well-reasoned (12-char minimum, length-only, sign-in exempt; matches NIST SP 800-63B).
   This task changes how the field integrates with the OS, not what counts as valid.
4. The existing "Later" escape hatch still works, and the layout is unchanged.
5. `npm run typecheck`, `npm test`, and `npx expo export --platform ios` all pass.

**Outcome — 4/5 met, 1 blocked.**

| # | Outcome | Status |
| --- | --- | --- |
| 1 | No "Save Password?" prompt on submit | ☑ **Confirmed on device** — see "Runtime verification" |
| 2 | Behaviour matches the screen's own copy | ☑ Autofill association removed from both fields; the password is also cleared from component state on submit |
| 3 | No new dependency, `authValidation.ts` untouched | ☑ `git diff` touches one file, `app/onboarding/auth.tsx` |
| 4 | "Later" path and layout unchanged | ☑ No structural or style change — only `textContentType` / `autoComplete` values and one `setPassword('')` |
| 5 | Validation green | ☑ `typecheck` pass · `npm test` 88/88 · `expo export --platform ios` pass |

**What changed.** Both fields move from `textContentType="emailAddress"` / `"newPassword"|"password"`
and `autoComplete="email"` to `textContentType="none"` / `autoComplete="off"`. iOS raises the save
sheet when it sees an AutoFill-associated username/password *pair* submitted together, so both fields
had to change, not just the password one. `secureTextEntry` stays — masking is correct regardless.

Additionally, `submit()` now clears the password from state before navigating. Expo Router keeps this
screen mounted beneath the pushed one, so the credential would otherwise sit in memory for the rest of
the session having already served its only purpose (local validation).

**Outcome 1 was initially blocked** on a native rebuild (the two new native modules' pods were absent
from `ios/`, so the installed build could not boot this branch). Owner approval to rebuild was given
on 2026-07-30 and the check now passes — see the next section.

---

## Explicitly out of scope

- **Any schema, migration, or RLS change.** The audit's two SQL-side findings — unbounded
  attacker-controlled `display_name` in `handle_new_user()` (`0001_init.sql:252-260`) and
  FK-checks-bypass-RLS on `exercises` (`:113`, `:148`) — are real and are carried forward as
  follow-ups. `CLAUDE.md` gates migrations behind explicit owner approval, and this sprint does not
  have it. Deferring them is a scope decision, not a judgement that they are unimportant.
- **Implementing authentication.** This sprint hardens the ground auth will stand on. It does not
  add sign-up, sign-in, sign-out, or session lifecycle.
- **The client-supplied `profile_id` defence-in-depth item** (audit LOW). Currently safe — every
  affected table has `with check (profile_id = auth.uid())`. It belongs with the backend sprint that
  touches those write paths.
- **Any UI surface, product feature, or information-architecture change.**
- **The unmerged `ui-ux-foundation-cleanup` work** (Stepper deletion, `CheckIn.note` comment). That
  branch was never merged and `Stepper.tsx` is still on `main`. Out of scope here; not reopened.

## Runtime verification (2026-07-30, iPhone 17 Pro simulator, iOS 26.4)

Owner approval for the native rebuild was given, so the checks that were blocked at the end of the
previous session were carried out.

### Rebuild

`npx pod-install` → **105 pods installed**, both new modules present in `ios/Podfile.lock`
(`ExpoCrypto (57.0.1)`, `ExpoSecureStore (57.0.1)`). `npx expo run:ios --device "iPhone 17 Pro"` →
**Build Succeeded, 0 errors, 1 warning**, installed and launched. Nothing in the repo diff changed —
`ios/` is gitignored, and `git status` stayed clean throughout.

**One environment hiccup, not a code fault.** The first launch showed React Native's *"No script URL
provided"* screen. Cause: `expo run:ios` had been started as a background command, and Metro is its
child — when the command exited, Metro died with it, leaving port 8081 empty. This is the README's
documented failure mode #1 reached by a new route. Fix: start Metro independently
(`npx expo start --dev-client`), relaunch the app. It then bundled and rendered normally. Worth noting
because it looks exactly like a broken build and is not one.

**Both native modules load.** The app boots to the welcome screen, which is itself a meaningful
result: `expo-crypto` and `expo-secure-store` are imported at module scope on the boot path
(`id.ts`, and `repository.ts` → `client.ts` → `secureStorage.ts`). A missing or unlinked pod would
have failed at import, before any screen rendered.

### SEC-3 — "Save Password?" prompt: **GONE**

Replayed the exact flow that produced the sheet before: *I already have an account* → sign-in mode →
type `test@example.com` → type `abc` → **Sign in**.

| Check | Before (UI verification sprint) | After |
| --- | --- | --- |
| Immediately after submit | Step 1 of 4, clean | Step 1 of 4, clean |
| ~1 min after submit | **"Save Password?" sheet** | **No sheet** — 12-element accessibility tree, full Step 1 |
| Accessibility tree during | collapsed to a single `Application` node (system alert layer on top) | intact, all Step 1 controls addressable |

The delayed re-check matters and was deliberate: in the original observation the sheet did **not**
appear in the screenshot taken right after submit — it surfaced about a minute later. Checking only
immediately would have produced a false pass. Confirmed clean at submit + 45s, with the simulator
clock running 11:59 → 12:01.

The tree-collapse signal is the strongest evidence: an iOS system alert takes over the accessibility
layer, which is precisely what was seen before and is absent now.

### SEC-2 — device CSPRNG: **PASS**

Follow-up 2 asked for real ids from the real generator. Rather than adding a debug affordance, two
full sessions were logged through the UI and the ids were read back out of the app container's
AsyncStorage (`RCTAsyncLocalStorage_V1`), so these are values the shipped code actually persisted.

```
total ids:             28   (2 workouts, 7 workout_exercises, 19 sets)
distinct:              28
malformed (not v4):     0
version nibbles:       {'4'}          (spec: '4')
variant nibbles:       ['8','9','a','b']  (spec: subset of 8/9/a/b)
distinct 32-bit heads: 28 / 28
```

All 28 distinct, all well-formed v4. Two details worth calling out: the version nibble is `4` on every
id, and **all four** legal variant nibbles appear across the sample — which is what a real random
source produces and what a stub returning a constant, or the `undefined` the jest preset returns,
would not. This closes the gap the unit suite could not reach by construction.

### SEC-1 — what could and could not be exercised

The Keychain adapter's **read/write path was not exercised at runtime, and this is not fixable in this
sprint.** It only runs when Supabase writes a session, and no session can exist while authentication
is unimplemented and demo mode is on. What the rebuild does establish is that `expo-secure-store`
links and loads on device. The adapter's behaviour remains covered by its 6 unit tests, including both
partial-write failure modes.

Stated plainly so the sprint is not read as claiming more than it verified: **SEC-1 is
test-verified and load-verified, not session-verified.** The first real sign-in is what will exercise
it, and that belongs to the backend sprint.

## Follow-ups

1. **Web session storage is still `localStorage`** and therefore XSS-readable. `app.json` declares a
   web target but PRism does not ship one. If web ever becomes real, it needs its own decision rather
   than inheriting the native fallback.
2. ~~Device-side CSPRNG unexercised.~~ **Resolved 2026-07-30** — 28 ids from two real logged sessions,
   all distinct and well-formed v4. See "Runtime verification".
3. ~~SEC-3 outcome 1 unconfirmed.~~ **Resolved 2026-07-30** — prompt confirmed gone, including on the
   delayed re-check that caught it originally.
3a. **SEC-1's Keychain read/write path is still unexercised at runtime**, and cannot be until
   authentication exists — no session means nothing calls the adapter. Covered by unit tests and
   confirmed to load on device. The first real sign-in in the backend sprint is the check that closes
   it.
4. **Carried from the audit, deliberately not addressed here** (both need migration approval):
   unbounded attacker-controlled `display_name` in `handle_new_user()`
   (`supabase/migrations/0001_init.sql:252-260`, no length constraint on a client-supplied value),
   and foreign-key checks bypassing RLS on `exercises` (`:113`, `:148`), which lets a reference from
   another user's row block a delete. Both belong with the backend sprint.
5. **Client-supplied `profile_id` on writes** (`repository.ts:317,355`, `mappers.ts:133`). Safe today
   — every affected table has `with check (profile_id = auth.uid())` — but ownership should come from
   the session, not client state. Belongs with the backend sprint that touches those write paths.
6. **`npm audit` reports 36 vulnerabilities** (11 moderate, 25 high) across 874 packages. Pre-existing
   and not introduced by this sprint's two additions; not triaged here because dependency upgrades are
   their own approval gate under `CLAUDE.md`. Worth a dedicated pass before launch.

## Progress log

Updated as work lands. Newest last.

- **2026-07-29** — Branch opened, sprint document written with success outcomes fixed before any code
  change.
- **2026-07-29** — SEC-1 landed (`9aaf7a0`). Keychain-backed session storage with byte-aware chunking
  and a commit-marker write order. 6 new tests; suite 78 → 84.
- **2026-07-29** — SEC-2 landed (`56a479e`). `Math.random()` replaced with `Crypto.randomUUID()`; no
  call site moved. 4 new tests; suite 84 → 88. Test asserts CSPRNG delegation after the planned
  entropy assertion proved untestable under the preset.
- **2026-07-29** — SEC-3 code landed. Autofill association removed from both credential fields and the
  password dropped from state on submit. Runtime confirmation blocked on a native rebuild that needs
  owner approval; recorded rather than worked around.
- **2026-07-30** — Owner approved the native rebuild. Pods installed (105), build succeeded, both new
  modules linked and loading on device. SEC-3's "Save Password?" prompt confirmed **gone**, including
  on the delayed re-check that is what caught it in the first place. SEC-2 confirmed against the real
  device CSPRNG: 28 ids from two logged sessions, all distinct and well-formed v4. Follow-ups 2 and 3
  closed; SEC-1's session path noted as unexercisable until auth exists (3a). Sprint complete.
