# Sprint: v1 local training day

## 1. Document status

- **Date:** 2026-08-06
- **Branch:** `feature/v1-local-training-day`, based on `main` after PR #54
  (`a72a2e5`). One branch, one purpose, per I-14.
- **Owner:** Engineer/owner.
- **Status:** Implemented and validated locally.
- **Labelling** per I-15: `[fact]` / `[decision]` / `[assumption]` /
  `[open question]`.
- **Approved before starting** `[decision]`: migration `0008`, client changes,
  SQL and unit coverage, I-7 evidence, and this sprint record.

---

## 2. Scope

Resolve the final check-in parity gap recorded by `Docs/invariants.md` I-7:
demo mode groups check-ins by the device's local calendar date while Postgres
groups them by UTC.

Deliver:

1. `check_ins.local_date date` and uniqueness on `(profile_id, local_date)`.
2. A required client-captured local date on every check-in submission.
3. Demo/Supabase parity, including existing partial-patch semantics.
4. A dedicated `06_...` SQL suite wired into `supabase/tests/rls/run.sh`.
5. Deterministic unit coverage for UTC-boundary, travel, and DST cases.
6. Updated I-7 evidence and full validation evidence here.

Out of scope: profile timezone settings, geolocation, background timezone
tracking, a change to readiness thresholds, and any account-deletion/auth change.

---

## 3. Decision: the training day is the local date where the check-in occurs

### 3.1 Arithmetic verified

`[fact]` At UTC offset `o`, local and UTC date labels agree for
`24 - abs(o)` hours of each local day.

- West of UTC, the mismatch is the final `abs(o)` hours before local midnight.
  At UTC-5, 00:00 through 18:59 has the same date label; 19:00 through 23:59
  is already the next UTC date. Monday 23:30 and Tuesday 00:30 are therefore
  both Tuesday in UTC and collapse under the old index.
- East of UTC, the mismatch is the first `o` hours after local midnight. At
  UTC+10, 00:00 through 09:59 is still the prior UTC date. A Monday morning
  and Monday evening therefore fall on different UTC dates and split under the
  old index.

Non-integral offsets follow the same formula in minutes.

### 3.2 Travel and DST

`[decision]` The date is captured at submission time from the device calendar.
Ordinary DST changes repeat or skip an hour, not a date, so uniqueness remains
well-defined. Travel or a political timezone change can skip a local date or
make one occur twice. A skipped date truthfully has no check-in. If a date
occurs twice, both submissions merge into the one training date; the existing
three-way field-patch semantics still preserve omitted answers and only replace
a field the lifter answers again.

### 3.3 Trust boundary

`[fact]` `local_date` is client supplied, so a defective or modified client can
mis-bucket its own check-in. That is a same-account data-integrity risk, not a
new authorization risk: `save_check_in` remains `security invoker`, ownership
still comes only from `auth.uid()`, and RLS still applies to every statement.
The client already supplies `checked_in_at` and all four subjective answers.

### 3.4 Timestamp semantics

`[decision]` `checked_in_at` stays and remains the ordering and recency key. It
records the latest submission instant and continues to drive readiness
staleness in elapsed hours. `local_date` is used only for training-day identity
and for selecting the check-in labelled "today".

### 3.5 Alternatives rejected

- **Profile IANA timezone:** stale during travel unless the profile is updated
  before the event; applying a later profile change historically is also wrong.
- **Per-check-in UTC offset:** sufficient to derive the date, but it stores an
  implementation input instead of the domain value and still trusts the
  client. The date is the only value current product behaviour needs.
- **Make demo use UTC:** mechanically simple, but makes "today" wrong for a
  visible portion of every non-UTC local day and contradicts the UI's local
  calendar language.

---

## 4. Read-path audit

- `src/domain/calc/readiness.ts` must continue selecting the latest check-in by
  `checked_in_at` and measuring age in elapsed hours. `local_date` must not
  replace either rule.
- `selectTodaysCheckIn` changes to local-date equality.
- `src/domain/history.ts` is workout-only; no change is required.
- Week/streak code is workout-only; no change is required.
- Account export includes `localDate`; its format version must change because
  the exported schema changes.
- Demo persistence needs a compatibility backfill for locally stored v1
  check-ins that predate the new field.

---

## 5. Implementation

### 5.1 Domain and client

`src/domain/trainingDay.ts` owns strict `YYYY-MM-DD` validation and offset
arithmetic. Production calls `deviceLocalDate` with the exact `Date` also used
for `checkedInAt`, so a submission cannot straddle midnight between two clock
reads. `CheckIn` and the Supabase mapper carry both values.

`DemoRepository` and `SupabaseRepository` normalize the same boundary. The
TypeScript contract requires `localDate`; a runtime caller from a legacy
in-process shape may omit it, in which case both derive it client-side from
`checkedInAt`. An impossible supplied date is rejected in demo mode just as a
Postgres `date` rejects it. Old locally persisted demo rows are backfilled on
hydrate rather than discarded.

