# Reference research protocol

This directory holds PRism-owned research notes only — never third-party assets, screenshots, or files. It implements the policy decided in [ADR-0003](../decisions/ADR-0003-reference-research-policy.md).

## What this directory is for

Sanitized, written observations from private functional research into established strength-training apps (e.g., Liftly), used to understand user jobs, common workout-logging conventions, and general product/infrastructure patterns — never to copy another product's expression.

## Ground rules

- **Screenshots and third-party files never enter this repository, anywhere, in any form.** If a private session reviews third-party screenshots, only a written note comes out of that session and into Git.
- A written research note may include:
  - A reference ID (e.g., `R-001`) for traceability across notes and future ADRs/sprints.
  - The **user job** the observed screen or flow appears to solve.
  - The **general pattern** observed (e.g., "logging screens commonly separate warm-up sets from working sets") — described in PRism's own words, not quoted from the source.
  - The **PRism-specific decision** this observation informs, if any.
  - **Explicitly excluded copied elements** — a short statement of what was deliberately not carried over (exact layout, wording, iconography, etc.).
  - A **confidence** level (e.g., high/medium/low) in how well-founded the observation is.
  - An **open question**, if the observation raises one that needs a decision.
- A note must **not** include: copied text or microcopy from the reference product, specific visual/layout measurements, pixel or spacing values, or anything that functions as reproduction instructions for another product's screen.

## Status of findings

Everything in this directory is a **hypothesis**, not a requirement. A research note does not authorize implementation on its own — it becomes actionable only once accepted through an ADR (`Docs/decisions/`) or a sprint document (`Docs/sprints/`) that explicitly references it.

## Escalation

Any uncertainty about whether an observation crosses from "general pattern" into "copying a distinctive element" must be raised to the engineer/owner before it informs any implementation decision — see the stop conditions in `Docs/agents.md`.

## Notes in this directory

| ID | Note | Informs |
| --- | --- | --- |
| R-001 | [Information architecture of a mature strength-training logger](R-001-primary-surface-information-architecture.md) | Sprint [`2026-07-29-ui-ux-expansion`](../sprints/2026-07-29-ui-ux-expansion.md) |
