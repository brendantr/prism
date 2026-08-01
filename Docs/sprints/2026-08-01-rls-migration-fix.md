# Sprint: rls-migration-fix

- **Status:** Complete. `Docs/invariants.md` I-1 is now met for the policies as committed.
- **Date:** 2026-08-01
- **Branch:** `rls-migration-fix` (new branch off `main`, after merging `rls-policy-verification`)
- **Type:** Database migration fix. One-line SQL change, engineer/owner-approved before editing.
- **Predecessor:** [`2026-07-31-rls-policy-verification`](2026-07-31-rls-policy-verification.md), which
  found and precisely diagnosed the defect but deliberately did not apply any fix, per `CLAUDE.md`'s
  database-change approval gate.
- **Part of:** [`2026-07-31-closure-inventory.md`](../readiness/2026-07-31-closure-inventory.md) item A1
  (highest-priority hard gate).

## Approval

Explicit engineer/owner approval was obtained before this sprint edited
`supabase/migrations/0001_init.sql`, per `CLAUDE.md`'s database-migration gate. The predecessor sprint's
own record names the exact fix and evidence this approval was based on.

## Goal

Apply the one-line fix the predecessor sprint tested against scratch copies in two independent
environments, and re-run the RLS isolation suite against the actual, corrected, committed migration
files — closing the gap between "the policies as written are correct" and "the schema that would need
them can actually be created."

## What changed

`supabase/migrations/0001_init.sql`, the `check_ins_one_per_day` index:

```diff
-create unique index check_ins_one_per_day
-  on check_ins (profile_id, (checked_in_at::date));
+-- checked_in_at::date depends on the session TimeZone setting, so Postgres
+-- classifies it STABLE, not IMMUTABLE, and rejects it in an index expression.
+-- timezone('utc', checked_in_at)::date is IMMUTABLE (confirmed via
+-- pg_proc.provolatile) and fixed to UTC rather than session-dependent.
+create unique index check_ins_one_per_day
+  on check_ins (profile_id, (timezone('utc', checked_in_at)::date));
```

No other line in `0001_init.sql` changed. `0002_security_hardening.sql` is untouched.

**Behavioral note, stated for anyone relying on the old expression's semantics:** the "one check-in per
day" boundary now falls at UTC midnight rather than at midnight in the Postgres session's local
timezone. Since no check-in UI or backend code reads or depends on the previous (broken, never-live)
behavior — this index has never successfully existed in any deployed database — there is no migration
of existing data to reason about.

## Validation

All performed against a disposable local Postgres 16 instance (`initdb` into a scratch data directory,
Unix socket in `/tmp`, torn down at the end of this session — no persistent local state, no
repository-tracked artifact).

| Step | Result |
|---|---|
| `supabase/tests/rls/run.sh` against the corrected `0001_init.sql` + unmodified `0002_security_hardening.sql` | **Migration applies cleanly end to end** — no error, no abort. All 11 product tables created (`personal_records` included — previously never created). |
| `pg_class.relrowsecurity` | `true` on every one of the 11 tables |
| `pg_policies` row count | 20 |
| `supabase/tests/rls/02_run_isolation_tests.sql` | **57 / 57 assertions passed** |
| Re-run from a clean, freshly-created database (drop + recreate) | **57 / 57 passed again** — reproducible, not a one-off |
| SB-3 check 1 — `display_name` bounding | A profile created via `handle_new_user()` with a 10,000-character `display_name` in `raw_user_meta_data` is stored truncated to exactly 60 characters |
| SB-3 check 2 — cross-tenant exercise FK block | User B inserting a `workout_exercises` row referencing user A's private exercise fails with `42501` (`assert_exercise_visible`), not a silent success |
| SB-3 check 3 — owner can still delete | User A deletes that same exercise afterward with no lingering block (`DELETE 1`, row gone) |
| SB-3 check 4 — normal logging unaffected | Ordinary same-user `workout_exercises`/`sets` inserts (both via the RLS suite's own seeding and a direct follow-up query) continue to succeed under `0002`'s new trigger |
| `npm run typecheck` | Pass, exit 0 (no application code touched) |
| `npm test -- --ci` | Pass — 103/103, 9 suites (no application code touched) |

This closes the four SB-3 behavioral checks that `2026-07-30-security-backend-foundation.md` named but
could not run (no database was reachable in that sprint), in addition to closing I-1.

## What this does not change

- **Authentication still does not exist** (`Docs/architecture.md` G-1). Fixing the migration does not
  make production/Supabase mode reachable by any real user — that requires an auth UI, out of scope here.
- **This migration was not applied to the live `prism-rls-verification` Supabase project** or to any
  production project. The fix is validated locally, against the same migration files that project would
  receive; applying it to that project (or a real production project) is a separate, explicit action.
- **`Docs/architecture.md` G-2** (non-atomic multi-record workout writes) is untouched — a different,
  already-tracked gap.

## Changed files

- `supabase/migrations/0001_init.sql` — one-line index-expression fix, as shown above.
- `Docs/invariants.md` — I-1 updated from "not yet met" to "met," with the new evidence.
- `Docs/sprints/2026-08-01-rls-migration-fix.md` — this record.

## Commands run

| Command | Result |
|---|---|
| `initdb` / `pg_ctl start` (Postgres 16, disposable, scratch-only) | Started clean |
| `PGHOST=… PGPORT=… PGUSER=postgres PGDATABASE=prism_rls_test bash supabase/tests/rls/run.sh` | Pass, 57/57, twice from clean state |
| Direct `psql` checks for the four SB-3 behaviors | All four confirmed, evidence above |
| `pg_ctl stop` / scratch directory removed | Clean teardown, no leftover local state |
| `npm run typecheck` | Pass |
| `npm test -- --ci` | Pass, 103/103, 9 suites |
| `git status --short` | Clean after commit |

## Unresolved risks

- The live `prism-rls-verification` Supabase project (disposition still open, closure-inventory item F2)
  has not been re-tested against this corrected migration — it was only tested against the
  scratch-patched copy in the predecessor sprint. Re-running it there is optional follow-up, not required
  to close I-1 for the committed file.
- Applying this migration to any real, production Supabase project remains a separate, explicit,
  future action — not performed or implied by this sprint.

## The exact next decision needed

None required to close this sprint. The next relevant decision is when/whether to scope an
authentication-implementation sprint, which is what would make this corrected schema reachable by a
real user for the first time — tracked as `Docs/architecture.md` G-1, not part of this closure pass.
