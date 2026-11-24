"""The 3D player's moves, worked out as joint angles and keyed into Blender actions.

A pose is a dict of joint angles in degrees, read in the figure's own terms
(it faces +X, its left is +Y):

    root    (tip, roll, turn): the whole body pivoting at the feet; with rx/ry (metres) to slide it
            and air (metres) to lift it off the ground; it is otherwise set down so its lowest part touches
    hips, spine, chest, neck, head: (lean forward, bend to his left, turn to his left)
    armL/armR, legL/legR: (swing forward, out to the side, twist); 0, 0 hangs straight down
    elbL/elbR, kneeL/kneeR: bend;  handL/handR, footL/footR: flex (feet: + points the toes)

Loops (runs, blocks, dances) are one cycle long; the game picks the point in a
run cycle from how far the player has gone, so feet don't slide. One-shot moves
end on their last pose, which the game holds.
"""
import math

from mathutils import Matrix, Quaternion, Vector

import player3d as P

FPS = 30
TUPLE = ("root", "hips", "spine", "chest", "neck", "head", "armL", "armR", "legL", "legR")
SCALAR = ("elbL", "elbR", "kneeL", "kneeR", "handL", "handR", "footL", "footR", "rx", "ry", "air")


def stand(**over):
    """A relaxed standing pose, with changes. Legs are angles from straight down, whatever the hips do."""
    p = {k: (0.0, 0.0, 0.0) for k in TUPLE}
    p.update({k: 0.0 for k in SCALAR})
    p["armL"] = (6, 9, 0); p["armR"] = (6, 9, 0); p["elbL"] = p["elbR"] = 14
    p["legL"] = (0, 3, 0); p["legR"] = (0, 3, 0); p["kneeL"] = p["kneeR"] = 5
    p.update(over)
    return p


def mix(a, b, k):
    out = {}
    for key in a:
        x, y = a[key], b.get(key, a[key])
        out[key] = tuple(u + (v - u) * k for u, v in zip(x, y)) if isinstance(x, tuple) else x + (y - x) * k
    return out


def smooth(k):
    k = max(0.0, min(1.0, k))
    return k * k * (3 - 2 * k)


def keyed(keys, i, loop_len=None):
    """Pose at frame i from (frame, pose) keys, easing between them; a loop wraps back to its first key."""
    if loop_len is not None:
        i %= loop_len
        keys = keys + [(loop_len, keys[0][1])]
    if i <= keys[0][0]:
        return keys[0][1]
    for (f0, a), (f1, b) in zip(keys, keys[1:]):
        if i <= f1:
            return mix(a, b, smooth((i - f0) / max(1e-6, f1 - f0)))
    return keys[-1][1]


def curve(pts, q):
    """A value along (phase, value) points, phase 0..1, eased between them and wrapping."""
    q %= 1.0
    pts = pts + [(1.0 + pts[0][0], pts[0][1])]
    for (a, va), (b, vb) in zip(pts, pts[1:]):
        if a <= q <= b:
            return va + (vb - va) * smooth((q - a) / max(1e-6, b - a))
    return pts[0][1]


# ---- Running ----

def stride(q, lean, reach, knee_hi, arm, crouch=0.0, carry=False, back=False):
    """A running stride at phase q (left foot strikes at 0, right at .5)."""
    def leg(ph):
        if back:
            ph = 1 - ph
        thigh = curve([(0, reach), (0.3, -reach * 0.75), (0.45, -reach * 0.55), (0.78, reach * 1.25)], ph) + crouch * 40
        knee = curve([(0, 18), (0.12, 38), (0.3, 16), (0.62, knee_hi), (0.88, 40)], ph) + crouch * 60
        foot = curve([(0, 2), (0.3, 30), (0.55, 5), (0.85, -6)], ph)
        return thigh, knee, foot
    tl, kl, fl = leg(q)
    tr, kr, fr = leg(q + 0.5)
    sw = math.cos(2 * math.pi * q)
    p = stand(
        hips=(lean * 0.4 + crouch * 25, 0, 7 * sw), spine=(lean * 0.35, 0, -4 * sw), chest=(lean * 0.25, 0, -6 * sw),
        neck=(-lean * 0.5 - crouch * 20, 0, 3 * sw), head=(-lean * 0.3, 0, 0),
        legL=(tl, 4, 0), legR=(tr, 4, 0), kneeL=kl, kneeR=kr, footL=fl, footR=fr,
        armL=(-arm * sw + 10, 12, 0), armR=(arm * sw + 10, 12, 0), elbL=85 - 15 * sw, elbR=85 + 15 * sw,
    )
    # A little float between foot strikes.
    p["air"] = 0.05 * max(0.0, math.sin(4 * math.pi * q - 0.9)) * (reach / 35)
    if carry:
        p["armR"] = (30, 18, -35); p["elbR"] = 118; p["handR"] = 20
    if back:
        p["air"] = 0.0
    return p


