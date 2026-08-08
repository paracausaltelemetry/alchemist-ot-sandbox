#!/usr/bin/env python3
"""One-off generator for the social/OG preview card (public/og.png).

Mirrors the section cards on the main Paracausal Telemetry site: the blue
ordered-dither warp field (a static frame of src/lib/heroDither.ts) behind a
left-aligned kicker and title, with the red signal tick and the subdomain in
the footer.

Committed output is what ships; CI never runs this. Regenerate by hand after
changing the wordmark or palette.

Deps: Pillow, numpy, fonttools + brotli (to read the woff2):
    python scripts/build-og-card.py
"""
import tempfile
from pathlib import Path

import numpy as np
from fontTools.ttLib import TTFont
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
W, H = 1200, 630
CELL = 4  # px per dither cell (chunky, like the hero's pixelated buffer)

# Palette, from src/styles/tokens.css.
BG = np.array([0x0a, 0x0b, 0x0c], dtype=float)         # --bg
BLUE = np.array([0x09, 0xba, 0xc9], dtype=float)        # --accent-blue
SIGNAL = (0xe5, 0x48, 0x4d)                             # --signal (period)
TEXT = (0xe9, 0xeb, 0xe8)                               # --text


def fract(x):
    return x - np.floor(x)


def hash2(ix, iy):
    return fract(np.sin(ix * 127.1 + iy * 311.7) * 43758.5453)


def value_noise(px, py):
    ix, iy = np.floor(px), np.floor(py)
    fx, fy = px - ix, py - iy
    ux, uy = fx * fx * (3 - 2 * fx), fy * fy * (3 - 2 * fy)
    h00 = hash2(ix, iy)
    h10 = hash2(ix + 1, iy)
    h01 = hash2(ix, iy + 1)
    h11 = hash2(ix + 1, iy + 1)
    return (h00 * (1 - ux) + h10 * ux) * (1 - uy) + (h01 * (1 - ux) + h11 * ux) * uy


def fbm(px, py):
    v = np.zeros_like(px)
    amp = 0.5
    for _ in range(4):
        v += amp * value_noise(px, py)
        px, py = px * 2, py * 2
        amp *= 0.5
    return v


def smoothstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def dither_field():
    """Return a (gh, gw) boolean mask: a static frame of the warp dither."""
    gw, gh = W // CELL, H // CELL
    t = 7.0  # arbitrary start offset, matching hero-dither.js
    xs = np.arange(gw)
    ys = np.arange(gh)
    gx, gy = np.meshgrid(xs, ys)
    uvx = gx / gw * (gw / gh)  # aspect-correct x like the shader
    uvy = gy / gh
    px, py = uvx * 3.0, uvy * 3.0
    wx = fbm(px + t * 0.10, py)
    wy = fbm(px + 5.2 - t * 0.13, py + 1.3)
    f = fbm(px + 2.4 * wx + t * 0.05, py + 2.4 * wy)
    f = smoothstep(0.32, 0.78, f)
    bayer = np.array([[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]) / 16.0
    thresh = bayer[gy % 4, gx % 4]
    return f > thresh


def build_background():
    mask = dither_field()
    gh, gw = mask.shape
    base = np.ones((gh, gw, 3)) * (BG / 255.0)
    src = BLUE / 255.0
    screen = 1 - (1 - base) * (1 - src)
    alpha = 0.3  # element opacity, screen blend
    lit = base * (1 - alpha) + screen * alpha
    field = np.where(mask[..., None], lit, base)

    # Text-protection pool: darken toward the bg near the centre (hero-card::after).
    yy, xx = np.mgrid[0:gh, 0:gw]
    ex = ((xx / gw) - 0.5) / 0.34
    ey = ((yy / gh) - 0.5) / 0.30
    r = np.sqrt(ex * ex + ey * ey)
    pool = np.clip(1 - r, 0, 1) * 0.85
    field = field * (1 - pool[..., None]) + (BG / 255.0) * pool[..., None]

    img = Image.fromarray((field * 255).astype(np.uint8), "RGB")
    return img.resize((W, H), Image.NEAREST)


def load_font(size):
    # Pillow can't read woff2 directly, so decompress to a ttf in the OS temp dir
    # (never inside the repo).
    tmp = Path(tempfile.gettempdir()) / "alchemist-space-grotesk.ttf"
    if not tmp.exists():
        f = TTFont(ROOT / "src" / "assets" / "fonts" / "space-grotesk-var.woff2")
        f.flavor = None
        f.save(tmp)
    font = ImageFont.truetype(str(tmp), size)
    try:
        font.set_variation_by_axes([700])  # bold weight
    except Exception:
        pass
    return font


KICKER = "OT Network Modelling"
TITLE = "Alchemist"
FOOTER = "alchemist.paracausaltelemetry.com"


def draw_card(img):
    draw = ImageDraw.Draw(img)
    kfont = load_font(34)
    tfont = load_font(96)
    x = 96

    # Kicker in muted, letter-spaced caps.
    draw.text((x, 132), " ".join(KICKER.upper()), font=kfont, fill=(0x9b, 0xa3, 0xa8))

    box = draw.textbbox((0, 0), TITLE, font=tfont)
    y = 210
    draw.text((x - box[0], y - box[1]), TITLE, font=tfont, fill=TEXT)
    y += (box[3] - box[1]) + 20

    # Red signal tick, echoing the wordmark's period.
    draw.rectangle([x, y + 6, x + 64, y + 12], fill=SIGNAL)

    sfont = load_font(38)
    draw.text((x, y + 56), "Model OT networks against the Purdue Model.", font=sfont, fill=(0xce, 0xd4, 0xd7))

    ffont = load_font(30)
    draw.text((x, H - 96), FOOTER, font=ffont, fill=(0x9b, 0xa3, 0xa8))

    # Hairline border, echoing the hero card's edge.
    m = 40
    draw.rectangle([m, m, W - m - 1, H - m - 1], outline=(206, 212, 215), width=1)
    return img


def main():
    out = ROOT / "public" / "og.png"
    out.parent.mkdir(exist_ok=True)
    draw_card(build_background()).save(out, "PNG", optimize=True)
    print(f"wrote {out} ({out.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
