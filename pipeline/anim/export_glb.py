"""Builds the 3D player and the football, keys every move and writes assets/anim/player.glb.

    python3 pipeline/anim/export_glb.py assets/anim [--save player.blend] [--preview <dir> [clip ...]]

The game draws this model live (src/ui/anim/Players3D.ts). `--save` keeps the
scene so a move can be reshaped by hand in Blender and exported from there;
`--preview` renders a contact sheet of frames from the field view's camera
angle for checking a move by eye.
"""
import math
import os
import sys

import bpy

sys.path.insert(0, os.path.dirname(__file__))
import moves3d  # noqa: E402
import player3d  # noqa: E402


def build_scene():
    arm, ball = player3d.build()
    scene = bpy.context.scene
    scene.render.fps = moves3d.FPS
    for name, (frames, fn, loop) in moves3d.CLIPS.items():
        moves3d.key_action(arm, name, frames, fn, loop)
    arm.animation_data.action = None
    return arm, ball


def export(out_dir):
    os.makedirs(out_dir, exist_ok=True)
    path = os.path.join(out_dir, "player.glb")
    bpy.ops.export_scene.gltf(
        filepath=path, export_format="GLB", use_selection=False,
        export_animations=True, export_animation_mode="ACTIONS", export_force_sampling=True,
        export_frame_step=1, export_def_bones=False, export_optimize_animation_size=True,
        export_apply=False, export_skins=True, export_morph=False, export_lights=False, export_cameras=False,
        export_materials="EXPORT", export_image_format="NONE", export_yup=True,
    )
    return path


def preview(out_dir, arm, clips):
    """Renders a few frames of each clip from the field camera's angle, side by side, into PNGs."""
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.samples = 16
    sc.cycles.use_denoising = False
    sc.render.resolution_x, sc.render.resolution_y = 1400, 300
    sc.render.film_transparent = False
    world = bpy.data.worlds.new("w")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs[0].default_value = (0.18, 0.4, 0.2, 1)
    world.node_tree.nodes["Background"].inputs[1].default_value = 0.8
    sc.world = world
    sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN"))
    sun.data.energy = 3.5
    sun.rotation_euler = (math.radians(40), math.radians(-30), 0)
    sc.collection.objects.link(sun)
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
    sc.collection.objects.link(cam)
    cam.data.type = "ORTHO"
    cam.data.ortho_scale = 14.5
    # PREVIEW_ELEV=10 looks from the side, to judge a pose; the field view's own angle is 60.
    t = math.radians(float(os.environ.get("PREVIEW_ELEV", "60")))
    cam.location = (6, -20 * math.cos(t), 0.9 + 20 * math.sin(t))
    cam.rotation_euler = (math.pi / 2 - t, 0, 0)
    sc.camera = cam
    os.makedirs(out_dir, exist_ok=True)
    for o in [arm, *arm.children]:
        o.hide_render = True
    # Seven copies of the figure, each at a different frame and facing.
    for name in clips:
        frames, _, _ = moves3d.CLIPS[name]
        act = bpy.data.actions[name]
        objs = []
        for k in range(7):
            dup = arm.copy()
            dup.data = arm.data
            dup.hide_render = False
            dup.animation_data_create()
            dup.animation_data.action = act
            sc.collection.objects.link(dup)
            for child in arm.children:
                c = child.copy()
                c.hide_render = False
                c.parent = dup
                c.modifiers["skeleton"].object = dup
                sc.collection.objects.link(c)
                objs.append(c)
            dup.location = (k * 2.0, 0, 0)
            dup.rotation_euler = (0, 0, math.radians([0, 45, 90, 135, 180, 270, 315][k]))
            objs.append(dup)
        # Each copy is posed straight from the clip's own math at its own frame.
        arms = [o for o in objs if o.type == "ARMATURE"]
        for k, o in enumerate(arms):
            o.animation_data.action = None
            f = 1 + round(k * (frames - 1) / 6)
            moves3d_pose(o, name, f - 1)
        sc.render.filepath = os.path.join(out_dir, f"{name}.png")
        bpy.ops.render.render(write_still=True)
        for o in objs:
            bpy.data.objects.remove(o)


def moves3d_pose(arm, name, i):
    frames, fn, _ = moves3d.CLIPS[name]
    p = fn(i)
    G, head, _, d = moves3d.solve(p)
    for pb in arm.pose.bones:
        r = arm.data.bones[pb.name].matrix_local.to_quaternion()
        pb.rotation_mode = "QUATERNION"
        pb.rotation_quaternion = r.inverted() @ d[pb.name] @ r
        if pb.name == "root":
            pb.location = arm.data.bones["root"].matrix_local.to_3x3().inverted() @ head["root"]


if __name__ == "__main__":
    args = sys.argv[1:]
    out = args[0]
    arm, ball = build_scene()
    print("wrote", export(out))
    if "--save" in args:
        bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(args[args.index("--save") + 1]))
    if "--preview" in args:
        k = args.index("--preview")
        rest = [a for a in args[k + 2:] if not a.startswith("--")]
        preview(args[k + 1], arm, rest or list(moves3d.CLIPS))