def run_cycle(n, lean, reach, knee_hi, arm, **kw):
    return lambda i: stride(i / n, lean, reach, knee_hi, arm, **kw)


def shuffle(i, n=16):
    """Side steps to his left, knees bent and hands ready."""
    q = i / n
    o = 14 * math.sin(2 * math.pi * q)
    return stand(hips=(18, 0, 0), spine=(10, 0, 0), neck=(-22, 0, 0), legL=(22, 10 + o, 0), legR=(22, 10 - o, 0),
                 kneeL=48, kneeR=48, footL=-10, footR=-10, armL=(40, 18, 0), armR=(40, 18, 0), elbL=80, elbR=80,
                 air=0.03 * abs(math.sin(2 * math.pi * q)))


def pass_set(i, n=16):
    """An offensive lineman's kick slide: sitting back, hands up and ready to punch."""
    q = i / n
    s = math.sin(2 * math.pi * q)
    return stand(hips=(28, 0, 0), spine=(8, 0, 0), chest=(4, 0, 0), neck=(-28, 0, 0),
                 legL=(30 + 14 * s, 14, 0), legR=(30 - 14 * s, 14, 0), kneeL=62 - 10 * s, kneeR=62 + 10 * s,
                 armL=(62, 22, 30), armR=(62, 22, 30), elbL=95, elbR=95, handL=-20, handR=-20)


def block(i, n=24):
    """Engaged: hands inside on the man's chest, driving with short choppy steps."""
    q = i / n
    s = math.sin(2 * math.pi * q * 2)
    return stand(hips=(40, 0, 4 * s), spine=(10, 0, 0), chest=(4, 0, 0), neck=(-38, 0, 0),
                 legL=(38 + 10 * s, 10, 0), legR=(38 - 10 * s, 10, 0), kneeL=60 - 8 * s, kneeR=60 + 8 * s, footL=-8, footR=-8,
                 armL=(78 + 4 * s, 14, 20), armR=(78 - 4 * s, 14, 20), elbL=38, elbR=38, handL=-30, handR=-30)


def rush(i, n=24):
    """A pass rusher working the man in front of him: club, then rip and swim over the top."""
    k = [
        (0, dict(arm=((70, 20, 10), (70, 20, 10)), elb=(40, 40), twist=0)),
        (6, dict(arm=((110, 40, 0), (55, 10, 20)), elb=(50, 30), twist=12)),
        (12, dict(arm=((150, 25, 0), (30, 15, 0)), elb=(40, 80), twist=20)),
        (18, dict(arm=((55, 10, 20), (110, 40, 0)), elb=(30, 50), twist=-12)),
    ]
    poses = [(f, stand(hips=(42, 0, d["twist"]), spine=(10, 0, d["twist"] * 0.5), neck=(-40, 0, 0),
                       legL=(42, 10, 0), legR=(30, 10, 0), kneeL=64, kneeR=52, footL=-8, footR=-8,
                       armL=d["arm"][0], armR=d["arm"][1], elbL=d["elb"][0], elbR=d["elb"][1])) for f, d in k]
    p = keyed(poses, i, n)
    # Feet keep chopping underneath.
    s = math.sin(2 * math.pi * i / n * 3)
    p["legL"] = (p["legL"][0] + 8 * s, p["legL"][1], 0); p["legR"] = (p["legR"][0] - 8 * s, p["legR"][1], 0)
    return p


# ---- Stances and set poses ----

STANCE3 = stand(hips=(68, 0, 0), spine=(8, 0, 0), chest=(4, 0, 0), neck=(-62, 0, 0), head=(-12, 0, 0),
                legL=(62, 12, 0), legR=(84, 10, 0), kneeL=98, kneeR=112, footL=-24, footR=-30,
                armL=(52, 16, 0), armR=(78, 4, 0), elbL=96, elbR=4, handR=-30)
STANCE2 = stand(hips=(26, 0, 6), spine=(6, 0, 0), neck=(-24, 0, 0), legL=(26, 6, 0), legR=(-6, 4, 0),
                kneeL=34, kneeR=20, footL=-8, footR=8, armL=(30, 8, 0), armR=(-6, 8, 0), elbL=70, elbR=50)
