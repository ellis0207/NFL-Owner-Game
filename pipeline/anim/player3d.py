"""The 3D player: a skinned body, its skeleton, and the football, built from code.

The field view draws these live (src/ui/anim/Players3D.ts), so every club and
every official is the same model with different colors. The figure stands on
z = 0 facing +X, one unit to the metre; its left is +Y.

The body is grown with Blender's skin modifier from a stick figure (vertices
with a radius at each joint) and smoothed, then weighted to the nearest bones.
The helmet, facemask, pads and number patches are rigid pieces on the head and
chest bones. Each surface has its own material name, which the game colors:

    jersey  the shirt                 pants   pants and pelvis
    socks   socks                      sleeve  arm sleeves under the shirt
    glove   gloves                     shoe    cleats
    helmet  helmet shell               stripe  helmet stripe
    mask    facemask                   face    the shadow behind the facemask
    head    a bare head (officials)    num     number patches, one texture each
    cap     an official's cap          ball / lace   the football
"""
import math

import bmesh
import bpy
from mathutils import Matrix, Vector

# The skeleton: name, head, tail, parent. Bones point along the limb; the game
# reads the hands (where the ball sits) and the head (where the name goes).
BONES = [
    ("root", (0, 0, 0), (0, 0, 0.25), None),
    ("hips", (0, 0, 0.98), (0, 0, 1.12), "root"),
    ("spine", (0, 0, 1.12), (0, 0, 1.3), "hips"),
    ("chest", (0, 0, 1.3), (0, 0, 1.52), "spine"),
    ("neck", (0, 0, 1.52), (0, 0, 1.62), "chest"),
    ("head", (0, 0, 1.62), (0, 0, 1.86), "neck"),
]
for side, s in (("L", 1), ("R", -1)):
    BONES += [
        (f"upper_arm.{side}", (0, s * 0.27, 1.47), (0, s * 0.27, 1.18), "chest"),
        (f"forearm.{side}", (0, s * 0.27, 1.18), (0, s * 0.27, 0.93), f"upper_arm.{side}"),
        (f"hand.{side}", (0, s * 0.27, 0.93), (0, s * 0.27, 0.8), f"forearm.{side}"),
        (f"thigh.{side}", (0, s * 0.11, 0.95), (0, s * 0.11, 0.52), "hips"),
        (f"shin.{side}", (0, s * 0.11, 0.52), (0, s * 0.11, 0.1), f"thigh.{side}"),
        (f"foot.{side}", (0, s * 0.11, 0.1), (0.17, s * 0.11, 0.025), f"shin.{side}"),
    ]
BONE = {b[0]: b for b in BONES}

# Material colors here are only for previews in Blender; the game sets its own.
MATERIALS = {
    "jersey": (0.8, 0.1, 0.1), "pants": (0.85, 0.85, 0.8), "socks": (0.8, 0.1, 0.1), "sleeve": (0.1, 0.1, 0.1),
    "glove": (0.9, 0.9, 0.9), "shoe": (0.05, 0.05, 0.05), "helmet": (0.85, 0.85, 0.8), "stripe": (0.8, 0.1, 0.1),
    "mask": (0.6, 0.6, 0.62), "face": (0.08, 0.06, 0.05), "head": (0.55, 0.4, 0.3), "num": (1, 1, 1),
    "cap": (0.95, 0.95, 0.95), "ball": (0.42, 0.2, 0.08), "lace": (0.95, 0.95, 0.95),
}


def material(name):
    mat = bpy.data.materials.get(name)
    if mat:
        return mat
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    c = MATERIALS[name]
    bsdf.inputs["Base Color"].default_value = (*c, 1)
    bsdf.inputs["Roughness"].default_value = 0.35 if name in ("helmet", "mask") else 0.8
    return mat


def armature():
    """The skeleton, as an armature object named "player"."""
    data = bpy.data.armatures.new("player")
    ob = bpy.data.objects.new("player", data)
    bpy.context.scene.collection.objects.link(ob)
    bpy.context.view_layer.objects.active = ob
    ob.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    for name, head, tail, parent in BONES:
        b = data.edit_bones.new(name)
        b.head, b.tail, b.roll = head, tail, 0
        if parent:
            b.parent = data.edit_bones[parent]
            b.use_connect = False
    bpy.ops.object.mode_set(mode="OBJECT")
    return ob


