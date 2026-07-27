# Sprint: product-intent-and-guardrails

- **Status:** Complete — awaiting engineer review
- **Date:** 2026-07-27
- **Branch:** `docs/product-intent-and-guardrails`

## Goal

Establish the durable engineering-of-intent system for PRism — agent operating rules, enforceable invariants, and the first accepted product/safety/research decisions — before any backend, payment, or feature implementation continues.

## Non-goals

- No application source code, SQL, migrations, tests, `.env` files, EAS config, native files, screenshots, or assets.
- No implementation of the readiness-aware progression feature — no algorithm, rule thresholds, or persistence design.
- No modification of `Docs/architecture.md`.
- No resolution of open questions raised below — they are recorded for the next sprint, not decided here.

## Inputs read

- `Docs/architecture.md` (accepted baseline)
- `README.md`
- `package.json`
- `app.json`
- `.claude/settings.local.json` (only existing project-instruction-adjacent file found — permissions list, not product/process guidance)
- `src/` directory structure (top-level only, to avoid contradicting current facts)
- `supabase/migrations/` directory listing (file presence only)

No `CLAUDE.md` or `AGENTS.md` existed before this sprint.

## Files in scope

Created only:

1. `CLAUDE.md`
2. `Docs/invariants.md`
3. `Docs/agents.md`
4. `Docs/decisions/ADR-0001-product-position.md`
5. `Docs/decisions/ADR-0002-readiness-suggestion-safety.md`
6. `Docs/decisions/ADR-0003-reference-research-policy.md`
7. `Docs/research/README.md`
8. `Docs/sprints/2026-07-27-product-intent-and-guardrails.md` (this file)

## Decisions captured

- **ADR-0001:** PRism's v1 differentiator is readiness-aware progression for strength trainees; explicit v1 non-goals (no medical claims, no auto-adjustment, no generative coaching, no wearable dependency, no social feed); success metric explicitly deferred.
- **ADR-0002:** Readiness suggestions must be deterministic, advisory-only, explainable, versioned, testable, and non-medical; allowed v1 inputs and required "not enough data" state defined; no algorithm or threshold invented.
- **ADR-0003:** Reference research (e.g., Liftly) is permitted only as a private, functional input; no third-party screenshots/assets/copy ever enter Git; sanitized-notes-only protocol established in `Docs/research/README.md`.

## Invariants introduced

Eighteen invariants across eight categories in `Docs/invariants.md` (user-data integrity, authorization and secrets, privacy and health-adjacent data, payments and entitlements, readiness-suggestion safety, product originality and reference research, Git/change control, validation and documentation). Each cites its own enforcement evidence or expected validation rather than asserting completion; several explicitly document **currently unmet** gaps (e.g., I-2 non-atomic workout writes, I-9/I-10 payments and deletion/export not yet implemented, I-18 no honest "not enough data" readiness state yet) rather than claiming them solved. Three invariants (I-16, I-17, I-18) were added in this continuation to record the RPE-only scope, the required "Not now" dismissal action, and the "not enough data" honesty requirement, following the reconciliation review above.

## Explicit external-reference boundary

Liftly and other established training apps are private functional research references only — for understanding user jobs, logging conventions, general product flows, and friction points. No brand, assets, screenshots, exact layout, wording, or source code from any third-party product may enter this repository in any form, including documentation. PRism is never referred to as a "clone" of any product anywhere in source, docs, Git history, or issue/PR text. Full policy: `Docs/decisions/ADR-0003-reference-research-policy.md`; operating protocol: `Docs/research/README.md`. No third-party screenshots were added, viewed, or referenced during this sprint.

## Validation performed

Documentation-only validation, per the approved scope:

| Command | Result |
|---|---|
| `git diff --check` | Clean — no whitespace errors |
| `git status --short --branch` | See "Git branch" below |
| `git diff --stat` | See "Changed-file list" below |
| `git diff --name-only` | See "Changed-file list" below |
| `rg` secret-pattern scan of new docs (`SUPABASE`, `REVENUECAT`, `API_KEY`, `SECRET`, `TOKEN`, `PASSWORD`, `PRIVATE KEY`) | See engineer report for this sprint |

No package installation, build, test execution, database command, or `git add`/`commit`/`push` (beyond the initial branch publish) was performed, per the approved workflow.

## Git branch

`docs/product-intent-and-guardrails`, branched from `main` at a clean, up-to-date state, published to `origin` before any file was created.

## Changed-file list