READY = stand(hips=(30, 0, 0), spine=(8, 0, 0), neck=(-30, 0, 0), legL=(30, 12, 0), legR=(30, 12, 0),
              kneeL=52, kneeR=52, footL=-12, footR=-12, armL=(40, 16, 0), armR=(40, 16, 0), elbL=80, elbR=80)
UNDER = stand(hips=(32, 0, 0), spine=(10, 0, 0), neck=(-26, 0, 0), legL=(30, 14, 0), legR=(30, 14, 0),
              kneeL=56, kneeR=56, footL=-12, footR=-12, armL=(56, 2, -40), armR=(52, -2, 40), elbL=40, elbR=40, handL=-30, handR=-30)
GUN = stand(hips=(14, 0, 0), spine=(4, 0, 0), neck=(-10, 0, 0), legL=(14, 9, 0), legR=(10, 9, 0),
            kneeL=24, kneeR=22, armL=(46, 10, 0), armR=(46, 10, 0), elbL=96, elbR=96)
HOLD = stand(hips=(34, 0, 0), spine=(14, 0, 0), neck=(-20, 0, 0), legL=(84, 8, 0), legR=(-10, 6, 0),
             kneeL=94, kneeR=118, footL=-15, footR=60, armL=(80, 18, 0), armR=(60, -10, 0), elbL=10, elbR=40)
KNEEL = stand(hips=(4, 0, 0), legL=(84, 8, 0), legR=(-12, 6, 0), kneeL=92, kneeR=114, footL=-8, footR=58,
              armL=(30, 6, 0), armR=(40, 4, 0), elbL=60, elbR=80)
HIPS_HANDS = stand(armL=(-10, 40, 0), armR=(-10, 40, 0), elbL=110, elbR=110, handL=10, handR=10, legL=(0, 8, 0), legR=(0, 8, 0))
PRONE = stand(root=(86, 0, 0), hips=(0, 0, 0), neck=(-40, 0, 12), legL=(-4, 10, 0), legR=(-2, 6, 0), kneeL=12, kneeR=26,
              footL=40, footR=40, armL=(150, 24, 0), armR=(120, 30, 0), elbL=30, elbR=60)
SUPINE = stand(root=(-84, 0, 0), neck=(30, 0, 0), legL=(10, 12, 0), legR=(30, 8, 0), kneeL=20, kneeR=40,
               armL=(20, 50, 0), armR=(30, 40, 0), elbL=40, elbR=30)


def idle(i, n=60):
    b = math.sin(2 * math.pi * i / n)
    return stand(spine=(2 + b, 0, 0), chest=(1 + b, 0, 0), neck=(-3, 0, 4 * b), hips=(0, 1.5 * b, 0),
                 armL=(8 + 2 * b, 9, 0), armR=(8 - 2 * b, 9, 0))


def breathe(pose, n=40):
    """A held pose that breathes a little, so a lineman in his stance isn't a statue."""
    def f(i):
        b = math.sin(2 * math.pi * i / n)
        p = dict(pose)
        p["chest"] = (pose["chest"][0] + 1.5 * b, pose["chest"][1], pose["chest"][2])
        p["neck"] = (pose["neck"][0] - 1.5 * b, pose["neck"][1], pose["neck"][2])
        return p
    return f


# ---- One-shot moves ----

def snap(i):
    """The center's snap: the ball goes back between his legs and he comes up to block."""
    up = stand(hips=(36, 0, 0), spine=(8, 0, 0), neck=(-32, 0, 0), legL=(34, 10, 0), legR=(34, 10, 0), kneeL=58, kneeR=58,
               armL=(70, 14, 20), armR=(70, 14, 20), elbL=60, elbR=60)
    back = dict(STANCE3, armR=(-30, 2, 0), elbR=10, armL=(52, 16, 0))
    return keyed([(0, STANCE3), (3, back), (10, up)], i)


def long_snap(i):
    base = dict(STANCE3, legL=(82, 20, 0), legR=(82, 20, 0), kneeL=100, kneeR=100, armL=(84, 6, 0), armR=(84, -6, 0), elbL=4, elbR=4)
    fire = dict(base, armL=(-50, 6, 0), armR=(-50, -6, 0), hips=(80, 0, 0))
    up = stand(hips=(36, 0, 0), neck=(-30, 0, 0), legL=(34, 10, 0), legR=(34, 10, 0), kneeL=58, kneeR=58, armL=(70, 14, 20), armR=(70, 14, 20), elbL=60, elbR=60)
    return keyed([(0, base), (4, fire), (12, up)], i)


