"""The rooms of the club as small Blender scenes, built from code.

Each sidebar group in the game is a room, and each room's page header shows a
wide picture of the place: the owner's desk, the film room's chalkboard, the
capologist's ledger, the draft war room, the boardroom, the stadium at night
and the game manual. Everything is made up for the game from boxes, cylinders
and text: no logos, no real places.

Pictures are composed with the interest on the right two thirds; the page
title sits over the left, under a dark scrim.
"""
import math
import random

import bpy
from mathutils import Vector

W, H = 1600, 420


# ---- Building blocks ----

def setup(samples=96, world=(0.01, 0.012, 0.015), size=(W, H)):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.device = "CPU"
    sc.cycles.samples = samples
    sc.cycles.use_denoising = True
    sc.cycles.max_bounces = 4
    sc.render.resolution_x, sc.render.resolution_y = size
    sc.render.resolution_percentage = 100
    sc.render.image_settings.file_format = "PNG"
    sc.render.image_settings.color_mode = "RGB"
    try:
        sc.view_settings.view_transform = "Filmic"
    except TypeError:
        sc.view_settings.view_transform = "AgX"
    w = bpy.data.worlds.new("w")
    w.use_nodes = True
    w.node_tree.nodes["Background"].inputs[0].default_value = (*world, 1)
    sc.world = w
    return sc


def mat(name, color, rough=0.6, metal=0.0, emit=0.0, noise=0.0, scale=8.0, stretch=(1, 1, 1)):
    """A plain surface; `noise` darkens it in patches (wood grain, cork, turf) so nothing looks like plastic."""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    b = nt.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*color, 1)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    if emit:
        b.inputs["Emission Color"].default_value = (*color, 1)
        b.inputs["Emission Strength"].default_value = emit
    if noise:
        coord = nt.nodes.new("ShaderNodeTexCoord")
        mapping = nt.nodes.new("ShaderNodeMapping")
        mapping.inputs["Scale"].default_value = stretch
        tex = nt.nodes.new("ShaderNodeTexNoise")
        tex.inputs["Scale"].default_value = scale
        tex.inputs["Detail"].default_value = 8
        mix = nt.nodes.new("ShaderNodeMixRGB")
        mix.blend_type = "MULTIPLY"
        mix.inputs[1].default_value = (*color, 1)
        ramp = nt.nodes.new("ShaderNodeValToRGB")
        ramp.color_ramp.elements[0].color = (1 - noise, 1 - noise, 1 - noise, 1)
        ramp.color_ramp.elements[1].color = (1, 1, 1, 1)
        nt.links.new(coord.outputs["Object"], mapping.inputs["Vector"])
        nt.links.new(mapping.outputs["Vector"], tex.inputs["Vector"])
        nt.links.new(tex.outputs["Fac"], ramp.inputs["Fac"])
        nt.links.new(ramp.outputs["Color"], mix.inputs[2])
        mix.inputs[0].default_value = 1
        nt.links.new(mix.outputs["Color"], b.inputs["Base Color"])
        bump = nt.nodes.new("ShaderNodeBump")
        bump.inputs["Strength"].default_value = 0.15
        nt.links.new(tex.outputs["Fac"], bump.inputs["Height"])
        nt.links.new(bump.outputs["Normal"], b.inputs["Normal"])
    return m


def _finish(o, m, rot):
    if rot:
        o.rotation_euler = [math.radians(a) for a in rot]
    if m:
        o.data.materials.append(m)
    return o


def box(loc, size, m, rot=None, bevel=0.0):
    bpy.ops.mesh.primitive_cube_add(location=loc)
    o = bpy.context.object
    o.scale = (size[0] / 2, size[1] / 2, size[2] / 2)
    if bevel:
        mod = o.modifiers.new("b", "BEVEL")
        mod.width = bevel
        mod.segments = 3
    return _finish(o, m, rot)


