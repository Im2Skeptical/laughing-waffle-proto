# Vassal & founder workbench

Run `npm run preview:vassals`, then open
<http://localhost:5182/images/dark-fantasy/vassal-chrome-prototype/>.
An existing root development server can serve the same path. The Pages build
copies the assets and bundles this study separately from the game.

This follows the illustrated card workbench: editable presentation fixtures,
layered painted assets, comparisons at game size, transparency and PNG export.
Keep it inside this workbench until the user approves production integration.

## Studies

- **Founder menu:** one centred founder, dim neighbouring previews, arrows,
  swipe, horizontal/Shift-scroll, keyboard arrows and a thumbnail rail. Compare
  4, 6 or 8 slots. Warlord and Philosopher explain their classes and compulsory
  founding actions. Extra slots are black silhouettes with question marks.
  The optional first-run Scholar lock is a proposal; its explanation remains
  inspectable. No unlock rule is invented for unknown founders.
- **Regular vassal:** compare identity first, signature first and full stat
  comparison. Edit the name, starting region, Age, Prestige, class stats,
  signature title/explanation and body size. Examples come from the existing
  signature definitions. Long copy raises a fit warning rather than reducing
  the font. The three-candidate drawer shows an example established tradition.
- **Class frames:** compare the Warrior's sword ring and the Scholar's book
  and scroll arch, with an optional separate founder crest. Swap the same two
  identities between class clothing. Export the empty hollow frame or its
  assembly with a portrait.

The default surface places founder/regular studies on the supplied game screen,
in the fixed 2424×1080 coordinate system. It retains the existing HUD, map,
navigation and time-control arrangement. Enlarged assembly mode is for editing
details. The screenshot is a fixed reference, not live civilization state.
Class portraits demonstrate independent identity and clothing; they are not a
procedural portrait generator.

Save PNG exports the full 2424×1080 game composition regardless of the browser
size. Candidate and frame assemblies export at twice their logical resolution.
Empty frames retain their transparent apertures.

URLs preserve `study`, `class`, `layout`, `founder`, `slots` and `guided`.
Other property edits are ephemeral; Reset restores that study's fixture.
Confirmation only records a local preview message. It never enters a real node.

## Layers and boundaries

`components.png` and `portraits.png` are original 1254×1254 ImageGen outputs,
copied without raster modification. `components.json` supplies rectangles for
the hollow Warrior/Scholar frames, detachable founder crest and dark silhouette.
`prompts.json` records generation prompts. `game-screen.png` is the supplied
in-game reference screenshot.

Read this file before `study.js`, which owns only local form state and Pixi
applications. `renderer.js` owns preview assemblies; it reuses the native relic
panel painter. It exports `loadVassalAssets`, `assemblePortrait`,
`assembleRegular`, `assembleFounder` and `assembleGame`. Shared textures belong
to the loader; destroy containers with `{ children: true }`.

Only founding and signature definitions are read. Simulation state, RNG,
serialization schemas, time and replay are untouched. The production renderer
does not import this workbench. Its source imports are bundled independently for
Pages; the asset manifest registers only the standalone preview images.

## Verification

Run `npm run check:architecture`, `npm run check:assets`, `npm run build` and
`npm run verify`. In the browser, check all six class/layout combinations;
overflow warnings and reset; locked/open Scholar and unavailable silhouettes;
4/6/8-slot wrapping; keyboard arrows outside fields; arrows/thumbnails/swipe;
PNG dimensions and transparent apertures; repeated tab changes without growing
canvas counts; and page overflow at 1280×800, 844×390 and 390×844.