# ---- The body: a stick figure with a radius at each point, grown into a mesh ----

def _body_graph():
    """Points (position, radius across, radius front-to-back) and the lines between them."""
    pts, edges = [], []

    def p(pos, rx, ry):
        pts.append((pos, rx, ry))
        return len(pts) - 1

    pelvis = p((0, 0, 0.96), 0.15, 0.19)
    waist = p((0, 0, 1.12), 0.14, 0.18)
    chest = p((0, 0, 1.3), 0.16, 0.22)
    upper = p((0, 0, 1.45), 0.15, 0.22)
    neck = p((0, 0, 1.6), 0.065, 0.065)
    edges += [(pelvis, waist), (waist, chest), (chest, upper), (upper, neck)]
    for s in (1, -1):
        sh = p((0, s * 0.25, 1.47), 0.075, 0.075)
        ua = p((0, s * 0.27, 1.32), 0.065, 0.065)
        el = p((0, s * 0.27, 1.18), 0.052, 0.052)
        fa = p((0, s * 0.27, 1.06), 0.05, 0.05)
        wr = p((0, s * 0.27, 0.94), 0.038, 0.038)
        hd = p((0.01, s * 0.27, 0.84), 0.045, 0.03)
        edges += [(upper, sh), (sh, ua), (ua, el), (el, fa), (fa, wr), (wr, hd)]
        hp = p((0, s * 0.11, 0.93), 0.1, 0.1)
        th = p((0, s * 0.11, 0.74), 0.09, 0.09)
        kn = p((0, s * 0.11, 0.52), 0.065, 0.065)
        cf = p((-0.01, s * 0.11, 0.36), 0.062, 0.062)
        an = p((0, s * 0.11, 0.11), 0.045, 0.045)
        toe = p((0.17, s * 0.11, 0.045), 0.045, 0.035)
        edges += [(pelvis, hp), (hp, th), (th, kn), (kn, cf), (cf, an), (an, toe)]
    return pts, edges


def _tube(bm, points, radius, sides=6):
    """A thin round bar through points (the facemask's wire)."""
    rings = []
    for i, c in enumerate(points):
        c = Vector(c)
        a = Vector(points[max(0, i - 1)]); b = Vector(points[min(len(points) - 1, i + 1)])
        t = (b - a).normalized()
        n = t.orthogonal().normalized()
        m = t.cross(n)
        rings.append([bm.verts.new(c + (n * math.cos(k * 2 * math.pi / sides) + m * math.sin(k * 2 * math.pi / sides)) * radius) for k in range(sides)])
    for r0, r1 in zip(rings, rings[1:]):
        for k in range(sides):
            bm.faces.new((r0[k], r0[(k + 1) % sides], r1[(k + 1) % sides], r1[k]))


def _sphere(bm, center, size, segs=16, rings=10, keep=None):
    """A squashed sphere; `keep(v)` drops faces whose middle fails it (an open helmet)."""
    out = bmesh.ops.create_uvsphere(bm, u_segments=segs, v_segments=rings, radius=1.0)
    verts = out["verts"]
    for v in verts:
        v.co = Vector((center[0] + v.co.x * size[0], center[1] + v.co.y * size[1], center[2] + v.co.z * size[2]))
    faces = list({f for v in verts for f in v.link_faces})
    if keep:
        drop = [f for f in faces if not keep(f.calc_center_median())]
        bmesh.ops.delete(bm, geom=drop, context="FACES")
        faces = [f for f in faces if f.is_valid]
    return faces


def _quad(bm, corners):
    vs = [bm.verts.new(c) for c in corners]
    return bm.faces.new(vs)


def _piece(name, build, mat_names):
    """A rigid piece: built into a fresh mesh whose faces take materials by `build`'s return (face -> material index)."""
    me = bpy.data.meshes.new(name)
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new("UVMap")
    build(bm, uv)
    bm.to_mesh(me)
    bm.free()
    for m in mat_names:
        me.materials.append(material(m))
    for poly in me.polygons:
        poly.use_smooth = True
    return ob