def cyl(loc, r, h, m, rot=None, verts=48):
    bpy.ops.mesh.primitive_cylinder_add(location=loc, radius=r, depth=h, vertices=verts)
    o = bpy.context.object
    bpy.ops.object.shade_smooth()
    return _finish(o, m, rot)


def ball(loc, r, m, scale=(1, 1, 1), rot=None):
    bpy.ops.mesh.primitive_uv_sphere_add(location=loc, radius=r, segments=48, ring_count=24)
    o = bpy.context.object
    o.scale = scale
    bpy.ops.object.shade_smooth()
    return _finish(o, m, rot)


def text(body, loc, size, m, rot=None, extrude=0.002, align="CENTER"):
    bpy.ops.object.text_add(location=loc)
    o = bpy.context.object
    o.data.body = body
    o.data.size = size
    o.data.extrude = extrude
    o.data.align_x = align
    return _finish(o, m, rot)


def area(loc, target, power, size=2.0, color=(1, 1, 1)):
    d = bpy.data.lights.new("a", "AREA")
    d.energy = power
    d.size = size
    d.color = color
    o = bpy.data.objects.new("a", d)
    bpy.context.scene.collection.objects.link(o)
    o.location = loc
    aim(o, target)
    return o


def spot(loc, target, power, angle=50, blend=0.6, color=(1, 1, 1)):
    d = bpy.data.lights.new("s", "SPOT")
    d.energy = power
    d.spot_size = math.radians(angle)
    d.spot_blend = blend
    d.color = color
    d.shadow_soft_size = 0.15
    o = bpy.data.objects.new("s", d)
    bpy.context.scene.collection.objects.link(o)
    o.location = loc
    aim(o, target)
    return o


def aim(o, target):
    o.rotation_euler = (Vector(target) - Vector(o.location)).to_track_quat("-Z", "Y").to_euler()


def camera(loc, target, lens=50, focus=None, fstop=2.8):
    d = bpy.data.cameras.new("cam")
    d.lens = lens
    d.sensor_fit = "HORIZONTAL"
    o = bpy.data.objects.new("cam", d)
    bpy.context.scene.collection.objects.link(o)
    o.location = loc
    aim(o, target)
    if focus:
        d.dof.use_dof = True
        d.dof.focus_distance = (Vector(focus) - Vector(loc)).length
        d.dof.aperture_fstop = fstop
    bpy.context.scene.camera = o
    return o


def pen(center, angle, length, body, cap):
    """A pen lying flat; `angle` turns it on the desk, the cap at the far end."""
    a = math.radians(angle)
    d = (math.cos(a), math.sin(a))
    cyl(center, 0.009, length, body, rot=(0, 90, angle))
    cyl((center[0] + d[0] * length * 0.45, center[1] + d[1] * length * 0.45, center[2]), 0.0095, length * 0.14, cap, rot=(0, 90, angle))
    cyl((center[0] - d[0] * length * 0.53, center[1] - d[1] * length * 0.53, center[2]), 0.004, length * 0.07, cap, rot=(0, 90, angle))


def football(loc, yaw=0.0, r=0.085):
    """A ball lying on its side: a stretched sphere with white laces on top, all in world space."""
    leather = mat("leather", (0.23, 0.09, 0.04), rough=0.55, noise=0.35, scale=60)
    white = mat("lace", (0.9, 0.9, 0.86), rough=0.5)
    ball(loc, r, leather, scale=(1.65, 1, 1), rot=(0, 0, yaw))
    a = math.radians(yaw)
    for i in range(-3, 4):
        d = i * 0.02
        box((loc[0] + d * math.cos(a), loc[1] + d * math.sin(a), loc[2] + r * 0.99), (0.006, 0.03, 0.006), white, rot=(0, 0, yaw))
    box((loc[0], loc[1], loc[2] + r * 1.0), (0.13, 0.006, 0.005), white, rot=(0, 0, yaw))


# ---- The rooms ----

