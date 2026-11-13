"""The moves, as joint angles worked out from a clock rather than keyed by hand.

`pose(action, i)` gives frame i of an action: degrees for each joint (positive
leans or swings forward, except knees, which only bend back), plus how far the
whole figure tips over (`tip`), how high the hips ride (`lift`, metres) and how
far it slides back as it goes down (`back`).
"""
import math

# Frames in each action. "down" is a player on the ground.
FRAMES = {"idle": 1, "run": 8, "carry": 8, "dive": 5, "down": 1}


def _run(p, carry):
    s, c = math.sin(2 * math.pi * p), math.cos(2 * math.pi * p)
    pose = {
        "spine": 14, "neck": -8,
        "hpL": 42 * s, "hpR": -42 * s,
        "knL": 18 + 62 * max(0, -c), "knR": 18 + 62 * max(0, c),
        "shL": -38 * s, "shR": 38 * s, "elL": 85, "elR": 85,
        "lift": 0.035 * abs(c), "tip": 0,
    }
    if carry:
        # The ball arm stays tucked against the body.
        pose["shR"], pose["elR"] = 12, 120
    return pose


def _dive(t):
    # From a run to laid out on the ground, arms reaching.
    k = t * t * (3 - 2 * t)
    return {
        "spine": 14 + 6 * k, "neck": -8 - 30 * k,
        "hpL": 30 * (1 - k) - 8 * k, "hpR": -30 * (1 - k) - 4 * k,
        "knL": 30 * (1 - k) + 6, "knR": 50 * (1 - k) + 10,
        "shL": 40 + 110 * k, "shR": 20 + 125 * k, "elL": 60 * (1 - k) + 8, "elR": 60 * (1 - k) + 8,
        "lift": -0.72 * k, "tip": 84 * k, "back": 0.85 * k,
    }


def pose(action, i):
    if action == "idle":
        # Two-point stance: knees bent, weight forward, hands ready.
        return {"spine": 24, "neck": -18, "hpL": 28, "hpR": 20, "knL": 46, "knR": 38,
                "shL": 22, "shR": 22, "elL": 55, "elR": 55, "lift": -0.07, "tip": 0}
    if action in ("run", "carry"):
        return _run(i / FRAMES[action], action == "carry")
    if action == "dive":
        return _dive((i + 1) / FRAMES["dive"])
    if action == "down":
        return _dive(1)
    raise ValueError(action)


def apply(joints, p):
    """Sets the figure's joints to a pose."""
    r = math.radians
    joints["root"].rotation_euler = (0, r(p["tip"]), joints["root"].rotation_euler[2])
    # A figure going to ground pivots at its feet; `back` slides it so the body stays over its spot.
    joints["root"]["back"] = p.get("back", 0.0)
    joints["hips"].location[2] = 0.95 + p["lift"]
    joints["spine"].rotation_euler[1] = r(p["spine"])
    joints["neck"].rotation_euler[1] = r(p["neck"])
    for side in "LR":
        joints["sh" + side].rotation_euler[1] = -r(p["sh" + side])
        joints["el" + side].rotation_euler[1] = -r(p["el" + side])
        joints["hp" + side].rotation_euler[1] = -r(p["hp" + side])
        joints["kn" + side].rotation_euler[1] = r(p["kn" + side])
