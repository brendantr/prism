# PRism invariants

Durable, enforceable rules for this codebase — not aspirational advice. Each entry states the rule, why it exists, what evidence would show it holds, and how an exception is granted. Facts about current implementation status are sourced from `Docs/architecture.md` (the accepted baseline) and are not re-asserted or re-verified here; where the baseline shows a gap, this document says so rather than claiming compliance.

Related: `CLAUDE.md`, `Docs/agents.md`, `Docs/decisions/`.

---

## User-data integrity

### I-1. Every user-data table must use row-level security (RLS) before real user data is written
- **Rule:** No table holding real (non-demo) user data may be written to in production until RLS is enabled and its policies are verified to behave as designed.
- **Why:** The client holds only a Supabase anon key; RLS is PRism's entire authorization boundary (see `README.md`'s security model paragraph). Without verified RLS, any user could potentially read or write another user's data.
- **Enforcement evidence or expected validation:** **Attempted 2026-07-31** (sprint
  `rls-policy-verification`, two independent environments) and **not yet met — a more specific
  finding than "unverified."** `supabase/migrations/0001_init.sql` fails to apply to a standard
  Postgres instance at all: a non-immutable function in the `check_ins_one_per_day` index expression
  (`checked_in_at::date`, which Postgres classifies `STABLE` not `IMMUTABLE`) aborts the migration
  before any RLS policy is created — confirmed directly (`pg_class.relrowsecurity` false and
  `pg_policies` empty after applying the committed file as-is), and **reproduced identically, at the
  identical line, on a real, dedicated hosted Supabase project** (`prism-rls-verification`,
  Postgres 17.6) — ruling out any environment- or version-specific cause. Against an unapplied,
  scratch-only copy with the one-line fix `timezone('utc', checked_in_at)::date`, an automated
  57-assertion suite (`supabase/tests/rls/`) confirmed full cross-tenant isolation across all 11
  tables and every CRUD operation, plus the documented `exercises.profile_id is null` exception
  (I-6) — **57/57 passed, in both environments (114/114 total)**. This means the policies *as
  written* are demonstrated correct, but the migration that creates them cannot run today, so I-1 is
  not met until (a) the index defect is fixed in `supabase/migrations/0001_init.sql` and (b)
  `supabase/tests/rls/run.sh` passes against that actual, corrected file rather than a scratch copy.
  Full evidence: `Docs/sprints/2026-07-31-rls-policy-verification.md`.
- **Exception process:** None. This is a hard gate before enabling non-demo mode for real users; no engineer/owner override applies to skipping RLS verification itself.

### I-2. Workout saves involving multiple records must be atomic, idempotent, or safely recoverable
- **Rule:** A workout write that touches more than one table (workout, workout_exercises, sets) must not be able to leave the database in a partially-written state that is silently lost or silently duplicated.
- **Why:** A logged workout is the user's primary data; a failed partial write (or a naive retry that duplicates it) destroys trust in the core product loop.
- **Enforcement evidence or expected validation:** `Docs/architecture.md` documents this as a **confirmed gap, not yet met**: `SupabaseRepository.saveWorkout` performs three sequential, non-transactional upserts (architecture.md G-2). Expected validation: wrap the multi-record write in a Postgres function/RPC (single transaction) or add reconciliation/detection logic, with a test that simulates a mid-sequence failure.
- **Exception process:** Any interim non-atomic write path must be explicitly called out in the relevant sprint document until fixed; it may not be silently treated as production-ready.

### I-3. Raw set-level data must remain available even when derived metrics are cached
- **Rule:** Introducing a cache or precomputed aggregate for a derived metric (readiness, volume, e1RM trend, etc.) must never come at the cost of discarding the underlying set-level rows it was computed from.
- **Why:** Derived metrics are recomputable; raw logged sets are not. Users need to be able to see and trust the source data behind any number PRism shows them, especially anything feeding a readiness suggestion.
- **Enforcement evidence or expected validation:** Currently trivially true — `Docs/architecture.md` §Runtime Architecture confirms derived values are computed on the fly via `useMemo` from stored data, with no caching layer yet in place. This invariant governs any future caching work.
- **Exception process:** Requires a dedicated ADR before any caching/aggregation design that would discard or downsample set-level rows.