def desk():
    """Desk: the owner's desk early in the morning. Lamp light, the day's folders, coffee."""
    setup(world=(0.012, 0.01, 0.008))
    wood = mat("wood", (0.20, 0.09, 0.04), rough=0.35, noise=0.55, scale=3, stretch=(1, 14, 1))
    paper = mat("paper", (0.86, 0.83, 0.76), rough=0.8)
    manila = mat("manila", (0.72, 0.55, 0.28), rough=0.75)
    ink = mat("ink", (0.03, 0.05, 0.12), rough=0.3)
    brass = mat("brass", (0.75, 0.55, 0.22), rough=0.25, metal=1)
    mug = mat("mug", (0.05, 0.09, 0.2), rough=0.2)
    coffee = mat("coffee", (0.05, 0.025, 0.01), rough=0.1)
    box((0, 0, -0.03), (6, 3, 0.06), wood)
    rnd = random.Random(4)
    # A stack of folders, the top one open to a page of lines.
    for i in range(4):
        box((0.35 + rnd.uniform(-0.02, 0.02), 0.05 + rnd.uniform(-0.02, 0.02), 0.006 + i * 0.012), (0.46, 0.62, 0.01), manila, rot=(0, 0, rnd.uniform(-8, 8)), bevel=0.003)
    box((0.36, 0.04, 0.056), (0.40, 0.56, 0.004), paper, rot=(0, 0, 4))
    for i in range(11):
        box((0.36 + 0.012 * (i - 5) * 0.1, 0.25 - i * 0.042, 0.0595), (0.30 - (i % 3) * 0.05, 0.0035, 0.0008), mat("pencil", (0.25, 0.28, 0.36), rough=0.9), rot=(0, 0, 4))
    # Loose sheets fanned toward the lamp.
    for i in range(3):
        box((1.0 + i * 0.06, -0.12 + i * 0.05, 0.003 + i * 0.003), (0.42, 0.56, 0.002), paper, rot=(0, 0, -14 + i * 9))
    # Pen.
    pen((0.95, -0.3, 0.017), -12, 0.26, ink, brass)
    # Coffee.
    cyl((1.42, 0.3, 0.055), 0.07, 0.11, mug)
    cyl((1.42, 0.3, 0.108), 0.062, 0.006, coffee)
    bpy.ops.mesh.primitive_torus_add(location=(1.5, 0.3, 0.055), major_radius=0.035, minor_radius=0.011, rotation=(math.pi / 2, 0, 0))
    bpy.context.object.data.materials.append(mug)
    bpy.ops.object.shade_smooth()
    # The banker's lamp: a brass stem and a warm shade, off to the right.
    cyl((1.75, 0.45, 0.01), 0.11, 0.02, brass)
    cyl((1.75, 0.45, 0.2), 0.012, 0.4, brass)
    shade = mat("shade", (0.02, 0.22, 0.12), rough=0.15, emit=0.25)
    cyl((1.62, 0.4, 0.4), 0.07, 0.36, shade, rot=(0, 90, 20))
    spot((1.6, 0.38, 0.38), (0.8, 0.0, 0), 90, angle=130, blend=0.8, color=(1, 0.78, 0.5))
    area((-2, -1.5, 2.2), (0.3, 0, 0), 60, size=3, color=(0.55, 0.65, 1))
    camera((0.2, -1.35, 0.42), (0.75, 0.1, 0.03), lens=38, focus=(0.4, 0.0, 0.05), fstop=2.2)


