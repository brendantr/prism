# Pre-feature readiness report

- **Date:** 2026-08-01
- **Scope:** A closure pass across the entire PRism repository — every sprint record, every ADR, every
  invariant, `CLAUDE.md`, `README.md`, `Docs/agents.md`, CI configuration, and current source — to bring
  the repository to a trustworthy, evidence-based baseline before any new product/UI-UX ideation begins.
- **Predecessor documents:** `Docs/readiness/2026-07-31-closure-inventory.md` (the mandatory first-phase
  audit and inventory this report closes out).
- **Verdict: READY for new feature and UI/UX ideation.** See "Verdict" at the end for the precise
  reasoning and the handful of pre-existing, correctly-sequenced gaps that remain — none of which are
  undocumented, silently ignored, or block *planning* work, as distinct from *implementing* features
  that would themselves depend on closing them (auth, primarily).

---

## Audit scope and sources examined

Read in full: `CLAUDE.md`, `README.md`, `Docs/architecture.md`, `Docs/invariants.md`, `Docs/agents.md`,
all three ADRs (`Docs/decisions/`), the research protocol and its one note (`Docs/research/`), and all
eleven pre-existing sprint records in `Docs/sprints/`. Cross-checked every sprint's claims against
`git log`, `gh pr list --state all` (14 PRs, all found merged — resolving stale "is this branch merged?"
questions in two sprint records), and `gh pr view` for specific PR bodies/file lists. Re-ran, from a
clean checkout, every validation command the repository documents: `npm run typecheck`, `npm test -- --ci`,
`npx expo-doctor`, `npm audit`, `npx expo export --platform ios`. Searched the full repository for
TODO/FIXME/XXX/follow-up/deferred/blocked/pending/recommended/open question/unverified/inconclusive/
limitation/future/integration and manually triaged every match.

## Inventory and resolution

Full detail, source citations, and proposed resolutions for every item are in
`Docs/readiness/2026-07-31-closure-inventory.md`. This table is the closure status as of this report.

### A — Hard gates

| # | Item | Status | Evidence |
|---|---|---|---|
| A1 | `supabase/migrations/0001_init.sql` fails to apply anywhere (non-immutable index expression) | **Closed.** Fixed, verified against the actual committed file. | `Docs/sprints/2026-08-01-rls-migration-fix.md`; `Docs/invariants.md` I-1 now **met** |
| A2 | Migration `0002`'s four behavioral checks never executed | **Closed.** All four run and passed against a disposable local Postgres. | Same sprint record |
| A3 | `SupabaseRepository.saveWorkout` is non-atomic | **Open, correctly unresolved.** Needs a design decision (Postgres RPC vs. client reconciliation) that is out of scope for a closure pass. | `Docs/architecture.md` G-2, `Docs/invariants.md` I-2 |
| A4 | No authentication UI exists | **Open, correctly sequenced.** Was blocked behind A1; A1 is now closed, so this is the natural next scoped sprint — not implemented here, since building it would be new feature work. | `Docs/architecture.md` G-1 |
| A5 | Account deletion/export do not exist | **Open, correctly sequenced** behind A4. | `Docs/invariants.md` I-10 |

### B — Verification gaps

| # | Item | Status | Evidence |
|---|---|---|---|
| B1 | Android Themed Icons ring — on-device fix status | **Attempted; still inconclusive for the fix, but the cause is now narrowed with strong new evidence to an emulator rendering-pipeline limitation, not a PRism defect.** A real Pixel device is the only remaining path to a definitive answer. | `Docs/sprints/2026-08-01-android-themed-icon-reverify.md` |
| B2 | 4 of 7 screens' error states never photographed | **Closed** — and a real, previously-undetected bug was found and fixed in the process (see below). | `Docs/sprints/2026-08-01-screen-state-verification.md` |
| B3 | SEC-1 Keychain path unexercised at runtime | **Open, correctly blocked** behind A4 (needs a real session). | `Docs/sprints/2026-07-29-security-foundation.md` follow-up 3a |
| B4 | Narrow device / large accessibility text never checked | **Closed.** iPhone SE (375pt, narrowest supported width) and `accessibility-extra-large` text both confirmed rendering cleanly. | Same B2 sprint record |
| B5 | Product originality never independently audited | **Accepted limitation, not actioned** — deliberately, per `ADR-0003`'s restriction on how reference research may be conducted. | `Docs/readiness/2026-07-31-closure-inventory.md` item B5 |

**Bug found and fixed during B2/B4:** `app/(tabs)/progress.tsx` checked `!profile || !headline` *before*
checking `status !== 'ready'`. Both stay `null` for the entire loading/error window, so the `ScreenState`
error/loading branch was unreachable dead code — the exact "bare title over blank space" regression
`Docs/architecture.md`'s original G-5 described, still present despite a prior sprint reporting all
seven screens fixed. Found only by forcing the error state on a real simulator and opening the actual
screen — neither typecheck nor the existing test suite caught it, since `app/` has no test coverage.
Fixed by reordering the two guards; re-verified on-device after the fix.