def handoff(i):
    """The quarterback turns and puts the ball in the back's belly, then carries out his fake."""
    give = stand(hips=(14, 0, 30), spine=(6, 0, 15), neck=(-10, 0, 10), legL=(20, 8, 0), legR=(-4, 8, 0), kneeL=30, kneeR=20,
                 armL=(64, 30, 0), armR=(70, -10, 30), elbL=30, elbR=30)
    after = stand(hips=(10, 0, -10), spine=(4, 0, -6), neck=(-8, 0, 0), legL=(10, 8, 0), legR=(14, 8, 0), kneeL=26, kneeR=26,
                  armL=(40, 10, 0), armR=(30, 10, 0), elbL=90, elbR=100)
    return keyed([(0, GUN), (5, give), (9, give), (14, after)], i)


def take(i):
    """The back takes the handoff: one arm up across the chest, one low, then he tucks it away."""
    pocket = stride(0.0, 14, 30, 100, 0)
    pocket.update(armL=(80, -20, 0), elbL=110, armR=(30, 20, 0), elbR=60)
    tucked = stride(0.5, 14, 30, 100, 30, carry=True)
    return keyed([(0, pocket), (6, pocket), (12, tucked)], i)


def throw(i):
    """Ball back by the ear, a step at the target, the hips and arm come through and over, and the follow-through."""
    set_ = stand(hips=(8, 0, -40), spine=(0, 0, -20), chest=(-6, 0, -10), neck=(0, 0, 50), legL=(10, 8, 0), legR=(-6, 12, 0),
                 kneeL=24, kneeR=30, armL=(70, 30, 20), armR=(20, 84, 80), elbL=60, elbR=110, handR=-30)
    step = dict(set_, legL=(34, 6, 0), kneeL=20, hips=(10, 0, -34))
    release = stand(hips=(18, 0, 20), spine=(10, 0, 18), chest=(6, 0, 10), neck=(-6, 0, -20), legL=(34, 6, 0), legR=(-20, 10, 0),
                    kneeL=26, kneeR=36, footR=30, armL=(-10, 40, 0), armR=(150, 30, 70), elbL=80, elbR=24)
    follow = stand(hips=(26, 0, 34), spine=(16, 0, 20), neck=(-16, 0, -30), legL=(30, 6, 0), legR=(-16, 8, 0), kneeL=36, kneeR=40,
                   footR=40, armL=(-14, 30, 0), armR=(64, -30, 40), elbL=80, elbR=30)
    return keyed([(0, set_), (4, step), (7, release), (9, follow), (16, follow)], i)


def catch(i):
    """Hands out to the ball, thumbs together, then the tuck."""
    reach = stand(hips=(10, 0, 0), spine=(4, 0, 0), neck=(-14, 0, 0), legL=(16, 6, 0), legR=(-6, 6, 0), kneeL=24, kneeR=24,
                  armL=(96, 2, -30), armR=(96, 2, 30), elbL=26, elbR=26, handL=-30, handR=-30)
    tuck = stand(hips=(14, 0, 0), spine=(6, 0, 0), neck=(-16, 0, 0), legL=(16, 6, 0), legR=(-6, 6, 0), kneeL=26, kneeR=26,
                 armL=(30, 4, 0), armR=(30, 18, -35), elbL=110, elbR=118)
    return keyed([(0, reach), (5, reach), (10, tuck)], i)


def high_point(i):
    """Up in the air for the ball with both hands, and down with it."""
    load = stand(hips=(28, 0, 0), spine=(6, 0, 0), legL=(36, 8, 0), legR=(36, 8, 0), kneeL=64, kneeR=64, armL=(-20, 10, 0), armR=(-20, 10, 0), elbL=30, elbR=30)
    up = stand(hips=(-4, 0, 0), neck=(18, 0, 0), legL=(20, 6, 0), legR=(-4, 6, 0), kneeL=50, kneeR=20, footL=30, footR=40,
               armL=(168, 6, 0), armR=(168, 6, 0), elbL=14, elbR=14, air=0.45)
    top = dict(up, air=0.55, armL=(160, 4, 0), armR=(160, 4, 0))
    land = stand(hips=(20, 0, 0), legL=(30, 8, 0), legR=(30, 8, 0), kneeL=50, kneeR=50, armL=(30, 4, 0), armR=(30, 18, -35), elbL=110, elbR=118)
    return keyed([(0, load), (4, up), (8, top), (13, up), (17, land)], i)