def team():
    """Team: the film room's chalkboard with a play drawn up, a ball on the tray."""
    setup(world=(0.008, 0.01, 0.01))
    slate = mat("slate", (0.035, 0.075, 0.06), rough=0.85, noise=0.45, scale=2.5)
    chalk = mat("chalk", (0.92, 0.92, 0.86), rough=1, emit=0.12)
    yellow = mat("ychalk", (0.95, 0.8, 0.3), rough=1, emit=0.12)
    wood = mat("frame", (0.18, 0.09, 0.04), rough=0.5, noise=0.5, scale=4, stretch=(12, 1, 1))
    box((0.9, 0.02, 1), (7.4, 0.04, 1.7), slate)
    box((0.9, -0.04, 0.12), (7.5, 0.14, 0.05), wood)
    box((0.9, 0, 1.88), (7.5, 0.08, 0.07), wood)
    # The offense as O's, the defense as X's, drawn flat on the board.
    o_spots = [(-0.6, 0.72), (-0.3, 0.72), (0, 0.72), (0.3, 0.72), (0.6, 0.72), (0.95, 0.72), (-1.5, 0.72), (1.7, 0.66), (0, 0.5), (0, 0.3), (-0.45, 0.36)]
    x_spots = [(-0.5, 0.95), (-0.15, 0.95), (0.2, 0.95), (0.6, 0.95), (-0.9, 1.12), (0, 1.15), (0.9, 1.12), (-1.5, 1.18), (1.7, 1.18), (-0.6, 1.5), (0.7, 1.52)]
    def Z(z):
        # The play is drawn squat so all of it fits the wide header.
        return 0.98 + (z - 0.95) * 0.6
    o_spots = [(x, Z(z)) for x, z in o_spots]
    x_spots = [(x, Z(z)) for x, z in x_spots]
    for x, z in o_spots:
        text("O", (x + 0.9, 0, z), 0.17, chalk, rot=(90, 0, 0))
    for x, z in x_spots:
        text("X", (x + 0.9, 0, z), 0.16, chalk, rot=(90, 0, 0))
    # Routes: chalk strokes made of thin boxes, with an arrow head.
    def stroke(a, b, m=yellow, w=0.014):
        ax, az = a
        bx, bz = b
        d = math.hypot(bx - ax, bz - az)
        ang = math.degrees(math.atan2(bz - az, bx - ax))
        box(((ax + bx) / 2 + 0.9, -0.004, (az + bz) / 2 + 0.06), (d, 0.004, w), m, rot=(0, -ang, 0))
    def arrow(pts, m=yellow):
        pts = [(x, Z(z)) for x, z in pts]
        for a, b in zip(pts, pts[1:]):
            stroke(a, b, m)
        (ax, az), (bx, bz) = pts[-2], pts[-1]
        ang = math.atan2(bz - az, bx - ax)
        for s in (2.6, -2.6):
            stroke((bx, bz), (bx + 0.08 * math.cos(ang + s), bz + 0.08 * math.sin(ang + s)), m)
    arrow([(-1.5, 0.8), (-1.5, 1.3), (-1.0, 1.62)])
    arrow([(1.7, 0.74), (1.7, 1.05), (1.15, 1.32)])
    arrow([(0.95, 0.8), (1.05, 1.3), (1.45, 1.6)])
    arrow([(0, 0.3), (0.5, 0.42), (0.85, 0.82)], chalk)
    stroke((-2.3, Z(0.62)), (2.3, Z(0.62)), chalk, 0.006)
    # Chalk and the ball on the tray.
    cyl((-0.2, -0.06, 0.16), 0.012, 0.09, chalk, rot=(0, 90, 20))
    cyl((0.0, -0.07, 0.16), 0.012, 0.07, yellow, rot=(0, 90, -10))

    spot((1.4, -2.8, 2.6), (1.2, 0, 0.95), 800, angle=75, blend=0.95, color=(1, 0.93, 0.8))
    area((-3, -2, 1.5), (0, 0, 1), 40, size=3, color=(0.6, 0.75, 1))
    camera((-0.2, -3.3, 1.0), (0.9, 0, 0.98), lens=30, focus=(0.9, 0, 0.98), fstop=8)


