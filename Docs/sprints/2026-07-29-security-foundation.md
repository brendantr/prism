# Sprint: security-foundation

- **Status:** In progress. Success outcomes below were written before any code was changed.
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

**Status:** ☐ Not started

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

---

### SEC-3 — Make the auth UI honest until real auth exists

**Status:** ☐ Not started

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

## Progress log

Updated as work lands. Newest last.

- **2026-07-29** — Branch opened, sprint document written with success outcomes fixed before any code
  change.
