# ADR-0001: PRism is a readiness-aware strength-training logger

- Status: Accepted
- Date: 2026-07-27
- Sprint: product-intent-and-guardrails
- Decision owner: Engineer/owner

## Context

`Docs/architecture.md` (the accepted, evidence-based baseline) shows PRism today as a working demo-mode strength-training logger: a calculation engine (1RM, volume, PRs, recovery estimate, a composite readiness score, and next-load recommendations), a Postgres schema with RLS, and one complete logging workflow. It has no accepted product-position document — the architecture audit explicitly declined to invent one ("does not propose a future architecture ... does not create new process documents").

**Fact, not assumption:** the repository already contains a readiness score (`src/domain/calc/readiness.ts`, weighted: recovery 40% / training load 25% / check-in 25% / consistency 10%) and a next-load recommendation engine (`src/domain/calc/loadRecommendation.ts`, RPE/rep-based deload/hold/increase rules) shipped in Phase 1, per `Docs/architecture.md` §"Runtime Architecture" and §"Glossary". This predates and only partially overlaps with the v1 readiness-aware progression direction approved for this sprint (see "Consequences" and [ADR-0002](./ADR-0002-readiness-suggestion-safety.md)).

Before any backend, payment, or feature implementation continues, the product needs one durable, written position: who PRism is for and what makes it worth building instead of a generic logger.

## Decision

PRism's v1 differentiation is **readiness-aware progression for strength trainees**.

- **Target user:** strength trainees who value context-aware training decisions — lifters who want their logger to account for how they're doing today, not just record numbers.
- **Product promise:** fast, frictionless set-by-set logging, plus a transparent, optional progression suggestion the lifter can inspect and override.
- **Differentiator:** using user-entered readiness data (sleep, energy, soreness, RPE) and recent comparable performance to offer an advisory load/rep/effort adjustment — never an automatic change, always explained. **RPE is the only perceived-effort input in v1.** RIR is explicitly deferred — not omitted by accident — to a later, separately approved sprint; see [ADR-0002](./ADR-0002-readiness-suggestion-safety.md).
- **Explicit v1 non-goals:**
  - No medical, clinical-recovery, injury-prevention, or injury-diagnosis claims.
  - No auto-adjusted workouts — every suggestion requires explicit user action.
  - No generative/LLM-based coaching or open-ended chat coaching.
  - No dependency on wearables or HealthKit for v1 — inputs are user-entered.
  - No social feed or community features.
  - No broad "AI features" push beyond the scoped, deterministic readiness suggestion.
- **Success metric:** intentionally not defined here. A concrete success metric (e.g., suggestion acceptance rate, retention lift, logging completion rate) is deferred to a later, explicitly scoped sprint and must not be invented in this documentation-only sprint.

## Alternatives considered

- **Generic workout logger, no differentiation** — rejected. Does not justify PRism over existing strength-training loggers; gives no reason for a lifter to switch.
- **Generative/AI coaching (LLM-driven programming or chat coach)** — rejected for v1. Conflicts with the determinism, explainability, and non-medical-claim requirements in [ADR-0002](./ADR-0002-readiness-suggestion-safety.md); introduces liability and trust risk before the basics are proven.
- **Wearable/HealthKit-driven recovery scoring** — rejected for v1. Adds a hard external dependency and clinical-sounding "recovery measurement" framing PRism is explicitly avoiding; user-entered readiness keeps the input surface simple and squarely non-medical.
- **Social/community-first product** — rejected. Does not match the stated user job (an individual lifter making an informed training decision) and expands scope well beyond the current single-user, RLS-scoped data model.

## Consequences

- Engineering must design any new readiness-suggestion work strictly inside the boundaries in [ADR-0002](./ADR-0002-readiness-suggestion-safety.md) — not this sprint.
- **Engineer/owner decision (recorded 2026-07-27, following a read-only reconciliation review):** the existing `src/domain/calc/readiness.ts` and `src/domain/calc/loadRecommendation.ts` are the **intended starting point** for v1 — their core deterministic algorithms are adapted, not retired or replaced. This is no longer an open question about *whether* to reuse this code; it is a decision about *how*. What remains open, and is deferred to a later, explicitly bounded implementation sprint, is closing the specific gaps identified in the reconciliation review (real user-entered check-ins, an honest "not enough data" state, RPE-only input scope with RIR deferred, an explicit dismissal action, rule versioning, and suggestion-audit persistence — see [ADR-0002](./ADR-0002-readiness-suggestion-safety.md) for the phased rollout). This documentation-only sprint does not alter the existing algorithms themselves.
- The Phase 2–5 roadmap in `README.md` ("Phased plan") is not reaffirmed or repealed by this ADR. Whether it still reflects the approved product direction is an open question for the next sprint.

## Validation / evidence

- `Docs/architecture.md` — Executive Summary, Runtime Architecture §6, Glossary (readiness score and load recommendation already implemented and unit-tested: 40/40 tests passing per the architecture audit).
- `README.md` — "How the numbers work" section, describing the existing readiness/recovery/load-recommendation formulas in detail.
- No new code, schema, or algorithm was written or evaluated as part of reaching this decision.

## Reversal or migration plan

No readiness feature is implemented in this sprint, so there is no schema or code lock-in to reverse. If readiness-aware progression is later found non-differentiating or infeasible, the product position can revert to a plain logger by superseding this ADR; the existing calc-engine code would need a separate decision about retirement or repurposing.

## Open questions

- ~~Is the existing `readiness.ts` / `loadRecommendation.ts` implementation intended to become the v1 feature, or retired in favor of a new implementation?~~ **Resolved 2026-07-27:** adapted, not retired — see "Consequences" above and [ADR-0002](./ADR-0002-readiness-suggestion-safety.md) for the phased rollout that governs the adaptation work.
- Does the Phase 2–5 roadmap in `README.md` still apply given this new product position, or does it need revision?
- What is the concrete, measurable success metric for v1? Deferred to a future sprint.
