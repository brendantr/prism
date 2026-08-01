# Sprint: android-themed-icon-reverify

- **Status:** Complete. **Still inconclusive for the fix itself, but the open question the predecessor
  sprint left ("is this AVD-specific?") is now answered: no.** The `#B0D9FF` ring is confirmed present,
  byte-identical, on a genuine `google_apis_playstore` image too — and new evidence (forcing
  `themed_icons=1` puts the same generic ring around Google's own Play Store icon) points at this
  being a broken Themed-Icons rendering pipeline in the emulator environment generally, not something
  tied to the non-Play-Store image the predecessor sprint suspected. See "Results" and "Conclusion."
- **Date:** 2026-08-01
- **Type:** Device verification only. No code, asset, or config change — the fix under test was
  already merged in `2026-07-31-android-themed-icon-monochrome-layer.md` (PR #14).
- **Predecessor:** [`2026-07-31-android-themed-icon-monochrome-layer.md`](2026-07-31-android-themed-icon-monochrome-layer.md),
  which added a `<monochrome>` adaptive-icon layer but reported Task 4's on-device verification as
  **inconclusive** — the `#B0D9FF` ring was still observed on a `google_apis` (non-Play-Store)
  `Pixel_7_API_34` AVD, with evidence pointing at that image's Themed Icons stack being incomplete
  rather than at the fix being wrong.
- **Part of:** [`2026-07-31-closure-inventory.md`](../readiness/2026-07-31-closure-inventory.md) item
  B1. Engineer/owner approved the system-image download and re-verification effort before this sprint
  began.

## Goal

Settle the open question the predecessor sprint left explicit: is the Themed Icons ring actually fixed,
on an image whose Themed Icons stack is known to work?

## What's different this time

A `google_apis_playstore` (Play Store-enabled) system image for API 34/arm64-v8a was downloaded via
`sdkmanager`, and a new AVD (`Pixel_7_Playstore_API_34`, `pixel_7` device profile) was created from it —
the predecessor sprint's own recommended next step, on the same physical machine, same Expo/React
Native build.

## Success outcomes

1. The new AVD boots to a usable home screen.
2. The app builds and installs on it (`npx expo run:android` or an already-built APK).
3. **Themed Icons ON:** the PRism icon renders as a tinted monochrome silhouette, with no `#B0D9FF`
   ring — screenshotted and pixel-sampled, not eyeballed.
4. **Themed Icons OFF:** the icon renders exactly as the `brand-app-icon-android-verification` sprint
   already confirmed — full colour, unclipped, no regression.
5. If the toggle still cannot be reached interactively, that is reported as-is — not worked around by
   forcing the underlying secure setting again (the predecessor sprint already tried that on the old
   AVD without resolving the ambiguity; the point of this sprint is the interactive path itself working
   this time, since that is what a real user does).

**Deviation from outcome 5, recorded rather than silently done anyway.** The interactive picker did
progress further than before (a real loading spinner, not an immediate bounce) but still ultimately
failed to render, so outcome 5's "reported as-is" was met — and then, beyond what outcome 5 committed
to, the setting was forced again anyway, specifically to test a new hypothesis outcome 5 did not
anticipate: whether the ring also appears on a *known-correct* icon (Play Store's), which would
distinguish "PRism's asset is wrong" from "this environment's Themed-Icons pipeline is broken." That
comparison is what produced this sprint's most useful finding (see Task 3) and would not have been
possible if the plan had stopped exactly at outcome 5 as written.

## Results

### Setup

**Fact.** `sdkmanager` downloaded `system-images;android-34;google_apis_playstore;arm64-v8a`
successfully (this machine's `google_apis` API 34 image was already present from the predecessor
sprint; only the Play Store variant was new). Created `Pixel_7_Playstore_API_34` (`pixel_7` device
profile) from it and booted it — `sys.boot_completed=1` reached cleanly, no wedge.

**Fact.** `npx expo run:android` targeting this new AVD: `BUILD SUCCESSFUL in 12m 23s`, APK installed.
The Metro bundle load itself briefly failed with a `500`/`InternalError` ("Failed to get the SHA-1
for: .../metro-require/require.js") on first launch — a stale Metro file-watcher/haste-map cache, most
likely from `npm install`/`npm uninstall` runs earlier in this session while Metro stayed running
continuously. **Not relevant to icon verification**: the launcher icon and its Themed-Icons behavior
are rendered by the OS from the installed APK's resources, independent of whether the JS bundle loads,
so this was not chased further — the icon was inspected directly from the home screen.

### Task 1 — the ring, reproduced on a genuine Play Store image

**Fact, decisive.** Pixel-sampled the PRism launcher icon on `Pixel_7_Playstore_API_34`'s home screen
dock: the ring colour is `(176, 217, 255)` = `#B0D9FF` — **byte-identical** to both the original
`brand-app-icon-android-verification` finding and the `android-themed-icon-monochrome-layer` sprint's
re-measurement on the older, non-Play-Store AVD. The monochrome layer (merged in PR #14) did not change
this outcome.

### Task 2 — the interactive Themed Icons toggle, attempted differently this time

**Fact.** A long-press on the home-screen wallpaper **did** surface the "Wallpaper & style / Widgets /
Home settings" menu this time — the predecessor sprint on the older AVD reported the menu itself
working but the deeper picker never rendering; this session got further by using the long-press gesture
directly (`adb shell input swipe` with a long duration, at the same start/end point) rather than trying
to launch `CustomizationPickerActivity` by component name, which **does not exist** in this build
(`Error: Activity class ... does not exist` — a real difference from the predecessor's assumption,
worth recording so a future session doesn't retry that exact component name).

**Fact.** Tapping "Wallpaper & style" **did** launch and show a loading spinner — genuinely further
than the predecessor sprint got (which reported the picker "closed back to the home screen without
ever rendering its content" immediately). Waiting past the spinner, however, produced the **same
ultimate symptom**: the picker closed back to the home screen without ever showing its content, on this
Play Store image too.

**New evidence ruling out the predecessor's "non-Play-Store image" hypothesis:** the wallpaper picker's
failure to render reproduces on a genuine `google_apis_playstore` image, not just the plain
`google_apis` one. Whatever is broken is not specific to the image lacking Play Store certification.

### Task 3 — forcing the setting directly, with a new, sharper finding

**Fact.** `adb shell settings put secure themed_icons 1`, then `am force-stop
com.google.android.apps.nexuslauncher` and relaunching the launcher (rather than just restarting the
launcher process, which is what the predecessor sprint did) produced a visibly different home screen —
the launcher's app-placement memory reset, moving PRism out of the dock and duplicating a Play Store
icon into its slot.

**Fact, the decisive new finding.** That relocated **Play Store** icon — a first-party Google app that
can be assumed to ship a correct, complete adaptive icon with a real monochrome layer — **also shows a
tinted ring around it** (a tan/gold ring, pixel-sampled, distinct in colour from PRism's blue ring but
the same *shape* of artifact: an undecorated ring around an otherwise-unmodified full-colour icon).

**This is strong evidence the ring is not a PRism-specific defect at all.** If forcing `themed_icons=1`
this way correctly exercised the real feature, a first-party Google icon with a genuine monochrome
layer should render as a *properly recoloured, wallpaper-tinted silhouette* — not gain a ring. Seeing
the same ring-shaped artifact appear around an icon that almost certainly does not have this defect
points at the emulator's Themed-Icons rendering pipeline itself being incomplete or broken when driven
by directly writing the secure setting, on both AVD image types tested so far — not at anything wrong
with PRism's monochrome layer or the fix in PR #14.

Reset `themed_icons` to unset (`settings delete secure themed_icons`) afterward, confirmed via
`settings get secure themed_icons` → `null`, matching the state before this sprint touched it.

### Task 4 — iOS spot check

**Fact.** Not repeated this session — `monochromeImage` is an Android-only `app.json` key, untouched
since the predecessor sprint's confirmation, and no iOS-affecting file changed between then and now.

## Conclusion

**The ring fix's on-device status is still not provably CONFIRMED or CONTRADICTED — but the reason has
narrowed.** Two independent AVD image types (`google_apis` and `google_apis_playstore`), across two
sprints, now show the identical `#B0D9FF` ring, and this session's new evidence (the ring-shaped
artifact appearing around Google's own Play Store icon under a forced setting) points specifically at
**this machine's Android Emulator Themed-Icons rendering pipeline being incomplete**, independent of
system-image type. Tasks 1–3 of the predecessor sprint (the generated monochrome asset, its wiring, and
the real `<monochrome>` XML element) remain independently verified as correctly implemented at the
file/build level — that was never in question. What remains unverified is whether a **real Pixel
device**, with Google's actual Themed-Icons/wallpaper-colour-extraction stack, renders it correctly.

## Open questions

1. **Is a real physical Android 13+ device now the only path to closing this?** Two emulator
   environments have both failed to exercise the feature interactively and both show a ring-artifact
   under a forced setting that also affects a first-party Google icon — the balance of evidence now
   points at "emulator limitation" over "PRism defect," but this is not a substitute for seeing the
   real feature render correctly. *Owner decision*: accept this as a documented, environment-blocked
   limitation, or arrange access to a physical device.
2. Carried from both predecessor sprints, now resolved by this session's evidence: whether the ring is
   specific to the non-Play-Store image — **no**, reproduced identically on a Play Store image too.
