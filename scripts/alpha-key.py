#!/usr/bin/env python3
"""
Turn the near-black background of a logo crop into transparency.

WHY THIS IS NEEDED
------------------
The splash image is drawn centred on a solid `backgroundColor`. Any opaque
image therefore shows up as a rectangle against it unless its own background
matches that colour *exactly* -- and the PRism artwork's background is not flat
(#030305 at the corners, #020204 mid-field), so no single colour matches it.
That mismatch is the "small black box on launch": the old placeholder was a flat
#0B0B12 square sitting on a #07070B background.

Keying the background out removes the rectangle entirely, and keeps the asset
correct no matter what `backgroundColor` is later set to.

HOW
---
Alpha is derived from luminance, with a soft ramp so antialiased edges on the
shield and beams stay smooth instead of going jagged:

    lum <= LOW   -> fully transparent
    lum >= HIGH  -> fully opaque
    between      -> linear

Measured from the source, which is what sets the defaults: background sits at
luminance ~3, the darkest *visible* prism facets at ~46, and the shield outline
and beams at ~253. LOW/HIGH of 6/20 clears the background with a wide margin
before any real artwork tone is touched.

Some prism facets in the source are themselves near-black and will key out too.
That is deliberate and invisible in practice: they render as the splash
background, which is also near-black. The alternative -- keeping them opaque --
would require a rectangular matte, which is the problem being solved.

Pure standard library: no Pillow, no ImageMagick.
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

    # Undo the per-scanline filter. Each row is prefixed with its filter type.
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
    # Filter type 0 (None) on every row: the payload is already tiny once
    # deflated, and it keeps the output byte-identical run to run.
    raw = bytearray()
    for y in range(height):
        raw.append(0)
        raw += pixels[y * stride : (y + 1) * stride]

    ihdr = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)
    with open(path, "wb") as fh:
        fh.write(PNG_SIG)
        fh.write(chunk(b"IHDR", ihdr))
        fh.write(chunk(b"IDAT", zlib.compress(bytes(raw), 9)))
        fh.write(chunk(b"IEND", b""))


def main() -> None:
    if len(sys.argv) < 3:
        raise SystemExit("usage: alpha-key.py <in.png> <out.png> [low] [high]")
    src, dst = sys.argv[1], sys.argv[2]
    low = float(sys.argv[3]) if len(sys.argv) > 3 else 6.0
    high = float(sys.argv[4]) if len(sys.argv) > 4 else 20.0

    width, height, channels, px = read_png(src)
    out = bytearray(width * height * 4)
    span = max(high - low, 1e-6)
    cleared = 0

    for i in range(width * height):
        r = px[i * channels]
        g = px[i * channels + 1]
        b = px[i * channels + 2]
        lum = 0.299 * r + 0.587 * g + 0.114 * b
        if lum <= low:
            alpha = 0
            cleared += 1
        elif lum >= high:
            alpha = 255
        else:
            alpha = int(round(255 * (lum - low) / span))
        out[i * 4 : i * 4 + 4] = bytes((r, g, b, alpha))

    write_rgba_png(dst, width, height, out)
    pct = 100.0 * cleared / (width * height)
    print(f"  {dst.split('/')[-1]:<22} {width}x{height}px  ({pct:.0f}% keyed transparent)")


if __name__ == "__main__":
    main()
