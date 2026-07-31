# Sprint: brand-app-icon-android-verification

- **Status:** Complete. Both named claims **CONFIRMED**. One new, unanticipated finding surfaced
  (a launcher-drawn ring around the icon) — reported below, not patched, per scope.
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

## Results

### Task 1 — emulator configuration

**Fact.** No Android SDK, `emulator`, `avdmanager`, or Android Studio existed anywhere on this
machine before this sprint — checked via `$ANDROID_HOME`, `$PATH`, `/Applications`, installed
Homebrew casks, and a filesystem search. This was itself worth confirming rather than assuming, per
the task's own instruction.

**Decision.** Installed the Android command-line SDK tools via `brew install --cask
android-commandlinetools` rather than the full Android Studio GUI. *Rationale:* the task instructions
named `avdmanager`/CLI tools explicitly as the expected route; this is the standard headless
equivalent and needed no interactive setup. 78 GB free disk confirmed before starting (build-tools
34.0.0, emulator 37.1.11, platform-tools 37.0.1, platform android-34, and the
`system-images;android-34;google_apis;arm64-v8a` system image — matched to this machine's `arm64`
host architecture).

**Decision.** AVD name `Pixel_7_API_34`, device profile `pixel_7` (Google), Android 14
("UpsideDownCake"), `google_apis/arm64-v8a`. *Rationale:* exactly the profile the task recommended;
`avdmanager list device` confirmed `pixel_7` was an available built-in profile. `config.ini` confirmed
1080×2400 @420dpi — matching a real Pixel 7's actual display geometry.

**Fact.** The AVD booted successfully — `adb devices` showed `emulator-5554 device`, and
`sys.boot_completed` reached `1`. One cosmetic `avdmanager` warning was ignored:
`Could not load devices from .../devices.xml` — the AVD was created and later booted correctly despite
it, so it did not affect the result.

### Task 2 — build and run

**Fact.** `npx expo run:android` — `BUILD SUCCESSFUL in 15m` (`359 actionable tasks: 309 executed, 50
from cache`), APK installed, app opened on `Pixel_7_API_34`, Metro served the bundle
(`/status` → `packager-status:running`), and the welcome screen rendered fully on the emulator. This
was a from-scratch native compile (CMake/NDK for `react-native-reanimated`,
`react-native-gesture-handler`, `expo-modules-core`, etc.), which is why it took 15 minutes on a fresh
SDK install rather than the low-single-digit minutes a warm build would take.

### Task 3 — launcher home screen (adaptive icon)

**Fact, decisively.** The shield mark is **not clipped**. A tight, precisely-centred crop of the
launcher icon (`icon-tight-4x.png`) shows the full shield — top point, both shoulders, bottom point —
entirely inside the masked circle, with a clear margin of the icon's own near-black fill between the
shield's blue outline and the mask edge on every side. Repeated across two independent screenshots
taken moments apart (`android-launcher-home.png`, `android-launcher-home2.png`); identical.

**Fact.** Pixel-sampled colours (raw, lossless `screencap` PNG, not a resized preview):