def building():
    """Roster building: the capologist's ledger under a green lamp, coins and a pen."""
    setup(world=(0.008, 0.011, 0.01))
    felt = mat("felt", (0.014, 0.055, 0.038), rough=0.95, noise=0.3, scale=90)
    page = mat("page", (0.87, 0.85, 0.76), rough=0.85)
    cover = mat("cover", (0.07, 0.035, 0.03), rough=0.5, noise=0.4, scale=40)
    rule = mat("rule", (0.25, 0.42, 0.55), rough=0.8)
    red = mat("red", (0.6, 0.08, 0.06), rough=0.8)
    ink = mat("ink", (0.04, 0.05, 0.09), rough=0.4)
    gold = mat("gold", (0.85, 0.62, 0.2), rough=0.28, metal=1)
    steel = mat("steel", (0.6, 0.62, 0.65), rough=0.25, metal=1)
    box((0, 0, -0.02), (6, 3, 0.04), felt)
    # The open ledger: a cover, two pages meeting at the gutter.
    box((0.7, 0.05, 0.008), (1.3, 0.84, 0.016), cover, bevel=0.004)
    for side in (-1, 1):
        box((0.7 + side * 0.31, 0.05, 0.026), (0.6, 0.78, 0.02), page, rot=(0, side * 2.2, 0), bevel=0.004)
        # Ruled lines, one red margin, and columns of figures as short dark dashes.
        for i in range(15):
            box((0.7 + side * 0.31, 0.39 - i * 0.048, 0.0375), (0.54, 0.0018, 0.0006), rule, rot=(0, side * 2.2, 0))
        box((0.7 + side * 0.31 + 0.12, 0.05, 0.0378), (0.0022, 0.74, 0.0006), red, rot=(0, side * 2.2, 0))
        rnd = random.Random(side + 7)
        for i in range(13):
            w = rnd.uniform(0.07, 0.2)
            box((0.7 + side * 0.31 - 0.24 + w / 2, 0.373 - i * 0.048, 0.038), (w, 0.012, 0.0006), ink, rot=(0, side * 2.2, 0))
            w = rnd.uniform(0.04, 0.09)
            box((0.7 + side * 0.31 + 0.23 - w / 2, 0.373 - i * 0.048, 0.038), (w, 0.012, 0.0006), red if rnd.random() < 0.2 else ink, rot=(0, side * 2.2, 0))
    # Pen across the gutter.
    pen((0.92, -0.2, 0.05), 25, 0.26, ink, gold)
    # Stacks of coins.
    rnd = random.Random(2)
    for (x, y, n) in [(1.62, 0.3, 9), (1.76, 0.18, 5), (1.58, 0.1, 3), (1.86, 0.36, 12)]:
        for i in range(n):
            cyl((x + rnd.uniform(-0.004, 0.004), y + rnd.uniform(-0.004, 0.004), 0.006 + i * 0.011), 0.055, 0.01, gold if (x * 10) % 2 < 1 else steel)
    # A green-shaded lamp spills from the right.
    spot((1.9, -0.2, 0.75), (0.8, 0.05, 0), 160, angle=95, blend=0.9, color=(1, 0.86, 0.6))
    area((2.6, 1.2, 0.9), (1.2, 0.2, 0), 25, size=1, color=(0.4, 1, 0.6))
    area((-2.2, -1.2, 2), (0.4, 0, 0), 35, size=3, color=(0.6, 0.7, 1))
    camera((0.2, -1.25, 0.5), (0.9, 0.1, 0.02), lens=36, focus=(0.75, 0.0, 0.04), fstop=2.4)


