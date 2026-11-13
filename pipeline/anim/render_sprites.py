"""Renders every frame of every action from eight sides, as mask images.

Run with Blender's Python (`pip install bpy`, or `blender -b -P`):

    python3 pipeline/anim/render_sprites.py <out dir> [body ...]

The camera looks down at the field from 60 degrees, the angle the field view
is drawn from, and never moves; the figure turns instead. Direction 0 faces
the right of the screen and each step turns 45 degrees counter-clockwise.
"""
import math
import os
import sys

import bpy

sys.path.insert(0, os.path.dirname(__file__))
import actions  # noqa: E402
import rig  # noqa: E402

SIZE = 64          # pixels a frame
SPAN = 2.7         # metres across a frame
TILT = 60          # degrees above the horizon
CENTER = 0.7       # height the camera aims at
DIRS = 8


def scene_setup():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.device = "CPU"
    sc.cycles.samples = 24
    sc.cycles.use_denoising = False
    sc.cycles.max_bounces = 0
    sc.render.film_transparent = True
    sc.render.resolution_x = sc.render.resolution_y = SIZE
    sc.render.resolution_percentage = 100
    sc.render.image_settings.file_format = "PNG"
    sc.render.image_settings.color_mode = "RGBA"
    sc.view_settings.view_transform = "Standard"
    sc.view_settings.look = "None"
    sc.world = bpy.data.worlds.new("w")
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
    sc.collection.objects.link(cam)
    cam.data.type = "ORTHO"
    cam.data.ortho_scale = SPAN
    t = math.radians(TILT)
    cam.location = (0, -10 * math.cos(t), CENTER + 10 * math.sin(t))
    cam.rotation_euler = (math.pi / 2 - t, 0, 0)
    sc.camera = cam
    return sc


def main(out, bodies):
    for body in bodies:
        sc = scene_setup()
        joints = rig.build(body)
        os.makedirs(os.path.join(out, body), exist_ok=True)
        for action, n in actions.FRAMES.items():
            for i in range(n):
                actions.apply(joints, actions.pose(action, i))
                for d in range(DIRS):
                    turn = math.radians(45 * d)
                    back = joints["root"]["back"]
                    joints["root"].rotation_euler[2] = turn
                    joints["root"].location = (-back * math.cos(turn), -back * math.sin(turn), 0)
                    sc.render.filepath = os.path.join(out, body, f"{action}-{i}-{d}.png")
                    bpy.ops.render.render(write_still=True)


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("-")]
    main(args[0], args[1:] or ["skill"])