All eight files listed under "Files in scope" — newly created, untracked at the time of this writing (not yet staged or committed; engineer review is expected before any commit).

## Reconciliation review and approved decisions (2026-07-27)

A read-only reconciliation review audited `src/domain/calc/readiness.ts` and `src/domain/calc/loadRecommendation.ts` (plus their call sites, tests, types, and persistence layer) against `ADR-0002`'s boundaries, across 13 dimensions. Findings: 8 dimensions already aligned (deterministic rules, comparable-session lookup, per-decision explanations, advisory-only writes enforced by the existing UI, demo/production data-shape agnosticism, non-medical tone, existing unit-test coverage), 4 gaps (no real check-in UI, no top-level readiness "not enough data" state, no rule versioning, no suggestion-audit persistence), and RIR found entirely absent from the codebase.

The engineer/owner reviewed these findings and made the following decisions:

1. **Adapt the existing readiness implementation; do not retire or replace its core calculation logic.** The audit found no evidence that replacement would be safer, clearer, or simpler than adaptation.
2. **RPE only for v1.** RIR data capture, storage, UI, and rule use are deferred to a later, explicitly approved sprint — not omitted by accident.
3. **Add an explicit user-visible dismissal action** ("Not now") to the later implementation plan, alongside the existing user-controlled "Apply" and manual editing.
4. **Sequencing:** real user-entered sleep/energy/soreness check-ins and an honest readiness "not enough data"/low-confidence state come **before** any suggestion audit-persistence work.
5. **Sequencing:** rule-versioning and suggestion-audit persistence are added **only after** authenticated production persistence, migrations, and RLS are ready.

These decisions are recorded in full, with their phased rollout (Phase A/B/C), in [ADR-0002](../decisions/ADR-0002-readiness-suggestion-safety.md); [ADR-0001](../decisions/ADR-0001-product-position.md) is updated to reflect that the "adapt vs. retire" question is resolved. No application source code was changed to implement any of this — these are documentation decisions governing a future implementation sprint.

## Open questions

1. ~~**Existing readiness/load-recommendation code vs. new boundaries**~~ — **Resolved 2026-07-27** by the reconciliation review and engineer decisions above.
2. **Success metric** — ADR-0001 explicitly defers choosing a concrete, measurable success metric for readiness-aware progression to a later sprint.
3. **Phase 2–5 roadmap** (`README.md` "Phased plan": Progress charts, Body map, Insights engine, Plans editor) — not reaffirmed or repealed by this sprint's decisions. Does it still reflect the approved product direction?
4. **Where private reference-research source files (e.g., screenshots) should live outside Git**, if a research session occurs — not specified by ADR-0003 or `Docs/research/README.md`.
5. **`package-lock.json` local drift** — before this sprint began, `package-lock.json` had uncommitted local changes (npm-metadata churn from a local toolchain difference, not an intentional dependency change). It was discarded via `git restore` per explicit engineer approval before branch creation. No dependency version changed as a result.

## Exit criteria for the next sprint

The reconciliation review above resolved open question 1, so the next proposed sprint is narrower than originally sketched. Proposed name: **`readiness-inputs-and-confidence-foundation`**.

**This must be explicitly scoped as an implementation-*planning* sprint only, until the engineer/owner approves the exact implementation scope.** It should list likely work areas, not create tickets, source files, or code:

- The existing check-in save path and UI wiring needed to make `saveCheckIn` reachable from a real screen (ADR-0002 Phase A).
- An explicit low-confidence/"not enough data" readiness state (ADR-0002 Phase A, `Docs/invariants.md` I-18).
- Deterministic tests for that state.
- The adaptation boundaries of the existing calculation engine — precisely which parts of `readiness.ts`/`loadRecommendation.ts` are reused as-is versus extended, per the reconciliation review.

**Explicitly excluded from that sprint's scope:** RIR (deferred, `Docs/invariants.md` I-16), suggestion-audit persistence (ADR-0002 Phase C), rule-version persistence (ADR-0002 Phase C, `Docs/invariants.md` I-12), payments, auth/backend redesign, and unrelated UI work.

Separately, a sprint should also reconcile `Docs/architecture.md` with the documents from this sprint and confirm or revise the Phase 2–5 roadmap (`README.md`) in light of the new product position — this was not resolved by the reconciliation review and remains open (see above).

This sprint does not create `readiness-inputs-and-confidence-foundation`'s document; it only proposes its scope for engineer review.
