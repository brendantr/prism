# Closure inventory — pre-feature readiness audit

- **Date:** 2026-07-31
- **Branch this audit was performed on:** `rls-policy-verification` (current branch at audit time; contains
  the RLS verification work, not yet merged to `main`)
- **Purpose:** Mandatory first-phase audit per the pre-feature-readiness mission. Inventories every
  actionable follow-up, caveat, deferred verification, recommendation, blocker, or open question found
  in the repository's documentation and code, before any implementation closure work begins.
- **Method:** Read `CLAUDE.md`, `README.md`, `Docs/architecture.md`, `Docs/invariants.md`,
  `Docs/agents.md`, all three ADRs, the research protocol and note, all eleven sprint records in
  `Docs/sprints/`, `.github/workflows/ci.yml`, `package.json`. Cross-checked sprint claims against
  `git log`, `gh pr list`, `gh pr view` (bodies/file lists), current `git status`/`git diff --stat`
  against `main`. Re-ran `npm run typecheck`, `npm test -- --ci`, `npx expo-doctor`, `npm audit`, and
  targeted `grep`s against current source to confirm or refute each documented claim against present
  code, not against what the docs say happened.
- **Labelling:** Per `Docs/invariants.md` I-15 — **Fact** (verified this session), **Carried fact**
  (verified by a prior sprint, not independently re-verified here), **Assumption**, **Open
  question/owner decision**.

---

## Fresh validation evidence (this session, 2026-07-31)

| Command | Result |
|---|---|
| `node --version` | `v26.0.0` |
| `npm run typecheck` (`tsc --noEmit`) | **Pass**, zero output |
| `npm test -- --ci` (`jest --ci`) | **Pass** — 103/103 tests, 9 suites |
| `npx expo-doctor` | **19/20** — one failing check: 7 packages have patch-version drift from what the installed Expo SDK expects (`expo`, `expo-asset`, `expo-constants`, `expo-router`, `expo-system-ui`, `react-native`, `jest-expo`). This is a **new finding**, not previously documented — `Docs/architecture.md` recorded 20/20 at the time it was written. |
| `npm audit` | **12 vulnerabilities** (11 moderate, 1 high) — down from the 36 (11 moderate, 25 high) recorded in `2026-07-29-security-foundation.md`, but still nonzero and still untriaged. All trace to `@expo/config`/`@expo/config-plugins` transitive dependencies. |
| `git status --short --branch` | Clean, on `rls-policy-verification` |
| `git diff main --stat` | 7 files changed, `+1446/−1` — the RLS verification test suite + `Docs/invariants.md` I-1 update + sprint doc, all uncommitted-to-`main` (branch not yet merged, no PR opened per its own record) |
| `gh pr list --state all` | 14 PRs, **all MERGED**. This resolves an open question in `2026-07-31-android-themed-icon-monochrome-layer.md` ("disposition of the unmerged `brand-app-icon-android-verification` branch") — PR #13 covering that branch's docs was in fact merged, and PR #14 (the monochrome-layer work) was also merged, **despite its own PR body's test-plan checkbox for on-device re-verification being left unchecked**. |

---

## Inventory

Each item: **Source** · **What remains** · **Category** · **Actionable here?** · **Proposed resolution** · **Verification needed to close**.

### A — Hard gates (block "ready for real user data" / block store release)

**A1. `supabase/migrations/0001_init.sql` cannot apply to any Postgres instance.**
- **Source:** `Docs/invariants.md` I-1; `Docs/sprints/2026-07-31-rls-policy-verification.md` Phase 1 & 2.
- **What remains:** `check_ins_one_per_day` index expression casts `checked_in_at::date`, which Postgres
  classifies `STABLE` not `IMMUTABLE`, aborting the migration at line 209 before any table past
  `personal_records` or any RLS policy is created. Confirmed on both a local Postgres instance and a real
  hosted Supabase project — identical failure, identical line, both Postgres versions. A one-line fix
  (`timezone('utc', checked_in_at)::date`) was tested against a **scratch, unapplied copy** in both
  environments and unblocks the migration; with it, all 57 cross-tenant isolation assertions pass, twice
  (114/114 total).
