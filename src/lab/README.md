# Stadium Lab (vendored)

Ellis's Stadium Lab: a buildless 3D stadium design tool (custom WebGL2 renderer
with a software fallback), 2026 venue models, renovation estimating rules, real
parking inventories and land scenarios. The game uses it on the Stadium Lab page
(`src/ui/screens/StadiumLabScreen.tsx`); `src/engine/stadiumlab.ts` prices
designs in the game's money and calendar and `src/engine/labstate.ts` applies
finished work to the building.

The modules are copied from the Lab's `dist/` as they were, with these patches:

- `viewer.js`: `destroy()` stops the frame loop and the resize watch and removes
  the canvas, so the page can mount and unmount it.
- `geometry.js`: the OpenStreetMap district outlines come from `surveys.js`
  (filled by `setSurveys`) instead of the 2.3 MB `site-surveys.js`. The game
  serves them as `lab/site-surveys.json` (`assets/lab/`) and the page fetches
  them when it opens; a district draws without them until then.
- `district-model.js`: two more lot colors, `leased` (lots the club leases)
  and `building` (a garage still going up), for the Grounds page's 3D view.
- `*.d.ts` and `types.d.ts`: TypeScript declarations for what the game imports.
- `lab-original.css.txt`: the Lab's own stylesheet, kept for reference; the page
  is styled by `src/ui/styles/lab.css`.

Not used by the game: the Lab's app shell, its Operations tab (`business.js`;
the game's gate model owns operating money) and its project storage.

Modules other than `viewer.js`/`geometry.js`/`architecture.js`/`district-model.js`
never touch the DOM, so the engine (which also runs in the sim worker) can import
`economics.js`, `parking.js`, `parcels.js`, `data.js` and `parking-data.js`.

## Credits and licenses

- Venue photos in `assets/lab/reference/` are from Wikimedia Commons; each
  photographer, title and license (CC BY / CC BY-SA) is in `references.js` and
  shown with the photo on the page. Keep them together.
- District outlines in `assets/lab/site-surveys.json` are © OpenStreetMap
  contributors, available under the Open Database License 1.0 (ODbL); the page
  credits them whenever a map is drawn.
- Models, colors and parking counts not measured are estimates for a game.
  Nothing here grants rights to any team's or league's brands.
