"""Packs the rendered frames into one image per body and writes its index.

    python3 pipeline/anim/pack_atlas.py <frames dir> <assets dir> [body ...]

Each frame gets a one-pixel black outline so figures read against the grass.
The index lists, for each action, the column its first frame starts in; a
frame's eight directions fill one row each (direction d of frame f of an
action is at column start + f, row d).
"""
import json
import os
import sys

from PIL import Image, ImageFilter

sys.path.insert(0, os.path.dirname(__file__))
from actions import FRAMES  # noqa: E402
from render_sprites import CENTER, DIRS, SIZE, SPAN, TILT  # noqa: E402
import math  # noqa: E402


def outlined(im):
    alpha = im.getchannel("A")
    solid = alpha.point(lambda a: 255 if a > 96 else 0)
    edge = solid.filter(ImageFilter.MaxFilter(3))
    out = Image.new("RGBA", im.size, (0, 0, 0, 0))
    out.paste((0, 0, 0, 255), mask=edge)
    out.alpha_composite(im)
    return out


def main(frames, assets, bodies):
    os.makedirs(assets, exist_ok=True)
    cols = sum(FRAMES.values())
    start, at = {}, 0
    for action, n in FRAMES.items():
        start[action] = [at, n]
        at += n
    for body in bodies:
        sheet = Image.new("RGBA", (cols * SIZE, DIRS * SIZE), (0, 0, 0, 0))
        for action, (c0, n) in start.items():
            for i in range(n):
                for d in range(DIRS):
                    im = Image.open(os.path.join(frames, body, f"{action}-{i}-{d}.png")).convert("RGBA")
                    sheet.paste(outlined(im), ((c0 + i) * SIZE, d * SIZE))
        sheet.save(os.path.join(assets, f"{body}.webp"), lossless=True, method=6)
    index = {
        "size": SIZE,
        "dirs": DIRS,
        # Yards a frame spans on the field, and where the figure's feet are in it.
        "span": round(SPAN / 0.9144, 3),
        "foot": [SIZE / 2, round(SIZE / 2 + CENTER * math.cos(math.radians(TILT)) / SPAN * SIZE, 2)],
        "actions": start,
        "bodies": bodies,
    }
    with open(os.path.join(assets, "sprites.json"), "w") as f:
        json.dump(index, f, separators=(",", ":"))


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2], sys.argv[3:] or ["skill"])