def body():
    """The skinned body as a mesh object (not yet weighted)."""
    pts, edges = _body_graph()
    me = bpy.data.meshes.new("body")
    ob = bpy.data.objects.new("body", me)
    bpy.context.scene.collection.objects.link(ob)
    bm = bmesh.new()
    vs = [bm.verts.new(p[0]) for p in pts]
    for a, b in edges:
        bm.edges.new((vs[a], vs[b]))
    bm.to_mesh(me)
    bm.free()
    ob.modifiers.new("skin", "SKIN")
    for v, (_, rx, ry) in zip(me.skin_vertices[0].data, pts):
        v.radius = (rx, ry)
    me.skin_vertices[0].data[0].use_root = True
    ob.modifiers.new("smooth", "SUBSURF").levels = 2
    dg = bpy.context.evaluated_depsgraph_get()
    solid = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
    ob.modifiers.clear()
    ob.data = solid
    bpy.data.meshes.remove(me)
    names = ["jersey", "pants", "socks", "sleeve", "glove", "shoe"]
    for n in names:
        solid.materials.append(material(n))
    for poly in solid.polygons:
        x, y, z = poly.center
        arm = abs(y) > 0.205 and z > 0.75
        if arm:
            m = "glove" if z < 0.95 else "sleeve" if z < 1.27 else "jersey"
        elif z < 0.125:
            m = "shoe"
        elif z < 0.47:
            m = "socks"
        elif z < 1.03:
            m = "pants"
        else:
            m = "jersey"
        poly.material_index = names.index(m)
        poly.use_smooth = True
    return ob


def gear():
    """Helmet, facemask, face shadow, bare head, shoulder pads and number patches, as one rigid-piece mesh."""
    names = ["helmet", "stripe", "mask", "face", "head", "jersey", "num"]

    def build(bm, uv):
        def tag(faces, mat):
            for f in faces:
                f.material_index = names.index(mat)

        hc = (0.015, 0, 1.75)
        # The shell is open at the face and the bottom.
        shell = _sphere(bm, hc, (0.15, 0.135, 0.15), 20, 12,
                        keep=lambda c: not (c.x > 0.06 and -0.07 < c.z - hc[2] < 0.06) and c.z - hc[2] > -0.11)
        tag(shell, "helmet")
        stripe = _sphere(bm, (hc[0], 0, hc[2] + 0.002), (0.152, 0.03, 0.152), 20, 12, keep=lambda c: c.z > hc[2] - 0.02 or c.x < -0.05)
        tag(stripe, "stripe")
        face = _sphere(bm, (0.06, 0, 1.73), (0.085, 0.095, 0.095), 12, 8)
        tag(face, "face")
        bare = _sphere(bm, (0.01, 0, 1.73), (0.115, 0.1, 0.13), 14, 9)
        tag(bare, "head")
        # The facemask: three bars around the front and two up the middle.
        before = set(bm.verts)
        for k, dz in enumerate((-0.085, -0.045, -0.005)):
            r = 0.17 - k * 0.006
            arc = [(hc[0] + r * math.cos(a) * 0.88, r * math.sin(a), hc[2] + dz) for a in [math.radians(d) for d in range(-75, 76, 15)]]
            _tube(bm, arc, 0.0085)
        for y in (-0.035, 0.035):
            _tube(bm, [(hc[0] + 0.15, y, hc[2] - 0.09), (hc[0] + 0.152, y, hc[2] - 0.04), (hc[0] + 0.148, y, hc[2] + 0.0)], 0.0085)
        tag([f for f in bm.faces if any(v not in before for v in f.verts)], "mask")
        # Shoulder pads under the shirt: a broad, flat cap over the top of the chest.
        pads = _sphere(bm, (0, 0, 1.47), (0.2, 0.33, 0.11), 18, 10, keep=lambda c: c.z > 1.41)
        tag(pads, "jersey")
        # Number patches: on the back, the chest and on top of each shoulder (the TV numbers), with UVs 0 to 1.
        def patch(center, right, up, w, h):
            c, r, u = Vector(center), Vector(right) * (w / 2), Vector(up) * (h / 2)
            f = _quad(bm, [c - r - u, c + r - u, c + r + u, c - r + u])
            for loop, (s, t) in zip(f.loops, [(0, 0), (1, 0), (1, 1), (0, 1)]):
                loop[uv].uv = (s, t)
            f.material_index = names.index("num")
        patch((-0.215, 0, 1.36), (0, -1, 0), (0, 0, 1), 0.26, 0.2)    # back, read from behind
        patch((0.215, 0, 1.36), (0, 1, 0), (0, 0, 1), 0.2, 0.15)       # chest, read from the front
        for s in (1, -1):
            patch((0, s * 0.2, 1.585), (0, -1, 0), (1, 0, 0), 0.11, 0.09)
    return _piece("gear", build, names)


