# Sprint: readiness-inputs-and-confidence-foundation

- **Status:** Planning only — no implementation in this session, awaiting engineer approval
- **Date:** 2026-07-27
- **Branch:** `readiness-inputs-and-confidence-foundation`
- **Phase:** [ADR-0002](../decisions/ADR-0002-readiness-suggestion-safety.md) Phase A only. Phase B (explicit "Not now" dismissal control) and Phase C (rule versioning + suggestion-audit persistence) are separate, later sprints — not this one.

## Goal

Close two of ADR-0002's Phase A gaps, identified by the 2026-07-27 reconciliation review ([sprint doc](2026-07-27-product-intent-and-guardrails.md), [`Docs/invariants.md`](../invariants.md) I-7 and I-18):

1. Make `saveCheckIn` reachable from a real screen, so sleep/energy/soreness check-ins are genuinely user-entered instead of unreachable plumbing.
2. Replace the readiness composite's current silent neutral-score substitution with an explicit, honest low-confidence / "not enough data" state, surfaced in the UI.

This sprint is planning only. No feature code, test code, or component code is written in this session — only this planning document and one one-line factual correction to `Docs/architecture.md` (see below).

## In scope (Phase A)

- Wire real user-entered sleep/energy/soreness check-in into the existing `saveCheckIn` path: repository (already implemented in both `DemoRepository` and `SupabaseRepository`) → `trainingStore.saveCheckIn` (already implemented) → a new UI form that actually calls it (does not exist today).
- Adapt `src/domain/calc/readiness.ts` to expose an explicit low-confidence/not-enough-data state, replacing the current behavior where `workloadFactor` and `wellbeingFactor` silently substitute a neutral 0.7 score when data is missing or stale and fold it into the single 0–100 composite with no top-level signal.
- Update `src/components/today/ReadinessCard.tsx` to render that state honestly instead of (or alongside) the current numeric score.
- Add deterministic tests for the new state in `src/domain/calc/__tests__/`.
- Define, in this document, the boundary between a "safe adaptation" of the existing readiness engine and a rewrite of it (see below) — this is a planning deliverable, not code.
- Fix the stale commit reference in `Docs/architecture.md` (currently cites `2490c8d`; repo `main` is now at `a6ed007`) — a one-line, doc-only correction, made in this same session.

## Explicitly excluded from this sprint

- RIR capture
- Rule-version identifiers or persistence
- Suggestion-audit persistence
- "Not now" dismissal control (that's Phase B)
- Payments, auth/backend redesign, migrations/RLS changes
- Success-metric definitions (deferred until Phase A ships and usage exists)
- Phase 2-5 roadmap reconciliation (separate future read-only sprint)
- Any UI work unrelated to check-in form and ReadinessCard confidence state
- Store/release work

## Affected files (anticipated for the future implementation sprint — list only; no edits made in this planning session)

- `src/domain/calc/readiness.ts` — add the low-confidence/not-enough-data signal; touch only the branches that currently substitute a neutral score (`workloadFactor`'s `chronicWeekly < 1` branch, `wellbeingFactor`'s missing/stale-check-in branches). Exported constants (`READINESS_WEIGHTS`, `READINESS_EXPLANATION`, `BAND_COPY`) and the scoring formula for the data-present case are not expected to change — to be confirmed against the "safe adaptation" boundary below once real code is proposed.
- `src/domain/types.ts` — per Decision 2 below, needs (a) a per-factor "insufficient data" signal on `ReadinessFactor`, (b) a `ReadinessResult` shape that can represent either a numeric, re-normalized composite or an explicit "not enough data" result (when recovery and wellbeing are both insufficient), and (c) `CheckIn`'s sleep/energy/soreness fields becoming independently nullable/"not provided" per Decision 4, rather than required numbers.
- `src/components/today/ReadinessCard.tsx` — render the new state (e.g., a distinct "not enough data yet" treatment instead of, or alongside, the numeric ring).
- `src/domain/calc/__tests__/calc.test.ts` (or a new adjacent test file) — deterministic tests for the new low-confidence paths.
- A new check-in entry component, per Decision 3, rendered inline on the Today screen (`app/(tabs)/index.tsx`) adjacent to the existing `ReadinessCard` — likely a new file under `src/components/today/` (e.g. `CheckInPrompt.tsx`; exact name TBD at implementation time). Per Decision 4, its form must let sleep/energy/soreness be submitted independently rather than as an all-or-nothing set.
- `src/store/trainingStore.ts` — `saveCheckIn` and `selectLatestCheckIn` already exist and are expected to need no interface changes; only a new call site elsewhere is anticipated.
- `Docs/invariants.md` — I-7 and I-18's "enforcement evidence" text will need updating once the gap is actually closed (not in this sprint; noted for the implementation sprint's handoff).
- `Docs/decisions/ADR-0002-readiness-suggestion-safety.md` — **not touched by this sprint.** Per Decision 1, its v1 input list ("sleep quality, energy, soreness, RPE") needs a follow-up correction to include `stress`, since the existing `CheckIn` schema and `wellbeingFactor` already use it. Filed as a small, separate doc-fix item, outside this sprint's code scope.

No file above is edited in this session. This list is a planning estimate for engineer review, not a commitment.

## Test plan outline (for the future implementation sprint)

