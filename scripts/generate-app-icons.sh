#!/usr/bin/env bash
#
# Generate PRism's app icons from one source artwork, deterministically.
#
#   assets/brand/prism-logo-source.(svg|png)   ->   assets/brand/app-icon.png
#                                                   assets/brand/adaptive-icon.png
#
# Same input and flags always produce the same output, so the icons can be
# rebuilt from source rather than being hand-made files nobody can reproduce.
#
# DEPENDENCIES: none to install.
#   sips          ships with macOS
#   rsvg-convert  only needed when the source is an SVG (brew install librsvg)
#
# WHY TWO OUTPUTS
#   iOS masks the icon to a squircle and expects full-bleed art, so `app-icon`
#   fills the canvas with the brand background and insets the mark slightly.
#
#   Android adaptive icons are different and get this wrong constantly: the
#   system composites `foregroundImage` over `backgroundColor` and may crop to a
#   circle, so only the middle ~66% is guaranteed visible. `adaptive-icon`
#   therefore scales the mark smaller and pads the rest. Handing Android the iOS
#   icon is what produces the classic clipped-logo launcher bug.
#
#   The padding is filled with the brand background rather than transparency.
#   Expo composites the foreground over `adaptiveIcon.backgroundColor`, which is
#   the same #07070B, so the result is identical to transparent padding while
#   keeping this script to tools that are already on the machine.
#
# USAGE
#   scripts/generate-app-icons.sh
#   scripts/generate-app-icons.sh --crop 320,180,1400,1400   # x,y,w,h on the source
#   scripts/generate-app-icons.sh --ios-scale 0.86 --android-scale 0.62
#
#   --crop is how the wordmark gets removed: give it the box around the
#   shield/prism mark in source pixels. Once the right box is known, record it
#   as the default below so a plain run stays reproducible.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BRAND_DIR="$ROOT/assets/brand"

# --- Tunables. Change here, not at the call site, so runs stay reproducible. --
CANVAS=1024                 # Apple wants a 1024x1024 master; Expo scales the rest.

# The artwork's own background, measured from the source (#030305 at the
# corners, #020204 mid-field) -- NOT the app canvas #07070B. Padding with the
# canvas colour leaves a visible frame where it meets the art; measured, that
# step is #07070B against #020204, which is small but a hard edge.
BG="030305"

# 1.0 = full bleed, no padding. The white beam runs to the left edge of the
# crop and the rainbow to the right, so any inset would truncate them against
# a pad boundary and read as clipping. Letting them run off the icon edge
# reads as intentional instead.
IOS_SCALE="1.0"

# Android composites this over `backgroundColor` and may crop to a circle, so
# only the middle ~66% is guaranteed. 0.62 keeps the shield inside that.
ANDROID_SCALE="0.62"

# Box around the shield/prism mark in source pixels, excluding the "PRism"
# wordmark and tagline (which begin at ~y=865). Chosen so the shield centre
# lands at 50%/50% of the crop: shield spans x 385-875, y 163-830, centre
# (630, 496); this 720px box is centred on that and is the largest square that
# stays clear of the wordmark.
CROP="272,135,720,720"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --crop)          CROP="$2"; shift 2 ;;
    --ios-scale)     IOS_SCALE="$2"; shift 2 ;;
    --android-scale) ANDROID_SCALE="$2"; shift 2 ;;
    --bg)            BG="${2#\#}"; shift 2 ;;
    -h|--help)       sed -n '2,40p' "${BASH_SOURCE[0]}"; exit 0 ;;
    *) echo "unknown option: $1" >&2; exit 2 ;;
  esac
done

# --- Locate the source. SVG wins: it rasterises crisply at any size. ----------
SOURCE=""
for candidate in "$BRAND_DIR/prism-logo-source.svg" "$BRAND_DIR/prism-logo-source.png"; do
  [[ -f "$candidate" ]] && { SOURCE="$candidate"; break; }
done

if [[ -z "$SOURCE" ]]; then
  cat >&2 <<MSG
error: no source artwork found.

Expected one of:
  assets/brand/prism-logo-source.svg   (preferred - scales without resampling)
  assets/brand/prism-logo-source.png   (>= 1024px on the short edge)

Nothing is generated without it. See assets/brand/README.md.
MSG
  exit 1
fi

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
MASTER="$WORK/master.png"

# --- 1. Normalise the source to a high-resolution PNG ------------------------
# Rasterise well above the target so the later downscale is a reduction, which
# stays sharp, rather than an enlargement, which does not.
if [[ "$SOURCE" == *.svg ]]; then
  command -v rsvg-convert >/dev/null 2>&1 || {
    echo "error: SVG source needs rsvg-convert (brew install librsvg)" >&2; exit 1; }
  rsvg-convert -w $((CANVAS * 2)) -h $((CANVAS * 2)) -a -b "#$BG" "$SOURCE" -o "$MASTER"
else
  cp "$SOURCE" "$MASTER"
fi

# --- 2. Optional crop, e.g. to drop the wordmark -----------------------------
if [[ -n "$CROP" ]]; then
  IFS=',' read -r CX CY CW CH <<< "$CROP"
  # sips takes height before width, and offsets as Y then X.
  sips -c "$CH" "$CW" --cropOffset "$CY" "$CX" "$MASTER" --out "$MASTER" >/dev/null
fi

# --- 3. Emit one square icon: scale the mark, pad out to the canvas ----------
emit() {
  local out="$1" scale="$2" label="$3"
  local inner
  inner=$(python3 -c "print(int($CANVAS * $scale))")

  sips -Z "$inner" "$MASTER" --out "$out" >/dev/null
  # sips prints a <CGColor ...> diagnostic to stderr when padding; it is noise.
  sips -p "$CANVAS" "$CANVAS" --padColor "$BG" "$out" --out "$out" >/dev/null 2>&1

  local dims
  dims=$(sips -g pixelWidth -g pixelHeight "$out" | awk '/pixel/{printf "%s", $2 " "}')
  printf '  %-22s %s  (mark at %s%% of canvas)\n' "$(basename "$out")" "${dims}px" \
    "$(python3 -c "print(round($scale*100))")"
  [[ "$label" == "" ]] || true
}

echo "source: ${SOURCE#$ROOT/}"
[[ -n "$CROP" ]] && echo "crop:   $CROP"
echo "generated:"
emit "$BRAND_DIR/app-icon.png"      "$IOS_SCALE"     "ios"
emit "$BRAND_DIR/adaptive-icon.png" "$ANDROID_SCALE" "android"

# The source is only ever read. Guard against a future edit writing over it.
for generated in "$BRAND_DIR/app-icon.png" "$BRAND_DIR/adaptive-icon.png"; do
  if [[ "$generated" -ef "$SOURCE" ]]; then
    echo "error: refusing to overwrite the source artwork" >&2; exit 1
  fi
done