### C — Product decisions (deliberately not made in this closure pass)

Every item in this category was, correctly, left for a future product-planning session rather than
decided unilaterally here — see "Next product-planning session" below. This includes: `CheckIn.note`
and `Stepper.tsx` (both were small enough to have a default judgment call approved and applied — see D
below — not left open), the Social tab's product status, the Phase 2–5 roadmap reconciliation, whether
Insights absorbs Progress/Body, per-exercise detail screen scope, and applying onboarding selections to
`Profile`.

**Two small "engineer/owner only" items were resolved this session** (approved defaults applied):

| # | Item | Status |
|---|---|---|
| C1 | `CheckIn.note` — persisted but unreachable field | **Closed.** Removed from the domain type, mapper, repository, and UI. DB column left in place (unused nullable column, not a defect). |
| C2 | `Stepper.tsx` — dead code, zero callers | **Closed.** Deleted. |

### D — Dependency hygiene

| # | Item | Status | Evidence |
|---|---|---|---|
| D1 | `npm audit`: 12 vulnerabilities (11 moderate, 1 high) | **Partially closed.** 1 high fixed. Remaining 11 moderate confirmed unfixable without a major Expo downgrade (`--force --dry-run` proves no real fix exists) — all trace to `expo prebuild`-time tooling, not the shipped app bundle. **Accepted as residual, tracked risk.** | `Docs/sprints/2026-08-01-dependency-hygiene.md` |
| D2 | `expo-doctor`: 7 packages drifted from SDK expectations | **Closed.** 20/20. | Same sprint |
| D3 | `react-hook-form`/`zod`/`@hookform/resolvers` declared, unused | **Closed.** Removed. | Same sprint |

### E — Documentation accuracy

