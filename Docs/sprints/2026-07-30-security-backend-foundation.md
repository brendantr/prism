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

**Status:** ☐ Not started

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

---

### SB-2 — Server-derived ownership on every write path

**Status:** ☐ Not started

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

---

### SB-3 — Migration 0002: bound `display_name`, close the exercise FK path

**Status:** ☐ Not started

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

---

### SB-4 — `SECURITY DEFINER` review and `search_path` safety

**Status:** ☐ Not started

A `SECURITY DEFINER` function runs with its creator's privileges. If its `search_path` is not pinned,
a caller can create a same-named table or operator in a schema earlier on the path and have the
privileged function execute *their* code instead. This is the classic Postgres privilege-escalation
shape.

**Success outcome:**

1. Every `SECURITY DEFINER` routine in the repository is enumerated in this document — no sampling.
2. Each is confirmed to pin `search_path`, and the pinned value is justified.
3. Any weakness found is fixed in `0002` (not `0001`), or explicitly recorded as accepted with reasons.

**Out of scope:** functions that do not yet exist; runtime privilege testing (needs a live database).

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