def draft():
    """Draft: the war room's big board. Rows of cards on cork, pinned, lit from above."""
    setup(world=(0.01, 0.009, 0.008))
    cork = mat("cork", (0.42, 0.26, 0.13), rough=0.95, noise=0.6, scale=45)
    frame = mat("frame", (0.1, 0.06, 0.035), rough=0.45, noise=0.4, scale=5, stretch=(10, 1, 1))
    card = mat("card", (0.9, 0.87, 0.78), rough=0.85)
    ink = mat("ink", (0.08, 0.09, 0.12), rough=0.6)
    pin = mat("pin", (0.7, 0.06, 0.05), rough=0.2)
    stripes = [mat(f"s{i}", c, rough=0.7) for i, c in enumerate([(0.75, 0.12, 0.1), (0.1, 0.3, 0.65), (0.1, 0.5, 0.25), (0.85, 0.6, 0.1), (0.4, 0.15, 0.55), (0.8, 0.35, 0.08)])]
    box((0.6, 0.03, 1), (9.4, 0.04, 1.8), cork)
    for z in (0.08, 1.92):
        box((0.6, 0, z), (9.5, 0.09, 0.07), frame)
    rnd = random.Random(11)
    cols, rows = 23, 5
    for c in range(cols):
        x = -3.7 + c * 0.39
        for r in range(rows):
            if rnd.random() < 0.12 and r > 1:
                continue  # a gap where a player came off the board
            z = 1.68 - r * 0.31
            tilt = rnd.uniform(-2.5, 2.5)
            box((x, 0, z), (0.33, 0.004, 0.24), card, rot=(0, tilt, 0))
            box((x, -0.003, z + 0.095), (0.33, 0.003, 0.05), stripes[(c + r * 2 + rnd.randrange(2)) % 6], rot=(0, tilt, 0))
            for k in range(3):
                box((x - 0.03 + k * 0.01, -0.003, z + 0.02 - k * 0.045), (0.2 - k * 0.04, 0.002, 0.014), ink, rot=(0, tilt, 0))
            ball((x, -0.012, z + 0.1), 0.013, pin)
    spot((1.2, -2.4, 3.0), (0.9, 0, 1), 900, angle=55, blend=0.9, color=(1, 0.9, 0.74))
    area((-3, -2, 1), (0, 0, 1), 30, size=3, color=(0.6, 0.72, 1))
    camera((-0.35, -1.75, 0.8), (0.95, 0, 1.03), lens=28, focus=(0.8, 0, 1), fstop=3.2)


def office():
    """Owner's office: the boardroom at dusk. A long table, chairs, the city behind glass."""
    setup(world=(0.01, 0.012, 0.02))
    table = mat("table", (0.09, 0.035, 0.02), rough=0.12, noise=0.5, scale=2.5, stretch=(1, 12, 1))
    leather = mat("chair", (0.03, 0.035, 0.05), rough=0.45)
    brass = mat("brass", (0.8, 0.58, 0.22), rough=0.25, metal=1)
    carpet = mat("carpet", (0.03, 0.045, 0.09), rough=1, noise=0.3, scale=70)
    wall = mat("wall", (0.07, 0.05, 0.04), rough=0.6, noise=0.3, scale=3, stretch=(1, 1, 10))
    box((0, 0, -0.01), (14, 10, 0.02), carpet)
    box((1.2, 0, 0.74), (6.2, 1.5, 0.07), table, bevel=0.02)
    box((1.2, 0, 0.36), (4.8, 0.5, 0.7), mat("base", (0.04, 0.02, 0.012), rough=0.4))
    for i in range(7):
        x = -1.35 + i * 0.85
        for side in (-1, 1):
            y = side * 1.05
            box((x, y, 0.47), (0.52, 0.5, 0.09), leather, bevel=0.03)
            box((x, y + side * 0.24, 0.78), (0.52, 0.09, 0.6), leather, rot=(side * -6, 0, 0), bevel=0.03)
            cyl((x, y, 0.22), 0.03, 0.42, brass)
    # The far wall is glass: a dusk sky with lit towers, behind dark mullions.
    box((6.6, 0, 1.7), (0.05, 14, 3.6), mat("sky", (0.05, 0.09, 0.22), rough=1, emit=1.1))
    rnd = random.Random(5)
    lit = mat("lit", (1.0, 0.72, 0.35), emit=6)
    tower = mat("tower", (0.012, 0.016, 0.03), rough=0.8)
    for i in range(30):
        y = -6 + i * 0.42 + rnd.uniform(-0.1, 0.1)
        h = rnd.uniform(0.5, 2.6)
        w = rnd.uniform(0.25, 0.42)
        box((6.5, y, h / 2 + 0.3), (0.05, w, h), tower)
        for _ in range(int(h * 9)):
            box((6.46, y + rnd.uniform(-w / 2 + 0.04, w / 2 - 0.04), 0.4 + rnd.uniform(0, h - 0.15)), (0.01, 0.03, 0.045), lit)
    for i in range(11):
        box((6.3, -6 + i * 1.2, 1.7), (0.08, 0.06, 3.6), wall)
    box((6.3, 0, 0.25), (0.1, 14, 0.5), wall)
    box((6.3, 0, 3.4), (0.1, 14, 0.2), wall)
    # Brass pendants over the table.
    glow = mat("glow", (1, 0.8, 0.5), emit=14)
    for i in range(4):
        x = -0.6 + i * 1.2
        cyl((x, 0, 2.0), 0.16, 0.12, brass)
        cyl((x, 0, 1.94), 0.13, 0.01, glow)
        spot((x, 0, 1.9), (x, 0, 0.7), 260, angle=85, blend=0.9, color=(1, 0.8, 0.52))
    area((-3, -3, 2.5), (1, 0, 0.8), 80, size=4, color=(0.5, 0.62, 1))
    camera((-3.2, 1.9, 1.55), (5.5, -0.9, 0.95), lens=32, focus=(1.5, 0, 0.8), fstop=4)


