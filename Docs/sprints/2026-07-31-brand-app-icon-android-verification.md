# Sprint: brand-app-icon-android-verification

- **Status:** In progress. Record opened before any emulator or build work, per `Docs/agents.md`
  preflight.
- **Date:** 2026-07-31
- **Branch:** `brand-app-icon-android-verification`
- **Type:** Verification only. Android emulator configuration and visual observation.
- **Predecessor:** [`2026-07-30-brand-app-icon.md`](2026-07-30-brand-app-icon.md) (PR #12, docs
  backfilled in PR #13). That record explicitly deferred Android rendering and recommended checking
  now rather than at first internal-track release — this sprint is that check.

## Goal

Close the one gap the predecessor record named as its most important limitation: **nobody has seen
the Android adaptive icon or splash actually render.** Everything claimed for Android in the
predecessor record was file-level and XML-level evidence — generated resource presence, correct
references, correct hex values — never an observed screen. This sprint replaces "arithmetic against
Google's ~66% safe zone" with an actual look at the result.

Two specific claims from the predecessor record are on trial here, restated so there is no ambiguity
about what "confirmed" or "contradicted" will mean at handoff:

1. **`ANDROID_SCALE=0.62`** (`scripts/generate-app-icons.sh`) keeps the shield mark fully inside
   Android's guaranteed-visible ~66% safe zone, so the adaptive icon shows the complete shield with no
   clipping at any launcher mask shape (circle, squircle, rounded square).
2. **`adaptiveIcon.backgroundColor = #07070B`** is safe to leave unchanged because the foreground
   (`assets/brand/adaptive-icon.png`) is fully opaque and covers the background layer completely, so
   the background colour is never actually visible in the rendered icon.

## Scope

**In scope:**
- Configuring a local Android emulator (AVD) if none exists.
- Building and running the app on that emulator via `npx expo run:android`.
- Capturing the launcher home screen (adaptive icon, actual rendered size) and a cold-start splash
  screenshot.
- Comparing what is observed against the two claims above and against the predecessor record's other
  Android-related statements.
- Writing up the result in this document and at handoff.

**Explicitly out of scope, per the task instructions and `CLAUDE.md` scope discipline:**
- **No changes to `scripts/generate-app-icons.sh`, `scripts/alpha-key.py`, `app.json`, or any file
  under `assets/brand/`.** This sprint observes; it does not fix.
- **No native project regeneration beyond what `expo run:android` itself performs** to produce a
  runnable build — `android/` is already gitignored and rebuilt from `app.json` + `assets/brand/` on
  every prebuild, so running it is not a scope violation, but no hand-edit to generated native files
  is in scope.
- **No dependency changes.**
- **If verification finds clipping or any visual defect:** stop immediately, do not patch anything,
  and report it as a finding at handoff instead. Per `CLAUDE.md`, native project changes and
  config/dependency changes both require explicit engineer/owner approval before being made, and a
  defect found here does not carry pre-approval to fix it in the same sprint.
- Emulator/AVD configuration itself is local developer-machine setup, not a repository change, and is
  not expected to produce any diff — this is flagged in case that assumption turns out to be wrong.

## Tasks and success criteria

1. **Configure a local Android emulator.** Success: an AVD exists and boots (Pixel 7 / API 34 or
   latest stable available, per the task's own recommendation). If Android Studio / `avdmanager` /
   the Android SDK are not installed on this machine, that is itself the finding to report — not
   something to install without confirming it is wanted, since it is a nontrivial local environment
   change.
2. **Build and run.** `npx expo run:android` succeeds and the app launches on the emulator.
3. **Capture the launcher home screen.** A screenshot showing the adaptive icon at actual rendered
   size, specifically examined for clipping at the safe-zone boundary.
4. **Capture a cold-start splash screenshot.** The shield mark's visibility, centring, and any
   clipping against `splashscreen_background #07070B` are checked.
5. **Compare against the predecessor record's claims.** Each of the two claims above is marked
   **CONFIRMED** or **CONTRADICTED** based on what was actually seen, not inferred.

## Labelling discipline (`I-15`)

Findings in this document and at handoff are marked as:
- **Fact** — directly observed (a screenshot, a command's actual output).
- **Decision** — a choice made during this sprint (e.g., which AVD profile), with rationale.
- **Assumption** — anything not directly checked.
- **Open question** — anything left for the engineer/owner.

## Progress log

- **2026-07-31, 00:03 local** — Branch created off `main` (post-PR #13, commit `8bfa55e`). This record
  opened before any environment inspection, emulator configuration, or build command.