- **Category:** Code (SQL) / infrastructure.
- **Actionable here:** Partially. Editing `supabase/migrations/0001_init.sql` is a database migration
  change — `CLAUDE.md` explicitly gates this behind engineer/owner approval before writing. The fix
  itself is fully specified and tested; only the approval to apply it to the committed file is missing.
- **Proposed resolution:** Apply the one-line fix to `supabase/migrations/0001_init.sql` (an already-tested
  change, not new SQL), then re-run `supabase/tests/rls/run.sh` against the corrected file (not a scratch
  copy) in at least one real environment, and update `Docs/invariants.md` I-1's status accordingly.
- **Verification needed to close:** `supabase/tests/rls/run.sh` passing against the actual corrected
  `0001_init.sql`. **Owner approval required before editing the migration file** — this is the single
  highest-priority open item in the repository.

**A2. Migration `0002_security_hardening.sql` is written but has never executed.**
- **Source:** `Docs/sprints/2026-07-30-security-backend-foundation.md` SB-3.
- **What remains:** Bounds `display_name`, closes the exercise-FK-bypasses-RLS path. Identifier-cross-checked
  against `0001` but never run against a live database; the four behavioral checks it names (long-name
  truncation, cross-tenant FK block/unblock, normal logging still works) have never been executed.
- **Category:** Code (SQL) / infrastructure.
- **Actionable here:** Yes, now that Postgres tooling is available locally (this session confirmed Homebrew
  `postgresql@16` was already installed for the RLS sprint). Applying an already-reviewed, unmodified
  migration to a disposable local database for verification is execution, not a policy edit — the same
  reasoning the RLS sprint used for `0001`.
- **Proposed resolution:** Apply `0001` (with A1's fix) + `0002` together against a disposable local
  Postgres instance and run the four SB-3 behavioral checks.
- **Verification needed to close:** The four checks' pass/fail, recorded with evidence.

**A3. `SupabaseRepository.saveWorkout` is non-atomic (three sequential upserts).**
- **Source:** `Docs/architecture.md` G-2; `Docs/invariants.md` I-2.
- **What remains:** A failure mid-save can leave a workout with missing exercises/sets. Confirmed as an
  unfixed, real gap by every sprint that has touched this area since (`ui-ux-product-polish` narrowed the
  *client-side* blast radius by not discarding local state on failure, but the *server-side* gap is
  untouched).
- **Category:** Code.
- **Actionable here:** Yes — this is application code, not a migration, and does not require the
  CLAUDE.md database-change approval gate in the same way (though a Postgres RPC/function to wrap the
  write would itself be a migration and would need approval). A pure-client reconciliation/retry approach
  would not.
- **Proposed resolution:** Needs an explicit design decision (Postgres RPC/transaction vs. client-side
  reconciliation) before implementation — this is exactly the kind of thing that deserves its own scoped
  sprint, not a drive-by fix.
- **Verification needed to close:** A test that simulates a mid-sequence failure and asserts no partial,
  undetected write survives.

**A4. No authentication UI exists anywhere in the app.**
- **Source:** `Docs/architecture.md` G-1; every UI sprint since.
- **What remains:** `app/onboarding/auth.tsx` is presentation-only by design (explicitly out of scope in
  `2026-07-29-ui-ux-foundation.md`); wiring it to real Supabase auth is explicitly gated behind RLS being
  verified (I-1, I-6) — i.e., behind A1.
- **Category:** Code / product decision.
- **Actionable here:** No, not yet — correctly sequenced behind A1. Building real auth now would violate
  the repo's own documented ordering and CLAUDE.md's approval gate for auth changes.
- **Proposed resolution:** Do not implement until A1 is closed and the engineer/owner explicitly scopes an
  auth-implementation sprint.
- **Verification needed to close:** N/A until scoped.

**A5. Account deletion and data export do not exist.**
- **Source:** `Docs/invariants.md` I-10 (hard blocker for store submission).
- **What remains:** Not implemented anywhere; schema's `on delete cascade` makes it straightforward once
  auth exists, but nothing is built.
- **Category:** Code / product decision.
- **Actionable here:** No — sequenced behind auth (A4), itself behind A1. Not a near-term store-submission
  concern since the app has no path to production users yet.
- **Proposed resolution:** Defer; revisit once auth is scoped.
- **Verification needed to close:** N/A until scoped.

### B — Verification gaps (claims made, not fully confirmed)

**B1. Android "Themed Icons" ring fix is unverified on-device — and was merged anyway.**
- **Source:** `Docs/sprints/2026-07-31-android-themed-icon-monochrome-layer.md`; PR #14 (merged
  2026-07-31T07:08:20Z with its own re-verification checkbox unchecked).
