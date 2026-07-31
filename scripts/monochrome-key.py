#!/usr/bin/env python3
"""
Derive the Android "Themed icon" monochrome layer from the source artwork.

WHY THIS EXISTS
---------------
Android 13+ can recolour an app's launcher icon to match the wallpaper
("Themed icons"), but only if the adaptive icon supplies an optional
<monochrome> layer -- a single-colour silhouette the OS tints itself. Without
one, some Pixel Launcher versions fall back to drawing an undecorated,
wallpaper-tinted ring around the unthemed icon instead. That is the finding
`Docs/sprints/2026-07-31-brand-app-icon-android-verification.md` reported:
observed on-device as a light-blue ring around the PRism icon, not sourced
from any value this repo controls.

HOW THE SILHOUETTE IS DERIVED
------------------------------
By luminance threshold, mirroring `alpha-key.py`'s technique but inverted:
that script keeps DARK pixels transparent (for the splash, where the
background needs to disappear); this one keeps BRIGHT pixels opaque (for the
monochrome layer, where only the mark itself should render).

Thresholds are measured from the source, not guessed. Sampling
`prism-logo-source.png` gives a clean, non-overlapping gap:

    background + interior shaded facets   luminance <= ~52
    every beam colour (red is the floor)  luminance >= ~82
    shield outline / white beam           luminance ~253

LOW=55, HIGH=85 sits inside that gap with room on both sides, so the result
is the shield's outline plus the full beam fan, rendered solid -- and the
interior diamond shading and background drop out. That matches Android's own
guidance for themed icons ("a simple, single-colour representation"), not a
shaded miniature of the full-colour mark.

TWO STEPS, BECAUSE OF A REAL `sips` LIMITATION
------------------------------------------------
Verified empirically before writing this: `sips -Z` (resize) preserves an
alpha channel correctly, but `sips -p --padColor` does not produce
transparent padding on any image, RGBA source or not -- it always fills with
an opaque colour. Padding the monochrome layer with an opaque colour would
make the *entire* canvas count as "shape" once Android tints it, i.e. a solid
tinted square instead of a silhouette. So this script does the padding itself
in pure Python, and the caller (`generate-app-icons.sh`) is expected to run
`sips -Z` for the resize in between the two subcommands below -- reusing a
proven, already-relied-upon tool for the part it handles correctly, and only
replacing the part it does not.

Pure standard library, matching `alpha-key.py`: no Pillow, no ImageMagick.

USAGE
-----
    monochrome-key.py key <in.png> <out.png> [low] [high]
        Keys bright pixels to opaque white, everything else to transparent,
        at the input's native resolution.

    monochrome-key.py pad <in.png> <out.png> <canvas>
        Centres <in.png> (already resized by the caller) onto a fully
        transparent <canvas>x<canvas> square.
"""

import struct
import sys
import zlib

PNG_SIG = b"\x89PNG\r\n\x1a\n"


def _paeth(a: int, b: int, c: int) -> int:
    p = a + b - c
    pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
    if pa <= pb and pa <= pc:
        return a
    return b if pb <= pc else c


def read_png(path: str):
    """Return (width, height, channels, raw pixel bytes). 8-bit RGB/RGBA only."""
    data = open(path, "rb").read()
    if data[:8] != PNG_SIG:
        raise SystemExit(f"{path}: not a PNG")

    idat, pos = bytearray(), 8
    width = height = channels = None
    while pos < len(data):
        (length,) = struct.unpack_from(">I", data, pos)
        ctype = data[pos + 4 : pos + 8]
        body = data[pos + 8 : pos + 8 + length]
        pos += 12 + length

        if ctype == b"IHDR":
            width, height, depth, colour, _comp, _filt, interlace = struct.unpack(
                ">IIBBBBB", body
            )
            if depth != 8 or interlace != 0 or colour not in (2, 6):
                raise SystemExit(
                    f"{path}: need 8-bit non-interlaced RGB/RGBA (got depth={depth}, "
                    f"colour={colour}, interlace={interlace})"
                )
            channels = 3 if colour == 2 else 4
        elif ctype == b"IDAT":
            idat += body
        elif ctype == b"IEND":
            break

    raw = zlib.decompress(bytes(idat))
    stride = width * channels
    out = bytearray(height * stride)

    src = 0
    for y in range(height):
        ftype = raw[src]
        src += 1
        row_start = y * stride
        prev_start = row_start - stride
        for x in range(stride):
            val = raw[src + x]
            a = out[row_start + x - channels] if x >= channels else 0
            b = out[prev_start + x] if y > 0 else 0
            c = out[prev_start + x - channels] if (y > 0 and x >= channels) else 0
            if ftype == 1:
                val += a
            elif ftype == 2:
                val += b
            elif ftype == 3:
                val += (a + b) >> 1
            elif ftype == 4:
                val += _paeth(a, b, c)
            elif ftype != 0:
                raise SystemExit(f"{path}: bad filter type {ftype}")
            out[row_start + x] = val & 0xFF
        src += stride

    return width, height, channels, out


