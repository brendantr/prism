# Brand assets

Source artwork and the icon files generated from it. One rule holds everything
together:

> **`prism-logo-source.*` is the only file edited by a human. Everything else in
> this folder is output, and is safe to delete and regenerate.**

## Layout

| File | Role | Origin |
| --- | --- | --- |
| `prism-logo-source.svg` *(preferred)* or `.png` | The artwork. Never modified by tooling. | Committed by hand |
| `app-icon.png` | 1024×1024 iOS icon master → `expo.icon` | Generated |
| `adaptive-icon.png` | 1024×1024 Android foreground → `expo.android.adaptiveIcon.foregroundImage` | Generated |
| `splash-icon.png` | 720×720 **transparent-background** mark → `expo-splash-screen` `image` | Generated |
| `monochrome-icon.png` | 1024×1024 **white-on-transparent silhouette** → `expo.android.adaptiveIcon.monochromeImage` | Generated |

## Regenerating

```bash
scripts/generate-app-icons.sh
```

Deterministic: the same source and flags always produce the same bytes, so these
are reproducible outputs rather than hand-made files nobody can rebuild. The
script only ever reads the source, and refuses to write over it.

Useful flags:

```bash
# Crop the source before scaling -- this is how the wordmark is removed.
# x,y,w,h in source pixels.
scripts/generate-app-icons.sh --crop 320,180,1400,1400

# Adjust how much of the canvas the mark occupies.
scripts/generate-app-icons.sh --ios-scale 0.86 --android-scale 0.62

# The monochrome layer's inset defaults to --android-scale (it is masked the
# same way); override independently only if the themed silhouette needs a
# different size than the unthemed icon.
scripts/generate-app-icons.sh --monochrome-scale 0.62
```

Once the correct crop box is known, record it as the `CROP` default inside the
script so a plain run stays reproducible.

## Why four outputs rather than one

They are not interchangeable, and reusing the iOS icon for Android is a common
way to ship a clipped logo.

- **iOS** masks to a squircle and expects full-bleed art. `app-icon.png` fills
  the canvas with the brand background and insets the mark slightly.
- **Android** adaptive icons composite `foregroundImage` over `backgroundColor`
  and may crop to a circle, so only the middle **~66%** is guaranteed visible.
  `adaptive-icon.png` scales the mark to sit inside that safe zone and pads out
  the rest.

- **Splash** is drawn centred on a solid `backgroundColor`, so an opaque image
  shows as a rectangle unless its own background matches that colour *exactly* —
  and the artwork's does not (`#030305` at the corners, `#020204` mid-field).
  Its background is therefore keyed to transparent by `scripts/alpha-key.py`.
  This was the old placeholder's bug: a flat `#0B0B12` square on a `#07070B`
  background, i.e. the "small black box on launch".

- **Monochrome** is a different job again: Android 13+ "Themed icons" tints an
  optional single-colour silhouette layer to match the wallpaper. Without one,
  Pixel Launcher was observed drawing an undecorated, wallpaper-tinted ring
  around the unthemed icon instead — recorded in
  [`Docs/sprints/2026-07-31-brand-app-icon-android-verification.md`](../../Docs/sprints/2026-07-31-brand-app-icon-android-verification.md).
  `monochrome-icon.png` is white where the mark is bright (the shield outline
  and the beam fan) and fully transparent everywhere else, derived by a
  measured luminance threshold — see `scripts/monochrome-key.py` for the exact
  values and why they're not guessed. It is masked the same way
  `adaptive-icon.png` is (same 62% inset by default), so the themed silhouette
  matches the unthemed icon's sizing.

Icon padding uses the brand background `#07070B` rather than transparency. Expo
composites the foreground over `adaptiveIcon.backgroundColor`, which is the same
colour, so the result matches transparent padding while keeping the script to
tools already present on macOS (`sips`, plus `rsvg-convert` for SVG sources).
**The monochrome layer is the one exception** — its padding must be genuinely
transparent (Android treats every opaque pixel as "shape" to tint), and `sips
--padColor` cannot produce that even on an RGBA source; verified empirically,
not assumed. `scripts/monochrome-key.py` does that one step in pure Python
instead.

## Source requirements

- **SVG preferred** — rasterises crisply at any size instead of being resampled.
- **PNG otherwise**, at least 1024px on the short edge. Below that, the shield
  outline visibly softens once iOS scales it down to 40pt on a home screen.
- Keep the wordmark **out** of the icon. Use `--crop` to isolate the
  shield/prism mark; text is unreadable at icon sizes and costs the mark room.

## Wiring (applied)

```jsonc
{
  "expo": {
    "icon": "./assets/brand/app-icon.png",
    "android": {
      "adaptiveIcon": {
        "foregroundImage": "./assets/brand/adaptive-icon.png",
        "monochromeImage": "./assets/brand/monochrome-icon.png",
        "backgroundColor": "#07070B"
      }
    }
  }
}
```

`monochromeImage` is an Expo config key, not a hand-edit to generated native XML — `expo prebuild`
turns it into `mipmap-anydpi-v26/ic_launcher.xml`'s `<monochrome>` element and an
`ic_launcher_monochrome.webp` resource, the same way `foregroundImage` and `backgroundColor` already
become the rest of that file. iOS ignores this key entirely; Android 13+ Themed Icons is the only
consumer.

No `expo.ios.icon` override: nothing here needs a platform-specific iOS icon, so
the single `expo.icon` covers it. iOS and Android are the only targets — there
is no macOS or Catalyst target in this repository.

### On `adaptiveIcon.backgroundColor`

Kept at the app canvas `#07070B`, but note it is **currently never visible**:
`adaptive-icon.png` is fully opaque (`hasAlpha: no`), so the foreground covers
the background layer completely. If the foreground is ever regenerated with
transparent padding, this value should change to the artwork's own background
`#030305`, or a visible square edge will appear where the two meet.

### Why the icon background is `#030305`, not `#07070B`

Measured from the source rather than assumed: the artwork's background is
`#030305` at the corners and `#020204` mid-field. Padding with the app canvas
`#07070B` leaves a faint but hard-edged frame where pad meets art — confirmed by
sampling across the boundary. The generator therefore pads with the artwork's
own value.

### Why iOS is full-bleed

`IOS_SCALE=1.0`. The white beam runs to the left edge of the crop and the
rainbow to the right, so any inset truncates them against a pad boundary and
reads as clipping. Letting them run off the icon edge reads as intentional.

The native `ios/` and `android/` folders are gitignored and regenerated by
`expo prebuild`, so the asset catalog and `mipmap-*` output are build artifacts.
This folder plus `app.json` are the real source of truth.
