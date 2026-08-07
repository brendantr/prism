# Sprint: v1 account deletion and export

## 1. Document status

- **Date:** 2026-08-06
- **Branch:** `feature/v1-account-deletion-export`, based on
  `feature/v1-checkin-partial-schema` (`ffac4ac`). `0005` follows `0004`, and both edit
  `supabase/tests/rls/run.sh`.
- **Owner:** Engineer/owner.
- **Labelling** per I-15: `[fact]` / `[decision]` / `[assumption]` / `[open question]`.
- **Approved before starting** `[decision]`: a database migration, per `CLAUDE.md` § Scope discipline.

---

## 2. Scope

`Docs/invariants.md` I-10 — a user-facing account deletion flow and a data export mechanism. Blocking
for store submission, exception process "None".

Taken now because the engineer/owner's direction — move off demo mode and collect real user data —
changes what this invariant costs. Three prior sprints each recorded it as open and each noted it
getting more exposed: accounts could be created, signed into, recovered, and filled with
health-adjacent data, and still not deleted or exported.

---

## 3. The decision that shaped everything: one `security definer` function

`0003` and `0004` both argue at length for `security invoker`, and that a definer function would become
the one hole in the RLS boundary. **This sprint adds a definer function.** That deserves the argument,
not a quiet exception `[decision]`.

Deleting an account means deleting a row in `auth.users`. That table belongs to `supabase_auth_admin`.
No RLS policy on PRism's own tables grants an `authenticated` caller the right to touch it, and the
only client-side alternative is the service-role key — which I-4 forbids from reaching the client, with
no exception process. So the privilege lives on the server in a function, or the feature does not exist.

**What contains it is structural, not procedural** `[fact]`:

1. **It takes no arguments.** There is no parameter to point at another lifter, no id to forge, no
   jsonb to smuggle a uid through. The only account it can delete is the one the JWT names. This is a
   design property rather than a check that could be edited out, and the suite asserts `pronargs = 0`
   directly so a future migration adding a parameter fails loudly.
2. `auth.uid()` is read inside the function, and a null one **raises** rather than falling through to
   `where id is null`. Relying on an accident of SQL semantics for a destructive statement in a
   privileged function is not a property worth depending on.
3. `set search_path = ''` with every object schema-qualified — the standard definer escalation, and the
   reason `0002` pinned `handle_new_user` the same way.
4. `revoke all from public`; only `authenticated` may execute.

**No table list.** `profiles.id references auth.users (id) on delete cascade`, and all six user tables
cascade from `profiles`. Deleting one row removes everything, with no list in the function that a
future migration could forget to update. The cascade is the mechanism precisely so the function cannot
drift out of step with the schema.

---

## 4. Implementation

**Export** — `src/domain/accountExport.ts`, pure. A versioned document (`formatVersion`, present from
v1 because an export outlives the app that wrote it), covering every stored table plus the lifter's own
custom exercises. PRism's seeded library is excluded: it is the app's data, not theirs, and several
hundred system rows would bury the handful that are personal.

Everything is **sorted**, and the sort is part of the contract: two exports of unchanged data must be
byte-identical, so a lifter diffing this month against last sees only real changes. Asserted by
shuffling the input and comparing serialised output.

`Repository.exportAccountData()` gathers it — a method rather than "call the six list methods from the
screen", because the guarantee I-10 asks for is **completeness**, and a table added later must not fall
out of the export because a caller forgot it.

**Deletion** — `deleteAccountAndTearDown` in `src/store/authActions.ts`. The remote delete goes first
and **its failure is not swallowed**, which is the one place this deliberately diverges from
`signOutAndTearDown` (which ignores a failed `signOut` because local teardown must happen regardless).
Here the opposite holds: wiping the device after a failed server delete would return a lifter to a
sign-in screen believing their data was erased while all of it is still there. On success, the local
half reuses `signOutAndTearDown` unchanged rather than repeating it — a store added to the teardown
later must not be cleared on sign-out and forgotten on deletion.

**UI** — two rows on `app/account.tsx`, **export above delete**. The order is the design: a lifter who
wants their data out is often on the way to erasing it, so the reversible action is never the second
one under the thumb. Deletion is behind **two** prompts, the first naming real counts read from the
export document — someone about to erase four years of training deserves to be told what four years
is, and taking the numbers from the export means the sentence and the file cannot disagree.

