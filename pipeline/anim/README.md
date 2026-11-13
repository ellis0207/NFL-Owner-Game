# Animation art

The field view's players and plays are made here with Blender and committed
to `assets/anim/`, so building and testing the game never needs Blender.

```
pip install bpy pillow                      # Blender as a Python module (or use `blender -b -P <script> --`)
python3 pipeline/anim/render_sprites.py /tmp/frames skill line
python3 pipeline/anim/pack_atlas.py /tmp/frames assets/anim skill line
python3 pipeline/anim/export_plays.py assets/anim [--save plays.blend]
npx vitest run tests/anim.test.ts           # size budget and that every play has what it needs
```

- `rig.py` builds the figure from code (two bodies: `skill` and `line`). Its
  materials are masks: red is the jersey, green the helmet and pants, blue the
  gloves, socks and shoes. The game tints them per club.
- `actions.py` holds the moves as joint angles worked out from a clock.
- `render_sprites.py` renders every frame from eight sides at the field
  view's camera angle; `pack_atlas.py` outlines the frames and packs one
  lossless WebP per body plus `sprites.json`.
- `export_plays.py` lays each play out as keyed empties on a field, one unit
  to the yard, and samples the paths into `plays.json`. `--save` keeps the
  scene so a play can be reshaped by hand and exported again.

Everything here is made up for the game: generic figures in club colors and
generic plays. No logos.