- **What remains:** A `<monochrome>` adaptive-icon layer was added and is confirmed present in generated
  native XML (build-output-level evidence). The actual on-device fix for the `#B0D9FF` ring was
  **inconclusive**: the ring was still observed after the fix across three test conditions on the
  `Pixel_7_API_34` (`google_apis`, non-Play-Store) AVD, and the interactive Themed-Icons toggle could not
  be exercised due to ANRs attributed to host resource contention. The sprint's own recommendation was to
  re-test on a `google_apis_playstore` AVD or a real device before treating the ring as fixed — this was
  not done before merge.
- **Category:** Device verification.
- **Actionable here:** Partially. This session confirmed: `avdmanager`, `emulator`, `adb` binaries exist
  under `/opt/homebrew/share/android-commandlinetools/` (not on `PATH` by default); only the
  `google_apis` (non-Play-Store) system image is installed locally — no `google_apis_playstore` image is
  present, and downloading one requires `sdkmanager` network access (~1 GB+) and would be a new local
  system image, similar in kind to the one installed in the `brand-app-icon-android-verification` sprint.
- **Proposed resolution:** Download the `google_apis_playstore` system image for API 34/35, create a new
  AVD from it, and re-run the Task 4 verification (Themed Icons on/off, screenshots + pixel samples).
- **Verification needed to close:** On-device screenshot + pixel sample showing the ring is gone with
  Themed Icons on, and the icon is unchanged with it off.

**B2. Four of seven screens' error/empty states were never individually photographed.**
- **Source:** `Docs/sprints/2026-07-30-ui-ux-product-polish.md`, "Still not covered."
- **What remains:** Plans, Social, Progress, and Body were wired onto the shared `ScreenState` primitive
  identically to Today/Exercises/Insights (which *were* photographed), and typecheck covers the wiring,
  but no screenshot exists for these four in their loading/error states. Insights' genuine empty state
  (loaded, nothing to derive) is unreachable from the demo seed and was never observed either.
- **Category:** Device verification.
- **Actionable here:** Yes — same simulator technique already documented in the README and prior sprints
  (`npx expo start`, no `--dev-client`; force a load/save failure via a temporary throw, screenshot, revert).
- **Proposed resolution:** A short verification-only sprint: force the same load/error injection used in
  `ui-ux-product-polish`, screenshot Plans/Social/Progress/Body in loading + error state, and construct a
  profile with no history to reach Insights' genuine empty state.
- **Verification needed to close:** Screenshots for all four remaining screens' error states + Insights'
  empty state.

**B3. `SEC-1`'s Keychain read/write path has never been exercised at runtime.**
- **Source:** `Docs/sprints/2026-07-29-security-foundation.md`, follow-up 3a.
- **What remains:** Covered by 6 unit tests and confirmed to link/load on device, but no real session has
  ever been written to it, because no auth flow exists (blocked behind A4/A1).
- **Category:** Device verification / externally blocked.
- **Actionable here:** No — correctly sequenced behind auth.
- **Proposed resolution:** Close automatically once A4 ships and a first real sign-in occurs.
- **Verification needed to close:** N/A until auth exists.

**B4. Narrow-device and large-accessibility-text-size rendering never checked.**
- **Source:** `Docs/sprints/2026-07-29-ui-ux-foundation-expansion.md`, follow-up 5 remainder;
  `2026-07-29-ui-ux-foundation-verification.md`, "Still simulator-only."