- Existing suite: all 40 current tests in `calc.test.ts` must continue to pass unchanged — the adaptation must not alter behavior for the data-present case.
- New deterministic cases for `workloadFactor`: assert the function reports the new low-confidence signal (not just a bare 0.7 score) when `chronicWeekly < 1`, and does not report it once sufficient history exists — boundary case at exactly the history threshold.
- New deterministic cases for `wellbeingFactor`: assert the low-confidence signal when there is no check-in at all, and separately when the latest check-in is stale (> 36h), versus a normal score when a fresh check-in exists.
- Composite-level tests asserting `computeReadiness`'s decided aggregation rule (Decision 2): when exactly one factor lacks sufficient data, the composite re-normalizes weights across the remaining factors and returns a numeric score; when recovery and wellbeing are both insufficient simultaneously, the composite returns an explicit "not enough data" result instead of any numeric score. Cases to cover: each single factor insufficient in turn (re-normalized numeric result expected), recovery+wellbeing both insufficient (explicit "not enough data" expected), and other two-factor-insufficient combinations not involving both recovery and wellbeing (re-normalized numeric result expected, per the literal rule as decided).
- New deterministic cases for partial check-in submission (Decision 4): `wellbeingFactor` given a check-in where only some of sleep/energy/soreness are provided must treat the unanswered fields as "not provided" — never a neutral or zero default — and this must be distinguishable from a fully-answered check-in in the function's output.
- Per Decision 6, component-level test infrastructure for `src/components/` is out of scope for this sprint. Only the existing Jest unit-test pattern in `src/domain/calc/__tests__/` is used; `ReadinessCard.tsx`'s new rendering is not covered by an automated test this sprint.

## Safe adaptation vs. rewrite — proposed boundary for engineer approval

**Safe adaptation (in bounds for this sprint's future implementation):**
- Adding a new field to the `ReadinessFactor`/`ReadinessResult` types to carry a low-confidence/completeness signal.
- Changing only the branches inside `workloadFactor`/`wellbeingFactor` that already handle the "missing or stale data" case today — these branches already exist as special cases; this sprint's change is to make them honest instead of neutral-scored.
- Adding new exported helper(s) or copy constants (e.g., analogous to `BAND_COPY`) for the new state's UI text — all such new user-facing strings require explicit product owner review before merge, per Decision 5 below and ADR-0002's non-medical-wording constraint.
- Dynamically re-normalizing the composite's weights across the factors that currently have sufficient data, per Decision 2 below — this is a change to how weights are *applied per-evaluation* when data is missing, not a change to the base weights themselves (see "Rewrite" below).
- Adding new test cases alongside the existing 40.

**Rewrite (out of bounds without a new ADR or explicit engineer sign-off):**
- Changing the four factor weights (`recovery` 0.4 / `workload` 0.25 / `wellbeing` 0.25 / `consistency` 0.1).
- Changing how `recoveryFactor` or `consistencyFactor` compute their score in the data-present case (they don't currently have a "missing data" branch at all — introducing one would be new scope, not adaptation).
- Renaming or removing any currently-exported function, constant, or type consumed elsewhere (`computeReadiness`, `bandFor`, `READINESS_WEIGHTS`, `READINESS_EXPLANATION`, `volumeInWindow`, `completedThisWeek`, `startOfIsoWeek` are all imported by other screens per `Docs/architecture.md`'s Runtime Architecture section — Progress/Body/Insights reuse the same calc functions).
- Any change to `loadRecommendation.ts` — out of scope for this sprint entirely; only `readiness.ts` and its UI/test surface are touched.

## Decisions (approved by product owner, 2026-07-27)

1. **Stress field:** kept in the `CheckIn` model. ADR-0002's v1 input list ("sleep quality, energy, soreness, RPE") does not currently mention `stress`, even though the existing `CheckIn` schema and `wellbeingFactor` already include and use it. This is a documentation gap in ADR-0002, not a code change — a small, separate doc-fix item is filed to correct ADR-0002's input list to include `stress` alongside sleep/energy/soreness/RPE. That doc fix is explicitly **not part of this sprint's code scope** and is not performed in this session.
2. **Composite aggregation:** when a readiness factor lacks sufficient input data, `computeReadiness` excludes it and re-normalizes weights across the remaining factors, still returning a numeric score. If two or more factors lack data simultaneously, **and those factors are specifically recovery and wellbeing**, `computeReadiness` returns an explicit "not enough data" result instead of a numeric score.
3. **Check-in UI location:** the check-in input is surfaced directly on the Today screen (`app/(tabs)/index.tsx`), adjacent to the existing `ReadinessCard` component — not a modal, not a separate route.
4. **Partial submission:** users may submit sleep/energy/soreness fields independently of one another. Any field left unanswered is recorded as "not provided" — it is never defaulted to a neutral or zero value, in the check-in data itself or in any factor computation that reads it.
5. **Low-confidence copy:** all new user-facing strings introduced by this feature (the new low-confidence/"not enough data" state, any new check-in form copy) are flagged for explicit product owner review before merge, per ADR-0002's non-medical-wording constraint (`Docs/invariants.md` I-8).
6. **Component test infrastructure:** out of scope for this sprint. The implementation continues using the existing Jest unit-test pattern in `src/domain/calc/__tests__/` only — no new UI/component test tooling is introduced this sprint.
