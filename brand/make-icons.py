#!/usr/bin/env python3
"""
Every MITOS icon, generated from the one logo file.

Run:  python3 brand/make-icons.py

── Why this is a script and not five hand-exported PNGs ──────────────────

There are seven icons in play — four in the web manifest, one for iOS, one
for the Shopify App Store listing, one favicon — and they must be the same
mark at every size. Exported by hand they drift: one gets re-cropped a little
tighter, one keeps a stale version of the logo, and the drift is invisible
until a merchant sees two different icons for the same product. So the mark
is stored once, and every size is derived.

── The two paddings ──────────────────────────────────────────────────────

`purpose: any` icons are drawn as-is, so the mark fills most of the square.

`purpose: maskable` icons are cropped by the platform to whatever shape it
likes — a circle on some Android launchers, a squircle on others — and only
the middle 80 % is guaranteed to survive. The mark is therefore drawn much
smaller there. It looks over-padded opened as a file, and correct on a phone.

── Why the background is white ───────────────────────────────────────────

The mark is a purple-to-cyan gradient. It is legible on white and muddy on
anything dark, and white is how the brand was drawn. The manifest's
background_color matches it, so the splash screen is the logo on its own
card rather than the logo floating on a different grey.
"""

from PIL import Image
import pathlib

HERE = pathlib.Path(__file__).parent
ICONS = HERE.parent / "mitos-dashboard" / "icons"
WHITE = (255, 255, 255)

mark = Image.open(HERE / "mitos-mark.png").convert("RGBA")


def save(im: Image.Image, path) -> None:
    """Every icon is written the same way, or one of them drifts.

    optimize + compress_level 9 is lossless — the pixels are identical, only
    the deflate window changes — and it takes about 2.5 % off each file. That
    matters more than it sounds: these bytes are uploaded on every deploy and
    downloaded by every phone that installs the app.
    """
    im.save(path, optimize=True, compress_level=9)


def icon(size: int, coverage: float, *, flatten: bool = False) -> Image.Image:
    """The mark centred on white, occupying `coverage` of the square."""
    canvas = Image.new("RGBA", (size, size), WHITE + (255,))
    box = size * coverage
    scale = min(box / mark.width, box / mark.height)
    w, h = round(mark.width * scale), round(mark.height * scale)
    resized = mark.resize((w, h), Image.LANCZOS)
    canvas.alpha_composite(resized, ((size - w) // 2, (size - h) // 2))
    # iOS rejects an apple-touch-icon with an alpha channel: it composites it
    # on black, and a logo drawn for white comes out unreadable.
    return canvas.convert("RGB") if flatten else canvas


ICONS.mkdir(parents=True, exist_ok=True)

# purpose: any — drawn as-is by the platform.
save(icon(192, 0.82), ICONS / "icon-192.png")
save(icon(512, 0.82), ICONS / "icon-512.png")

# purpose: maskable — only the middle 80 % is guaranteed to survive the crop.
save(icon(192, 0.58), ICONS / "icon-maskable-192.png")
save(icon(512, 0.58), ICONS / "icon-maskable-512.png")

# iOS home screen. No alpha, and iOS rounds the corners itself.
save(icon(180, 0.82, flatten=True), ICONS / "apple-touch-icon.png")

# The gate screen draws the mark itself, on the page's own background, so
# this one keeps its transparency and is not squared off.
_g = mark.resize((256, round(256 * mark.height / mark.width)), Image.LANCZOS)
save(_g, ICONS / "mark.png")

# Browser tab.
save(icon(32, 0.90), ICONS / "favicon-32.png")

# Shopify App Store listing. Their spec is 1200×1200 PNG or JPEG.
save(icon(1200, 0.78, flatten=True), HERE / "mitos-app-icon-1200.png")

for f in sorted([*ICONS.glob("*.png"), HERE / "mitos-app-icon-1200.png"]):
    im = Image.open(f)
    print(f"{f.relative_to(HERE.parent)}  {im.size[0]}x{im.size[1]}  {im.mode}  {f.stat().st_size:,} B")
