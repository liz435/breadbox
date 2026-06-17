#!/usr/bin/env python3
"""Regenerate Breadbox app icons / logo from the bread-box source image.

Pipeline: auto-detect the bread (light cream pixels stand out against the
orange field) -> centre a square crop that frames it with breathing room ->
apply a supersampled rounded-corner (squircle-ish) alpha mask -> export every
size the Tauri bundler, notifications, splash, and web favicon need.
"""
import base64
import io
import os
import subprocess

from PIL import Image, ImageDraw

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
ICONS = os.path.join(ROOT, "packages/desktop/src-tauri/icons")
# Vendored brand source so icons can be regenerated reproducibly.
# Override with ICON_SOURCE=/path/to/image.png to re-brand from a new image.
SRC = os.environ.get("ICON_SOURCE", os.path.join(ICONS, "icon-source.jpeg"))
APP_PUBLIC = os.path.join(ROOT, "packages/app/public")
SPLASH = os.path.join(ROOT, "packages/desktop/splash")

CORNER = 0.2237          # corner radius as fraction of the rounded body (Apple squircle ~22%)
BREAD_FILL = 0.72        # bread's longest side should fill ~72% of the tile
APP_CONTENT = 824 / 1024  # macOS icon grid: rounded body is 824px in a 1024 canvas (~100px margin)
SS = 4                   # supersample factor for a smooth mask edge


def detect_bread_bbox(im):
    """Bounding box of the cream bread: blue channel is ~138 on the loaf, ~0 on the orange field."""
    b = im.split()[2]
    mask = b.point(lambda v: 255 if v > 60 else 0)
    bbox = mask.getbbox()
    if bbox is None:
        raise SystemExit("could not locate the bread in the source image")
    return bbox


def square_crop(im):
    W, H = im.size
    l, t, r, b = detect_bread_bbox(im)
    cx, cy = (l + r) / 2, (t + b) / 2
    side = max(r - l, b - t) / BREAD_FILL
    side = min(side, W, H)                       # never exceed the source
    half = side / 2
    # keep the square in-bounds by nudging the centre if it would overflow
    cx = min(max(cx, half), W - half)
    cy = min(max(cy, half), H - half)
    box = (round(cx - half), round(cy - half), round(cx + half), round(cy + half))
    return im.crop(box)


def rounded(tile, size):
    """Resize the cropped tile to `size` and punch rounded-corner transparency."""
    tile = tile.convert("RGBA").resize((size, size), Image.LANCZOS)
    big = size * SS
    mask = Image.new("L", (big, big), 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        (0, 0, big - 1, big - 1), radius=round(big * CORNER), fill=255
    )
    mask = mask.resize((size, size), Image.LANCZOS)
    tile.putalpha(mask)
    return tile


def app_icon(tile, size):
    """Rounded body inset inside transparent padding so it matches Apple's icon grid in the Dock."""
    body = max(1, round(size * APP_CONTENT))
    mark = rounded(tile, body)
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    off = (size - body) // 2
    canvas.paste(mark, (off, off), mark)
    return canvas


def save_png(img, path):
    img.save(path, "PNG")
    print("wrote", os.path.relpath(path, ROOT))


def embed_svg(img512, path, title):
    buf = io.BytesIO()
    img512.save(buf, "PNG")
    data = base64.b64encode(buf.getvalue()).decode()
    svg = (
        '<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" '
        'viewBox="0 0 1024 1024" role="img" aria-label="{title}">\n'
        '  <title>{title}</title>\n'
        '  <image width="1024" height="1024" '
        'xlink:href="data:image/png;base64,{data}" '
        'xmlns:xlink="http://www.w3.org/1999/xlink"/>\n'
        "</svg>\n"
    ).format(title=title, data=data)
    with open(path, "w") as f:
        f.write(svg)
    print("wrote", os.path.relpath(path, ROOT))


def main():
    src = Image.open(SRC).convert("RGB")
    tile = square_crop(src)
    print("source", src.size, "-> crop", tile.size)

    master = rounded(tile, 1024)          # full-bleed logo mark (favicon / splash / toast / svg)
    os.makedirs(APP_PUBLIC, exist_ok=True)

    def at(size):
        return master.resize((size, size), Image.LANCZOS)

    def app(size):
        # build each app-icon size natively from the crop (no downscale ringing at 16/32px)
        return app_icon(tile, size)

    # --- Tauri bundler PNGs (padded to the macOS icon grid) ---
    save_png(app(32), os.path.join(ICONS, "32x32.png"))
    save_png(app(128), os.path.join(ICONS, "128x128.png"))
    save_png(app(256), os.path.join(ICONS, "128x128@2x.png"))
    save_png(at(512), os.path.join(ICONS, "icon.png"))   # loose full-bleed logo source

    # --- notification / toast icon (full-bleed mark) ---
    save_png(master, os.path.join(ICONS, "toast-icon.png"))

    # --- Windows .ico (multi-resolution, padded) ---
    ico_path = os.path.join(ICONS, "icon.ico")
    app(256).save(ico_path, sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
    print("wrote", os.path.relpath(ico_path, ROOT))

    # --- macOS .icns via iconutil ---
    iconset = os.path.join(ICONS, "icon.iconset")
    os.makedirs(iconset, exist_ok=True)
    icns_map = {
        "icon_16x16.png": 16, "icon_16x16@2x.png": 32,
        "icon_32x32.png": 32, "icon_32x32@2x.png": 64,
        "icon_128x128.png": 128, "icon_128x128@2x.png": 256,
        "icon_256x256.png": 256, "icon_256x256@2x.png": 512,
        "icon_512x512.png": 512, "icon_512x512@2x.png": 1024,
    }
    for name, sz in icns_map.items():
        app(sz).save(os.path.join(iconset, name), "PNG")
    subprocess.run(
        ["iconutil", "-c", "icns", iconset, "-o", os.path.join(ICONS, "icon.icns")],
        check=True,
    )
    print("wrote", os.path.relpath(os.path.join(ICONS, "icon.icns"), ROOT))
    for name in icns_map:
        os.remove(os.path.join(iconset, name))
    os.rmdir(iconset)

    # --- brand-source SVGs (embed the rounded raster) ---
    img512 = at(512)
    embed_svg(img512, os.path.join(ICONS, "icon.svg"), "Breadbox")
    embed_svg(img512, os.path.join(ICONS, "toast-icon.svg"), "Breadbox")

    # --- web favicon ---
    save_png(at(64), os.path.join(APP_PUBLIC, "favicon.png"))

    # --- desktop splash mark (referenced by splash/index.html) ---
    save_png(at(256), os.path.join(SPLASH, "mark.png"))


if __name__ == "__main__":
    main()