def dive(i):
    """Laid out forward, arms reaching, onto the ground."""
    start = stride(0.0, 20, 34, 100, 20)
    flight = stand(root=(60, 0, 0), legL=(-10, 6, 0), legR=(-20, 6, 0), kneeL=20, kneeR=40, armL=(160, 10, 0), armR=(160, 10, 0), elbL=10, elbR=10, air=0.25)
    return keyed([(0, start), (5, flight), (12, dict(PRONE, armL=(165, 14, 0), armR=(165, 14, 0), elbL=10, elbR=10))], i)


def tackle(i):
    """The tackle: head across, arms wrap, drive through and take him to the ground."""
    load = stand(hips=(46, 0, 0), spine=(12, 0, 0), neck=(-44, 0, 0), legL=(44, 10, 0), legR=(20, 10, 0), kneeL=70, kneeR=50,
                 footL=-10, armL=(40, 30, 0), armR=(40, 30, 0), elbL=70, elbR=70)
    wrap = stand(root=(30, 0, 0), hips=(40, 0, 0), spine=(10, 0, 0), neck=(-40, 0, 20), legL=(30, 8, 0), legR=(-30, 8, 0),
                 kneeL=40, kneeR=30, footR=40, armL=(90, 40, -30), armR=(90, 40, 30), elbL=80, elbR=80)
    down = dict(PRONE, armL=(130, 40, -20), armR=(130, 40, 20), elbL=70, elbR=70, neck=(-50, 0, 30))
    return keyed([(0, load), (4, wrap), (9, dict(wrap, root=(64, 0, 0), air=0.05)), (15, down)], i)


def tackled(i):
    """The ball carrier brought down forward, the ball held tight."""
    hit = stand(root=(14, 6, 0), hips=(24, 0, 10), spine=(8, 0, 0), neck=(-20, 0, 0), legL=(10, 10, 0), legR=(-20, 10, 0), kneeL=30, kneeR=50,
                armL=(60, 40, 0), armR=(30, 18, -35), elbL=40, elbR=118)
    going = dict(hit, root=(50, 10, 0), legL=(-6, 10, 0), legR=(-24, 10, 0), kneeL=20, kneeR=50, armL=(110, 30, 0))
    down = dict(PRONE, armR=(60, 30, -30), elbR=120, armL=(140, 30, 0))
    return keyed([(0, hit), (5, going), (12, down)], i)


def fall_back(i):
    """Knocked back onto his back."""
    hit = stand(root=(-18, 0, 0), hips=(-6, 0, 0), neck=(20, 0, 0), legL=(30, 8, 0), legR=(10, 8, 0), kneeL=30, kneeR=20, armL=(60, 50, 0), armR=(60, 50, 0), elbL=30, elbR=30)
    return keyed([(0, stand()), (4, hit), (10, dict(hit, root=(-60, 0, 0), legL=(50, 8, 0), legR=(30, 8, 0))), (16, SUPINE)], i)


def get_up(i):
    """From face down: hands under the shoulders, a knee up, and back on his feet."""
    push = dict(PRONE, root=(70, 0, 0), armL=(70, 20, 0), armR=(70, 20, 0), elbL=20, elbR=20, neck=(-30, 0, 0))
    knee = stand(root=(30, 0, 0), hips=(50, 0, 0), spine=(10, 0, 0), neck=(-30, 0, 0), legL=(90, 8, 0), legR=(10, 8, 0), kneeL=120, kneeR=110,
                 footR=50, armL=(70, 20, 0), armR=(60, 20, 0), elbL=10, elbR=10)
    rise = stand(hips=(30, 0, 0), legL=(50, 8, 0), legR=(10, 8, 0), kneeL=80, kneeR=40, armL=(20, 10, 0), armR=(20, 10, 0), elbL=40, elbR=40)
    return keyed([(0, PRONE), (6, push), (13, knee), (19, rise), (26, stand())], i)


def juke(i):
    """A hard plant to one side and away the other."""
    a = stride(0.0, 16, 30, 100, 20, carry=True)
    plant = dict(a, hips=(18, 22, -10), spine=(6, 12, 0), legL=(6, 34, 0), kneeL=40, legR=(10, -8, 0), kneeR=50, root=(0, 14, 0))
    away = dict(a, hips=(18, -20, 16), spine=(6, -10, 0), legR=(16, 30, 0), kneeR=40, legL=(-10, 0, 0), kneeL=60, root=(0, -12, 0))
    return keyed([(0, a), (4, plant), (9, away), (13, stride(0.5, 16, 30, 100, 20, carry=True))], i)


