"""The moves, as joint angles worked out from a clock rather than keyed by hand.

`pose(action, i)` gives frame i of an action: degrees for each joint (positive
leans or swings forward, except knees, which only bend back), plus how far the
whole figure tips over (`tip`), how high the hips ride (`lift`, metres) and how
far it slides back as it goes down (`back`).
"""
import math

# Frames in each action. "down" is a player on the ground.
FRAMES = {"idle": 1, "run": 8, "carry": 8, "dive": 5, "down": 1,
          "set": 1, "block": 2, "throw": 4, "catch": 2, "kick": 4, "cheer": 2, "kneel": 1}


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
    base = {"spine": 8, "neck": -6, "hpL": 6, "hpR": -6, "knL": 10, "knR": 10,
            "shL": 10, "shR": 10, "elL": 25, "elR": 25, "lift": 0.0, "tip": 0}
    if action == "set":
        # A lineman's three-point stance: hips low, one hand on the ground.
        return {**base, "spine": 58, "neck": -45, "hpL": 62, "hpR": 50, "knL": 92, "knR": 80,
                "shL": 62, "shR": -20, "elL": 8, "elR": 70, "lift": -0.28}
    if action == "block":
        # Hands inside, then the punch.
        punch = i == 1
        return {**base, "spine": 16, "hpL": 28, "hpR": -18, "knL": 34, "knR": 22,
                "shL": 82 if punch else 58, "shR": 82 if punch else 58, "elL": 14 if punch else 78, "elR": 14 if punch else 78, "lift": -0.06}
    if action == "throw":
        # Ball back by the ear, the arm comes over the top, follow through.
        sh, el = [(-35, 115), (55, 125), (140, 55), (95, 15)][i]
        return {**base, "spine": [2, 6, 14, 20][i], "hpL": 24, "hpR": -16, "knL": 20, "knR": 14,
                "shR": sh, "elR": el, "shL": [70, 50, 20, -10][i], "elL": 40}
    if action == "catch":
        # Hands out to the ball, then the tuck.
        return {**base, "spine": 6, "shL": 118 if i == 0 else 60, "shR": 118 if i == 0 else 60,
                "elL": 22 if i == 0 else 105, "elR": 22 if i == 0 else 105, "hpL": 12, "hpR": -12}
    if action == "kick":
        # Plant, swing through, the leg finishes high.
        return {**base, "spine": [10, 4, -6, -12][i], "hpR": [-38, 8, 68, 96][i], "knR": [72, 44, 10, 4][i],
                "hpL": -4, "knL": 12, "shL": [35, 45, 60, 50][i], "shR": [-30, -40, -45, -30][i], "elL": 15, "elR": 15}
    if action == "cheer":
        return {**base, "shL": 172 if i == 0 else 150, "shR": 150 if i == 0 else 172, "elL": 8, "elR": 8,
                "neck": 6, "lift": 0.0 if i == 0 else 0.07}
    if action == "kneel":
        return {**base, "spine": 12, "hpL": 84, "knL": 96, "hpR": 2, "knR": 92, "lift": -0.4}
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
