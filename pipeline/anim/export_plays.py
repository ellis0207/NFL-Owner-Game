"""Draws the offense's side of the game on a Blender field and writes it out as paths.

    python3 pipeline/anim/export_plays.py <assets dir> [--save plays.blend]

One unit is one yard. x runs downfield from the line of scrimmage (the offense
attacks +x) and y runs across the field from the ball, positive to the
offense's left. Every route and run is an empty keyed at a few moments;
Blender's curves smooth the path between the keys, and it is sampled ten times
a second. `--save` keeps the scene so a path can be reshaped by hand.

What is written:

- `formations`: where each group lines up, by the quarterback's spot
  (Under center, Pistol, Shotgun, Empty) and the personnel on the field
  ("11" is one back and one tight end, and so on).
- `routes`: the route tree, drawn for a receiver on the left side; +y is
  toward his sideline. The game mirrors a route for the right side.
- `runs`: the back's path and the quarterback's on a handoff to the left, by
  backfield and hole. Runs to the right are mirrored by the game.

The game decides everything else as it plays a row of the log: which routes
are run, how the line blocks, how the defense lines up and reacts, and where
the play ends, which is wherever the sim said it did.

These are our own generic formations and routes, not any club's playbook.
"""
import json
import math
import os
import sys

import bpy

FPS = 20     # keys land on twentieths of a second
STEP = 2     # sampled every tenth
RUN_LENGTH = 3.2

LINE = [(-0.5, 3.0), (-0.5, 1.5), (-0.3, 0.0), (-0.5, -1.5), (-0.5, -3.0)]  # left tackle to right tackle
WIDE_L, WIDE_R, SLOT_L, SLOT_R = (-0.3, 18.0), (-1.2, -19.0), (-1.2, 10.0), (-1.2, -11.0)
TE_R, TE_L, WING_R = (-0.6, -4.6), (-0.6, 4.6), (-1.5, -6.2)
RECEIVERS = {
    "10": {"WR": [WIDE_L, WIDE_R, SLOT_L, SLOT_R], "TE": []},
    "11": {"WR": [WIDE_L, WIDE_R, SLOT_L], "TE": [TE_R]},
    "12": {"WR": [WIDE_L, WIDE_R], "TE": [TE_R, TE_L]},
    "13": {"WR": [WIDE_L], "TE": [TE_R, TE_L, WING_R]},
    "21": {"WR": [WIDE_L, WIDE_R], "TE": [TE_R]},
}
BACKS = {
    "Under center": {"QB": (-1.3, 0.0), "RB": (-6.5, 0.0), "FB": (-4.2, 0.0), "handoff": 0.75},
    "Pistol": {"QB": (-4.0, 0.0), "RB": (-7.0, 0.0), "FB": (-4.6, 1.8), "handoff": 0.7},
    "Shotgun": {"QB": (-5.0, 0.0), "RB": (-5.2, -1.9), "FB": (-4.2, 2.0), "handoff": 0.6},
    # An empty backfield: the back splits out as one more receiver.
    "Empty": {"QB": (-5.0, 0.0), "RB": (-1.2, -7.5), "FB": (-1.2, 6.0), "handoff": 0.6},
}

# The route tree. Keys are (seconds, yards downfield, yards toward the sideline).
ROUTES = {
    "flat": [(0, 0, 0), (0.5, 2, 0.5), (1.4, 3, 5.5), (2.6, 3.5, 11)],
    "hitch": [(0, 0, 0), (0.9, 6, 0), (1.3, 5, -0.6), (3.0, 5, -0.6)],
    "slant": [(0, 0, 0), (0.45, 2.5, 0), (1.3, 7, -5.5), (2.4, 12, -12.5)],
    "out": [(0, 0, 0), (1.1, 8, 0), (1.7, 9, 4.0), (2.7, 9, 9.5)],
    "curl": [(0, 0, 0), (1.7, 12, 0), (2.2, 10.5, -1.5), (3.4, 10.5, -1.5)],
    "dig": [(0, 0, 0), (1.6, 12, 0), (2.3, 13, -5), (3.5, 13, -13.5)],
    "cross": [(0, 0, 0), (0.5, 3, -1), (1.6, 5, -9), (2.9, 6, -18.5)],
    "post": [(0, 0, 0), (1.6, 12, 0), (2.6, 20, -5), (3.6, 28, -9), (4.8, 38, -12)],
    "corner": [(0, 0, 0), (1.6, 12, 0), (2.6, 19.5, 5), (3.7, 27, 9.5)],
    "go": [(0, 0, 0), (1.1, 8, 0.3), (2.1, 17, 0.5), (3.1, 26, 0.5), (4.8, 41, 0.5)],
    "seam": [(0, 0, 0), (1.1, 8, 0), (2.1, 17, -0.5), (3.1, 26, -1), (4.8, 41, -1.5)],
    "bubble": [(0, 0, 0), (0.5, -0.8, 1.2), (1.1, -1.6, 3.2), (2.0, -1.6, 4.0)],
    "swing": [(0, 0, 0), (0.6, -0.5, 3), (1.4, 0, 8), (2.4, 1.5, 12)],
    "check": [(0, 0, 0), (0.5, 1.0, 0.6), (1.8, 1.2, 0.6), (2.7, 3, 3.5)],
    "leak": [(0, 0, 0), (0.7, 0.5, -1.0), (1.3, 0.2, -2.5), (2.0, -1.5, -3.0)],
}

