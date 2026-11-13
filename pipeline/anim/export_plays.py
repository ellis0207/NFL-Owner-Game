"""Lays plays out on a Blender field and writes them as paths the game can follow.

    python3 pipeline/anim/export_plays.py <assets dir> [--save plays.blend]

One unit is one yard. x runs downfield from the line of scrimmage (the offense
attacks +x) and y runs across the field from the ball, positive to the
offense's left. Each player is an empty keyed at a few moments; Blender's
curves smooth the path between them, and the path is sampled ten times a
second. `--save` keeps the scene so a play can be opened and reshaped by hand.

Only the paths are written. The game picks the move to show (stance, run,
carry, dive) from how each player is travelling, and bends the carrier's path
to the gain the sim gave the play. Plays to the right are the left-side plays
mirrored by the game, so they aren't stored.

These are our own generic plays (inside run, off tackle, sweep), not any
club's playbook.
"""
import json
import math
import os
import sys

import bpy

FPS = 20     # keys land on twentieths of a second
STEP = 2     # sampled every tenth
LENGTH = 3.2  # seconds laid out; the game carries a longer run on from the last heading

# Where the offense lines up, by the quarterback's spot. Eleven personnel:
# one back, one tight end (right), three receivers.
LINE = {"LT": (-0.5, 3.0), "LG": (-0.5, 1.5), "C": (-0.3, 0.0), "RG": (-0.5, -1.5), "RT": (-0.5, -3.0),
        "TE": (-0.6, -4.6), "X": (-0.3, 18.0), "SL": (-1.2, 11.0), "Z": (-1.2, -19.0)}
BACKS = {
    "Under center": {"QB": (-1.3, 0.0), "RB": (-6.5, 0.0), "handoff": 0.75},
    "Pistol": {"QB": (-4.0, 0.0), "RB": (-7.0, 0.0), "handoff": 0.7},
    "Shotgun": {"QB": (-5.0, 0.0), "RB": (-5.2, -1.9), "handoff": 0.6},
}
# A four-three front with a safety walked out over the slot.
DEFENSE = {"DE1": (1.0, 4.3), "DT1": (1.0, 1.2), "DT2": (1.0, -1.3), "DE2": (1.0, -5.6),
           "WLB": (4.5, 3.6), "MLB": (4.6, 0.0), "SLB": (4.5, -3.9),
           "CB1": (6.0, 18.0), "CB2": (6.0, -19.0), "SS": (7.0, 10.0), "FS": (13.0, -2.0)}
BODY = {"LT": "line", "LG": "line", "C": "line", "RG": "line", "RT": "line", "DT1": "line", "DT2": "line", "DE1": "line", "DE2": "line"}

# The hole each run aims at, yards to the left of the ball.
RUNS = {"middle": 0.9, "tackle": 4.2, "end": 9.0}


def run_play(formation, hole):
    """Keys for every player on a run to the left: role -> [(seconds, x, y), ...]."""
    b = BACKS[formation]
    th = b["handoff"]
    flow = min(hole, 8.0) * 0.25  # how far the blocking slides toward the hole
    keys = {}
    for role, (x, y) in LINE.items():
        if role in ("X", "SL", "Z"):
            # Receivers run off the coverage, then block it.
            keys[role] = [(0, x, y), (1.2, 4.6, y * 0.97), (2.4, 6.0, y * 0.94), (LENGTH, 6.4, y * 0.93)]
        else:
            keys[role] = [(0, x, y), (0.8, 1.2, y + flow * 0.6), (2.0, 2.2, y + flow), (LENGTH, 2.5, y + flow)]
    qx, qy = b["QB"]
    if formation == "Under center":
        keys["QB"] = [(0, qx, qy), (th, -3.3, 0.5), (th + 1.0, -5.0, -1.4), (LENGTH, -5.6, -2.0)]
    else:
        keys["QB"] = [(0, qx, qy), (th, qx - 0.2, qy + 0.3), (th + 1.0, qx - 1.0, qy - 0.8), (LENGTH, qx - 1.2, qy - 1.0)]
    rx, ry = b["RB"]
    mx, my = keys["QB"][1][1] + 0.1, keys["QB"][1][2] + 0.5
    # He reaches the hole at a back's pace, however wide it is, and is in the clear a second later.
    hit = th + max(0.55, math.hypot(-0.3 - mx, hole * 0.9 - my) / 7.0)
    free = hit + 0.95
    keys["RB"] = [(0, rx, ry), (th, mx, my), (hit, -0.3, hole * 0.9), (hit + 0.45, 3.0, hole * 1.05),
                  (free, 6.5, hole * 1.12), (LENGTH, 6.5 + (LENGTH - free) * 8.0, hole * 1.2)]
    for role, (x, y) in DEFENSE.items():
        if role.startswith("D"):
            keys[role] = [(0, x, y), (0.8, 0.6, y + flow * 0.5), (2.0, 0.9, y + flow), (LENGTH, 1.0, y + flow)]
        elif role.endswith("LB"):
            keys[role] = [(0, x, y), (0.35, x, y), (1.5, 2.6, y + (hole - y) * 0.6), (2.2, 2.2, y + (hole - y) * 0.8), (LENGTH, 2.2, y + (hole - y) * 0.8)]
        elif role.startswith("CB"):
            keys[role] = [(0, x, y), (0.8, 8.0, y), (2.0, 6.6, y * 0.95), (LENGTH, 6.6, y * 0.94)]
        elif role == "SS":
            keys[role] = [(0, x, y), (0.6, 6.6, y), (2.0, 5.0, y + (hole - y) * 0.4), (LENGTH, 5.0, y + (hole - y) * 0.5)]
        else:
            keys[role] = [(0, x, y), (0.7, 12.5, y + 0.4), (2.3, 8.0, hole * 0.7), (LENGTH, 7.5, hole * 0.7)]
    return keys, th, free


def lay_out(name, keys):
    """One empty per player in its own collection, keyed along its path."""
    col = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(col)
    objs = {}
    for role, path in keys.items():
        o = bpy.data.objects.new(f"{name}:{role}", None)
        o.empty_display_size = 0.5
        col.objects.link(o)
        for t, x, y in path:
            o.location = (x, y, 0)
            o.keyframe_insert("location", frame=round(t * FPS))
        objs[role] = o
    return objs


def sample(objs):
    sc = bpy.context.scene
    frames = range(0, round(LENGTH * FPS) + 1, STEP)
    out = {role: [] for role in objs}
    for f in frames:
        sc.frame_set(f)
        for role, o in objs.items():
            # Tenths of a yard, as whole numbers, keep the file small.
            out[role] += [round(o.location.x * 10), round(o.location.y * 10)]
    return out


def main(assets, save):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.render.fps = FPS
    plays = []
    for formation in BACKS:
        for where, hole in RUNS.items():
            keys, th, free = run_play(formation, hole)
            objs = lay_out(f"{formation} {where}", keys)
            plays.append({"family": "run", "formation": formation, "where": where, "carrier": "RB", "from": "QB",
                          "handoff": th, "free": round(free, 2), "paths": sample(objs)})
    data = {"rate": FPS // STEP, "bodies": BODY, "offense": list(LINE) + ["QB", "RB"], "defense": list(DEFENSE), "plays": plays}
    os.makedirs(assets, exist_ok=True)
    with open(os.path.join(assets, "plays.json"), "w") as f:
        json.dump(data, f, separators=(",", ":"))
    if save:
        bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(save))


if __name__ == "__main__":
    args = sys.argv[1:]
    save = args[args.index("--save") + 1] if "--save" in args else None
    main(args[0], save)