- **What remains:** All UI verification to date is a single device (iPhone 17 Pro, 402×874pt) at default
  text size. iPhone SE-class widths and large Dynamic Type sizes (up to the app's own 1.6× cap) are
  unverified.
- **Category:** Device verification.
- **Actionable here:** Yes — a simulator device-size swap and an accessibility text-size setting are both
  free, local operations.
- **Proposed resolution:** A short verification pass: boot an iPhone SE-class simulator and an
  accessibility-large-text configuration, screenshot the five-tab bar and a text-dense screen (Exercises)
  in each.
- **Verification needed to close:** Screenshots showing no label truncation/clipping at both extremes.

**B5. Product originality is a stated position, never independently audited against any reference product.**
- **Source:** `Docs/architecture.md`; every UI sprint repeats this caveat.
- **What remains:** No comparison against Liftly or any other product has ever been run.
- **Category:** Docs / product decision.
- **Actionable here:** Ambiguous — `ADR-0003` explicitly restricts reference research to protected,
  documented sessions with sanitized-notes-only output; an open-ended "audit for originality" is exactly
  the kind of activity that risks crossing from research into reproduction if done casually.
- **Proposed resolution:** Not proposed as new work in this closure pass — flag as an accepted, standing
  limitation (the stated position is not verified, and does not need to be to reach a trustworthy
  baseline) rather than manufacture a comparison exercise outside this mission's scope.
- **Verification needed to close:** N/A — accepted limitation.

### C — Product/architecture decisions needed (engineer/owner only)

**C1. `CheckIn.note` has no UI — persisted-but-unreachable field.**
- **Source:** `Docs/sprints/2026-07-29-ui-ux-foundation-verification.md`, follow-up 12.
- **What remains:** The domain model and repository round-trip `note`, but `CheckInPrompt.tsx` never
  renders an input for it. Confirmed still true this session (`grep` shows the same single round-trip
  line, no input).
- **Category:** Product decision.
- **Actionable here:** No — the prior sprint explicitly declined to decide this unilaterally ("not decided
  here; this is a question for the engineer/owner").
- **Proposed resolution:** Ask: wire a note field into `CheckInPrompt`, or remove the unused field from
  `CheckIn` and its save path.
- **Verification needed to close:** Depends on the decision.

**C2. `src/components/ui/Stepper.tsx` is dead code — zero callers.**
- **Source:** `Docs/sprints/2026-07-29-ui-ux-foundation-verification.md`, follow-up 13.
- **What remains:** Confirmed still zero JSX callers this session (`grep -rn "<Stepper"` — no matches;
  only the export and its own definition reference it). `SetRow.tsx`'s weight/reps are a separate,
  deliberately tap-only `ValueCell`.
- **Category:** Code hygiene / product decision.
- **Actionable here:** No — same "not decided here" note as C1.
- **Proposed resolution:** Ask: delete it, or adopt it somewhere a typed numeric entry is actually wanted
  (it has its own touch-capture bug, drafted-and-reverted in that sprint, that would need re-fixing first).
- **Verification needed to close:** Depends on the decision.

**C3. Is Social a real product differentiator, or a navigation-stability placeholder?**
- **Source:** `Docs/research/R-001-primary-surface-information-architecture.md` open question 1;
  `Docs/sprints/2026-07-29-ui-ux-foundation-expansion.md` follow-up 1.
- **What remains:** ADR-0001 names readiness-aware progression, not community, as the v1 differentiator.
  The Social tab exists only because retrofitting a nav slot later is expensive, per the research note.
- **Category:** Product decision.
- **Actionable here:** No.
- **Proposed resolution:** Ask, but not urgent to closure — the tab is already honest (explicit "nothing
  is live" notice, no fabricated content), so this is a strategy question, not an integrity gap.
- **Verification needed to close:** N/A — decision, not a defect.

**C4. Does the Phase 2–5 roadmap in `README.md` still reflect the approved product direction?**
- **Source:** `Docs/decisions/ADR-0001-product-position.md` open question; repeated in the
  `product-intent-and-guardrails` sprint's exit criteria; never picked up by any subsequent sprint.
- **What remains:** ADR-0001 established readiness-aware progression as the v1 differentiator on
  2026-07-27. The README's "Phased plan" (Progress charts → Body map → Insights engine → Plans editor →
  Onboarding/auth/Settings) has never been explicitly reconciled against that decision.
- **Category:** Product decision.
- **Actionable here:** No — this is squarely a product-direction call.
- **Proposed resolution:** Ask as part of the "next product-planning session" handoff, not as closure work
  itself — reconciling a roadmap **is** the beginning of new product/UI-UX ideation the mission says not
  to start yet.
- **Verification needed to close:** N/A — decision.

**C5. Should Insights absorb Progress and Body as sections, or stay separate?**
- **Source:** `Docs/research/R-001` open question 2; `2026-07-29-ui-ux-foundation-expansion.md`
  follow-up 2.
- **Category:** Product decision.
- **Actionable here:** No.
- **Proposed resolution:** Same as C4 — hand off to product-planning, do not decide here.

**C6. Per-exercise detail screen — build now, or wait for Progress to grow one first?**
- **Source:** `Docs/research/R-001` open question 3; `2026-07-29-ui-ux-foundation-expansion.md`
  follow-up 3.
- **Category:** Product decision.
- **Actionable here:** No.
- **Proposed resolution:** Same as C4/C5.

**C7. Onboarding selections are never applied to `Profile`.**
- **Source:** `Docs/sprints/2026-07-29-ui-ux-foundation.md`, follow-up 1.
- **What remains:** `onboardingStore` persists locally only; `trainingStore.updateProfile` is never
  called from onboarding, confirmed still true this session. Includes an unresolved question about what
  happens to demo-seed data if `trainingDaysPerWeek` changes, since it feeds the readiness consistency
  factor.
- **Category:** Code / product decision (the seed-interaction question needs a design answer first).
- **Actionable here:** No — needs the design answer before safe implementation.
- **Proposed resolution:** Ask; flag as accepted limitation until scoped.

**C8. Should `docs/product-intent-and-guardrails`-era open items (RIR, success metric,
suggestion-audit persistence location) be picked up now?**
- **Source:** `ADR-0001`, `ADR-0002` open questions.
- **What remains:** RIR explicitly deferred pending a future ADR; success metric explicitly deferred;
  audit-persistence location explicitly sequenced after auth/RLS (behind A1/A4).
- **Category:** Product decision / correctly sequenced.
- **Actionable here:** No — every one of these is already correctly marked "deferred," not "forgotten."
- **Proposed resolution:** None needed for closure — these are honestly-labelled future work, not
  ambiguous gaps.

### D — Dependency / environment hygiene

**D1. `npm audit`: 12 vulnerabilities (11 moderate, 1 high), all in Expo config-plugin transitives.**
- **Source:** This session's fresh `npm audit` run; carried forward from
  `2026-07-29-security-foundation.md` follow-up 6 (which recorded 36 at the time).
- **Category:** Dependency upgrade.
- **Actionable here:** No — `CLAUDE.md` explicitly gates dependency upgrades behind engineer/owner
  approval.
- **Proposed resolution:** Ask before running `npm audit fix` / `expo install --fix`.
- **Verification needed to close:** `npm audit` clean (or residual risk explicitly accepted), typecheck
  and full test suite green after.

**D2. `expo-doctor`: 7 packages have patch-version drift from the installed Expo SDK's expectations.**
- **Source:** This session's fresh `npx expo-doctor` run — **new finding**, not in any existing doc.
  `Docs/architecture.md` recorded 20/20 passing at the time it was written; that is now stale.
- **Category:** Dependency upgrade.
- **Actionable here:** No — same gate as D1. `npx expo install --fix` (the README's own documented remedy
  for exactly this situation) would resolve it, but is a dependency change.
- **Proposed resolution:** Ask before running `expo install --fix`.
- **Verification needed to close:** `expo-doctor` 20/20, typecheck/test/export green after.

**D3. Unused declared dependencies: `react-hook-form`, `zod`, `@hookform/resolvers`.**
- **Source:** `Docs/architecture.md` G-6.
- **What remains:** Confirmed still zero imports anywhere in `app/`/`src/` this session. No form work has
  since claimed them (the auth screen and check-in form both use hand-rolled validation, not these
  libraries).
- **Category:** Dependency hygiene / product decision.
- **Actionable here:** Partially — removing an unused dependency is a `package.json` change; `CLAUDE.md`'s
  gate is written around *upgrades*, and this is a *removal*, but it is the same class of change and
  should get the same explicit approval given package-lock.json churn it would cause.
- **Proposed resolution:** Ask whether these were meant for unbuilt onboarding/settings form work (keep)
  or are dead weight (remove).
- **Verification needed to close:** Depends on the decision; if removed, `npm ci` + full validation after.

### E — Documentation accuracy (actionable now, no approval needed)

**E1. `Docs/architecture.md` is stale on multiple counted facts.**
- **Source:** Direct comparison, this session.
- **What remains:** Test count says "40/40" (now 103/9); no mention of the RLS verification, both
  security sprints, the UI restructure (5-tab bar, Exercises/Social/Insights layering), the onboarding
  flow, the brand/app-icon asset pipeline (`assets/brand/`, `scripts/generate-app-icons.sh`), or the
  Android monochrome-icon work. G-3 (RLS unexercised) is now substantively addressed differently than
  the gap describes (policies proven correct, but the migration that creates them doesn't run — a more
  specific finding). G-5 (screens don't branch on error status) is resolved by `ScreenState`. G-8
  (`maxFontSizeMultiplier` claim) is now **confirmed true** in code (`Text.tsx:41`, plus three other
  components) — the discrepancy the document flagged no longer exists.
- **Category:** Docs.
- **Actionable here:** Yes, fully — this is a read-only-to-code, write-to-docs reconciliation.
- **Proposed resolution:** Rewrite `Docs/architecture.md`'s Executive Summary, Known Gaps table, and
  Quality/Operational Readiness section against current, freshly-verified evidence.
- **Verification needed to close:** Every updated claim backed by a command run or file read in this
  session.

**E2. Unmerged-branch open questions are stale — everything is actually merged.**
- **Source:** `2026-07-31-android-themed-icon-monochrome-layer.md` open question 2;
  `2026-07-31-brand-app-icon-android-verification.md` (implicitly, via the predecessor chain).
- **What remains:** Both records ask what to do about branches that, per `gh pr list`, are now merged
  (PR #13, PR #14). The question is answered by fact, not by a new decision.
- **Category:** Docs.
- **Actionable here:** Yes.
- **Proposed resolution:** Note the resolution in this inventory (done, above) and in the final readiness
  report; no further action needed.

**E3. `2026-07-27-readiness-inputs-and-confidence-foundation.md` is a planning-only record; its
implementation shipped separately (PR #4) with no corresponding sprint record of its own.**
- **Source:** `gh pr view 4` — title "feat(readiness): add check-ins and honest confidence", merged
  2026-07-29T08:14:02Z, on branch `readiness-inputs-and-confidence-foundation-impl`. No file
  `Docs/sprints/2026-07-29-readiness-inputs-and-confidence-foundation-impl.md` (or similar) exists.
- **What remains:** `Docs/invariants.md` I-7/I-18 cite this work directly and are internally consistent
  with what shipped (confirmed against PR #4's file list and description), so the *decisions* are
  documented — but there is no dedicated sprint record for the implementation itself, breaking the "every
  sprint has exactly one record" rule in `Docs/agents.md`.
- **Category:** Docs / process gap.
- **Actionable here:** Yes — a backfilled record, same pattern already used for `brand-app-icon`.
- **Proposed resolution:** Write a backfilled sprint record for the `readiness-inputs-and-confidence-foundation-impl`
  work, labelled retroactive per the `brand-app-icon` precedent.
- **Verification needed to close:** Record exists, cites PR #4's actual diff/validation.

**E4. `Docs/decisions/ADR-0002` open question — was the existing readiness/load-recommendation code
formally re-audited for compliance after PR #4 changed `readiness.ts`?**
- **Source:** `ADR-0002` "Consequences": "The existing readiness/load-recommendation code must be
  explicitly audited (not assumed) for compliance before being reused, extended, or exposed..."
- **What remains:** The 2026-07-27 reconciliation review audited the *pre-PR#4* code. PR #4
  substantially changed `readiness.ts` (136 additions/28 deletions) to add the confidence-state
  behavior the review called for, and 11 new tests were added — but no document explicitly re-states
  "audited against ADR-0002, dimension by dimension" for the code as it exists today.
  `Docs/invariants.md` I-18 documents the outcome in detail and I-17 documents that the dismissal
  control (Phase B) is still missing — so the substance is tracked, just not framed as a formal
  re-audit checklist.
- **Category:** Docs.
- **Actionable here:** Yes, as a documentation task — no code change implied.
- **Proposed resolution:** Not necessary as new work: I-7, I-12, I-16, I-17, I-18 already give an
  accurate, evidence-based compliance picture piece by piece. Formalizing that into a single
  "ADR-0002 compliance checklist" document would be nice-to-have, not a gap that blocks readiness.
  Flag as accepted, not actioned.

### F — Externally blocked (hardware/credentials/infra not available here)

**F1. iOS native build/launch on a real device or fresh simulator — not re-verified in this closure
pass.**
- **Category:** Device verification.
- **Actionable here:** Partially — a simulator is available and the README documents the exact working
  sequence; a **real device** is not confirmed available in this environment.
- **Proposed resolution:** Re-run the existing documented simulator sequence as part of closure sprints
  that touch UI (B2, B4); explicitly accept real-device verification as out of scope unless hardware is
  provided.

**F2. `prism-rls-verification` hosted Supabase project is live and billed, disposition undecided.**
- **Source:** `Docs/sprints/2026-07-31-rls-policy-verification.md` Phase 2, open question 1.
- **What remains:** A real, dedicated Supabase project (org `dokonveymdzabfxzhwjf`, ref
  `gyxcjmitzktffyuroucz`) was created for RLS testing, contains only synthetic data, and is still live.
- **Category:** Infrastructure / cost.
- **Actionable here:** No — deleting or keeping a billed cloud resource is exactly the kind of
  cloud-resource change `CLAUDE.md` gates behind explicit approval, and it costs the owner money either
  way.
- **Proposed resolution:** Ask: keep for future re-verification/CI, or delete now that A1's fix has been
  validated against it once already.
- **Verification needed to close:** N/A — decision.

**F3. `android-commandlinetools`/AVD Themed-Icons re-verification (B1) needs a new system image
download.**
- Cross-referenced with B1 above; listed here because the blocker is environment setup (network +
  storage for a new system image), not decision-making. Actionable if approved.

---

## Summary counts

| Category | Count | Actionable now | Needs owner decision/approval | Externally blocked |
|---|---|---|---|---|
| A — Hard gates | 5 | 2 (A2, A3 partially) | 3 | 0 |
| B — Verification gaps | 5 | 3 (B1 partial, B2, B4) | 0 | 2 (B1 image download, B3) |
| C — Product decisions | 8 | 0 | 8 | 0 |
| D — Dependency hygiene | 3 | 0 | 3 | 0 |
| E — Docs accuracy | 4 | 4 | 0 | 0 |
| F — Externally blocked | 3 | 0 | 1 (F2) | 2 |

**Immediately actionable without further approval:** E1–E4 (documentation reconciliation), A2 (apply and
test migration `0002` locally, no repo edit), B2/B4 (simulator screenshot verification), F1 (simulator
re-run as part of B2/B4).

**Requires an explicit owner decision before proceeding:** A1 (the RLS migration fix — highest priority),
A3's design approach, C1–C8, D1–D3, F2, and B1's system-image download (time/resource cost).