`trainingStore` continues ordering by timestamp. It selects Today by
`localDate` and, when a fresh-id same-date submission is made, retains the
existing row id just as `save_check_in` does. This closes a small cache-parity
edge exposed by testing the new key.

Account export format moves from 1 to 2 because every exported check-in gains a
field a reader can observe.

### 5.2 Database

Migration `0008`:

1. Adds and backfills `check_ins.local_date date`, then makes it required.
2. Drops the UTC expression index and recreates `check_ins_one_per_day` on
   `(profile_id, local_date)`.
3. Replaces `save_check_in` to require/merge by `local_date`, preserving the
   partial-field rules from `0004`.
4. Keeps the function `security invoker`, its empty `search_path`, session-only
   ownership, and authenticated-only grant.

No applied migration was rewritten.

---

## 6. Validation evidence

Environment: Node **22.23.2** (matching `.nvmrc`), Postgres **16.14**.

| Command | Actual result |
|---|---|
| `npx tsc --noEmit` | Passed; exit 0, no output. |
| `npx jest --ci` | Passed on the final run: **52 suites / 828 tests**. This local checkout contains a user-owned `.claude/worktrees/...` copy that Jest also discovers, so this count includes the stale suite twice and emits a `prism` module-name collision warning. An earlier run failed 5 stale nested-worktree tests before the repository's legacy-caller normalization was added; the branch's own copies were green. |
| `npx jest --ci --testPathIgnorePatterns='/\\.claude/worktrees/'` | Passed: **423 tests / 27 suites**, with the existing credential-gated integration suite (**5 tests**) skipped. This is the branch-only count. |
| `PSQL_URI=... supabase/tests/rls/run.sh` on a clean disposable Postgres 16.14 cluster | Passed: **57/57** isolation, **31/31** workout integrity, **23/23** partial check-in, **20/20** local training-day, **21/21** deletion — **152/152 total**. |
| First sandboxed `initdb` attempt | Failed before database creation because sandboxed System V shared memory was denied. Re-run outside that restriction against a disposable `/tmp` cluster produced the passing result above; the cluster was stopped and removed. |
| `git diff --check` | Passed; no whitespace errors. |

The SQL boundary suite asserts literals rather than recomputing the client
formula. It also pins the column/index shape, invoker status and grants,
required/valid date input, direct uniqueness, latest timestamp retention, and
that a hostile payload `profile_id` is ignored in favour of `auth.uid()`.

---

## 7. Changed files

```
Docs/architecture.md
Docs/invariants.md
Docs/sprints/2026-08-06-v1-local-training-day.md
src/components/today/CheckInPrompt.tsx
src/data/__tests__/checkInMapper.test.ts
src/data/__tests__/ownership.test.ts
src/data/__tests__/repository.test.ts
src/data/demoSeed.ts
src/data/repository.ts
src/data/supabase/mappers.ts
src/domain/__tests__/accountExport.test.ts
src/domain/__tests__/trainingDay.test.ts
src/domain/accountExport.ts
src/domain/calc/__tests__/calc.test.ts
src/domain/trainingDay.ts
src/domain/types.ts
src/store/__tests__/authActions.test.ts
src/store/__tests__/trainingStore.test.ts
src/store/trainingStore.ts
supabase/migrations/0008_local_training_day.sql
supabase/tests/rls/01_seed_test_data.sql
supabase/tests/rls/02_run_isolation_tests.sql
supabase/tests/rls/04_run_check_in_tests.sql
supabase/tests/rls/05_run_account_deletion_tests.sql
supabase/tests/rls/08_run_local_training_day_tests.sql
supabase/tests/rls/run.sh
```

---

## 8. Known incompleteness

- **No live Supabase verification** `[fact]`. Migrations `0001`–`0008` are
  applied nowhere real. The SQL evidence is disposable local Postgres only.
- **Rollout order matters** `[fact]`. A new client against schema through
  `0004` still gets UTC grouping because the old function ignores the extra
  key. Migration `0008` against an old client rejects a missing `local_date`.
  The handoff states no production users/data exist, so both must land together
  before the first preview build rather than requiring a compatibility window.
- **Legacy demo backfill is best-effort** `[fact]`. A pre-field local record did
  not retain the timezone where it was created, so hydration derives its date
  using the device's current timezone rules for that instant. It preserves the
  row but cannot reconstruct information that was never stored.
- **Client trust remains bounded, not eliminated** `[fact]`. A modified client
  can choose a false date for its own data. It cannot choose an owner.
- **No cold-start on-device run** `[fact]`. No layout or rendering changed, and
  no rendering claim is made.

---

## 9. The exact next decision

**Who will apply migrations `0001`–`0008` to the real Supabase project, and
will that happen before the first preview build is distributed?** The local
implementation is complete; the fix does not exist in the real path until that
owner-only operation happens.