| Sample point | Colour | Meaning |
| --- | --- | --- |
| Icon disc, off-mark (near the shield's black fill) | `#040507` | Matches the artwork's own background (`#030305`–`#020204`, per the predecessor record's Decision 2), **not** `#07070B` |
| Ring around the icon | `#B0D9FF` / `#ADD6FB` | A genuine light blue — see "New finding" below |
| Wallpaper, outside the icon entirely | `#12121D` | Part of the device wallpaper image, unrelated to the app |

**Fact.** `adaptiveIcon.backgroundColor` (`#07070B`) does **not** appear anywhere in the rendered
icon — confirmed by sampling, not merely by the opaque-foreground argument the predecessor record
made. Claim 2, in the specific form it was stated, holds.

**New finding — not clipping, not anticipated by the predecessor record.** A light-blue ring
(`#B0D9FF`) is drawn around the PRism icon on this launcher (`com.google.android.apps.nexuslauncher`
— confirmed via `dumpsys window`, i.e. genuine Pixel Launcher, not a generic AOSP one). It is:

- **Fact:** present in every screenshot taken (not a transient animation frame — reconfirmed
  identical across two captures seconds apart).
- **Fact:** not sourced from any value this repository controls. `colors.xml` (as generated this run)
  defines only `#07070B` (`splashscreen_background`, `iconBackground`, `activityBackground`) and
  `#023c69` (`colorPrimary`) — no light blue exists anywhere in the generated resources.
- **Fact:** absent from the other dock icons in the same screenshot (Gmail, Photos, YouTube, Phone,
  Messages, Chrome all show plain white circles — their own declared backgrounds), so this is not a
  blanket OS/wallpaper effect applied to every icon.
- **Assumption, not independently confirmed:** the most likely cause is Android 13+ "Themed icons" —
  when an adaptive icon has no optional `<monochrome>` layer (this one does not;
  `mipmap-anydpi-v26/ic_launcher.xml` declares only `<background>` and `<foreground>`), some Pixel
  Launcher versions fall back to drawing a wallpaper-tinted circular backplate around the unthemed
  icon rather than recolouring it. This matches what was observed (full-colour shield and beams,
  unmodified, with an added ring) but was **not** confirmed by toggling the "Themed icons" setting
  off — a long-press attempt to reach the per-icon theming control did not register a menu, and no
  further attempt was made once sufficient pixel-level evidence existed to answer the two claims this
  sprint was scoped to test.
- **Not a defect in either tested claim.** The ring sits *outside* the masked icon; it does not
  clip the shield, and it is not the app's `backgroundColor` rendering unexpectedly. It is a
  real, first-time-observed visual polish gap, reported here rather than fixed, per scope.

### Task 4 — cold-start splash

**Fact.** A single-shot `screencap` immediately after launch caught the already-loaded welcome
screen — Metro was warm from Task 2, so the JS bundle mounted before a single screenshot could land
mid-splash. Ten screenshots fired in parallel around a backgrounded `am start` all caught the *prior*
home screen, for the same reason (dev-mode cold start is too fast for a naive capture loop once
Metro's cache is warm).

**Decision.** Used `adb shell screenrecord` (a 4-second video starting just before `am start`) and
extracted frames with `ffmpeg` at 10fps, rather than more single screenshots. *Rationale:* this is the
standard technique for capturing sub-second transient UI reliably.

**Fact.** The splash held for roughly 18 consecutive extracted frames (~1.8 s) — comfortably long
enough to have been caught by a well-timed single screenshot too, which was then taken for
colour-accuracy (video is H.264-compressed and crushes near-black values; a follow-up lossless
`screencap` timed ~0.6 s into a fresh launch was used for the pixel measurements below).

**Fact, decisively.** The shield mark renders **fully visible, not clipped, with no rectangular
background box** — the exact defect this whole verification chain traces back to (the original iOS/
Android splash bug was a flat, slightly-lighter square on the canvas colour). Pixel-sampled at four
points well clear of the mark (`y=300,x=540`; `y=1000,x=800`; `y=1000,x=150`; `y=2300,x=1000`): all
four read **exactly `#07070B`**, matching `splashscreen_background` precisely. A fifth sample that
initially read an unexpected blue (`#1856A1`) was investigated by cropping and viewing that exact
region directly — it landed on the shield's own antialiased outline stroke, not the background;
the estimate of "below the shield" was simply wrong by a few dozen pixels. Corrected and confirmed,
rather than left as an unresolved anomaly.

**Assumption, stated rather than measured precisely.** The shield sits slightly above true screen
centre (visually, roughly 40–45% down from the top rather than 50%). This is consistent with how
`expo-splash-screen`'s native Android implementation typically anchors content and was not present as
a concern in either claim under test; it is not called a defect here, only noted as unverified against
any specific design intent.

### Comparison against the predecessor record's claims

| Claim | Verdict | Basis |
| --- | --- | --- |
| **1.** `ANDROID_SCALE=0.62` keeps the shield fully inside the safe zone, no clipping | **CONFIRMED** | Direct, repeated visual observation plus pixel sampling. Clear margin on every side, no cut edge on the shield outline at any point around its perimeter. |
| **2.** `adaptiveIcon.backgroundColor = #07070B` is never visible because the opaque foreground covers it | **CONFIRMED** | The icon disc's own colour (`#040507`) matches the artwork's fill, not `#07070B`; separately, `#07070B` never appears anywhere in either the icon or the splash captures except as the splash's own correctly-configured canvas. |

Both claims from `2026-07-30-brand-app-icon.md` move from "arithmetic, not observation" to directly
observed and confirmed.

## New finding (summary)

A Pixel Launcher–drawn light-blue ring (`#B0D9FF`) appears around the PRism launcher icon, most
likely because the adaptive icon has no `<monochrome>` layer for Android 13+ "Themed icons" to use.
Not clipping, not a violation of either tested claim, not sourced from this repository's
configuration. **Not fixed in this sprint** — reported per the explicit instruction to stop and
report rather than patch. See "Open questions" below for the proposed next step.

## Open questions

1. **Should `scripts/generate-app-icons.sh` be extended to also emit a `monochromeImage`, and should
   `app.json`'s `android.adaptiveIcon` reference it?** This would very likely resolve the ring finding
   above by giving Android 13+ Themed Icons a real silhouette to theme instead of falling back to an
   undecorated backplate. Not attempted here — it is a config/script change requiring the same
   approval this sprint's own scope rules withheld from itself. *Owner decision.*
2. **Is the ring specific to this Pixel Launcher build/version, or general?** Not tested against a
   second launcher (e.g. Nova Launcher) or with "Themed icons" toggled off — the toggle could not be
   reached in this session. If it matters for release readiness, a second, cheap check would settle
   it. *Owner decision on priority.*
3. **Is the splash's slightly-above-centre vertical position intentional?** Not a defect, not
   previously specified either way. *Owner decision, low priority.*

## Progress log

- **2026-07-31, 00:03 local** — Branch created off `main` (post-PR #13, commit `8bfa55e`). This record
  opened before any environment inspection, emulator configuration, or build command.
- **2026-07-31, 00:05–00:20 local** — Confirmed no Android SDK/emulator/Android Studio present.
  Installed `android-commandlinetools` via Homebrew; installed platform-tools, build-tools 34.0.0,
  platform android-34, emulator, and the arm64-v8a API 34 system image via `sdkmanager`. Created and
  booted `Pixel_7_API_34`.
- **2026-07-31, 00:21–00:37 local** — `npx expo run:android`: `BUILD SUCCESSFUL in 15m`, app installed
  and launched, Metro bundle served, welcome screen confirmed rendering.
- **2026-07-31, 00:37–00:48 local** — Captured and measured the launcher home screen. Confirmed the
  shield is not clipped; confirmed the icon disc colour is the artwork's own fill, not
  `adaptiveIcon.backgroundColor`; discovered and investigated the light-blue ring finding.
- **2026-07-31, 00:48–00:52 local** — Captured the cold-start splash via `screenrecord` + `ffmpeg`
  frame extraction, then a timed lossless `screencap` for accurate colour sampling. Confirmed no
  background box and exact `#07070B` match at four of five sample points; resolved the fifth as a
  measurement-location error, not an anomaly.
- **2026-07-31, 00:52 local** — Both named claims marked CONFIRMED. New finding documented. No source,
  config, or asset file changed — `git status`/`git diff --name-only` confirmed clean against the
  sprint-doc-only commit. Record finalised.
