# ADR-0002: Readiness suggestions are deterministic, advisory, and explainable

- Status: Accepted
- Date: 2026-07-27
- Sprint: product-intent-and-guardrails
- Decision owner: Engineer/owner

## Context

[ADR-0001](./ADR-0001-product-position.md) establishes readiness-aware progression as PRism's v1 differentiator. Any suggestion PRism makes about a lifter's training carries real trust and safety weight — a wrong or opaque suggestion, or one that reads as medical advice, undermines the product and creates liability. This ADR sets the non-negotiable safety boundaries for that feature before any implementation begins. It does not design the feature.

**Important existing-code fact:** `Docs/architecture.md` documents that `src/domain/calc/readiness.ts` and `src/domain/calc/loadRecommendation.ts` already exist and are already unit-tested, implementing a readiness score and load-recommendation rules with specific thresholds (e.g., "deload if avg top-set RPE ≥ 9.3"). This ADR's boundaries apply to that existing code exactly as they would to new code — nothing here should be read as retroactively certifying the existing implementation as compliant. Whether it complies (in particular: does it persist suggestion disposition and rule version? does it currently only use inputs from the approved v1 list?) is unverified and is called out as an open question.

**Engineer/owner decision (recorded 2026-07-27, following a read-only reconciliation review of the existing code):** `readiness.ts` and `loadRecommendation.ts` are **documented candidates for adaptation** — the intended basis for v1 — not proof that this ADR's requirements are already met. The review found the core rule logic, comparable-session lookup, per-decision explanation strings, and unit-test coverage already fit this ADR well, while real user-entered check-ins, an honest "not enough data" state, an explicit dismissal action, rule versioning, and suggestion-audit persistence are gaps that must be closed before the existing engine can be considered compliant. The existing calculation engine must be validated against this ADR in the later implementation sprint, not assumed compliant because it predates this document. The phased rollout below governs how those gaps are closed and in what order.

## Decision

- **Allowed initial (v1) inputs:** user-entered sleep quality, user-entered energy, user-entered soreness, user-entered RPE, and recent comparable workout performance. **RPE is the sole perceived-effort input for v1. RIR is explicitly deferred** — its data capture, storage, UI, and use as a rule input all require a separate, explicitly approved future sprint; it is not in scope until then. No other inputs (e.g., wearables, HealthKit, third-party health data) are in scope for v1.
- **"Not enough data" state is required.** When there isn't sufficient recent, comparable data to support a suggestion, PRism must say so plainly rather than guessing or defaulting silently.
- **Output is advisory only, never automatic.** A suggestion is a recommended load/rep/effort range or adjustment. It must never silently update a logged or planned workout.
- **User choices are mandatory:** accept, edit, dismiss, or ignore. All four must be genuinely available for every suggestion; none may be short-circuited by default behavior. The dismissal action must be an explicit, user-visible control — preferred v1 language is **"Not now."**
- **Persisted auditability is mandatory** once suggestion persistence is implemented. Any suggestion that is persisted must record: the rule/version that produced it, the exact evaluated inputs, the explanation shown to the user, the output, and the user's disposition (accepted/edited/dismissed/ignored).
- **Deterministic unit tests are required before the rule engine affects real users.** No non-deterministic (e.g., ML/generative) component may drive the suggestion in v1.
- **Safety language is mandatory and non-negotiable:** suggestions are non-medical. PRism does not diagnose injury, does not detect overtraining, does not clinically measure recovery, does not claim to prevent injury, and does not give medical advice. PRism is not described as an AI coach.
- **No algorithm, formula, or threshold is invented in this document.** This ADR defines boundaries only; the actual rule design is deferred to an implementation sprint that explicitly includes deterministic unit tests as an exit criterion.

### Phased rollout (engineer/owner-approved ordering, 2026-07-27)

Implementation work toward v1 compliance proceeds in this order. Each phase is a precondition for the next; none of it is implemented by this documentation-only sprint.

