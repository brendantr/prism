# Sprint: readiness-inputs-and-confidence-foundation-impl

> **This record is retroactive**, written 2026-08-01 as part of a pre-feature-readiness closure pass
> (`Docs/readiness/2026-07-31-closure-inventory.md` item E3), backfilling a sprint that shipped and
> merged (PR #4, 2026-07-29) without ever getting a dedicated record of its own — a gap in
> `Docs/agents.md`'s "every sprint has exactly one record" rule, following the precedent set by
> `2026-07-30-brand-app-icon.md`. Unlike every other record in this folder, its success criteria were
> **not** fixed before the code changed; this document describes what shipped, drawn from the PR's own
> title, body, and diff, rather than constraining work already done.

- **Status:** Merged (PR #4, merge commit `6b89935`, 2026-07-29T08:16:04Z).
- **Date:** 2026-07-29 (original work); this record: 2026-08-01.
- **Sprint branch:** `readiness-inputs-and-confidence-foundation-impl` (merged, deleted).
- **Predecessor:** [`2026-07-27-readiness-inputs-and-confidence-foundation.md`](2026-07-27-readiness-inputs-and-confidence-foundation.md)
  — the planning-only sprint that scoped this work and deferred implementation to a later,
  explicitly-approved sprint. This is that implementation.
- **Type:** Feature implementation — [ADR-0002](../decisions/ADR-0002-readiness-suggestion-safety.md)
  Phase A (readiness inputs and honesty).

## What changed (from the PR body and file list — fact, not reconstructed)

Per `gh pr view 4`'s title ("feat(readiness): add check-ins and honest confidence") and body:

- Added Today-screen check-ins for sleep, energy, soreness, and stress.
- Added honest readiness-confidence states when available inputs are incomplete.
- Added safe, accessible save-failure feedback without exposing Supabase errors.
- Added `DemoRepository` same-day patch semantics: an omitted field preserves the existing saved value,
  an explicit value overwrites it, and an explicit `null` clears it.
- Added regression tests for persistence, refresh behavior, and readiness after a cleared input.
- Added iOS Simulator quick-start documentation, in a separate commit (`81d7bf3`).

**Files changed** (14, `gh pr view 4 --json files`):

| File | Change |
|---|---|
| `Docs/architecture.md` | Modified (+2/−1) |
| `Docs/invariants.md` | Modified (+2/−2) |
| `README.md` | Modified (+19) — the iOS simulator quick-start section |
| `app/(tabs)/index.tsx` | Modified (+4) |
| `src/components/today/CheckInPrompt.tsx` | **Added** (+191) |
| `src/components/today/ReadinessCard.tsx` | Modified (+49/−21) |
| `src/data/__tests__/repository.test.ts` | **Added** (+164) |
| `src/data/repository.ts` | Modified (+93/−4) |
| `src/data/supabase/mappers.ts` | Modified (+4/−4) |
| `src/domain/calc/__tests__/calc.test.ts` | Modified (+235/−23) |
| `src/domain/calc/readiness.ts` | Modified (+136/−28) |
| `src/domain/types.ts` | Modified (+55/−9) |
| `src/store/__tests__/trainingStore.test.ts` | **Added** (+154) |
| `src/store/trainingStore.ts` | Modified (+13) |

This closes the two gaps the predecessor planning sprint named: `saveCheckIn` becomes reachable from a
real screen (`CheckInPrompt.tsx`, rendered on Today), and `readiness.ts` gains the explicit
low-confidence/"not enough data" state in place of the prior silent neutral-score substitution — this
is the work `Docs/invariants.md` I-7 and I-18 cite directly as their evidence, and both invariants
remain internally consistent with what this diff actually shipped (cross-checked against the current
file contents as part of this backfill, not merely assumed).

## Known limitation, stated in the PR itself

> Partial check-ins work in `DemoRepository` only. Supabase still rejects partial check-ins until a
> migration makes the four scale columns nullable and supports safe same-day upserts.

This remains true as of this backfill (2026-08-01) — `check_ins` in
`supabase/migrations/0001_init.sql` still declares all four scales `not null`, and no migration to
change that has been written or applied.

## Validation (as stated in the PR body — not re-run for this backfill)

| Command | Result (as reported in the PR) |
|---|---|
| `npm run typecheck` | Pass |
| `npm test` | Pass — 65/65 tests across 3 suites |
| `npx expo export --platform ios` | Pass |
| `git diff --check` | Clean |

This backfill does not re-run these — it is a documentation-only record of already-merged, already-CI-verified
work. The current, much larger test count (103/9 suites as of 2026-08-01) reflects everything merged
since, not a discrepancy with the 65/3 reported here at the time.

## Relationship to ADR-0002's phased rollout

This sprint completes **Phase A** (readiness inputs and honesty) of the phased rollout in
[ADR-0002](../decisions/ADR-0002-readiness-suggestion-safety.md). Phase B (the explicit "Not now"
dismissal control, `Docs/invariants.md` I-17) and Phase C (rule versioning and suggestion-audit
persistence, I-12) remain not started, exactly as the phased rollout intended — Phase A was scoped to
precede them, not to include them.

## Why this backfill exists

`Docs/agents.md`'s sprint-record-naming rule assumes one record per sprint, opened before the work.
This implementation sprint had a planning-only predecessor record but no record of its own — the
planning document's "Exit criteria for the next sprint" section named the intended next sprint but
that next sprint never got a document when it actually shipped. This gap was found during the
2026-08-01 pre-feature-readiness closure audit (`Docs/readiness/2026-07-31-closure-inventory.md` item
E3) while cross-checking every merged PR against `Docs/sprints/` for a corresponding record.

## Handoff

**Changed files (this backfill):** `Docs/sprints/2026-07-29-readiness-inputs-and-confidence-foundation-impl.md`
(this file) only.

**Commands run (this backfill):** `gh pr view 4 --json title,body,mergeCommit,files` — the source for
every fact above. No code was read, run, or changed.

**Unresolved risks:** None introduced by this backfill. The underlying implementation's own known
limitation (partial check-ins unsupported in Supabase) remains open and is tracked in
`Docs/invariants.md` I-7, not newly discovered here.
