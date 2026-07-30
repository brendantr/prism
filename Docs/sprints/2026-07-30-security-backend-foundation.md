# Sprint: security-backend-foundation

- **Status:** In progress. Success outcomes below were written before any code changed.
- **Date:** 2026-07-30
- **Branch:** `security-backend-foundation` (new branch off `main`; no UI branch reused)
- **Type:** Backend security hardening. Client write paths + one **authored, unapplied** migration.
- **Predecessor:** [`2026-07-29-security-foundation`](2026-07-29-security-foundation.md) (merged, PR #9)
- **Input:** Security audit, 2026-07-29 — the findings that sprint deliberately deferred.

## Why a new branch

`security-foundation` merged via PR #9. Per `CLAUDE.md`'s "one branch, one sprint, one clear purpose"
and the naming rule in `Docs/agents.md`, backend work opens its own branch rather than reopening a
closed one.

## Goal, in plain terms

Right now PRism keeps everything on the phone. Soon it will keep things on a server that many
people share. The danger with a shared server is simple: **the phone should not be the one that
says who you are.** If the phone gets to say "this workout belongs to user 42", then someone who
tampers with the phone can say "this workout belongs to user 7" and read or wreck a stranger's data.

So this sprint does four things:

1. **Check the lockbox actually works** — last sprint moved the login token into the phone's secure
   lockbox (Keychain). Nothing had ever opened that lockbox with the real library. Now it does.
2. **Stop the phone claiming who it is.** Every save now takes the owner's identity from the signed-in
   session on the server side of the call, never from a value the phone supplied.
3. **Fix two holes in the database rules** — one lets someone store a name of unlimited length, one
   lets someone quietly point at another person's private exercise and jam it so they can't delete it.
4. **Double-check the one database function that runs with extra privileges**, so it cannot be tricked
   into running the wrong code.

The technically precise version: establish server-derived ownership, bound untrusted input at the
schema boundary, close a foreign-key path that bypasses row-level security, and pin `search_path` on
every `SECURITY DEFINER` routine — before real auth and real writes are enabled. Related invariants:
`I-1` (RLS before real data), `I-4` (no privileged credentials on the client), `I-6` (own-data-only).

## The constraint that shapes this sprint

**There is no database to run anything against.** `.env` holds placeholders only, no Supabase project
is linked, and `supabase start` needs Docker, which is not installed on this machine (`docker` not
found). The Supabase CLI is present but cannot start a local Postgres without it.

Consequences, stated up front so no result below is read as more than it is:

- SQL in this sprint is **authored and reviewed, never executed**. It is not applied to any project.
- Applying it is the engineer/owner's action, and `CLAUDE.md` gates migrations behind their approval.
- RLS *enforcement* therefore stays unverified (`I-1`), exactly as `Docs/architecture.md` already
  records. This sprint improves the policy text; it does not prove the policies work.

## Tasks

### SB-1 — Verify the secure session flow against real supabase-js behaviour

**Status:** ☑ **Done** — `src/data/supabase/__tests__/sessionFlow.test.ts`, 5 tests

The predecessor sprint shipped a Keychain-backed storage adapter but could never exercise it: nothing
calls it until a session exists, and auth is unimplemented. It closed as "test-verified and
load-verified, not session-verified".

**Success outcome:**

1. A real `@supabase/supabase-js` client, constructed with `secureSessionStorage` as its auth storage,
   **reads back a session that the adapter wrote** — proving the two agree on the storage contract,
   not merely that the adapter round-trips strings.
2. The session used is realistically shaped (`access_token`, `refresh_token`, `expires_at`,
   `token_type`, `user`) and large enough to span multiple SecureStore chunks.
3. A local sign-out leaves **nothing** behind — no chunk, no commit marker.
4. A corrupted store presents as *signed out* to supabase-js, not as a broken or partial session.

**What will be tested:** the above, as a jest integration test against the real library with no
network.

**Out of scope:** implementing sign-in/sign-up; any network round trip; a live Supabase project.
End-to-end auth stays unverified after this task and is not claimed.

**Outcome — met, 4/4.** A real `createClient` instance, given `secureSessionStorage`, reads back a
session the adapter wrote; the session spans multiple Keychain items (asserted via the commit
marker's chunk count, with the mock throwing above 2048 bytes so a regression cannot pass); sign-out
purges every item; a torn write and an absent session both present as *signed out*.

Verified against the real storage contract read from `auth-js` source rather than assumed:
`setItemAsync` writes `JSON.stringify(session)` through `storage.setItem`, and `getItemAsync`
fail-closes to `null` on unparseable JSON — which is the same posture the adapter already took.

**Two findings from doing this properly, both worth keeping:**

1. **`signOut({ scope: 'local' })` still makes a network call** in auth-js 2.110. The first version of
   the sign-out test asserted `error` was `null` and failed. The failure was isolated by re-running
   the identical flow against a trivial in-memory storage, where it **also** failed — proving the
   adapter was not the cause before anything was changed.
2. **An offline sign-out still purges the token locally.** Read from source
   (`GoTrueClient._signOut`, ~line 4013): on a non-401/403/404 error the failure path calls
   `removeCurrentSession()` *and then* returns the error. So a lifter signing out on gym wifi with no
   signal does not leave a live refresh token in the Keychain. The test now asserts that property and
   deliberately does **not** assert `error === null`, because whether the server was reachable is not
   the security question.

---

### SB-2 — Server-derived ownership on every write path

**Status:** ☑ **Done** — `repository.ts`, `mappers.ts`, + `src/data/__tests__/ownership.test.ts` (5 tests)

**Audit finding:** LOW (defence-in-depth) — `repository.ts:317,355` and `mappers.ts:133` send
`profile_id` taken from client state. Postgres currently rejects a forged value because every affected
table carries `with check (profile_id = auth.uid())`, so this is **not** an exploitable hole today.

**Why fix it anyway:** tenant isolation rests on a single control. Any future policy edit that drops a
`WITH CHECK`, or any new table added without one, converts this into immediate mass-assignment. The
repository already knows the right value — `this.uid()` is used correctly in all six read paths and
in none of the writes. That asymmetry is the defect.

**Success outcome:**

1. No Supabase write sends a `profile_id` originating from client state. Ownership comes from
   `this.uid()` — the signed-in session — on every insert/upsert.
2. `deleteWorkout` is scoped by owner as well as id.
3. `fromWorkout` no longer emits `profile_id` at all, so the mapper cannot reintroduce it silently.
4. Tests assert that a caller passing someone else's `profileId` still results in a payload carrying
   the **session** uid.
5. `npm run typecheck` and `npm test` pass; demo-mode behaviour is unchanged.

**What will be tested:** the write payloads, via a mocked Supabase client, including the hostile case
in (4).

**Out of scope:** RLS policy text (unchanged this task); multi-record write atomicity — `I-2`/`G-2`
stays open and is **not** fixed here; demo repository ownership (single-user, no tenancy).

**Outcome — met, 5/5.**

| # | Outcome | Evidence |
| --- | --- | --- |
| 1 | Ownership from the session on every write | `saveWorkout`, `saveCheckIn`, `savePersonalRecords` each `await this.uid()` and stamp that. `grep "profile_id:" src/data/` returns three hits, all `profileId` (the session value) |
| 2 | `deleteWorkout` scoped by owner | `.eq('id', id).eq('profile_id', profileId)` |
| 3 | `fromWorkout` no longer emits `profile_id` | Removed from the mapper, with a comment saying why |
| 4 | Hostile case covered | A caller passing a foreign `profileId` still produces a payload carrying the session uid — asserted per path, plus a sweep over everything sent |
| 5 | Validation green | `typecheck` pass · `npm test` **98/98, 8 suites** · `expo export --platform ios` pass |

**The tests were checked for teeth, not just for green.** Client-supplied ownership was temporarily
reintroduced on the check-in path; 2 of the 5 tests failed, including the catch-all sweep, and the
change was then reverted. A test that cannot fail is not evidence.

The batch case is asserted per row rather than on the first, because stamping only `records[0]`
correctly is a plausible way to reintroduce this and would otherwise pass.

**What this does and does not change.** It changes nothing about what Postgres will accept — a forged
`profile_id` was already rejected by `with check (profile_id = auth.uid())`. What it changes is how
many independent things must fail before a cross-tenant write is possible: previously one (the
policy), now two (the policy *and* the repository). The client no longer expresses identity at all,
so there is nothing to forge.

---

### SB-3 — Migration 0002: bound `display_name`, close the exercise FK path

**Status:** ☑ **Written — ⚠ NOT APPLIED.** `supabase/migrations/0002_security_hardening.sql`.
Applying it needs engineer/owner approval and a database; neither exists here.

Two audit findings that live in SQL:

- **MEDIUM — unbounded attacker-controlled `display_name`.** `handle_new_user()`
  (`0001_init.sql:252-260`) copies `raw_user_meta_data ->> 'display_name'` straight into
  `profiles.display_name`, which is `text` with no length limit. `raw_user_meta_data` is whatever the
  caller passed to `signUp()`, so a single signup can write a multi-megabyte name.
- **LOW — foreign-key checks bypass RLS.** Postgres runs referential-integrity checks as the table
  owner and they **ignore** row-level security. So a user can insert a `workout_exercises` row whose
  `exercise_id` points at another user's private exercise. They cannot read it, but
  `on delete restrict` (`0001_init.sql:148`) then means the owner can never delete it — a permanent,
  unattributable cross-tenant denial of service on that row.

**Success outcome:**

1. A new `supabase/migrations/0002_security_hardening.sql` exists that: bounds `display_name`, makes
   `handle_new_user()` trim/cap/fall back rather than trusting its input, and rejects a
   `workout_exercises` / `routine_exercises` row referencing an exercise the caller cannot see.
2. `0001_init.sql` is **not edited** — an applied migration is never rewritten.
3. The migration is written to be safe to run against an existing database.
4. Every identifier it references is cross-checked against `0001_init.sql` (see Validation).
5. The document states plainly that it is **unapplied and unexecuted**, and names the approval needed.

**What will be tested:** identifier cross-check only. **The SQL is not executed** — see "The
constraint that shapes this sprint".

**Out of scope:** applying the migration anywhere; the `check_ins` NOT NULL / partial-check-in
mismatch (a separate product decision, `I-7`); any RLS policy rewrite beyond the trigger above.

**Outcome — met, 5/5, with the execution limit stated.**

| # | Outcome | Evidence |
| --- | --- | --- |
| 1 | `0002` exists and does all three things | `display_name` bound + normalised; `assert_exercise_visible()` with triggers on three tables; `handle_new_user()` replaced |
| 2 | `0001` not edited | `git diff main -- supabase/migrations/0001_init.sql` is empty |
| 3 | Safe to re-run | Constraint added inside a `pg_constraint` guard; `create or replace function`; `drop trigger if exists` before each `create trigger` |
| 4 | Identifiers cross-checked | Script diffed every `public.<name>`, every column touched, and every trigger target against `0001`. **PASS** — all 5 tables and all 7 columns exist |
| 5 | Unapplied status stated | This heading, and the file's own header |

**Deviation, recorded rather than absorbed: the trigger covers three tables, not two.** The audit named
the two `on delete restrict` paths (`workout_exercises`, `routine_exercises`), because those are what
let a stranger's reference permanently block a delete. `personal_records.exercise_id` is
`on delete cascade`, so it cannot block anything — but it is the same cross-tenant reference through
the same RLS-exempt mechanism, and covering it was one extra `create trigger` against the function
already being written. Leaving a known-open path because its consequence was milder seemed the worse
call. Flagged here so the wider scope is a decision on the record, not a quiet expansion.

**Normalising existing rows before adding the constraint** is deliberate: adding a validated
constraint to a table that already violates it fails, and a failure there would leave the rest of the
migration unapplied. The two `update` statements run first for that reason.

**How it must be validated, since it could not be here.** The SQL has **never been executed**. Nothing
above is a claim that it runs. Before this is trusted:

```bash
supabase start                         # needs Docker, absent on this machine
supabase db reset                      # applies 0001 then 0002 from scratch
```

and then the behavioural checks that matter, which a syntax check cannot substitute for:

1. Sign up with a 10,000-character `display_name` → profile row created, name stored at 60 chars.
2. As user A, create a private exercise. As user B, insert a `workout_exercises` row pointing at it →
   must fail with `42501`, not succeed.
3. As user A, delete that exercise → must now succeed.
4. Existing app flows (log a workout, save a PR) still work — the new trigger fires on every
   `workout_exercises` insert, so a mistake here breaks normal logging, not just the attack.

---

### SB-4 — `SECURITY DEFINER` review and `search_path` safety

**Status:** ☑ **Done** — review below; the one tightening it produced ships in `0002`.

A `SECURITY DEFINER` function runs with its creator's privileges. If its `search_path` is not pinned,
a caller can create a same-named table or operator in a schema earlier on the path and have the
privileged function execute *their* code instead. This is the classic Postgres privilege-escalation
shape.

**Success outcome:**

1. Every `SECURITY DEFINER` routine in the repository is enumerated in this document — no sampling.
2. Each is confirmed to pin `search_path`, and the pinned value is justified.
3. Any weakness found is fixed in `0002` (not `0001`), or explicitly recorded as accepted with reasons.

**Out of scope:** functions that do not yet exist; runtime privilege testing (needs a live database).

**Outcome — met, 3/3.** The repository defines exactly **three** functions. This is the complete list,
from `grep -nE "create (or replace )?function" supabase/migrations/*.sql` — not a sample.

| Function | Privilege | `search_path` | Assessment |
| --- | --- | --- | --- |
| `set_updated_at()` (`0001:236`) | **INVOKER** (no `definer` keyword) | not set | **No escalation path.** It runs as the caller, so a caller who shadows something only shadows it for themselves. Body is `new.updated_at = now()`; `now()` resolves to `pg_catalog.now()` regardless. Left unchanged — pinning it would be noise, not hardening. |
| `handle_new_user()` (`0001:252`) | **DEFINER** | was `public`, now `''` | Tightened in `0002`. See the correction below. |
| `assert_exercise_visible()` (new, `0002`) | **INVOKER**, deliberately | `''` | Must see visibility as the caller does, so definer rights would defeat its purpose. Pinned anyway. |

**A correction to the audit, stated plainly because getting this wrong in either direction matters.**
The audit recommended changing `set search_path = public` to `pg_catalog, public` to prevent operator
and function shadowing. That recommendation was **cosmetic, not a fix**: PostgreSQL implicitly
searches `pg_catalog` *first* whenever it is not named explicitly in the path, so
`search_path = public` was already immune to that class of attack. `handle_new_user` was not
vulnerable as written.

What `0002` does instead is set `search_path = ''`, the current Supabase recommendation. It removes
any reliance on that implicit rule and is workable here only because every reference in the function
is already schema-qualified (`public.profiles`). This is a **tightening of an already-safe function**,
and is recorded as such rather than as closing a hole.

**The substantive fix in that function is the input handling**, not the path: `display_name` is now
trimmed, capped at 60, and defaulted — which is also what stops the new length constraint from
turning a long name into a failed signup.

---

## Explicitly out of scope for the whole sprint

- **Implementing authentication.** This sprint prepares the ground; it does not add sign-in.
- **Applying any migration** to any project, local or hosted.
- **Verifying RLS enforcement.** Policy *text* improves here; proving policies behave requires a
  database. `I-1` stays unmet, as `Docs/architecture.md` already says.
- **Multi-record write atomicity** (`I-2`, `G-2`) — a real, known, unfixed gap. Not touched.
- **Any UI, product feature, or readiness work.**
- **Dependency upgrades**; the pre-existing `npm audit` backlog is not triaged here.

## Validation steps

Run after each meaningful change, results recorded in the progress log:

| Check | Command | Applies to |
| --- | --- | --- |
| Types | `npm run typecheck` | SB-1, SB-2 |
| Unit + integration tests | `npm test` | SB-1, SB-2 |
| iOS bundle still builds | `npx expo export --platform ios` | SB-2 |
| No client-supplied ownership remains | `grep` over the Supabase write paths | SB-2 |
| Migration identifier cross-check | every table/column/function named in `0002` exists in `0001` | SB-3 |
| Migration execution | **not possible here** — no Docker, no linked project | SB-3 |

## Progress log

Newest last.

- **2026-07-30** — Branch opened from `main` at `5be14b1`. Sprint document written with success
  outcomes fixed before any code change. Confirmed no database is reachable for validation: `docker`
  absent, no linked Supabase project, `.env` placeholders only.
- **2026-07-30** — SB-1 done. 5 integration tests wire the real Supabase client to the Keychain
  adapter. Suite 88 → 93, 6 → 7 suites; `typecheck` clean. Two findings recorded above: local-scope
  sign-out still hits the network, and an offline sign-out still purges the token.
- **2026-07-30** — SB-2 done. Three write paths and one delete now take ownership from the session;
  `fromWorkout` no longer carries `profile_id`. Suite 93 → 98, 7 → 8 suites; typecheck and iOS export
  clean. Tests verified to fail when the old behaviour is reintroduced.
- **2026-07-30** — SB-3 and SB-4 done. `0002_security_hardening.sql` written (**not applied**):
  `display_name` bounded and normalised, `assert_exercise_visible()` closing the RLS-exempt
  foreign-key path on three tables, `handle_new_user()` rebuilt with bounded input and
  `search_path = ''`. Identifier cross-check against `0001` passes; `0001` untouched. All three
  functions in the repository reviewed — one is SECURITY DEFINER and it was already safe against
  search_path shadowing, which the audit had overstated; corrected in the record.
