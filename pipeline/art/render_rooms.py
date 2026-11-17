"""Renders the room pictures for the page headers and writes them as WebP.

    pip install bpy pillow
    python3 pipeline/art/render_rooms.py assets/art [room ...]

Each picture is 1600 x 420, about 30-60 KB. They ship beside the page
(dist/art) and are optional: a header without its picture keeps the room's
flat color.
"""
import os
import sys
import tempfile

import bpy
from PIL import Image

sys.path.insert(0, os.path.dirname(__file__))
import scenes  # noqa: E402


def main(out, rooms):
    os.makedirs(out, exist_ok=True)
    for room in rooms:
        scenes.ROOMS[room]()
        png = os.path.join(tempfile.gettempdir(), f"room-{room}.png")
        bpy.context.scene.render.filepath = png
        bpy.ops.render.render(write_still=True)
        Image.open(png).convert("RGB").save(os.path.join(out, f"{room}.webp"), "WEBP", quality=80, method=6)
        print(room, os.path.getsize(os.path.join(out, f"{room}.webp")) // 1024, "KB")


if __name__ == "__main__":
    args = sys.argv[1:]
    main(args[0], args[1:] or list(scenes.ROOMS))
