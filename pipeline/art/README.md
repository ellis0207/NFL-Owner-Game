# Room art

Each sidebar group in the game is a room, and the header of every page in it
shows that room's picture: the owner's desk, the film room's chalkboard, the
cap office's ledger, the draft war room, the boardroom, the stadium at night
and the game manual. They are small Blender scenes built from code and
committed to `assets/art/`, so building the game never needs Blender.

```
pip install bpy pillow
python3 pipeline/art/render_rooms.py assets/art [room ...]   # desk team building draft office league game
```

- `scenes.py` builds each room from boxes, cylinders and text, with procedural
  materials (wood grain, cork, felt, turf) and its own lighting and camera.
  Pictures are 1600 x 420, composed with the interest on the right: the page
  title sits over the left under a scrim in the room's color.
- Each WebP is 15-35 KB. They ship beside the page as `art/` (Vite's public
  dir) and are optional: a header without its picture keeps the room's color.

Everything here is made up for the game: no logos, no real places.