def cap():
    """An official's cap, on the head where the helmet would be."""
    def build(bm, uv):
        top = _sphere(bm, (0.01, 0, 1.79), (0.12, 0.11, 0.08), 14, 8, keep=lambda c: c.z > 1.77)
        for f in top:
            f.material_index = 0
        b = _quad(bm, [(0.08, -0.09, 1.775), (0.21, -0.075, 1.765), (0.21, 0.075, 1.765), (0.08, 0.09, 1.775)])
        b.material_index = 0
    return _piece("cap", build, ["cap"])


def football():
    """The ball: a prolate spheroid along X with a lace strip on top, 0.28 m long."""
    def build(bm, uv):
        verts = bmesh.ops.create_uvsphere(bm, u_segments=20, v_segments=12, radius=1.0)["verts"]
        # Points along X: tapered ends.
        for v in verts:
            x, y, z = v.co.z, v.co.x, v.co.y
            k = 1 - abs(x) ** 2.2 * 0.18
            v.co = Vector((x * 0.14, y * 0.086 * k, z * 0.086 * k))
        for f in bm.faces:
            f.material_index = 0
        for x in (-0.045, -0.015, 0.015, 0.045):
            q = _quad(bm, [(x - 0.004, -0.018, 0.0875), (x + 0.004, -0.018, 0.0875), (x + 0.004, 0.018, 0.0875), (x - 0.004, 0.018, 0.0875)])
            q.material_index = 1
        q = _quad(bm, [(-0.06, -0.004, 0.0878), (0.06, -0.004, 0.0878), (0.06, 0.004, 0.0878), (-0.06, 0.004, 0.0878)])
        q.material_index = 1
    return _piece("football", build, ["ball", "lace"])


# ---- Weights ----

def _seg_dist(p, a, b):
    ab = b - a
    t = max(0.0, min(1.0, (p - a).dot(ab) / max(1e-9, ab.length_squared)))
    return (p - (a + ab * t)).length


def skin(ob, arm, rigid=None):
    """Weights every vertex to its nearest bones (two at most), or all to `rigid(v)`'s bone when given."""
    segs = {name: (Vector(h), Vector(t)) for name, h, t, _ in BONES if name != "root"}
    for name in segs:
        ob.vertex_groups.new(name=name)
    groups = {g.name: g for g in ob.vertex_groups}
    for v in ob.data.vertices:
        p = v.co
        if rigid:
            groups[rigid(p)].add([v.index], 1.0, "REPLACE")
            continue
        arm_side = abs(p.y) > 0.205 and p.z > 0.75
        near = []
        for name, (a, b) in segs.items():
            is_arm = name.startswith(("upper_arm", "forearm", "hand"))
            if is_arm != arm_side and not (name == "chest" and arm_side and p.z > 1.3):
                continue
            if name.startswith(("upper_arm", "forearm", "hand", "thigh", "shin", "foot")) and (p.y > 0) != name.endswith(".L") and abs(p.y) > 0.02:
                continue
            near.append((_seg_dist(p, a, b), name))
        near.sort()
        top = near[:2]
        w = [1 / (d + 0.01) ** 4 for d, _ in top]
        total = sum(w)
        for (d, name), wi in zip(top, w):
            groups[name].add([v.index], wi / total, "REPLACE")
    ob.parent = arm
    mod = ob.modifiers.new("skeleton", "ARMATURE")
    mod.object = arm


def build():
    """Everything in a fresh scene: the armature with body, gear and cap skinned to it, and the ball on its own."""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    arm = armature()
    b = body()
    skin(b, arm)
    g = gear()
    skin(g, arm, rigid=lambda p: "head" if p.z > 1.62 else "chest")
    c = cap()
    skin(c, arm, rigid=lambda p: "head")
    ball = football()
    ball.location = (0, 1.2, 0.3)  # off to the side so it doesn't sit in the body; the game places it itself
    return arm, ball
