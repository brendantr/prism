# AGENTS.md

Operating instructions for AI agents working in this repository. `Docs/architecture.md` is the **implementation baseline** — an evidence-based, current-state audit of what exists today. Treat any claim here or elsewhere that contradicts it as suspect until re-verified.

## Read before planning or editing

- `Docs/architecture.md` — what actually exists, verified.
- `Docs/invariants.md` — durable rules that must not break.
- `Docs/agents.md` — agent roles, stop conditions, handoff format.
- Any accepted ADR touching your area of work — `Docs/decisions/`.
- The active sprint document — `Docs/sprints/`.

If these conflict with each other, or with what the code shows, stop and report the conflict. Do not silently resolve it by inventing facts.

## Workflow: branch-first, one sprint per branch

Every substantive change happens on a dedicated branch named for its sprint/purpose — never directly on `main`. One branch, one sprint, one clear purpose. See `Docs/invariants.md` I-14 and `Docs/agents.md` for preflight/handoff requirements.

## Scope discipline

Do only what the active sprint approved. Stop and get explicit engineer/owner approval before:
- Destructive commands (force-push, `reset --hard`, deleting branches/files not created this session).
- Dependency upgrades.
- Native project regeneration (`expo prebuild`, editing `ios/`/`android/`).
- Cloud-resource changes (Supabase project settings, RevenueCat config, store consoles).
- Database migrations or RLS policy changes.
- Payment/entitlement logic changes.
- Production configuration changes.

## Secrets

Never put a secret — API key, token, password, private key, service-role credential — in code, commits, documentation, prompts, logs, or generated output. Not even partially, not even as an "example" that's actually real. See `Docs/invariants.md` I-4, I-5.

**Privileged credentials never reach the mobile client.** Supabase service-role keys, RevenueCat secret keys, and App Store/Play Console credentials must never be embedded in or reachable from client code — only `EXPO_PUBLIC_*` values safe for a public bundle (see `README.md`'s security model paragraph and `Docs/invariants.md` I-4).

## Data integrity

Multi-record workout writes must be atomic, idempotent, or safely recoverable — no silent partial writes, no silent duplicates. This is a **known, currently unmet gap** (`Docs/architecture.md` G-2, `Docs/invariants.md` I-2), not a solved problem; do not claim it is fixed unless you have actually fixed and validated it.

## Validation and handoff

Every change ships with validation evidence (commands run, actual results) and an explicit changed-files summary. See `Docs/agents.md` "Required handoff" for the exact format. Do not report work as complete without it.

## Product originality and reference research

Liftly and other established training apps may be used only as **private functional research references** — to understand user jobs, logging conventions, and general product flows. Repello never copies another product's brand, assets, screenshots, exact layout, wording, or source code, and is never called a "clone" anywhere in this repository. Full policy: `Docs/decisions/ADR-0003-reference-research-policy.md`, protocol: `Docs/research/README.md`.

## Readiness-aware progression

Repello's v1 differentiator is readiness-aware progression (`Docs/decisions/ADR-0001-product-position.md`). Any readiness suggestion must be **advisory-only, deterministic, explainable, versioned, testable, and user-overridable** — never automatic, never framed as medical advice or diagnosis. Full boundaries: `Docs/decisions/ADR-0002-readiness-suggestion-safety.md`, `Docs/invariants.md` I-7–I-12 and I-16–I-18. The readiness feature is **not implemented** as of this sprint; existing code in `src/domain/calc/readiness.ts` and `loadRecommendation.ts` predates these boundaries and has not been audited against them (see ADR-0001 open questions).

## When to stop and ask

Stop and request clarification when intent, evidence, security boundaries, or scope are insufficient to proceed safely — see `Docs/agents.md` "Stop conditions." Proceeding on a plausible guess is not an acceptable substitute for asking.