# The hole each run aims at, yards to the left of the ball.
HOLES = {"middle": 0.9, "tackle": 4.2, "end": 9.0}


def run_keys(word, hole):
    """The quarterback's and the back's keys on a handoff to the left."""
    b = BACKS[word]
    th = b["handoff"]
    qx, qy = b["QB"]
    if word == "Under center":
        qb = [(0, qx, qy), (th, -3.3, 0.5), (th + 1.0, -5.0, -1.4), (RUN_LENGTH, -5.6, -2.0)]
    else:
        qb = [(0, qx, qy), (th, qx - 0.2, qy + 0.3), (th + 1.0, qx - 1.0, qy - 0.8), (RUN_LENGTH, qx - 1.2, qy - 1.0)]
    rx, ry = b["RB"]
    mx, my = qb[1][1] + 0.1, qb[1][2] + 0.5
    # He reaches the hole at a back's pace, however wide it is, and is in the clear a second later.
    hit = th + max(0.55, math.hypot(-0.3 - mx, hole * 0.9 - my) / 7.0)
    free = hit + 0.95
    rb = [(0, rx, ry), (th, mx, my), (hit, -0.3, hole * 0.9), (hit + 0.45, 3.0, hole * 1.05),
          (free, 6.5, hole * 1.12), (RUN_LENGTH, 6.5 + (RUN_LENGTH - free) * 8.0, hole * 1.2)]
    return qb, rb, th, free


def sampled(name, keys, col):
    """Keys an empty along a path and reads the smoothed curve back, in tenths of a yard."""
    o = bpy.data.objects.new(name, None)
    o.empty_display_size = 0.5
    col.objects.link(o)
    for t, x, y in keys:
        o.location = (x, y, 0)
        o.keyframe_insert("location", frame=round(t * FPS))
    sc = bpy.context.scene
    out = []
    for f in range(0, round(keys[-1][0] * FPS) + 1, STEP):
        sc.frame_set(f)
        out += [round(o.location.x * 10), round(o.location.y * 10)]
    return out


def collection(name):
    col = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(col)
    return col


def main(assets, save):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.render.fps = FPS
    formations = {}
    for word, b in BACKS.items():
        formations[word] = {}
        for personnel, r in RECEIVERS.items():
            formations[word][personnel] = {"QB": [b["QB"]], "RB": [b["RB"]], "FB": [b["FB"]], "WR": r["WR"], "TE": r["TE"], "OL": LINE}
    col = collection("routes")
    routes = {name: sampled(name, keys, col) for name, keys in ROUTES.items()}
    col = collection("runs")
    runs = []
    for word in ("Under center", "Pistol", "Shotgun"):
        for where, hole in HOLES.items():
            qb, rb, th, free = run_keys(word, hole)
            runs.append({"formation": word, "where": where, "handoff": th, "free": round(free, 2),
                         "back": sampled(f"{word} {where} back", rb, col), "qb": sampled(f"{word} {where} qb", qb, col)})
    data = {"rate": FPS // STEP, "formations": formations, "routes": routes, "runs": runs}
    os.makedirs(assets, exist_ok=True)
    with open(os.path.join(assets, "plays.json"), "w") as f:
        json.dump(data, f, separators=(",", ":"))
    if save:
        bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(save))


if __name__ == "__main__":
    args = sys.argv[1:]
    save = args[args.index("--save") + 1] if "--save" in args else None
    main(args[0], save)