`ListRow` gained `disabled` and `busy` props. A second tap on "Delete my account" mid-request is the one
double-press in the product with no undo.

---

## 5. The rule this sprint appears to break, and why it does not

`app/account.tsx` carried a standing instruction from the sign-out sprint: *"if this grows a fourth
item it has become the settings surface this sprint was scoped not to build."* This adds two rows.

The rule's target was **settings** — units, notifications, theme, the long tail that turns a focused
sheet into a junk drawer. Export and deletion are not settings; they are the other two things you can
do to an account, and I-10 makes both blocking with no exception process. Putting them behind a
separate "Privacy" screen would satisfy the letter of a three-item limit while making the one
irreversible action in the product harder to find — the opposite of what a store reviewer and a
worried lifter both need.

So the rule is **restated rather than broken** `[decision]`: this screen holds account lifecycle and
nothing else. The first *preference* that appears here is the one that has made it a settings surface.

---

## 6. Validation evidence

```
npx tsc --noEmit                          → clean, no output
npx jest --ci                             → 398 passed, 25 suites, 0 failed
PSQL_URI=... supabase/tests/rls/run.sh    → 57/57 RLS
  (clean database, Postgres 16.14)          31/31 write integrity
                                            23/23 partial check-in
                                            21/21 account deletion
                                            132 assertions total
```

Six of the 21 deletion assertions test the **shape** of the function rather than its behaviour — no
arguments, definer, pinned `search_path`, and who may execute it. A behaviour-only suite would still
pass if a later migration relaxed the containment, which is the failure worth guarding against on the
only privileged function in the schema.

The suite creates and destroys **its own fixture user (C)**. A deletion test that erased a shared
fixture would work exactly once and then break every suite after it.

**Changed files:**

```
supabase/migrations/0005_account_deletion.sql            (new)
supabase/tests/rls/05_run_account_deletion_tests.sql     (new)
supabase/tests/rls/run.sh
src/domain/accountExport.ts                              (new)
src/domain/__tests__/accountExport.test.ts               (new)
src/data/repository.ts
src/store/authActions.ts
src/store/__tests__/authActions.test.ts
src/content/account.ts
src/content/__tests__/accountCopy.test.ts
src/components/ui/ListRow.tsx
app/account.tsx
Docs/invariants.md
Docs/sprints/2026-08-06-v1-account-deletion-export.md    (new)
```

---

## 7. Known incompleteness

- **I-10 says deletion and export must "exist and work". They exist and are tested; neither has run
  against a live Supabase project** `[fact]`. `0005` is not applied to one. This is the same gap every
  sprint in this chain carries, and for this invariant it is the difference between met-in-the-client
  and met-as-a-release-gate.
- **No privacy policy exists** `[fact]`. `Docs/architecture.md` §Risks has flagged this since the
  baseline. Both stores require one for health-adjacent data, and it is a separate blocking item from
  I-10 that the direction toward real user data makes live. Not addressed here.
- **Export delivery uses React Native's `Share`, not a file** `[decision]`. `expo-file-system` and
  `expo-sharing` are not dependencies and adding them is behind `CLAUDE.md`'s approval gate. The share
  sheet routes to Files, Mail, or anything accepting text, and works today with nothing new.
  **Recommendation** `[recommendation]`: adopt the file-based path before a lifter has years of
  history — a multi-megabyte string through a share sheet is a poor experience, and the filename helper
  (`accountExportFilename`) already exists for it.
- **No on-device verification** `[fact]`. Per `Docs/agents.md`, the two-prompt flow and the disabled
  rows are claimed as implemented and type-checked, not verified. Deletion in particular cannot be
  meaningfully rehearsed in demo mode, where `deleteAccount()` resets the seed rather than erasing an
  account.
- **No re-authentication before deletion** `[open question]`. Some platforms expect a recent credential
  before a destructive account action. PRism asks twice but does not ask for the password. Worth a
  decision before submission; not added here because it changes the auth surface.

---

## 8. The exact next decision

1. **Apply `0001`–`0005` to a real Supabase project, and run the account lifecycle against it.** This
   is now the same blocking step for four separate invariants (I-1, I-2, I-7, I-10) and it has not
   moved. Every one of them is met-in-the-client and unverified in the world.
2. **A privacy policy**, before any build that collects real user data reaches a person who is not the
   engineer/owner. Not a code task, and not one an agent should draft unreviewed.
3. **Re-authentication before deletion — yes or no?** (§7).