def write_rgba_png(path: str, width: int, height: int, pixels: bytearray) -> None:
    def chunk(tag: bytes, body: bytes) -> bytes:
        return (
            struct.pack(">I", len(body))
            + tag
            + body
            + struct.pack(">I", zlib.crc32(tag + body) & 0xFFFFFFFF)
        )

    stride = width * 4
    raw = bytearray()
    for y in range(height):
        raw.append(0)  # filter type 0 (None) on every row -- keeps output reproducible
        raw += pixels[y * stride : (y + 1) * stride]

    ihdr = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)
    with open(path, "wb") as fh:
        fh.write(PNG_SIG)
        fh.write(chunk(b"IHDR", ihdr))
        fh.write(chunk(b"IDAT", zlib.compress(bytes(raw), 9)))
        fh.write(chunk(b"IEND", b""))


def cmd_key(src: str, dst: str, low: float, high: float) -> None:
    width, height, channels, px = read_png(src)
    out = bytearray(width * height * 4)
    span = max(high - low, 1e-6)
    kept = 0

    for i in range(width * height):
        r = px[i * channels]
        g = px[i * channels + 1]
        b = px[i * channels + 2]
        lum = 0.299 * r + 0.587 * g + 0.114 * b
        if lum <= low:
            alpha = 0
        elif lum >= high:
            alpha = 255
            kept += 1
        else:
            alpha = int(round(255 * (lum - low) / span))
        # Solid white: Android tints the monochrome layer itself, so the
        # layer's own colour must not vary -- only its alpha/shape matters.
        out[i * 4 : i * 4 + 4] = bytes((255, 255, 255, alpha))

    write_rgba_png(dst, width, height, out)
    pct = 100.0 * kept / (width * height)
    print(f"  {dst.split('/')[-1]:<22} {width}x{height}px  ({pct:.1f}% opaque silhouette)")


def cmd_pad(src: str, dst: str, canvas: int) -> None:
    width, height, channels, px = read_png(src)
    if channels != 4:
        raise SystemExit(f"{src}: expected RGBA input for padding, got {channels} channels")
    if width > canvas or height > canvas:
        raise SystemExit(f"{src}: {width}x{height} does not fit in a {canvas}x{canvas} canvas")

    out = bytearray(canvas * canvas * 4)  # zero-initialised = fully transparent black
    off_x = (canvas - width) // 2
    off_y = (canvas - height) // 2
    for y in range(height):
        src_row = y * width * 4
        dst_row = ((y + off_y) * canvas + off_x) * 4
        out[dst_row : dst_row + width * 4] = px[src_row : src_row + width * 4]

    write_rgba_png(dst, canvas, canvas, out)
    print(f"  {dst.split('/')[-1]:<22} {canvas}x{canvas}px  (silhouette centred, transparent pad)")


def main() -> None:
    if len(sys.argv) < 2:
        raise SystemExit(__doc__)

    mode = sys.argv[1]
    if mode == "key":
        if len(sys.argv) < 4:
            raise SystemExit("usage: monochrome-key.py key <in> <out> [low] [high]")
        low = float(sys.argv[4]) if len(sys.argv) > 4 else 55.0
        high = float(sys.argv[5]) if len(sys.argv) > 5 else 85.0
        cmd_key(sys.argv[2], sys.argv[3], low, high)
    elif mode == "pad":
        if len(sys.argv) < 5:
            raise SystemExit("usage: monochrome-key.py pad <in> <out> <canvas>")
        cmd_pad(sys.argv[2], sys.argv[3], int(sys.argv[4]))
    else:
        raise SystemExit(f"unknown mode: {mode!r} (expected 'key' or 'pad')")


if __name__ == "__main__":
    main()
