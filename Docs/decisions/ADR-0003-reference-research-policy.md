# ADR-0003: External reference research informs PRism requirements without copying external products

- Status: Accepted
- Date: 2026-07-27
- Sprint: product-intent-and-guardrails
- Decision owner: Engineer/owner

## Context

`README.md`'s existing "Originality" section already states PRism's design system, copy, exercise library, coaching cues, template plans, and calculation model were written from scratch, and that formulas like Epley's 1RM estimate are cited as standard public-domain strength-training mathematics. That section is a stated position, not an independently verified audit — `Docs/architecture.md` explicitly notes it "does not independently verify originality against any external product."

Liftly and other established strength-training apps may be useful as private functional research references: they encode years of learning about workout-logging conventions, common friction points, and user expectations. Used carelessly, that same research is also the most direct path to accidentally copying another product's protected expression (brand, exact layout, wording, assets). This ADR sets the policy boundary before any such research is conducted or referenced in this repository.

## Decision

- Private references (e.g., Liftly) may be used only to understand: the user job a screen solves, common workout-logging conventions, general product flows, general infrastructure questions, and points of friction or value in a training workflow.
- No third-party screenshots, brand assets, icons, exact screen layouts, navigation sequences, visual hierarchy, typography, color systems, spacing, iconography, animation, microcopy, exercise descriptions, paywall copy, or source code may enter this Git repository in any form — not as files, not embedded in documentation, not in commit messages or PR/issue text.
- Only sanitized written observations are committed: user problem, general pattern, PRism-specific decision, and explicitly excluded copied elements, per the protocol in `Docs/research/README.md`.
- PRism must make its own independent design system, information hierarchy, interaction model, visual language, wording, assets, and product-position decisions. Reference observations are inputs to that independent process, never a specification to reproduce.
- PRism is never referred to as a "Liftly clone" (or equivalent) anywhere — source, documentation, Git history, issue/PR text, store metadata, or comments. Use "strength-training app," "strength-training logger," or "reference research" instead.
- Any uncertainty about whether a specific decision crosses from "inspired by a general pattern" into "copying a distinctive element" must be escalated to the engineer/owner before implementation, per the stop conditions in `Docs/agents.md`.

## Alternatives considered

- **No reference research at all** — rejected. Discards a legitimate, low-risk way to understand established workout-logging conventions and user friction points without needing to reinvent basic product knowledge from zero.
- **Keep raw screenshots/files in a local, gitignored folder for personal reference** — a viable operational practice, but out of scope for this ADR to mandate or forbid; regardless of where source images live, this repository's Git history must never contain them, and only sanitized notes are ever committed.
- **Commit raw research notes with embedded quotes/measurements from the reference product** — rejected. Even in "private" documentation, embedded copied text, layout measurements, or reproduction instructions create real copying risk and blur the line this ADR exists to hold.

## Consequences

- `Docs/research/README.md` (created in this sprint) is the operating protocol for any future research note.
- Every research note is a hypothesis about a user problem or pattern until it is accepted into a decision via an ADR or sprint document — research alone does not authorize implementation.
- Anyone conducting reference research is responsible for applying this boundary in real time (e.g., during a private screen-sharing session); this ADR does not create an automated enforcement mechanism.

## Validation / evidence

- `README.md` — existing "Originality" section, read as the current stated project position (not independently verified by this sprint).
- `Docs/architecture.md` — Product and System Boundaries section, noting originality was not independently audited.
- No research notes exist yet in `Docs/research/`; this ADR establishes the policy before any are written.

## Reversal or migration plan

If this protocol proves insufficient — for example, if a copying boundary is crossed despite it — the response is a superseding ADR that tightens the protocol (e.g., requiring a second reviewer before any research-derived decision ships), not a silent process change.

## Open questions

- Where source screenshots/files from private reference sessions should be stored outside Git (e.g., a local-only folder, a separate non-repo tool) is not specified by this sprint and should be decided, if needed, before any such session occurs.