def league():
    """League: the stadium at night from behind the goal post, lights over the far stand."""
    setup(world=(0.004, 0.006, 0.012))
    turf = mat("turf", (0.03, 0.2, 0.06), rough=0.95, noise=0.35, scale=120)
    turf2 = mat("turf2", (0.022, 0.16, 0.045), rough=0.95, noise=0.35, scale=120)
    line = mat("line", (0.9, 0.92, 0.9), rough=0.9)
    post = mat("post", (0.95, 0.75, 0.08), rough=0.3)
    stand = mat("stand", (0.02, 0.022, 0.03), rough=0.9)
    # The field runs away from the camera along +Y, one unit to the yard.
    for i in range(12):
        box((0, -5 + i * 10, 0), (53.3, 10, 0.02), turf if i % 2 else turf2)
    for i in range(21):
        box((0, i * 5, 0.012), (53.3, 0.12, 0.005), line)
    for x in (-26.6, 26.6):
        box((x, 50, 0.012), (0.2, 120, 0.005), line)
    for i in range(100):
        for x in (-3.1, 3.1):
            box((x, i, 0.012), (0.6, 0.08, 0.005), line)
    for i in range(1, 10):
        n = str(min(i, 10 - i) * 10)
        for x, r in ((-17, -90), (17, 90)):
            text(n, (x, i * 10, 0.013), 2.2, line, rot=(0, 0, r))
    # The near goal post.
    cyl((0, -11.5, 1.6), 0.09, 3.3, post)
    cyl((0, -10.9, 3.3), 0.08, 6.2, post, rot=(0, 90, 0))
    box((0, -11.2, 3.3), (0.12, 0.7, 0.12), post)
    for x in (-3.08, 3.08):
        cyl((x, -10.9, 8.3), 0.065, 10, post)
    # Stands on three sides, rising in steps, with a scatter of crowd lights.
    rnd = random.Random(3)
    crowd = [mat(f"c{i}", c, emit=1.2) for i, c in enumerate([(0.9, 0.85, 0.7), (0.5, 0.6, 0.9), (0.9, 0.4, 0.3)])]
    for t in range(14):
        box((0, 126 + t * 1.6, 2 + t * 1.5), (150, 1.6, 1.5), stand)
        for x in (-1, 1):
            box((x * (36 + t * 1.6), 50, 2 + t * 1.5), (1.6, 190, 1.5), stand)
    for _ in range(1100):
        t = rnd.randrange(14)
        if rnd.random() < 0.45:
            box((rnd.uniform(-70, 70), 125.1 + t * 1.6, 2.9 + t * 1.5), (0.35, 0.05, 0.3), rnd.choice(crowd))
        else:
            x = rnd.choice((-1, 1))
            box((x * (35.1 + t * 1.6), rnd.uniform(-10, 125), 2.9 + t * 1.5), (0.05, 0.35, 0.3), rnd.choice(crowd))
    # Light banks on towers above the far corners.
    bank = mat("bank", (1, 0.97, 0.9), emit=60)
    for x in (-52, -18, 18, 52):
        box((x, 150, 38), (0.5, 0.5, 34), stand)
        for r in range(3):
            for c in range(6):
                ball((x - 5 + c * 2, 149, 46 + r * 2.2), 0.7, bank)
    for x in (-40, 40):
        spot((x, 60, 60), (0, 40, 0), 250000, angle=70, blend=0.7, color=(1, 0.97, 0.92))
    area((0, -30, 30), (0, 20, 0), 6000, size=30, color=(0.7, 0.8, 1))
    camera((9, -24, 4.2), (-3, 40, 8.5), lens=24, focus=(0, -11, 5), fstop=5.6)


