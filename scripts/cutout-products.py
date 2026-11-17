"""
Cut the W2026 product shots out of their white backgrounds for the homepage pile.

Usage (needs Pillow + numpy):
    python3 scripts/cutout-products.py

Reads  public/preorder/figma-{item}.png  (650x650, white background)
Writes public/preorder/cutouts/{item}.png  (transparent, trimmed)
       src/scripts/product-cutouts.json    (size + a convex hit area per item, used as clip-path)
"""
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

SRC = Path("public/preorder")
OUT = SRC / "cutouts"
HULLS = Path("src/scripts/product-cutouts.json")

# Near-white counts as background when it touches the edge, or when it's an enclosed patch
# bigger than HOLE pixels (inside the tote handles and the keychain ring). Smaller white
# patches are part of the design (ascii art, the dino's teeth) and stay.
WHITE = 236
HOLE = 2500
EDGE = 4  # the exports have a faint grey frame on their edges
PAD = 6

# The keychain shot crops the top of its ring. Measured from the photo (source pixels): the
# stroke's widest row is y=62, its outer edge reaches x=71..583 there and y=263 at the bottom.
RINGS = {"keychain": {"center": (327.5, 62), "radii": (256.5, 201), "width": 6, "color": (255, 205, 56)}}


def close_ring(image, ring, scale=4):
    """Redraw the ring's top half. Above its widest row the photo has nothing but ring, and
    at that row the stroke runs vertically, so the new half meets the old one without a step."""
    (cx, cy), (rx, ry) = ring["center"], ring["radii"]  # radii to the stroke's outer edge
    extra = int(np.ceil(ry - cy + PAD))
    w, h = image.size
    split = int(cy) + extra  # the widest row, on the taller canvas
    canvas = Image.new("RGBA", (w, h + extra))
    canvas.paste(image, (0, extra))
    canvas.paste((0, 0, 0, 0), (0, 0, w, split))

    # draw at 4x and shrink, for a smooth stroke (PIL draws the width inward from the box)
    layer = Image.new("RGBA", (w * scale, (h + extra) * scale))
    mid = (cy + extra) * scale
    ImageDraw.Draw(layer).ellipse(
        ((cx - rx) * scale, mid - ry * scale, (cx + rx) * scale, mid + ry * scale),
        outline=(*ring["color"], 255),
        width=ring["width"] * scale,
    )
    layer = layer.resize(canvas.size, Image.LANCZOS)
    # bottom half stays the photo's, so the ring still passes through the charms as shot
    keep = np.zeros((h + extra, w), dtype=np.uint8)
    keep[:split] = 255
    layer.putalpha(Image.fromarray(np.minimum(np.array(layer.getchannel("A")), keep)))
    return Image.alpha_composite(canvas, layer), extra


def hull(points):
    pts = sorted(set(map(tuple, points)))
    if len(pts) < 3:
        return pts

    def cross(o, a, b):
        return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])

    lower, upper = [], []
    for p in pts:
        while len(lower) >= 2 and cross(lower[-2], lower[-1], p) <= 0:
            lower.pop()
        lower.append(p)
    for p in reversed(pts):
        while len(upper) >= 2 and cross(upper[-2], upper[-1], p) <= 0:
            upper.pop()
        upper.append(p)
    return lower[:-1] + upper[:-1]


def cut(item):
    rgb = np.array(Image.open(SRC / f"figma-{item}.png").convert("RGB"))
    h, w, _ = rgb.shape
    rgb[:EDGE], rgb[-EDGE:], rgb[:, :EDGE], rgb[:, -EDGE:] = 255, 255, 255, 255

    # 255 = could be background; flood the connected parts from the seeds with 128
    candidate = Image.fromarray(np.where(rgb.min(axis=2) >= WHITE, 255, 0).astype(np.uint8)).copy()  # fromarray images are read-only
    ImageDraw.floodfill(candidate, (0, 0), 128)  # the edge is all white, so this reaches all of it
    # label the enclosed white patches one at a time: big ones are holes, small ones are design
    while True:
        remaining = np.argwhere(np.array(candidate) == 255)
        if not len(remaining):
            break
        y, x = remaining[0]
        ImageDraw.floodfill(candidate, (int(x), int(y)), 64)
        patch = np.array(candidate) == 64
        candidate = Image.fromarray(
            np.where(patch, 128 if patch.sum() > HOLE else 1, np.array(candidate)).astype(np.uint8)
        ).copy()
    background = np.array(candidate) == 128

    # soften the edge by a pixel so it doesn't look jagged when rotated
    alpha = Image.fromarray(np.where(background, 0, 255).astype(np.uint8))
    alpha = alpha.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.8))

    image = Image.fromarray(rgb).convert("RGBA")
    image.putalpha(alpha)
    shift = 0  # how far close_ring moved the photo down
    if item in RINGS:
        image, shift = close_ring(image, RINGS[item])
    w, h = image.size
    left, top, right, bottom = image.getbbox()
    box = (max(left - PAD, 0), max(top - PAD, 0), min(right + PAD, w), min(bottom + PAD, h))
    image = image.crop(box)
    OUT.mkdir(parents=True, exist_ok=True)
    image.save(OUT / f"{item}.png", optimize=True)

    # convex hull of the opaque pixels, as clip-path percentages, so hovering the
    # transparent corners of a cutout reaches the item underneath. A ring is left out,
    # or its empty middle would cover everything it loops over.
    solid = np.array(image.getchannel("A")) > 24
    if item in RINGS:
        (cx, cy), (rx, ry) = RINGS[item]["center"], RINGS[item]["radii"]
        yy, xx = np.mgrid[: image.height, : image.width]
        d = np.hypot((xx + box[0] - cx) / rx, (yy + box[1] - shift - cy) / ry)
        solid &= np.abs(d - 1) * min(rx, ry) > RINGS[item]["width"] + 4
    ys, xs = np.nonzero(solid)
    cw, ch = image.size
    poly = hull(np.stack([xs, ys], axis=1))
    clip = ", ".join(f"{x / cw * 100:.1f}% {y / ch * 100:.1f}%" for x, y in poly)
    return {"width": cw, "height": ch, "clip": f"polygon({clip})"}


if __name__ == "__main__":
    data = {item: cut(item) for item in ["shirt", "tote", "socks", "keychain"]}
    HULLS.write_text(json.dumps(data, indent=2) + "\n")
    for item, d in data.items():
        print(item, d["width"], "x", d["height"], len(d["clip"]), "chars")