def spin(i, n=14):
    """Spun all the way round on the plant foot, ball held tight."""
    p = stride(0.25, 14, 22, 90, 10, carry=True)
    p["root"] = (0, 0, -360 * smooth(i / n))
    p["armL"] = (40, 50, 0); p["elbL"] = 40
    return p


def stiff_arm(i):
    a = stride(0.0, 14, 30, 100, 20, carry=True)
    out = dict(a, armL=(84, 22, 0), elbL=4, handL=-60, spine=(10, 0, 18), chest=(6, 0, 10))
    return keyed([(0, a), (4, out), (12, out), (16, a)], i)


def kick(i):
    """Plant beside the ball and swing through it; the leg finishes high, arms out for balance."""
    approach = stride(0.6, 10, 26, 80, 20)
    plant = stand(hips=(10, -10, 20), spine=(-4, 0, 0), legL=(24, 6, 0), legR=(-46, 16, 0), kneeL=30, kneeR=96, footR=40,
                  armL=(40, 70, 0), armR=(10, 50, 0), elbL=10, elbR=20)
    strike = stand(hips=(4, -12, -10), spine=(-10, 0, -10), legL=(6, 4, 0), legR=(60, 6, 0), kneeL=24, kneeR=10, footR=40,
                   armL=(30, 80, 0), armR=(-10, 60, 0), elbL=10, elbR=10)
    finish = stand(hips=(-6, -6, -14), spine=(-14, 0, -6), legL=(0, 4, 0), legR=(110, 0, 0), kneeL=10, kneeR=4, footL=40, footR=30,
                   armL=(20, 70, 0), armR=(-20, 50, 0), elbL=10, elbR=10, air=0.06)
    return keyed([(0, approach), (6, plant), (10, strike), (14, finish), (22, stand())], i)


def punt(i):
    """Ball out in both hands, a step, the drop and the leg swings up to meet it."""
    hold = stand(hips=(10, 0, 0), legL=(16, 6, 0), legR=(-8, 6, 0), kneeL=20, kneeR=20, armL=(80, 0, 0), armR=(80, 0, 0), elbL=20, elbR=20)
    drop = dict(hold, legL=(26, 6, 0), legR=(-30, 8, 0), kneeR=60, armL=(60, 30, 0), armR=(70, 10, 0))
    up = stand(hips=(-10, 0, 0), spine=(-10, 0, 0), legL=(0, 4, 0), legR=(130, 0, 0), kneeL=10, kneeR=0, footL=40, footR=30,
               armL=(30, 70, 0), armR=(40, 60, 0), elbL=10, elbR=10, air=0.12)
    return keyed([(0, hold), (6, hold), (10, drop), (15, up), (24, stand())], i)


def kneel_down(i):
    """The quarterback takes a knee."""
    return keyed([(0, GUN), (8, dict(KNEEL, armR=(40, 18, -35), elbR=118))], i)


def spike(i):
    """The ball up high, and slammed into the turf."""
    up = stand(hips=(-6, 0, 0), legL=(10, 8, 0), legR=(-4, 8, 0), armR=(170, 10, 0), elbR=20, armL=(40, 40, 0), elbL=40)
    down = stand(hips=(40, 0, 0), spine=(14, 0, 0), legL=(36, 10, 0), legR=(-10, 10, 0), kneeL=60, kneeR=30, armR=(60, 0, 0), elbR=0, handR=60,
                 armL=(-20, 50, 0), elbL=40)
    return keyed([(0, stand(armR=(30, 18, -35), elbR=118)), (6, up), (10, down), (18, dict(down, hips=(20, 0, 0)))], i)


def leap(i):
    """A jump with both fists up."""
    load = stand(hips=(30, 0, 0), legL=(40, 10, 0), legR=(40, 10, 0), kneeL=70, kneeR=70, armL=(-30, 20, 0), armR=(-30, 20, 0), elbL=40, elbR=40)
    up = stand(neck=(20, 0, 0), legL=(10, 8, 0), legR=(10, 8, 0), kneeL=20, kneeR=40, footL=40, footR=40, armL=(170, 20, 0), armR=(170, 20, 0),
               elbL=30, elbR=30, air=0.5)
    return keyed([(0, stand()), (5, load), (10, up), (15, dict(up, air=0.35)), (19, load), (24, stand(armL=(150, 30, 0), armR=(150, 30, 0)))], i)


