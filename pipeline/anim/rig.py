"""The player figure: a low-poly body built from code, so the art is ours and can be rebuilt.

Each body part is a simple mesh hanging from an empty that acts as its joint
(hips, spine, neck, shoulders, elbows, hips, knees). A pose is a set of joint
angles; nothing is skinned. The figure faces +X and stands on z = 0, one unit
to the metre.

Materials are flat masks, not team colors: the jersey renders in the red
channel, the helmet and pants in green, and gloves, socks and shoes in blue.
The game tints the three channels with each club's colors, so one set of
sprites serves every team. A little shading from a fixed light is baked into
the channel's strength.
"""
import math

import bpy

LIGHT = (-0.35, -0.45, 0.82)  # from the camera's upper left, fixed on the field


def mask_material(name, color):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    emit = nt.nodes.new("ShaderNodeEmission")
    geo = nt.nodes.new("ShaderNodeNewGeometry")
    dot = nt.nodes.new("ShaderNodeVectorMath")
    dot.operation = "DOT_PRODUCT"
    n = math.sqrt(sum(c * c for c in LIGHT))
    dot.inputs[1].default_value = tuple(c / n for c in LIGHT)
    ramp = nt.nodes.new("ShaderNodeMapRange")
    ramp.inputs["From Min"].default_value = 0.0
    ramp.inputs["From Max"].default_value = 0.9
    ramp.inputs["To Min"].default_value = 0.45
    ramp.inputs["To Max"].default_value = 1.0
    emit.inputs["Color"].default_value = (*color, 1)
    nt.links.new(geo.outputs["Normal"], dot.inputs[0])
    nt.links.new(dot.outputs["Value"], ramp.inputs["Value"])
    nt.links.new(ramp.outputs["Result"], emit.inputs["Strength"])
    nt.links.new(emit.outputs["Emission"], out.inputs["Surface"])
    return mat


def _joint(name, parent, loc):
    e = bpy.data.objects.new(name, None)
    bpy.context.scene.collection.objects.link(e)
    e.parent = parent
    e.location = loc
    e.rotation_mode = "XYZ"
    return e


def _part(kind, parent, loc, scale, mat, rot=(0, 0, 0)):
    if kind == "box":
        bpy.ops.mesh.primitive_cube_add(size=1)
    elif kind == "ball":
        bpy.ops.mesh.primitive_uv_sphere_add(radius=0.5, segments=16, ring_count=10)
    else:
        bpy.ops.mesh.primitive_cylinder_add(radius=0.5, depth=1, vertices=10)
    o = bpy.context.object
    o.parent = parent
    o.location = loc
    o.scale = scale
    o.rotation_euler = rot
    o.data.materials.append(mat)
    for p in o.data.polygons:
        p.use_smooth = kind != "box"
    return o


# Body shapes: how wide and thick each kind of player is drawn.
BODIES = {
    "skill": {"chest": 0.5, "depth": 0.3, "pads": 0.68, "limb": 0.15, "leg": 0.19},
    "line": {"chest": 0.62, "depth": 0.42, "pads": 0.8, "limb": 0.18, "leg": 0.23},
}


def build(body="skill"):
    """Builds the figure and returns its joints by name."""
    b = BODIES[body]
    jersey = mask_material("jersey", (1, 0, 0))
    second = mask_material("second", (0, 1, 0))
    plain = mask_material("plain", (0, 0, 1))
    j = {}
    j["root"] = _joint("root", None, (0, 0, 0))
    j["hips"] = _joint("hips", j["root"], (0, 0, 0.95))
    j["spine"] = _joint("spine", j["hips"], (0, 0, 0))
    _part("box", j["hips"], (0, 0, -0.02), (b["depth"] * 0.92, b["chest"] * 0.9, 0.22), second)
    _part("box", j["spine"], (0, 0, 0.3), (b["depth"], b["chest"], 0.5), jersey)
    _part("box", j["spine"], (0, 0, 0.5), (b["depth"] * 1.15, b["pads"], 0.17), jersey)
    j["neck"] = _joint("neck", j["spine"], (0, 0, 0.6))
    _part("ball", j["neck"], (0.01, 0, 0.14), (0.42, 0.38, 0.38), second)
    _part("box", j["neck"], (0.21, 0, 0.09), (0.05, 0.24, 0.12), plain)
    for side, s in (("L", 1), ("R", -1)):
        sh = j["sh" + side] = _joint("sh" + side, j["spine"], (0, s * (b["pads"] / 2 - 0.03), 0.5))
        _part("tube", sh, (0, 0, -0.15), (b["limb"] * 1.1, b["limb"] * 1.1, 0.32), jersey)
        el = j["el" + side] = _joint("el" + side, sh, (0, 0, -0.3))
        _part("tube", el, (0, 0, -0.13), (b["limb"] * 0.9, b["limb"] * 0.9, 0.28), plain)
        _part("ball", el, (0, 0, -0.3), (0.12, 0.12, 0.12), plain)
        hp = j["hp" + side] = _joint("hp" + side, j["hips"], (0, s * 0.12, -0.05))
        _part("tube", hp, (0, 0, -0.22), (b["leg"], b["leg"], 0.46), second)
        kn = j["kn" + side] = _joint("kn" + side, hp, (0, 0, -0.45))
        _part("tube", kn, (0, 0, -0.2), (b["leg"] * 0.8, b["leg"] * 0.8, 0.42), plain)
        _part("box", kn, (0.05, 0, -0.42), (0.24, 0.1, 0.08), plain)
    return j
