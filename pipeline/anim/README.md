# Animation art

The field view's players and plays are made here with Blender and committed
to `assets/anim/`, so building and testing the game never needs Blender.

```
pip install bpy pillow                      # Blender as a Python module (or use `blender -b -P <script> --`)
python3 pipeline/anim/render_sprites.py /tmp/frames skill line
python3 pipeline/anim/pack_atlas.py /tmp/frames assets/anim skill line
python3 pipeline/anim/export_plays.py assets/anim [--save plays.blend]
python3 pipeline/anim/export_glb.py assets/anim [--save player.blend] [--preview /tmp/prev run tackle]
npx vitest run tests/anim.test.ts           # size budget and that every play has what it needs
```

The field view draws 3D players when the browser has WebGL, and falls back to
the sprites below when it doesn't:

- `player3d.py` builds the 3D player: a body grown with the skin modifier
  from a stick figure and weighted to an 18-bone skeleton, a helmet with a
  facemask and stripe, shoulder pads, number patches (back, chest and the
  shoulders), an official's cap, and the football with its laces. Each
  surface has its own material name, which the game colors per club.
- `moves3d.py` holds about 50 moves as joint angles (runs, backpedal,
  shuffle, stances, pass sets, blocks, rush moves, the snap, handoffs,
  throws, catches, tackles, falls, getting up, jukes, spins, stiff arms,
  kicks, punts, celebrations, officials' signals). Each pose is set down so
  its lowest part touches the grass.
- `export_glb.py` keys every move into a Blender action and writes
  `player.glb`; `--preview` renders frames of chosen moves to check them by
  eye (`PREVIEW_ELEV=8` for a side view).

- `rig.py` builds the figure from code (two bodies: `skill` and `line`). Its
  materials are masks: red is the jersey, green the helmet and pants, blue the
  gloves, socks and shoes. The game tints them per club.
- `actions.py` holds the moves as joint angles worked out from a clock.
- `render_sprites.py` renders every frame from eight sides at the field
  view's camera angle; `pack_atlas.py` outlines the frames and packs one
  lossless WebP per body plus `sprites.json`.
- `export_plays.py` lays the play book out as keyed empties on a field, one
  unit to the yard, and samples the paths into `plays.json`: where each
  group lines up by formation and personnel, the route tree, and the
  handoff paths. The game (`src/ui/anim/build.ts`) puts the plays together
  from those pieces. `--save` keeps the scene so a path can be reshaped by
  hand and exported again.

Everything here is made up for the game: generic figures in club colors and
generic plays. No logos.