def dance(i, n=24):
    """A celebration shimmy: hips one way, arms the other."""
    s = math.sin(2 * math.pi * i / n)
    c = math.cos(2 * math.pi * i / n * 2)
    return stand(hips=(6, 10 * s, 20 * s), spine=(0, -6 * s, -10 * s), neck=(0, 6 * s, 10 * s), legL=(20 + 10 * s, 10, 0), legR=(20 - 10 * s, 10, 0),
                 kneeL=36 + 10 * s, kneeR=36 - 10 * s, armL=(60 + 40 * c, 40, 0), armR=(60 - 40 * c, 40, 0), elbL=90, elbR=90, air=0.04 * abs(c))


def flex(i, n=24):
    """Both arms up, flexing."""
    s = math.sin(2 * math.pi * i / n)
    return stand(hips=(4, 0, 0), legL=(4, 12, 0), legR=(4, 12, 0), neck=(-10, 0, 10 * s),
                 armL=(20, 88, 90), armR=(20, 88, 90), elbL=110 + 10 * s, elbR=110 - 10 * s)


def point_up(i):
    up = stand(neck=(30, 0, 0), armL=(176, 6, 0), armR=(176, 6, 0), elbL=4, elbR=4, handL=-40, handR=-40)
    return keyed([(0, stand()), (8, up)], i)


def cheer(i, n=20):
    s = math.sin(2 * math.pi * i / n)
    return stand(neck=(10, 0, 0), armL=(160 + 8 * s, 24, 0), armR=(160 - 8 * s, 24, 0), elbL=10, elbR=10, air=0.06 * max(0.0, s))


def ref_td(i):
    """Touchdown: both arms straight up."""
    return keyed([(0, stand()), (6, stand(armL=(178, 4, 0), armR=(178, 4, 0), elbL=0, elbR=0, neck=(4, 0, 0)))], i)


def ref_incomplete(i, n=20):
    """Incomplete: arms swept back and forth across each other at the waist."""
    s = math.sin(2 * math.pi * i / n)
    return stand(armL=(80, 50 - 60 * s, 0), armR=(80, 50 + 60 * s, 0), elbL=6, elbR=6)


def ref_first(i):
    """First down: the arm pointing the way the offense is going."""
    return keyed([(0, stand()), (6, stand(armR=(90, -4, 0), elbR=0, handR=-10, spine=(0, 0, 0)))], i)


def ref_flag(i):
    """The flag goes up out of his belt and into the air."""
    reach = stand(spine=(10, 0, 0), armR=(-10, 30, 0), elbR=60)
    toss = stand(armR=(150, 20, 0), elbR=10, handR=-30, neck=(10, 0, 0))
    return keyed([(0, stand()), (4, reach), (9, toss), (14, dict(toss, armR=(110, 20, 0)))], i)


# name: (frames, pose(i), loops)
CLIPS = {
    "idle": (60, idle, True),
    "walk": (32, run_cycle(32, 2, 18, 44, 18), True),
    "jog": (22, run_cycle(22, 7, 26, 80, 26), True),
    "run": (18, run_cycle(18, 13, 34, 108, 36), True),
    "sprint": (16, run_cycle(16, 18, 40, 122, 44), True),
    "carry": (18, run_cycle(18, 14, 34, 108, 36, carry=True), True),
    "backpedal": (16, run_cycle(16, 26, 22, 80, 16, crouch=0.25, back=True), True),
    "shuffle": (16, shuffle, True),
    "passset": (16, pass_set, True),
    "block": (24, block, True),
    "rush": (24, rush, True),
    "stance3": (40, breathe(STANCE3), True),
    "stance2": (40, breathe(STANCE2), True),
    "ready": (40, breathe(READY), True),
    "under": (40, breathe(UNDER), True),
    "gun": (40, breathe(GUN), True),
    "hold": (40, breathe(HOLD), True),
    "hips": (60, breathe(HIPS_HANDS, 60), True),
    "prone": (40, breathe(PRONE), True),
    "supine": (40, breathe(SUPINE), True),
    "snap": (12, snap, False),
    "longsnap": (14, long_snap, False),
    "handoff": (16, handoff, False),
    "take": (14, take, False),
    "throw": (18, throw, False),
    "catch": (12, catch, False),
    "highpoint": (19, high_point, False),
    "dive": (14, dive, False),
    "tackle": (17, tackle, False),
    "tackled": (14, tackled, False),
    "fallback": (18, fall_back, False),
    "getup": (28, get_up, False),
    "juke": (15, juke, False),
    "spin": (14, spin, False),
    "stiffarm": (18, stiff_arm, False),
    "kick": (24, kick, False),
    "punt": (26, punt, False),
    "kneel": (10, kneel_down, False),
    "spike": (20, spike, False),
    "leap": (26, leap, False),
    "dance": (24, dance, True),
    "flex": (24, flex, True),
    "point": (10, point_up, False),
    "cheer": (20, cheer, True),
    "ref_td": (8, ref_td, False),
    "ref_incomplete": (20, ref_incomplete, True),
    "ref_first": (8, ref_first, False),
    "ref_flag": (16, ref_flag, False),
}