- **Phase A — readiness inputs and honesty.**
  - Add a real user-entered sleep, energy, and soreness check-in path (the schema and repository methods already exist per the reconciliation review; no UI currently calls them).
  - Surface an explicit "not enough data" or low-confidence readiness state when meaningful input or history is missing, replacing the current behavior where missing check-in/workload data silently defaults to a neutral score folded into the composite.
  - Add deterministic tests for this state before it reaches real users.
- **Phase B — transparent user control.**
  - Add the explicit "Not now" dismissal action described above.
  - Keep the existing user-controlled "Apply" action and manual per-set editing.
  - RPE only for v1, per the input list above; RIR remains deferred.
- **Phase C — accountable production operation.**
  - Add named/versioned readiness and load-recommendation rule sets (no such versioning exists today).
  - Only after authenticated user-scoped persistence, migrations, and RLS exist for this data: add suggestion-audit persistence covering evaluated inputs, output, explanation, rule version, and user disposition. This is deliberately sequenced after the auth/persistence/RLS foundation, not before it, so audit records are never written into an unauthorized or unverified data path.

## Alternatives considered

- **Fully automatic load adjustment** (PRism silently updates the next session's target) — rejected. Violates the advisory-only mandate in the approved product direction and removes user agency over their own training.
- **ML/generative suggestion engine** — rejected for v1. Cannot satisfy the determinism, explainability, and testability requirements; increases the risk of the system producing something that reads as diagnostic or medical.
- **No readiness feature at all (pure logger)** — rejected. Would abandon the differentiator decided in [ADR-0001](./ADR-0001-product-position.md) without a documented reason to do so.
- **Reuse the existing `readiness.ts` / `loadRecommendation.ts` as-is, unaudited** — rejected. A read-only reconciliation review was performed instead (2026-07-27); its findings are summarized in the "Context" section above. The engineer/owner decision is to **adapt** this code following the phased rollout, not to reuse it unaudited or to retire it.
- **Retire and replace `readiness.ts` / `loadRecommendation.ts` with a new implementation** — rejected. The reconciliation review found the core rule logic, comparable-session lookup, per-decision explanation, and existing unit-test coverage already fit this ADR's requirements; the gaps found (real check-ins, "not enough data" state, dismissal action, rule versioning, audit persistence) are additive, not evidence that the existing algorithms are unsafe, unclear, or harder to extend than a rewrite would be.

## Consequences

- A future implementation sprint must design the actual rule engine, its versioning scheme, its persistence model, and its deterministic test suite against these boundaries.
- The existing readiness/load-recommendation code must be explicitly audited (not assumed) for compliance before being reused, extended, or exposed as the v1 readiness-aware progression feature.
- Any suggestion UI must always render all four user actions (accept/edit/dismiss/ignore) and a visible non-medical disclaimer alongside the explanation.

## Validation / evidence

- No algorithm was implemented, run, or tested as part of this ADR. Validation is deferred to the implementation sprint, which must produce deterministic unit tests as exit evidence before the feature reaches real users.
- Existing-code facts cited above are sourced from `Docs/architecture.md` (Runtime Architecture §6, Glossary) — read, not re-verified, in this sprint.

## Reversal or migration plan

Since no algorithm is implemented in this sprint, there is nothing to reverse. If a future implementation is found to violate these boundaries after shipping, it must be disabled (feature flag or removal) until brought back into compliance; this is a hard requirement, not a suggestion, given the non-medical/advisory-only mandate.

## Open questions

- ~~Does the existing `readiness.ts` / `loadRecommendation.ts` implementation need to be revised, replaced, or retired to meet this ADR?~~ **Resolved 2026-07-27:** adapted per the phased rollout above; not retired.
- Where and how will suggestion audit records (rule version, inputs, explanation, output, disposition) be persisted? Deferred to Phase C, subject to the RLS and multi-record-write invariants in `Docs/invariants.md`, and explicitly sequenced after authenticated user-scoped persistence and RLS exist.
- What exact rule thresholds and versioning scheme will v1 use? Explicitly not decided in this document.
- Whether and when RIR capture is added is a separate future product decision, not addressed by this ADR.