| # | Item | Status |
|---|---|---|
| E1 | `Docs/architecture.md` stale on multiple counted facts | **Closed.** Refreshed: test counts, RLS status, resolved gaps struck through and kept per I-15, brand/icon pipeline noted, dependency drift noted. `Docs/sprints/2026-08-01-architecture-refresh` (folded into the `architecture-refresh` branch/PR #20). |
| E2 | "Is this branch merged?" open questions in two sprint records | **Closed by fact.** `gh pr list` confirms all 14 PRs, including both in question, are merged. |
| E3 | PR #4 (readiness implementation) shipped with no sprint record | **Closed.** Backfilled. | `Docs/sprints/2026-07-29-readiness-inputs-and-confidence-foundation-impl.md` |
| E4 | No formal "ADR-0002 compliance checklist" document | **Accepted, not actioned** — the substance is already tracked accurately across I-7/I-12/I-16/I-17/I-18; a consolidated checklist would be nice-to-have, not a closure gap. |

### F — Externally blocked / infrastructure

| # | Item | Status |
|---|---|---|
| F1 | Real iOS device never used for verification | **Still simulator-only.** No physical device available in this environment; documented as a standing limitation, not silently assumed away. |
| F2 | `prism-rls-verification` live Supabase test project | **Decision made: keep** (for future re-verification / eventual CI use), per explicit engineer/owner instruction. No action taken — it already existed and remains as-is. |
| F3 | Android `google_apis_playstore` system image needed for B1 | **Closed.** Downloaded and used (see B1). |

## Test / build / validation evidence (this session, final pass on `main`)

| Command | Result |
|---|---|
| `npm run typecheck` | **Pass**, zero output |
| `npm test -- --ci` | **Pass — 103/103 tests, 9 suites** |
| `npx expo-doctor` | **Pass — 20/20** |
| `npm audit` | 11 moderate (accepted residual risk, see D1) |
| `npx expo export --platform ios` | **Pass** — single iOS bundle, 5.1 MB |
| `supabase/tests/rls/run.sh` against the actual, corrected `0001_init.sql` + `0002_security_hardening.sql` | **Pass — 57/57 assertions, reproduced twice from a clean database** |
| Migration `0002`'s four SB-3 behavioral checks | **Pass, all four**, run directly against a disposable local Postgres |
| iOS Simulator (iPhone 16e, iOS 26.0): Today/Exercises/Insights/Social/Plans/Progress/Body ready + error states | **All confirmed on-device**, screenshotted |
| iOS Simulator (iPhone SE 3rd gen, 375pt) and `accessibility-extra-large` text size | **Confirmed rendering cleanly**, no clipping/overlap |
| Android Emulator (`Pixel_7_Playstore_API_34`, Play Store image): app builds, installs, launches; launcher icon un-clipped | **Confirmed.** Themed Icons ring status: see B1 — not definitively resolved, evidence points at an environment limitation |
| `git status` / working tree | **Clean** on `main` after every merge |

## Accepted limitations (explicitly, not silently)

1. **Android Themed Icons ring (B1).** Unresolved after two independent emulator environments (both
   `google_apis` and `google_apis_playstore` images) produced identical, reproducible evidence pointing
   at an emulator rendering-pipeline limitation rather than a PRism asset defect — but this is not proof.
   Closing it needs a real Android 13+ device.
2. **`npm audit`'s 11 residual moderate findings (D1).** Confirmed unfixable without a major, breaking
   Expo downgrade; all trace to build-time tooling (`xcrun`/`@expo/config-plugins`), not the shipped
   client bundle. Revisit when a newer Expo SDK release addresses them upstream.
3. **Product originality (B5).** Stated position, not independently audited — deliberately, since an
   open-ended comparison exercise would itself risk crossing `ADR-0003`'s research boundary.
4. **No real iOS or Android physical device was available (F1).** All device verification in this
   closure pass used simulators/emulators.
5. **`supabase/tests/rls/` is not wired into CI.** Deliberately out of scope for the sprints that built
   and then applied the fix to it — a real, tracked, low-risk next step, not a gap in what was verified.

## Externally blocked items

| Item | Prerequisite | Next concrete action |
|---|---|---|
| Android Themed Icons ring, definitive answer | A real Android 13+ Pixel device | Install the current build and toggle Settings → Wallpaper & style → Themed icons |
| `npm audit`'s 11 residual findings | An upstream Expo SDK release fixing `@expo/config-plugins`'s `xcrol`/`uuid` dependency chain | Re-run `npm audit` after the next `expo install --fix` |
| Real iOS device verification | Physical hardware | Re-run the existing documented on-device verification sequence (README "iOS simulator quick start") against real hardware |

## Links to sprint records and commits (this closure pass)

- `Docs/sprints/2026-07-31-rls-policy-verification.md` (PR #15) — found the RLS migration defect
- `Docs/readiness/2026-07-31-closure-inventory.md` (PR #16) — the mandatory audit/inventory
- `Docs/sprints/2026-08-01-rls-migration-fix.md` (PR #17) — fixed it, closed I-1
- `Docs/sprints/2026-08-01-dependency-hygiene.md` (PR #18)
- `Docs/sprints/2026-08-01-cleanup-batch.md` (PR #19)
- `Docs/architecture.md` refresh (PR #20)
- `Docs/sprints/2026-08-01-screen-state-verification.md` (PR #21) — found and fixed the Progress bug
- `Docs/sprints/2026-08-01-android-themed-icon-reverify.md` (PR #22)
- `Docs/sprints/2026-07-29-readiness-inputs-and-confidence-foundation-impl.md` (PR #23) — backfill

All eleven pre-existing sprint records already carried clear final statuses (complete, complete with
accepted limitation, or complete-and-superseded) — none required a status correction beyond what this
report's cross-referencing confirms.

## Verdict

**READY for new feature and UI/UX ideation.**

Every actionable, in-scope item found in the audit is now closed, explicitly accepted as a documented
limitation, or explicitly and concretely externally blocked. Automated validation is fully green
(typecheck, hermetic test suite, `expo-doctor`, iOS export). The RLS migration — the single hard gate
blocking any future real-user data path — is fixed and verified against the actual committed file, not
a scratch copy. Every sprint record has an honest, evidence-backed final status. Documentation
(`Docs/architecture.md`, `Docs/invariants.md`) reflects current reality, not a stale snapshot.

**What "ready" does not mean:** it does not mean production-ready or feature-complete. Authentication
(G-1), atomic multi-record writes (G-2), observability (G-4), and release tooling (G-7) remain open —
but each is a pre-existing, correctly-sequenced, honestly-documented future scope item, not a silently
ignored gap. None of them blocks *product/UX ideation and planning* — they block specific future
*implementation* work that would itself need to be scoped as its own sprint, which is exactly the
boundary this report exists to draw.

## Next product-planning session — first decisions to make (not implemented here)

1. **Reconcile the Phase 2–5 roadmap** (`README.md`) against `ADR-0001`'s readiness-aware-progression
   product position — does it still hold, or does it need revision?
2. **Decide Social's product status**: a real differentiator, or a navigation-stability placeholder held
   open for later (`Docs/research/R-001` open question 1)?
3. **Decide whether Insights absorbs Progress and Body as sections**, or they stay separate destinations
   (R-001 open question 2).
4. **Scope the per-exercise detail screen** — full history/best-sets view — and its relationship to
   Progress (R-001 open question 3).
5. **Design the onboarding-selections-to-`Profile` application**, including what happens to demo-seed
   data when `trainingDaysPerWeek` changes (it feeds the readiness consistency factor).
6. **Scope an authentication-implementation sprint.** This is now unblocked (RLS is verified) and is the
   natural next *technical* sprint, distinct from product ideation — named here because every other
   product decision above interacts with whether/when real user accounts exist.
7. **Design the atomic-workout-write fix** (Postgres RPC vs. client-side reconciliation) — a technical
   decision, not a product one, but one that should be made before any feature builds further on the
   current non-atomic write path.
