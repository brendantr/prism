# Agent behavior and human authority

Defines what AI agents may decide on their own in this repository, and what must go back to the engineer/owner. Related: `CLAUDE.md`, `Docs/invariants.md`, `Docs/decisions/`.

## Roles

**Engineer/owner** holds final authority over: product scope, architecture, security exceptions, external accounts (Supabase, RevenueCat, App Store/Play Console, etc.), spending, data retention policy, monetization, and release decisions. Nothing in this document delegates any of that authority to an agent.

**AI agent** may: inspect the repository, plan work, implement only the scope explicitly approved for the current sprint, validate its own changes, report evidence honestly, and escalate uncertainty rather than guessing. An agent does not expand scope, make security trade-offs, or treat a plausible-sounding assumption as a fact.

## Required preflight (before planning or editing anything)

1. Check Git state: `git status --short --branch`; confirm the working tree is clean and the active branch is correct before making changes.
2. Confirm the active branch matches the current sprint's purpose (see `CLAUDE.md`'s branch-first workflow). Do not work on `main` directly.
3. Read the relevant Docs: `Docs/architecture.md` (implementation baseline), `Docs/invariants.md`, `Docs/agents.md` (this file), any accepted ADR touching the area of work (`Docs/decisions/`), and the active sprint document (`Docs/sprints/`).
4. If any of the above is missing, stale, or contradicts what the code actually shows, stop and say so rather than proceeding on a guess.

## Required handoff (at the end of any work)

Every handoff states, explicitly:
- **Changed files** — the exact list, not a paraphrase.
- **Commands run** — including validation/test commands and their actual results (pass/fail, not "should pass").
- **Validation results** — what was verified and how; what was not verified and why.
- **Unresolved risks** — anything left open, deferred, or uncertain.
- **The exact next decision** the engineer/owner needs to make, stated as a specific question, not a vague "let me know what you think."

## Stop conditions

An agent stops and asks rather than proceeding when it hits any of the following:
- Insufficient evidence to support a claim it's about to make or a change it's about to build.
- Contradictory documents (e.g., an ADR conflicts with `Docs/architecture.md`, or a sprint's instructions conflict with an invariant).
- Any risk of exposing a secret — even a partial value, even in a log or prompt.
- A destructive operation (force-push, `reset --hard`, deleting branches/files not created this session, discarding uncommitted work).
- A change to schema, RLS policy, payment/entitlement logic, authentication, or account deletion/export that is outside the scope explicitly approved for the current sprint.
- Unclear boundary between "general pattern learned from reference research" and "copying a distinctive element of another product" (see `Docs/decisions/ADR-0003-reference-research-policy.md`, `Docs/research/README.md`).
- Any pressure, explicit or implied, to expand scope beyond what the current sprint approved.

## Categories of change, and what each requires

| Category | Examples | Requirement |
|---|---|---|
| Read-only investigation | Reading code/docs, searching, running `git status`/`diff` | No special approval; still follow preflight. |
| Documentation changes | Editing `Docs/`, `CLAUDE.md`, ADRs, sprint docs | Branch-first; must not silently resolve conflicts with existing docs (state them instead). |
| Code changes | App/source code, tests | Scoped to the approved sprint; validation evidence required at handoff. |
| Database changes | Migrations, RLS policy edits | Explicit engineer/owner approval before writing, per `CLAUDE.md`; never applied silently. |
| Production/external-service changes | Cloud resource changes, store credentials, RevenueCat config, deploys | Explicit engineer/owner approval; agent does not hold or use privileged credentials (`Docs/invariants.md` I-4). |

## Labeling ambiguity

When a statement could be read as certain but isn't, label it: **fact** (with evidence/citation), **assumption** (stated as such, with what would confirm or refute it), **recommendation** (the agent's judgment, offered not imposed), or **question** (something only the engineer/owner can resolve). This mirrors the fact/inferred/unknown discipline `Docs/architecture.md` already established.

## Secrets

No secret value is ever echoed — not in chat output, not in committed files, not in logs, not partially. If a secret must be referenced, reference its name/location, never its value. See `Docs/invariants.md` I-4 and I-5.