# ---- From joint angles to the skeleton ----

def _rx(d): return Quaternion((1, 0, 0), math.radians(d))
def _ry(d): return Quaternion((0, 1, 0), math.radians(d))
def _rz(d): return Quaternion((0, 0, 1), math.radians(d))


def deltas(p):
    """Each bone's turn in the figure's axes, relative to its parent, and where the root goes."""
    d = {}
    tip, roll, turn = p["root"]
    d["root"] = _rz(turn) @ _ry(tip) @ _rx(-roll)
    for b in ("hips", "spine", "chest", "neck", "head"):
        lean, side, tw = p[b]
        d[b] = _rz(tw) @ _ry(lean) @ _rx(-side)
    for s, sign in (("L", 1), ("R", -1)):
        f, o, tw = p["arm" + s]
        d["upper_arm." + s] = _ry(-f) @ _rx(sign * o) @ _rz(sign * tw)
        d["forearm." + s] = _ry(-p["elb" + s])
        d["hand." + s] = _ry(-p["hand" + s])
        # Legs are read against the ground, not the pelvis: leaning the hips bends him at the waist.
        f, o, tw = p["leg" + s]
        d["thigh." + s] = (_ry(p["hips"][0]) @ _rx(-p["hips"][1])).inverted() @ _ry(-f) @ _rx(sign * o) @ _rz(sign * tw)
        d["shin." + s] = _ry(p["knee" + s])
        d["foot." + s] = _ry(p["foot" + s])
    return d


# How far each joint's surface sits from its centre, for setting the figure down on the ground.
RADIUS = {"root": 0.0, "hips": 0.17, "spine": 0.17, "chest": 0.2, "neck": 0.08, "head": 0.15}
for _s in "LR":
    RADIUS.update({f"upper_arm.{_s}": 0.08, f"forearm.{_s}": 0.06, f"hand.{_s}": 0.05, f"thigh.{_s}": 0.1, f"shin.{_s}": 0.065, f"foot.{_s}": 0.05})


def solve(p):
    """Forward kinematics: every bone's head and tail and its turn, with the figure set on the ground."""
    d = deltas(p)
    G, head, tail = {}, {}, {}
    for name, h, t, parent in P.BONES:
        h, t = Vector(h), Vector(t)
        if parent is None:
            G[name] = d[name]
            head[name] = Vector((p["rx"], p["ry"], 0))
        else:
            G[name] = G[parent] @ d[name]
            head[name] = head[parent] + G[parent] @ (h - Vector(P.BONE[parent][1]))
        tail[name] = head[name] + G[name] @ (t - h)
    # Set down: the lowest point of any part touches the ground, then lift by `air`.
    low = min(min(head[n].z, tail[n].z) - RADIUS[n] for n in head if n != "root")
    heel = min((head[f"foot.{s}"] + G[f"foot.{s}"] @ Vector((-0.06, 0, -0.06))).z - 0.02 for s in "LR")
    low = min(low, heel, min(tail[f"foot.{s}"].z - 0.02 for s in "LR"))
    lift = -low + p["air"]
    for n in head:
        head[n].z += lift
        tail[n].z += lift
    return G, head, tail, d


def key_action(arm, name, frames, fn, loop):
    """One clip as a Blender action on the armature, keyed every frame."""
    import bpy
    act = bpy.data.actions.new(name)
    act.use_fake_user = True
    arm.animation_data_create()
    arm.animation_data.action = act
    rest = {b.name: b.matrix_local.to_quaternion() for b in arm.data.bones}
    rest_m = {b.name: b.matrix_local.to_3x3() for b in arm.data.bones}
    for pb in arm.pose.bones:
        pb.rotation_mode = "QUATERNION"
    # A loop's last key repeats its first, so it wraps without a hitch.
    last = frames if loop else frames - 1
    for i in range(last + 1):
        p = fn(i % frames if loop else min(i, frames - 1))
        G, head, _, d = solve(p)
        for pb in arm.pose.bones:
            r = rest[pb.name]
            pb.rotation_quaternion = r.inverted() @ d[pb.name] @ r
            pb.keyframe_insert("rotation_quaternion", frame=i + 1)
            if pb.name == "root":
                pb.location = rest_m["root"].inverted() @ head["root"]
                pb.keyframe_insert("location", frame=i + 1)
    return act