---

## Authorization and secrets

### I-4. Client code must never hold privileged credentials
- **Rule:** Supabase service-role keys, RevenueCat secret/API keys, App Store/Play Console credentials, and any other privileged/server-only credential must never be embedded in, bundled with, or reachable from the mobile client.
- **Why:** `EXPO_PUBLIC_*` variables are inlined into the client bundle by design (README, `Docs/architecture.md` §Security). A privileged credential in client code is exposed to every install of the app.
- **Enforcement evidence or expected validation:** `Docs/architecture.md` confirms only three `EXPO_PUBLIC_*` variables exist today (`DEMO_MODE`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`) and no service-role key or other server-only secret was found anywhere in the repository. This invariant must continue to hold as RevenueCat, store operations, or any server-side component are added.
- **Exception process:** None for privileged credentials reaching the mobile client. Any feature that appears to need one (e.g., RevenueCat webhook verification, store API calls) requires a server-side component, decided via ADR — not a client-side workaround.

### I-5. No secret values in code, commits, documentation, prompts, logs, or generated artifacts
- **Rule:** Secret-like values (API keys, tokens, passwords, private keys) are never written into source, Git history, `Docs/`, AI prompts/output, or logs — including partial or "example-looking" values that are actually real.
- **Why:** Git history and documentation are effectively permanent and widely readable; a leaked secret cannot be un-leaked by deleting the file in a later commit.
- **Enforcement evidence or expected validation:** This sprint's validation step searches all newly created documentation for secret-like patterns (`SUPABASE`, `REVENUECAT`, `API_KEY`, `SECRET`, `TOKEN`, `PASSWORD`, `PRIVATE KEY`) without printing values. `.env` is confirmed git-ignored (`.gitignore`).
- **Exception process:** None. If a secret is ever committed, the response is rotation of the credential and history remediation, not documentation.

### I-6. A user may only access their own protected data unless a documented server-side policy permits otherwise
- **Rule:** Every RLS policy scopes access to `profile_id = auth.uid()` (directly or via an `EXISTS` walk to the owning parent), with any exception documented at the schema level.
- **Why:** This is the actual authorization mechanism given the client-holds-anon-key trust model (see I-1, I-4).
- **Enforcement evidence or expected validation:** `Docs/architecture.md` confirms policies are written this way for all 11 tables. The one documented exception is `exercises` rows with `profile_id = null`, which are intentionally world-readable system rows (migration comments, README "Connecting Supabase" step 3). Verification of correct *enforcement* (not just intent) is covered by I-1.
- **Exception process:** Any new shared/world-readable data pattern must be documented in the schema/migration and referenced from this invariant's evidence, not introduced silently.

---

## Privacy and health-adjacent data

### I-7. Readiness and check-in data is optional, user-entered, private by default, and never positioned as medical data or diagnosis
- **Rule:** Sleep, energy, soreness, RPE, and any other readiness input are optional for the user to provide, entered by the user (not inferred or pulled from a health platform in v1), private to that user by default, and never framed as medical or diagnostic information. **RPE is the sole perceived-effort field for v1; RIR is out of scope until a separate, explicitly approved future sprint authorizes its data capture, storage, UI, and use as a rule input.**
- **Why:** This is a mandatory boundary of the approved product direction ([ADR-0002](decisions/ADR-0002-readiness-suggestion-safety.md)) and a real legal/trust risk if violated. RIR was deliberately deferred (engineer/owner decision, 2026-07-27) to keep v1 input scope bounded rather than expanded ad hoc.
- **Enforcement evidence or expected validation:** **Partially met as of 2026-07-29** (sprint `readiness-inputs-and-confidence-foundation`). What is now verified in code: a real user-entered check-in path exists — `src/components/today/CheckInPrompt.tsx` renders on the Today screen and calls `trainingStore.saveCheckIn`, closing the "no call site for `saveCheckIn` in `app/`" gap the 2026-07-27 reconciliation review found. Optionality is enforced by the type system rather than by convention: `CheckIn.sleepQuality`, `.energy`, `.soreness` and `.stress` are `number | null` in `src/domain/types.ts`, each answerable on its own, and a field left alone is stored as null rather than defaulted (asserted by `src/domain/calc/__tests__/calc.test.ts` and `src/data/__tests__/repository.test.ts`). Inputs remain user-entered — no health-platform or wearable source was added. **Known limitation:** partial check-ins work against `DemoRepository` only. `check_ins` still declares all four scales `not null` (`supabase/migrations/0001_init.sql`), so `SupabaseRepository.saveCheckIn` calls `assertCompleteCheckIn` and throws before writing; a nullable-column migration is required before partial check-ins reach Postgres, and none is made by this sprint. **Still open:** the "never medical" copy bar has not been formally reviewed — the strings shipped are product-owner-approved for this feature, but no standing copy/claims review process exists (see I-8). Any check-in data written for real users must still satisfy I-1 (RLS verified) and I-6 (own-data-only access) before production; neither is met, and check-in data is not exempt.
- **Exception process:** None without a new ADR reviewed by the engineer/owner and supported by evidence (e.g., specific legal/clinical review), per the mandatory boundaries in the approved product direction. Adding RIR requires the same: a new ADR or explicit sprint approval, not an incidental addition during other readiness work.

### I-8. PRism must not claim to diagnose injury, detect overtraining, measure recovery clinically, prevent injury, or provide medical advice
- **Rule:** No copy, UI element, or feature description asserts diagnostic, clinical-measurement, or preventive-medical capability. PRism is not described as an "AI coach," and no scientific/medical validation claim is made unless specifically approved and evidenced.
- **Why:** Same as I-7 — mandatory product boundary; also the existing recovery-estimate copy already models the correct posture ("What this model does not know... It is a prompt to check in with your own body, not a verdict" — `README.md`).
- **Enforcement evidence or expected validation:** The existing `RECOVERY_MODEL_EXPLANATION` framing (README, `Docs/architecture.md` §Runtime Architecture) is consistent with this invariant and should be treated as the tone baseline for any new readiness copy. No formal copy review process exists yet — expected validation is a copy/claims review before any readiness-suggestion UI ships.
- **Exception process:** Requires specific, documented legal/product approval and supporting evidence — not currently granted for any claim beyond the existing "estimate, not a verdict" framing.

---

## Payments and entitlements

### I-9. Entitlements are never trusted from a client-controlled boolean
- **Rule:** Whether a user has an active paid entitlement must be determined server-side (Supabase + RevenueCat webhook/verification), never from a value the client can set or spoof.
- **Why:** A client-controlled entitlement flag is trivially bypassable and would give away paid features for free.
- **Enforcement evidence or expected validation:** No RevenueCat integration exists in the repository yet (`package.json` has no RevenueCat dependency; `Docs/architecture.md` does not mention one). This is a forward requirement to be validated when payments are implemented — expected validation is a documented server-side entitlement check before any paywall ships.
- **Exception process:** None. Any payment implementation must be designed against this invariant from the start, per the approval-gate for payment changes in `CLAUDE.md`.

### I-10. Account deletion and export are required before store release
- **Rule:** A user-facing account deletion flow and a data export mechanism must exist and work before PRism is submitted to the App Store or Play Store.
- **Why:** Store policy and user trust requirements; also directly relevant given the health-adjacent data PRism stores.
- **Enforcement evidence or expected validation:** `Docs/architecture.md` confirms neither exists today — the README lists both as Phase 6 ("planned"), not implemented. The schema's `on delete cascade` from `auth.users` (migration) makes deletion straightforward to implement once auth exists, but this is a design note, not evidence of completion.
- **Exception process:** None — this is a blocking requirement for store submission, not a negotiable scope item.

---

## Readiness-suggestion safety

### I-11. A readiness suggestion cannot change a workout without explicit user confirmation
- **Rule:** No readiness-derived suggestion may alter a logged or planned workout's load, reps, or effort target unless the user explicitly accepts or edits it.
- **Why:** Mandatory advisory-only boundary from the approved product direction ([ADR-0002](decisions/ADR-0002-readiness-suggestion-safety.md)).
- **Enforcement evidence or expected validation:** Already aligned in the existing code, per a read-only reconciliation review (2026-07-27): `app/workout/active.tsx`'s `onApplySuggestion` only fires from an explicit user tap on "Apply to all sets"; nothing writes a suggested weight without it. This behavior must be preserved as the existing engine is adapted — see the phased rollout in [ADR-0002](decisions/ADR-0002-readiness-suggestion-safety.md).
- **Exception process:** None.

### I-12. Rule versioning and persisted suggestion audit records are future production requirements, not currently implemented facts
- **Rule:** If a suggestion is stored, the stored record must include the evaluated inputs, the rule and its version, the explanation shown to the user, the output, and what the user did with it. Neither rule versioning nor any such persistence exists today, and neither may be described as implemented until it is.
- **Why:** Traceability, testability, and the ability to audit or roll back a rule change — required by [ADR-0002](decisions/ADR-0002-readiness-suggestion-safety.md). Sequenced deliberately late (ADR-0002 Phase C) so audit records are never written into an unauthenticated or unverified data path.
- **Enforcement evidence or expected validation:** Confirmed not yet implemented by a read-only reconciliation review (2026-07-27): no version identifier exists for either the readiness weights or the load-recommendation thresholds, and no suggestion is persisted anywhere in `src/data/repository.ts` or `supabase/migrations/0001_init.sql`. Expected validation: this work does not begin until authenticated user-scoped persistence, migrations, and RLS are ready (I-1, I-6), and a schema/migration review confirms all five fields are captured before the feature ships to real users.
- **Exception process:** None without an ADR update.

---

## Product originality and reference research

### I-13. No copied external UI, branding, wording, assets, or screenshots
- **Rule:** PRism's repository never contains another product's brand, product name, icon, assets, screenshots, source code, exact screen layout/navigation sequence, visual hierarchy, typography, color system, spacing, iconography, animation, microcopy, exercise descriptions, or paywall copy.
- **Why:** Legal/IP risk and product integrity; formalized in [ADR-0003](decisions/ADR-0003-reference-research-policy.md).
- **Enforcement evidence or expected validation:** `README.md`'s existing "Originality" section states this as current practice (not independently audited by `Docs/architecture.md`). Expected ongoing validation: no third-party asset files ever appear in `git status`/diffs; research notes follow the `Docs/research/README.md` protocol.
- **Exception process:** Any uncertainty is escalated to the engineer/owner before implementation, per `Docs/agents.md` stop conditions — never resolved by proceeding and hoping it's fine.

---

## Git/change control

### I-14. Every substantive change occurs on a non-main branch with a clear, single purpose
- **Rule:** Documentation, code, schema, and configuration changes happen on a dedicated branch named for their sprint/purpose, not directly on `main`; each branch corresponds to one sprint's scope.
- **Why:** Keeps `main` reviewable and revertible, and keeps each unit of work traceable to one documented intent (this sprint's own workflow is an example).
- **Enforcement evidence or expected validation:** `git log` shows a merge-PR pattern into `main` (e.g., `4785bc9 Merge pull request #1 ...`). This sprint itself follows the rule (branch `docs/product-intent-and-guardrails`).
- **Exception process:** Requires explicit engineer/owner approval to commit directly to `main`; not to be done by default under any circumstance.

---

## Validation and documentation

### I-15. Documentation must distinguish fact, approved decision, assumption, and open question
- **Rule:** Any PRism document states clearly which of its claims are verified facts (with evidence), which are approved decisions (with an owner and date), which are assumptions, and which are open questions — and does not blend these categories without a label.
- **Why:** `Docs/architecture.md` set this precedent explicitly (verified/inferred/unknown labeling) precisely because blended claims are how false certainty enters a project's documentation and later its code.
- **Enforcement evidence or expected validation:** This document and the ADRs created in this sprint follow that convention (e.g., explicit "Open questions" sections, explicit citations to `Docs/architecture.md` for any implementation-status claim).
- **Exception process:** None — this applies to every PRism document going forward, including future revisions of this one.

---

## Readiness-suggestion safety (continued)

Continued from I-11/I-12 above; grouped separately here only to keep invariant IDs in ascending document order. See also `Docs/decisions/ADR-0002-readiness-suggestion-safety.md`.

### I-16. RPE is the sole perceived-effort field in readiness v1
- **Rule:** Only user-entered RPE feeds v1 readiness/load-suggestion rules. RIR data capture, storage, UI, and rule use are out of scope until a separate, explicitly approved future sprint.
- **Why:** Engineer/owner decision (2026-07-27) to keep v1 input scope bounded; a read-only reconciliation review found RPE already genuinely user-entered (`src/components/workout/RpeSelector.tsx`) with no RIR field anywhere in the schema or code.
- **Enforcement evidence or expected validation:** Confirmed by repo-wide search (2026-07-27): zero references to RIR in `src/` or `app/`. This invariant blocks adding an RIR field/UI/rule input without a new ADR or sprint approval.
- **Exception process:** Requires a new ADR or explicit sprint approval naming RIR in scope — not an incidental addition during other readiness work.

### I-17. Recommendation dismissal must be an explicit, user-visible, and — once implemented — auditable action
- **Rule:** A user must be able to explicitly dismiss a readiness/load suggestion (preferred v1 language: "Not now"), distinct from silently ignoring it. Once suggestion-interaction telemetry or audit persistence exists (I-12), a dismissal must be captured as a disposition value like any other user action.
- **Why:** ADR-0002's four required user choices (accept/edit/dismiss/ignore) require dismissal to be a real, discoverable control, not merely a state a user can reach by taking no action.
- **Enforcement evidence or expected validation:** Not yet implemented — a read-only reconciliation review (2026-07-27) found the existing UI (`src/components/workout/ExerciseBlock.tsx`) offers "Apply" but no explicit dismiss control. Expected validation: a visible "Not now" affordance shipped as part of ADR-0002 Phase B, with a test asserting it does not write to the workout.
- **Exception process:** None without an ADR update.

### I-18. Lack of sufficient input or history must not be represented as a confident readiness recommendation
- **Rule:** When meaningful readiness input (check-in data) or workout history is missing, PRism must surface an explicit "not enough data" or low-confidence state rather than silently substituting a neutral default into a composite score presented as a normal result.
- **Why:** A confident-looking number built on absent data misleads the user and violates the explainability/honesty intent of [ADR-0002](decisions/ADR-0002-readiness-suggestion-safety.md).
- **Enforcement evidence or expected validation:** **Met as of 2026-07-29** (sprint `readiness-inputs-and-confidence-foundation`), replacing the "not met" finding of the 2026-07-27 reconciliation review. The three branches in `src/domain/calc/readiness.ts` that substituted a neutral 0.7 — `workloadFactor`'s `chronicWeekly < 1`, and `wellbeingFactor`'s missing-check-in and stale-check-in cases — now report `sufficient: false` and are excluded from the composite instead of scored. `computeReadiness` re-normalises weights across the factors that do have data, and returns `score: null`, `band: null`, `confidence: 'insufficient'` when both the workload and wellbeing signals are missing; `ReadinessCard` renders that state without a numeric ring. Partial check-ins are scored only from the fields actually answered, never from a stand-in for the rest. Deterministic evidence: 11 tests added to `src/domain/calc/__tests__/calc.test.ts` covering the workload history threshold, the 36-hour staleness boundary, single-factor exclusion with re-normalisation, the both-missing no-score result, and four partial-check-in cases — plus two equivalence tests proving the data-present calculation is unchanged (`READINESS_WEIGHTS` is untouched). Full suite: 61 tests passing across 3 suites. **Scope note:** `recoveryFactor` and `consistencyFactor` still have no missing-data branch, so a lifter with no history is scored 1.0 on recovery (via `averageReadiness`'s empty-input return) and 0 on consistency. Both are acknowledged residual gaps, deliberately out of this sprint's scope, and neither is claimed as met by this invariant.
- **Exception process:** None without an ADR update.