def game():
    """Game: the manual. A playbook binder, a whistle and a clipboard on a plain table."""
    setup(world=(0.012, 0.013, 0.015))
    top = mat("top", (0.1, 0.11, 0.125), rough=0.5, noise=0.25, scale=30)
    binder = mat("binder", (0.05, 0.12, 0.25), rough=0.35)
    page = mat("page", (0.88, 0.87, 0.82), rough=0.85)
    ink = mat("ink", (0.08, 0.09, 0.12), rough=0.6)
    steel = mat("steel", (0.7, 0.72, 0.75), rough=0.2, metal=1)
    board = mat("board", (0.3, 0.19, 0.1), rough=0.6, noise=0.4, scale=14)
    cord = mat("cord", (0.75, 0.1, 0.08), rough=0.7)
    box((0, 0, -0.02), (6, 3, 0.04), top)
    box((0.55, 0.1, 0.03), (0.6, 0.76, 0.06), binder, rot=(0, 0, -8), bevel=0.008)
    box((0.56, 0.1, 0.03), (0.56, 0.72, 0.05), page, rot=(0, 0, -8))
    box((0.55, 0.1, 0.0615), (0.34, 0.12, 0.002), page, rot=(0, 0, -8))
    text("PLAYBOOK", (0.555, 0.085, 0.063), 0.05, ink, rot=(0, 0, -8))
    # The clipboard with a page of lines.
    box((1.35, 0.02, 0.006), (0.5, 0.7, 0.012), board, rot=(0, 0, 10), bevel=0.004)
    box((1.35, 0.0, 0.014), (0.44, 0.6, 0.003), page, rot=(0, 0, 10))
    box((1.295, 0.32, 0.025), (0.2, 0.06, 0.025), steel, rot=(0, 0, 10), bevel=0.005)
    for i in range(9):
        box((1.36 + i * 0.008, 0.2 - i * 0.05, 0.0165), (0.32 - (i % 4) * 0.04, 0.008, 0.001), ink, rot=(0, 0, 10))
    # The whistle and its cord.
    cyl((0.98, -0.3, 0.03), 0.03, 0.035, steel, rot=(90, 0, 30))
    box((1.02, -0.275, 0.035), (0.07, 0.03, 0.022), steel, rot=(0, 0, 30), bevel=0.004)
    bpy.ops.mesh.primitive_torus_add(location=(0.9, -0.36, 0.006), major_radius=0.065, minor_radius=0.004)
    bpy.context.object.data.materials.append(cord)
    football((1.95, 0.32, 0.085), yaw=28)
    spot((1.8, -0.6, 1.3), (0.9, 0, 0), 220, angle=75, blend=0.9, color=(1, 0.95, 0.88))
    area((-2, -1.4, 1.8), (0.5, 0, 0), 40, size=3, color=(0.62, 0.72, 1))
    camera((0.3, -1.75, 0.62), (1.1, 0.1, 0.02), lens=36, focus=(1.0, 0.0, 0.05), fstop=2.8)


ROOMS = {"desk": desk, "team": team, "building": building, "draft": draft, "office": office, "league": league, "game": game}
