# PRism invariants

Durable, enforceable rules for this codebase — not aspirational advice. Each entry states the rule, why it exists, what evidence would show it holds, and how an exception is granted. Facts about current implementation status are sourced from `Docs/architecture.md` (the accepted baseline) and are not re-asserted or re-verified here; where the baseline shows a gap, this document says so rather than claiming compliance.

Related: `CLAUDE.md`, `Docs/agents.md`, `Docs/decisions/`.

---

## User-data integrity

### I-1. Every user-data table must use row-level security (RLS) before real user data is written
- **Rule:** No table holding real (non-demo) user data may be written to in production until RLS is enabled and its policies are verified to behave as designed.
- **Why:** The client holds only a Supabase anon key; RLS is PRism's entire authorization boundary (see `README.md`'s security model paragraph). Without verified RLS, any user could potentially read or write another user's data.
- **Enforcement evidence or expected validation:** **Met, as of 2026-08-01** (sprint
  `rls-migration-fix`, following `rls-policy-verification`'s 2026-07-31 finding). The index defect
  that previously aborted `supabase/migrations/0001_init.sql` before any RLS policy could be created —
  a non-immutable function (`checked_in_at::date`) in the `check_ins_one_per_day` index expression —
  is fixed in the committed file (`timezone('utc', checked_in_at)::date`, `IMMUTABLE` per
  `pg_proc.provolatile`). `supabase/tests/rls/run.sh`, run against the actual corrected
  `supabase/migrations/0001_init.sql` and `0002_security_hardening.sql` (not a scratch copy) on a
  disposable local Postgres 16 instance, applies both migrations cleanly end to end — all 11 tables
  created, all 20 RLS policies present, `pg_class.relrowsecurity = true` on every table including
  `personal_records` (previously never created) — and passes all 57 cross-tenant isolation assertions,
  reproduced twice from a clean database. Migration `0002`'s four SB-3 behavioral checks were also run
  directly against this corrected schema and all four passed: a 10,000-character `display_name` is
  truncated to exactly 60 characters; a cross-tenant `workout_exercises` reference to another user's
  private exercise is rejected (`42501`, `assert_exercise_visible`); the owning user can still delete
  that exercise afterward (no lingering block); and ordinary same-user logging inserts continue to
  succeed. Full evidence: `Docs/sprints/2026-08-01-rls-migration-fix.md`. This closes I-1 for the
  policies-as-committed; it does not by itself mean production/non-demo mode should be enabled — that
  still requires an authentication path (`Docs/architecture.md` G-1) and applying this migration to a
  real production Supabase project, neither of which is in scope here.

  **Strengthened 2026-08-06** (sprint `v1-auth-and-session`). One of the two remaining conditions above
  is now met: an authentication path exists, so identity is sourced from a live Supabase session rather
  than being unreachable. `SupabaseRepository.uid()` reads `auth.getSession()` and throws
  `AuthRequiredError` when there is none; it remains the single accessor, called at the top of the ten
  methods that need an owner and deliberately absent from `listExercises`, `listRoutines` and
  `getActiveRoutine` — world-readable system rows and RLS-only scoping, the documented I-6 exception,
  unchanged. `getSession()` replaced `getUser()` for cost, not for trust: the access token is what
  Postgres evaluates policies against either way, and `getUser()` was issuing a network round-trip on
  each of the six `uid()` calls inside a single parallel `refresh()`. **The other condition is still
  open** — no migration has been applied to a real production project, and no code path in this
  repository has been executed against one (the integration lane is credential-gated and skipped). RLS
  remains verified against a disposable local Postgres, not against production.

  **Index model superseded 2026-08-06** (sprint `v1-local-training-day`). Migration `0008` drops the
  UTC expression index named in the original evidence above and replaces it with an ordinary unique
  index on `(profile_id, local_date)`. This changes day identity, not authorization: `save_check_in`
  remains `security invoker`, RLS still applies to every statement, and ownership still comes only
  from `auth.uid()`. The full database runner passes **152/152 assertions** after the change, including
  the unchanged 57 cross-tenant assertions and four new function/index authorization-shape checks.
- **Exception process:** None. This is a hard gate before enabling non-demo mode for real users; no engineer/owner override applies to skipping RLS verification itself.

### I-2. Workout saves involving multiple records must be atomic, idempotent, or safely recoverable
- **Rule:** A workout write that touches more than one table (workout, workout_exercises, sets) must not be able to leave the database in a partially-written state that is silently lost or silently duplicated.
- **Why:** A logged workout is the user's primary data; a failed partial write (or a naive retry that duplicates it) destroys trust in the core product loop.
- **Enforcement evidence or expected validation:** **Met as of 2026-08-06** (sprint
  `v1-workout-write-integrity`), replacing the "confirmed gap, not yet met" status this entry carried
  from the baseline and the "reaffirmed as open" note the auth sprint added the same day.
  `supabase/migrations/0003_workout_write_integrity.sql` introduces
  `public.save_workout_graph(jsonb, jsonb)`: one plpgsql function, therefore one transaction, writing
  the workout, its exercise blocks, its sets, and the personal records the session set.
  `SupabaseRepository.saveWorkout` and the new `completeWorkout` both call it; the three sequential
  upserts and the separate personal-record insert are gone.

  The audit that produced the fix found the gap was **wider than G-2 recorded** — three defects, not
  one. (1) Non-atomicity, as described. (2) The write was *additive only*: it upserted what it was
  given and deleted nothing, so an exercise removed in the logger stayed in Postgres and reappeared on
  the next read. The function now treats the payload as authoritative for that workout and deletes the
  children it omits. (3) Personal records were inserted separately, with freshly minted ids on every
  retry, into a table with no uniqueness beyond its primary key — so a retry after a lost response
  wrote a duplicate. A `(profile_id, workout_id, exercise_id, kind)` unique index plus `on conflict do
  nothing` makes a repeat call a no-op.

  Deterministic evidence: `supabase/tests/rls/03_run_write_integrity_tests.sql`, **31 assertions**, run
  as the non-owning `authenticated` role against a disposable local Postgres 16.14 with all three
  migrations applied exactly as committed — **31/31 passing from a clean database**, alongside the
  unchanged **57/57** RLS isolation suite. The mid-sequence failure this invariant names as its
  expected validation is assertion set 4: a set violating `reps <= 500` aborts the call, and the
  workout row, the exercise block and the personal record that had already been written are all
  confirmed absent afterwards. Also covered: exact-retry idempotency, child reconciliation, an
  order-index swap inside one statement, cross-tenant rejection, and refusal of an unauthenticated
  call. Demo mode holds the same two properties (`DemoRepository.completeWorkout`, tested in
  `src/data/__tests__/repository.test.ts`) so demo and real modes do not diverge on the behaviour this
  invariant governs.

  **Two limits on this claim, stated rather than buried.** First, the function is `security invoker` by
  deliberate choice — RLS still applies to every statement inside it and ownership still comes from
  `auth.uid()`, so I-1 and I-6 are not weakened. A `security definer` version would have been shorter
  and would have become the one hole in the authorization boundary those two invariants describe.
  Second, **this is verified against local Postgres only.** The migration has not been applied to the
  real Supabase project, and until it is, `save_workout_graph` does not exist there and every workout
  save against it fails outright. That is a loud failure rather than a silent partial write, but it is
  a release gate — see `Docs/release-checklist.md` §3.
- **Exception process:** Any interim non-atomic write path must be explicitly called out in the relevant sprint document until fixed; it may not be silently treated as production-ready.

### I-3. Raw set-level data must remain available even when derived metrics are cached
- **Rule:** Introducing a cache or precomputed aggregate for a derived metric (readiness, volume, e1RM trend, etc.) must never come at the cost of discarding the underlying set-level rows it was computed from.
- **Why:** Derived metrics are recomputable; raw logged sets are not. Users need to be able to see and trust the source data behind any number PRism shows them, especially anything feeding a readiness suggestion.
- **Enforcement evidence or expected validation:** Currently trivially true — `Docs/architecture.md` §Runtime Architecture confirms derived values are computed on the fly via `useMemo` from stored data, with no caching layer yet in place. This invariant governs any future caching work. **Strengthened 2026-08-03** (sprint `workout-history-v1`): the set-level rows are now visible to the user, not merely retained. `app/history/[id].tsx` renders every stored set of a completed session — load, reps, RPE, set type — including warm-ups and any set not ticked off, each marked as counting toward volume or not. Anything a future cache discarded would therefore become visible as missing data on a review screen a lifter actually uses, rather than silently vanishing behind a total.
- **Exception process:** Requires a dedicated ADR before any caching/aggregation design that would discard or downsample set-level rows.

---

## Authorization and secrets

### I-4. Client code must never hold privileged credentials
- **Rule:** Supabase service-role keys, RevenueCat secret/API keys, App Store/Play Console credentials, and any other privileged/server-only credential must never be embedded in, bundled with, or reachable from the mobile client.
- **Why:** `EXPO_PUBLIC_*` variables are inlined into the client bundle by design (README, `Docs/architecture.md` §Security). A privileged credential in client code is exposed to every install of the app.
- **Enforcement evidence or expected validation:** `Docs/architecture.md` confirms only three `EXPO_PUBLIC_*` variables exist today (`DEMO_MODE`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`) and no service-role key or other server-only secret was found anywhere in the repository. This invariant must continue to hold as RevenueCat, store operations, or any server-side component are added.

  **Still holds 2026-08-06** (sprint `v1-auth-and-session`). Authentication introduced **no fourth
  variable and no credential of any kind** — it consumes the two Supabase values that already existed
  and adds nothing. Nothing was created on EAS. The session it now obtains is a user access/refresh
  token pair, which is not a build-time secret and is held only in the Keychain/Keystore by the existing
  chunked adapter, never in source, `eas.json`, or a doc.

  **Still holds 2026-08-09** (sprint `v1-password-reset`). The recovery OTP is **user-supplied and
  transient**: the lifter reads six digits out of an email, types them in, and they are sent once and
  discarded with the component. It is never written to the Keychain, to `AsyncStorage`, to a log, or to
  a doc, and it is not a build-time secret in any sense. No `redirectTo` URL is passed either, so
  nothing about the project's configuration is embedded in the call.
- **Exception process:** None for privileged credentials reaching the mobile client. Any feature that appears to need one (e.g., RevenueCat webhook verification, store API calls) requires a server-side component, decided via ADR — not a client-side workaround.

### I-5. No secret values in code, commits, documentation, prompts, logs, or generated artifacts
- **Rule:** Secret-like values (API keys, tokens, passwords, private keys) are never written into source, Git history, `Docs/`, AI prompts/output, or logs — including partial or "example-looking" values that are actually real.
- **Why:** Git history and documentation are effectively permanent and widely readable; a leaked secret cannot be un-leaked by deleting the file in a later commit.
- **Enforcement evidence or expected validation:** This sprint's validation step searches all newly created documentation for secret-like patterns (`SUPABASE`, `REVENUECAT`, `API_KEY`, `SECRET`, `TOKEN`, `PASSWORD`, `PRIVATE KEY`) without printing values. `.env` is confirmed git-ignored (`.gitignore`).

  **Extended again 2026-08-09** (sprint `v1-password-reset`): the same assertions now run over the
  reset strings, and the pattern list there additionally rejects `otp` and `verifyOtp` — the mechanism
  has a name the lifter has no reason to learn, and "enter the code from your email" is the honest
  description of what they are doing.

  **Extended to user-facing copy 2026-08-06** (sprint `v1-auth-and-session`). The rule now has an
  automated check on the one surface most likely to leak configuration detail into a lifter's hands:
  `src/content/__tests__/authCopy.test.ts` asserts that no string on the auth surface matches
  `EXPO_PUBLIC_`, `SUPABASE`, `ANON_KEY`, `SERVICE_ROLE`, `API_KEY`, `SECRET`, `TOKEN`, or internal
  identifiers such as `auth/v1`, `RLS`, `profile_id` or `postgres`. The contrast is deliberate and
  documented: `SUPABASE_MISCONFIGURED_MESSAGE` *does* name two environment variables, because its
  audience is whoever built the app, and it is the only such string in the product.
- **Exception process:** None. If a secret is ever committed, the response is rotation of the credential and history remediation, not documentation.

### I-6. A user may only access their own protected data unless a documented server-side policy permits otherwise
- **Rule:** Every RLS policy scopes access to `profile_id = auth.uid()` (directly or via an `EXISTS` walk to the owning parent), with any exception documented at the schema level.
- **Why:** This is the actual authorization mechanism given the client-holds-anon-key trust model (see I-1, I-4).
- **Enforcement evidence or expected validation:** `Docs/architecture.md` confirms policies are written this way for all 11 tables. The one documented exception is `exercises` rows with `profile_id = null`, which are intentionally world-readable system rows (migration comments, README "Connecting Supabase" step 3). Verification of correct *enforcement* (not just intent) is covered by I-1.

  **Strengthened 2026-08-06** (sprint `v1-auth-and-session`), in two directions.

  *The client still never asserts identity.* No repository method accepts a caller-supplied id — the
  auth sprint added none, and changed no signature. `sessionStore.userId` exists for display and test
  assertions and is never passed into a query; `saveWorkout` still overwrites `profile_id` from the
  session rather than from the passed-in object, and `deleteWorkout` still scopes by owner as well as
  id. `src/data/__tests__/ownership.test.ts` asserts this against a deliberately hostile payload and was
  updated to the `getSession` shape without any change to what it claims.

  *Own-data-only now also covers what is already on the device.* RLS governs what the server returns and
  says nothing about what a previous user left in memory or in `AsyncStorage`. On a shared phone that
  gap is a real path to one lifter seeing another's data, so it is now closed explicitly by the
  sign-out teardown contract and the draft-ownership check — see **I-19**, which exists to keep that
  from being re-derived every time a new store is added.

  **Extended 2026-08-08** (sprint `v1-signout-surface`). `SessionUser` now carries `email` alongside
  `userId`, and both are held on `sessionStore`. The rule they live under is unchanged and is stated in
  the store itself: **neither is ever passed into a repository method.** They exist so the Account sheet
  can answer "which account am I in?" — the question a sign-out control is usually opened to settle on a
  shared device — and for test assertions. Identity still reaches Postgres only as the access token, and
  is still checked by RLS. Sign-out clears both, so a stale `email` cannot name the previous lifter on
  the next session's first frame (asserted in `src/store/__tests__/authActions.test.ts`).
- **Exception process:** Any new shared/world-readable data pattern must be documented in the schema/migration and referenced from this invariant's evidence, not introduced silently.

---

## Privacy and health-adjacent data

### I-7. Readiness and check-in data is optional, user-entered, private by default, and never positioned as medical data or diagnosis
- **Rule:** Sleep, energy, soreness, RPE, and any other readiness input are optional for the user to provide, entered by the user (not inferred or pulled from a health platform in v1), private to that user by default, and never framed as medical or diagnostic information. **RPE is the sole perceived-effort field for v1; RIR is out of scope until a separate, explicitly approved future sprint authorizes its data capture, storage, UI, and use as a rule input.**
- **Why:** This is a mandatory boundary of the approved product direction ([ADR-0002](decisions/ADR-0002-readiness-suggestion-safety.md)) and a real legal/trust risk if violated. RIR was deliberately deferred (engineer/owner decision, 2026-07-27) to keep v1 input scope bounded rather than expanded ad hoc.
- **Enforcement evidence or expected validation:** **Partially met as of 2026-07-29** (sprint `readiness-inputs-and-confidence-foundation`). What is now verified in code: a real user-entered check-in path exists — `src/components/today/CheckInPrompt.tsx` renders on the Today screen and calls `trainingStore.saveCheckIn`, closing the "no call site for `saveCheckIn` in `app/`" gap the 2026-07-27 reconciliation review found. Optionality is enforced by the type system rather than by convention: `CheckIn.sleepQuality`, `.energy`, `.soreness` and `.stress` are `number | null` in `src/domain/types.ts`, each answerable on its own, and a field left alone is stored as null rather than defaulted (asserted by `src/domain/calc/__tests__/calc.test.ts` and `src/data/__tests__/repository.test.ts`). Inputs remain user-entered — no health-platform or wearable source was added. ~~**Known limitation:** partial check-ins work against `DemoRepository` only…~~ **Closed 2026-08-06** (sprint `v1-checkin-partial-schema`). `supabase/migrations/0004_partial_check_ins.sql` drops `not null` from all four scales and adds `public.save_check_in(jsonb)`, a `security invoker` function that merges a submission into that day's record. Nullability alone was not sufficient: `DemoRepository` distinguishes an **omitted** property (leave the stored answer alone) from one sent as **explicit null** (erase it), which a PostgREST upsert cannot express because it sends every column. The payload is therefore jsonb, and the function tests key presence (`p_patch ? 'energy'`); `SupabaseRepository.saveCheckIn` builds it with `field in checkIn` rather than by value. `assertCompleteCheckIn` is deleted rather than relaxed. A second defect was found and closed with it: the old code upserted on the primary key, so a same-day submission carrying a new id would have inserted a second row and violated `check_ins_one_per_day` — it worked only because the UI happened to reuse a cached id. Evidence: `supabase/tests/rls/04_run_check_in_tests.sql`, **23/23 assertions** against a clean local Postgres 16.14 (111 total across the three SQL suites), each mapped to its counterpart in `src/data/__tests__/repository.test.ts` because parity with demo mode is the property under test. **Deliberately not added:** an at-least-one-answered constraint — demo mode permits clearing every field, and Postgres rejecting a state demo accepts would be exactly the kind of divergence that only surfaces in production. **Still open** `[open question]`: demo resolves "same day" in the device's **local** timezone and Postgres in **UTC**, so a late-evening check-in can land on different days in the two modes. Settling that is a product decision about what a training day is, and it should be settled before real users span time zones. **Also still true:** `0004` has not been applied to any live Supabase project, and until it is, check-ins fail entirely there rather than only partially. **Still open:** the "never medical" copy bar has not been formally reviewed — the strings shipped are product-owner-approved for this feature, but no standing copy/claims review process exists (see I-8). Any check-in data written for real users must still satisfy I-1 (RLS verified) and I-6 (own-data-only access) before production; neither is met, and check-in data is not exempt.

  **The day-boundary open question above is superseded and closed as of 2026-08-06** (sprint
  `v1-local-training-day`). A training day is the device-local calendar date captured when the
  check-in is submitted. `supabase/migrations/0008_local_training_day.sql` adds required `local_date`,
  replaces the UTC expression index with uniqueness on `(profile_id, local_date)`, and replaces
  `save_check_in` so it merges on that value. `checkedInAt` remains separate: it still orders rows and
  drives readiness staleness in elapsed hours; only one-per-day identity and `selectTodaysCheckIn`
  use `localDate`.

  Literal tests cover the two regressions (UTC-4 adjacent dates collapsing; UTC+10 one date
  splitting), half-hour offsets, DST gaps/folds, and travel that skips or repeats a date. A skipped
  date has no row; a repeated date intentionally merges under the existing patch rules. Client
  computation is a same-account integrity input, not a new security boundary: a modified client can
  mis-bucket its own data, while RLS and `auth.uid()` still prevent cross-account access. Evidence:
  **20/20** new local-training-day SQL assertions, **152/152** across the full database runner, and the
  branch-only Jest run **423 passed / 27 suites** with 5 credential-gated integration tests skipped.

  **Still true:** migrations `0001`–`0008` have not been applied to a live Supabase project. This is
  verified against disposable local Postgres 16.14, not production. The "never medical" copy bar also
  has no standing formal review process (see I-8). Check-in data is not exempt from I-1/I-6; both are
  verified in the committed client/schema and remain unverified against a live project.
- **Exception process:** None without a new ADR reviewed by the engineer/owner and supported by evidence (e.g., specific legal/clinical review), per the mandatory boundaries in the approved product direction. Adding RIR requires the same: a new ADR or explicit sprint approval, not an incidental addition during other readiness work.

### I-8. PRism must not claim to diagnose injury, detect overtraining, measure recovery clinically, prevent injury, or provide medical advice
- **Rule:** No copy, UI element, or feature description asserts diagnostic, clinical-measurement, or preventive-medical capability. PRism is not described as an "AI coach," and no scientific/medical validation claim is made unless specifically approved and evidenced.
- **Why:** Same as I-7 — mandatory product boundary; also the existing recovery-estimate copy already models the correct posture ("What this model does not know... It is a prompt to check in with your own body, not a verdict" — `README.md`).
- **Enforcement evidence or expected validation:** The existing `RECOVERY_MODEL_EXPLANATION` framing (README, `Docs/architecture.md` §Runtime Architecture) is consistent with this invariant and should be treated as the tone baseline for any new readiness copy. No formal copy review process exists yet — expected validation is a copy/claims review before any readiness-suggestion UI ships.

  **First automated check added 2026-08-06** (sprint `v1-auth-and-session`). `authCopy.test.ts` asserts
  that no auth-surface string matches `/diagnos|clinical|medical|injur|overtrain|prevent/i`. This is
  trivially satisfied today — the auth screens have no readiness content to overclaim about — which is
  exactly why it was worth pinning before someone adds a reassuring sentence about recovery to a
  sign-up screen. It is a pattern for the copy review this invariant still expects, not a substitute
  for it: a regex cannot review a claim, and the readiness surfaces remain unchecked.

  **Extended 2026-08-09** (sprint `v1-password-reset`) over the reset strings. Worth noting the word
  that makes this less trivial than it looks: PRism uses **"recovery"** for both a training concept
  (`estimateRecovery`, the Body screen) and an account one (Supabase's recovery email). The reset copy
  deliberately never says "recovery" to the lifter — it says "reset your password" and "code" — so the
  two senses cannot collide on screen and imply that resetting a password has anything to do with how
  recovered they are.
- **Exception process:** Requires specific, documented legal/product approval and supporting evidence — not currently granted for any claim beyond the existing "estimate, not a verdict" framing.

---

## Payments and entitlements

### I-9. Entitlements are never trusted from a client-controlled boolean
- **Rule:** Whether a user has an active paid entitlement must be determined server-side (Supabase + RevenueCat webhook/verification), never from a value the client can set or spoof.
- **Why:** A client-controlled entitlement flag is trivially bypassable and would give away paid features for free.
- **Enforcement evidence or expected validation:** **Met in the S4 repository implementation as of
  2026-08-09; operational release validation remains open.** `react-native-purchases` performs only
  purchase/restore transport. `useEntitlementStore` changes its phase only after
  `Repository.getEntitlement()` reads the authenticated account's Postgres row; SDK customer info and
  purchase results never grant access. Migration `0009_entitlements.sql` gives the client owner-select
  only, denies client writes, and exposes one service-role-only, security-invoker event RPC. The
  RevenueCat webhook authenticates before calling that RPC and applies supported events idempotently.
  Deterministic unit tests cover fail-closed resolution, purchase/restore polling, identity switching,
  and exact-product selection; the disposable Postgres suite adds 17 entitlement assertions. This
  does **not** prove the hosted webhook, product, offering, or store transaction: all remain release
  gates in `Docs/revenuecat-release-runbook.md`.
- **Exception process:** None. Any payment implementation must be designed against this invariant from the start, per the approval-gate for payment changes in `CLAUDE.md`.

### I-10. Account deletion and export are required before store release
- **Rule:** A user-facing account deletion flow and a data export mechanism must exist and work before PRism is submitted to the App Store or Play Store.
- **Why:** Store policy and user trust requirements; also directly relevant given the health-adjacent data PRism stores.
- **Enforcement evidence or expected validation:** `Docs/architecture.md` confirms neither exists today — the README lists both as Phase 6 ("planned"), not implemented. The schema's `on delete cascade` from `auth.users` (migration) makes deletion straightforward to implement once auth exists, but this is a design note, not evidence of completion.

  **Reaffirmed as open 2026-08-06, and now more exposed** (sprint `v1-auth-and-session`). Auth landing
  does not advance this invariant by even a step: accounts can now be created and signed into, and there
  is still no way to delete one or export its data. The gap has moved from theoretical to reachable by a
  real user. The precondition named above — "once auth exists" — is now satisfied, so the cascade-based
  implementation is unblocked and this is squarely a scheduling decision rather than a dependency.
  Remains blocking for store submission; its own branch, per I-14.

  **Guarded against confusion 2026-08-08** (sprint `v1-signout-surface`). An Account surface now exists,
  and "sign out" is exactly the phrase a worried person reads as "erase my data" — so the copy is
  constrained rather than trusted. `src/content/__tests__/accountCopy.test.ts` asserts the explanatory
  line matches none of `delete`, `erase`, `export`, `wipe`, `permanently`, `remove your account` or
  `close your account`, and that it states both halves of what actually happens: the device is cleared,
  and the account and its logged sessions are not. If deletion or export ever ships, that test is the
  thing that has to be deliberately changed — which is the point. **Neither capability exists**, and this
  invariant is unchanged and still open.

  **Guarded again 2026-08-09** (sprint `v1-password-reset`). Password reset is the second surface whose
  name a worried person can read as erasure — "reset my account" and "reset my password" are one word
  apart. It **changes a credential and removes nothing**: no row is deleted, no data is exported, and
  the account is the same account afterwards. `authCopy.test.ts` extends the same constraint over
  `AUTH_RESET` and `AUTH_RESET_ERROR_COPY` (`delete`, `erase`, `export`, `wipe your`). **I-10 remains
  open and blocking for store submission**, and the client-side account lifecycle being complete —
  sign up, sign in, sign out, recover — must not be mistaken for it being closed. Deletion and export
  are a separate branch and a separate gate.

  **Met in the client as of 2026-08-06** (sprint `v1-account-deletion-export`), closing the gap the
  three notes above kept restating.

  *Deletion.* `supabase/migrations/0005_account_deletion.sql` adds
  `public.delete_my_account()`, and `app/account.tsx` reaches it through
  `deleteAccountAndTearDown` behind two confirmations. Deleting the `auth.users` row cascades through
  `profiles` to all six user tables (0001), so the function names no tables and cannot drift out of
  step with the schema. It is the only `security definer` function in PRism that **destroys data** — a
  claim originally and wrongly written here as "the only `security definer` function in PRism", which a
  review corrected: `handle_new_user` (`0001_init.sql`, re-created with a pinned `search_path` in
  `0002_security_hardening.sql`) is also one. Deletion is definer deliberately:
  `auth.users` belongs to `supabase_auth_admin`, and the only alternative is the service-role key,
  which I-4 forbids from reaching the client without exception. What contains it is structural — **it
  takes no arguments**, so there is no id to forge and the only account it can ever delete is the one
  the JWT names. `search_path` is pinned, and `PUBLIC`/`anon` cannot execute it.

  **Amended 2026-08-08 by `supabase/migrations/0007_deletable_account_with_custom_exercises.sql`.**
  The cascade above is necessary but was not sufficient: a lifter who created their own movement and
  logged a session with it could not delete their account at all. `profiles` cascades to both
  `exercises` and `workouts`, Postgres leaves the order of those branches undefined, and `on delete
  restrict` is checked immediately — so when the exercise branch ran first, `workout_exercises` still
  referenced the movement and `delete_my_account()` aborted. `0007` moves both exercise foreign keys
  to `on delete no action deferrable initially deferred`: identical rule, enforced at commit rather
  than at statement time, so an in-use movement still cannot be deleted on its own while a whole
  account can. **`cascade` would satisfy I-10 and violate the reason `restrict` is there** — deleting
  a movement would silently delete the sets performed with it. Verified by
  `supabase/tests/rls/07_run_exercise_reference_tests.sql` (8 assertions, 154/154 suite-wide).

  **Applied to staging `[fact, owner, 2026-08-09]`.** `0001`–`0007` are on the staging project, so
  I-10 is met there in schema as well as in the repository. The line this replaces said "applied to no
  hosted project yet", which was already false when written — an invariant's status against a live
  project is the owner's report, never something the repository can observe. **Production has had no
  such treatment**, and I-10 is not met there until it does; `Docs/tester-readiness-runbook.md` §2 is a
  read-only probe that answers this for any project rather than asserting it.

  *Export.* `src/domain/accountExport.ts` assembles a versioned, deterministically sorted document
  covering the user-facing account/training tables plus the lifter's own custom exercises;
  `Repository.exportAccountData()` gathers it so a user-data table added later cannot fall out because
  a caller forgot it. S4's internal, non-client-selectable webhook idempotency ledger is deliberately
  excluded and disclosed as such in the privacy policy; it is erased on account deletion. Delivery is React
  Native's own `Share` — deliberately no new dependency, since `expo-file-system`/`expo-sharing` are
  behind `CLAUDE.md`'s approval gate.

  Evidence: `supabase/tests/rls/05_run_account_deletion_tests.sql`, **21 assertions** against a clean
  local Postgres 16.14 (132 across the four SQL suites), of which six assert the *shape* of the
  function rather than its behaviour — no arguments, definer, pinned `search_path`, and who may
  execute — because a behaviour-only suite would still pass if a later migration relaxed the
  containment. Plus 13 unit tests on the export builder and four on the deletion teardown, including
  the one that matters most: **a failed remote delete must not tear the device down**, or a lifter is
  returned to a sign-in screen believing their data is gone while all of it remains.

  **Extended by S4 on 2026-08-09.** Export format version 3 includes the current entitlement record,
  and profile deletion cascades through both `entitlements` and `revenuecat_event_targets`. Migration
  `0009` and its 17 local Postgres assertions verify those rows are removed with the account. The
  authenticated `delete-account` Edge Function closes the new processor-side gap: it derives the UUID
  from the platform-verified JWT, deletes the RevenueCat customer first, and only then invokes the
  no-argument database RPC under that JWT. RevenueCat failure stops before database deletion. Hosted
  production deployment/configuration through `0009` and both functions remains mandatory before
  either promise is true in release.

  **Not yet met for production release** `[fact]`. The invariant says deletion and export must "exist
  and **work**". The owner reports both driven through the UI against staging, whose schema includes
  `0001`–`0007`; production remains unverified and S4 adds new cascade/export scope in `0009` that is
  local-only. `Docs/privacy-policy-draft.md` now exists, but still has owner/legal placeholders and is
  not a published policy URL. Store submission remains blocked until the production path, final policy
  and public URL are verified.
- **Exception process:** None — this is a blocking requirement for store submission, not a negotiable scope item.

---

## Readiness-suggestion safety

### I-11. A readiness suggestion cannot change a workout without explicit user confirmation
- **Rule:** No readiness-derived suggestion may alter a logged or planned workout's load, reps, or effort target unless the user explicitly accepts or edits it.
- **Why:** Mandatory advisory-only boundary from the approved product direction ([ADR-0002](decisions/ADR-0002-readiness-suggestion-safety.md)).
- **Enforcement evidence or expected validation:** Already aligned in the existing code, per a read-only reconciliation review (2026-07-27): `app/workout/active.tsx`'s `onApplySuggestion` only fires from an explicit user tap on "Apply to all sets"; nothing writes a suggested weight without it. This behavior must be preserved as the existing engine is adapted — see the phased rollout in [ADR-0002](decisions/ADR-0002-readiness-suggestion-safety.md).
- **Exception process:** None.

### I-12. Rule versioning and persisted suggestion audit records are future production requirements, not currently implemented facts
- **Rule:** If a suggestion is stored, the stored record must include the evaluated inputs, the rule and its version, the explanation shown to the user, the output, and what the user did with it. Neither rule versioning nor any such persistence exists today, and neither may be described as implemented until it is.
- **Why:** Traceability, testability, and the ability to audit or roll back a rule change — required by [ADR-0002](decisions/ADR-0002-readiness-suggestion-safety.md). Sequenced deliberately late (ADR-0002 Phase C) so audit records are never written into an unauthenticated or unverified data path.
- **Enforcement evidence or expected validation:** Confirmed not yet implemented by a read-only reconciliation review (2026-07-27): no version identifier exists for either the readiness weights or the load-recommendation thresholds, and no suggestion is persisted anywhere in `src/data/repository.ts` or `supabase/migrations/0001_init.sql`. Expected validation: this work does not begin until authenticated user-scoped persistence, migrations, and RLS are ready (I-1, I-6), and a schema/migration review confirms all five fields are captured before the feature ships to real users.
- **Exception process:** None without an ADR update.

---

## Product originality and reference research

### I-13. No copied external UI, branding, wording, assets, or screenshots
- **Rule:** PRism's repository never contains another product's brand, product name, icon, assets, screenshots, source code, exact screen layout/navigation sequence, visual hierarchy, typography, color system, spacing, iconography, animation, microcopy, exercise descriptions, or paywall copy.
- **Why:** Legal/IP risk and product integrity; formalized in [ADR-0003](decisions/ADR-0003-reference-research-policy.md).
- **Enforcement evidence or expected validation:** `README.md`'s existing "Originality" section states this as current practice (not independently audited by `Docs/architecture.md`). Expected ongoing validation: no third-party asset files ever appear in `git status`/diffs; research notes follow the `Docs/research/README.md` protocol.
- **Exception process:** Any uncertainty is escalated to the engineer/owner before implementation, per `Docs/agents.md` stop conditions — never resolved by proceeding and hoping it's fine.

---

## Git/change control

### I-14. Every substantive change occurs on a non-main branch with a clear, single purpose
- **Rule:** Documentation, code, schema, and configuration changes happen on a dedicated branch named for their sprint/purpose, not directly on `main`; each branch corresponds to one sprint's scope.
- **Why:** Keeps `main` reviewable and revertible, and keeps each unit of work traceable to one documented intent (this sprint's own workflow is an example).
- **Enforcement evidence or expected validation:** `git log` shows a merge-PR pattern into `main` (e.g., `4785bc9 Merge pull request #1 ...`). This sprint itself follows the rule (branch `docs/product-intent-and-guardrails`).

  **Further instances 2026-08-06:** `feature/v1-auth-and-session` (implementation, commit `0af00cd`) and
  `feature/v1-auth-session-docs` (this documentation pass) are separate branches with one purpose each,
  and the implementation branch was cut from `feature/v1-production-posture` rather than `main` so it
  would inherit the demo-fallback throw. Splitting code from docs also keeps the docs able to cite a
  real commit hash rather than an uncommitted working tree. Note `[fact]`: as of this writing neither
  `5c18d93` nor `0af00cd` has been merged to `main`, so the auth and production-posture claims
  throughout `Docs/` describe branches, not `main`.
- **Exception process:** Requires explicit engineer/owner approval to commit directly to `main`; not to be done by default under any circumstance.

---

## Validation and documentation

### I-15. Documentation must distinguish fact, approved decision, assumption, and open question
- **Rule:** Any PRism document states clearly which of its claims are verified facts (with evidence), which are approved decisions (with an owner and date), which are assumptions, and which are open questions — and does not blend these categories without a label.
- **Why:** `Docs/architecture.md` set this precedent explicitly (verified/inferred/unknown labeling) precisely because blended claims are how false certainty enters a project's documentation and later its code.
- **Enforcement evidence or expected validation:** This document and the ADRs created in this sprint follow that convention (e.g., explicit "Open questions" sections, explicit citations to `Docs/architecture.md` for any implementation-status claim).
- **Exception process:** None — this applies to every PRism document going forward, including future revisions of this one.

---

## Readiness-suggestion safety (continued)

Continued from I-11/I-12 above; grouped separately here only to keep invariant IDs in ascending document order. See also `Docs/decisions/ADR-0002-readiness-suggestion-safety.md`.

### I-16. RPE is the sole perceived-effort field in readiness v1
- **Rule:** Only user-entered RPE feeds v1 readiness/load-suggestion rules. RIR data capture, storage, UI, and rule use are out of scope until a separate, explicitly approved future sprint.
- **Why:** Engineer/owner decision (2026-07-27) to keep v1 input scope bounded; a read-only reconciliation review found RPE already genuinely user-entered (`src/components/workout/RpeSelector.tsx`) with no RIR field anywhere in the schema or code.
- **Enforcement evidence or expected validation:** Confirmed by repo-wide search (2026-07-27): zero references to RIR in `src/` or `app/`. This invariant blocks adding an RIR field/UI/rule input without a new ADR or sprint approval.
- **Exception process:** Requires a new ADR or explicit sprint approval naming RIR in scope — not an incidental addition during other readiness work.

### I-17. Recommendation dismissal must be an explicit, user-visible, and — once implemented — auditable action
- **Rule:** A user must be able to explicitly dismiss a readiness/load suggestion (preferred v1 language: "Not now"), distinct from silently ignoring it. Once suggestion-interaction telemetry or audit persistence exists (I-12), a dismissal must be captured as a disposition value like any other user action.
- **Why:** ADR-0002's four required user choices (accept/edit/dismiss/ignore) require dismissal to be a real, discoverable control, not merely a state a user can reach by taking no action.
- **Enforcement evidence or expected validation:** Not yet implemented — a read-only reconciliation review (2026-07-27) found the existing UI (`src/components/workout/ExerciseBlock.tsx`) offers "Apply" but no explicit dismiss control. Expected validation: a visible "Not now" affordance shipped as part of ADR-0002 Phase B, with a test asserting it does not write to the workout.
- **Exception process:** None without an ADR update.

### I-18. Lack of sufficient input or history must not be represented as a confident readiness recommendation
- **Rule:** When meaningful readiness input (check-in data) or workout history is missing, PRism must surface an explicit "not enough data" or low-confidence state rather than silently substituting a neutral default into a composite score presented as a normal result.
- **Why:** A confident-looking number built on absent data misleads the user and violates the explainability/honesty intent of [ADR-0002](decisions/ADR-0002-readiness-suggestion-safety.md).
- **Enforcement evidence or expected validation:** **Met as of 2026-07-29** (sprint `readiness-inputs-and-confidence-foundation`), replacing the "not met" finding of the 2026-07-27 reconciliation review. The three branches in `src/domain/calc/readiness.ts` that substituted a neutral 0.7 — `workloadFactor`'s `chronicWeekly < 1`, and `wellbeingFactor`'s missing-check-in and stale-check-in cases — now report `sufficient: false` and are excluded from the composite instead of scored. `computeReadiness` re-normalises weights across the factors that do have data, and returns `score: null`, `band: null`, `confidence: 'insufficient'` when both the workload and wellbeing signals are missing; `ReadinessCard` renders that state without a numeric ring. Partial check-ins are scored only from the fields actually answered, never from a stand-in for the rest. Deterministic evidence: 11 tests added to `src/domain/calc/__tests__/calc.test.ts` covering the workload history threshold, the 36-hour staleness boundary, single-factor exclusion with re-normalisation, the both-missing no-score result, and four partial-check-in cases — plus two equivalence tests proving the data-present calculation is unchanged (`READINESS_WEIGHTS` is untouched). Full suite: 61 tests passing across 3 suites. **Scope note:** `recoveryFactor` and `consistencyFactor` still have no missing-data branch, so a lifter with no history is scored 1.0 on recovery (via `averageReadiness`'s empty-input return) and 0 on consistency. Both are acknowledged residual gaps, deliberately out of this sprint's scope, and neither is claimed as met by this invariant.
- **Exception process:** None without an ADR update.

---

## Session and device hygiene

### I-19. Sign-out leaves no prior user's training data or drafts on the device

- **Rule:** Ending a session must clear the in-memory read model, the in-progress workout draft, and any
  cached repository handle **before** the app navigates away from the authenticated surfaces. A
  recovered draft must never be resumed under an account other than the one that created it.
- **Why:** RLS governs what the *server* returns; it says nothing about what is already in device memory
  or `AsyncStorage`. On a shared phone the concrete failure is one lifter's sessions painting on Today
  before the next lifter's own load resolves — or worse, their unfinished draft being finished and saved
  under the new account, because `saveWorkout` correctly stamps `profile_id` from the current session and
  knows nothing about where the draft came from. That is a data-integrity failure no policy change could
  catch, and it sits underneath I-6 rather than beside it: own-data-only has to mean the device too.
- **Enforcement evidence or expected validation:** **Met as of 2026-08-06** (sprint
  `v1-auth-and-session`). `signOutAndTearDown` (`src/store/authActions.ts`) runs a fixed sequence:
  remote sign-out (wrapped, so an offline or already-revoked failure cannot abort local teardown), then
  `activeWorkoutStore.discard()` plus an explicit `AsyncStorage.removeItem` of
  `prism.activeWorkout.draft.v1`, then `trainingStore.reset()`, then `resetRepository()`, and **only
  then** the phase flip to `'unauthenticated'`. The phase is last *by construction*: the route gate in
  `app/_layout.tsx` redirects on phase, so navigation cannot precede an empty store, and reordering the
  sequence breaks the guarantee rather than merely contradicting a comment. `trainingStore.reset()`
  restores a named `INITIAL_DATA` constant shared with the store's initialiser, so a field added to the
  store is cleared on sign-out for free rather than silently surviving it — including
  `favouriteExerciseIds`, which is never persisted and would otherwise have carried one lifter's
  preferences into the next one's session unnoticed. `hydrate()` takes a `DraftOwner` and discards any
  draft whose `profileId` does not match the signed-in user, which also covers a device moving from demo
  to a real session, where the stored id is the `DEMO_PROFILE_ID` literal.

  **Extended by S4 on 2026-08-09.** The fixed teardown now calls
  `entitlementStore.reset()` after `trainingStore.reset()` and before `resetRepository()` and the final
  unauthenticated phase. It clears the previous account's entitlement phase, localized price and
  purchase outcome without calling RevenueCat `logOut`; a later account is identified with custom-ID
  `logIn`, avoiding creation of an anonymous RevenueCat identity. The auth teardown test observes the
  entitlement store as cleared before the phase flip.

  Two deliberate exceptions, both tested: `prism.onboarding.v1` **survives** a sign-out (first-run state
  belongs to the device, not the account — clearing it would replay the carousel for a returning
  lifter), and the `prism.demo.*` keys are untouched (unreachable from a build that has a session to
  end). Evidence: 16 assertions in `src/store/__tests__/authActions.test.ts`, including one that
  observes the store's contents at the exact moment the phase flips, and one that drives a failing
  remote sign-out to prove teardown still completes.

  Two limits, stated so they are not overread. `resetRepository()` is **defence in depth, not the fix**:
  `SupabaseRepository` is stateless and re-derives identity on every call, so resetting it changes
  nothing observable today — the data that actually survives is `trainingStore`'s arrays, and clearing
  those is the remedy. And the `DraftOwner` comparison is **not an authorization check**: it discards
  local state and grants nothing. The security boundary remains RLS plus the session-derived
  `profile_id` stamped on write. This is why `activeWorkoutStore.start()`'s standing warning — that
  `profileId` must not be read back as a permission or used to gate UI — is unchanged and still correct:
  the value can throw a draft away, and can never let one through.

  **Now enforceable by the user, as of 2026-08-08** (sprint `v1-signout-surface`), replacing this
  entry's previous "implemented and tested but reachable only in code" caveat. Today's header carries an
  Account control that opens `app/account.tsx`, whose "Sign out" row calls `signOutAndTearDown`. Three
  properties matter to this invariant specifically:

  - **It appears exactly where an account exists.** `canOfferSignOut({ authEnabled, sessionPhase })` is
    true only for an authenticated session in a build with credentials, so demo and misconfigured builds
    render nothing — the teardown contract cannot be invoked where there is no session to end.
  - **It warns before destroying logged work.** `shouldConfirmSignOut` returns true when the in-progress
    draft has any completed set, warm-ups included, and the sheet then names the count and the session
    before proceeding. Teardown itself is deliberately indiscriminate — leaving one lifter's unfinished
    session on a shared device is worse than losing it — so the warning belongs in front of it, not
    inside it. This is UX decision D6's rule ("confirm only when logged work would be lost"), unchanged.
  - **It cannot survive its own action.** After teardown the draft key is absent, `trainingStore` is
    empty, `userId` and `email` are null, and `canOfferSignOut` returns false. Asserted directly in
    `src/store/__tests__/authActions.test.ts`.

  **Still unverified by rendering.** No component-test tooling exists, so the control, the modal and the
  confirmation `Alert` are covered only through the pure predicates behind them, and no cold-start
  on-device run has been performed.
- **Exception process:** None. Any new store or persisted key holding user-scoped data must be added to
  the teardown sequence in the same change that introduces it — not in a follow-up.
