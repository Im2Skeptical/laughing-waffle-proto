# World map view extract

Helpers for the public module `src/views/world-map-pixi.js`, which remains the
orchestrator and still re-exports every previous public symbol.

This split is mechanical. Map interaction, packet rewind, and panel content
stay in `createWorldMapView`.

## Extracted modules

- `constants.js` — `MAP_RECT`, panel rects, colours, packet caps, tap windows
- `packets.js` — glyph spec, playback direction, pose, facing, rewind visual spec
- `glyphs.js` — worker/ownership/vassal/pressure/currency builders
  that take explicit parent/point arguments and do not close over the view

## Intentionally not extracted

- Packet spawn/draw/reset (closes over batch and playback state)
- `buildRegionMapIndicators` and worker-count adapters (state aggregation)
- Hit-testing, double-tap, tooltips, buttons, and chronicle panel wiring

`createWorldMapView` accepts optional `getDisplayOptions` for the Development Lab's
terrain/scenery/connections/workers/structures/actors/alerts toggles. Omitted flags
retain normal game rendering. These flags affect presentation only.

## Map disclosure and camera

The map fills the playfield beneath fixed chrome. Selection opens a right-hand
region panel; dismissal eases back to the saved overview camera while the panel
shrinks toward the settlement over 320 ms. Its content stays visible until the
transition ends; reopening reverses the shrink from its current pose. Opening or switching a
region eases its map marker into the left-side center at a minimum 1.65x zoom.
Manual camera input cancels that focus transition immediately. Chaos is a floating,
collapsible drawer. `transitions.js` provides view-local easing and the 240 ms
panel reveal from the selected marker; reduced-motion preferences skip easing.
The panel container survives content redraws so neither transition restarts.
The camera in `camera.js` owns view-local pan, wheel/pinch
zoom, bounds, and drag/tap discrimination. Terrain, markers and transfer effects
share its transform and clipping; simulation state and replay are unchanged.

Regional tableaus show five larger Practices and an eight-cell construction
rail, with cells beyond regional capacity hatched and locked. Card inspection
continues to use the shared piece view.

Run `npm run test:region-map-camera` for deterministic focus/animation checks
and `npm run probe:region-map` for disclosure, mouse/touch gestures, inspection,
and desktop/mobile screenshots, alongside the settlement/navigation probes.

## Territory presentation

Settlement paintings are 58 x 66 map units; zoom supplies the close view.
Structure-slot pictograms are omitted from the map and remain in settlement
panels. Player land has a dark-backed gold boundary; the selected polygon uses
an ice-blue/white outline drawn above neighboring terrain and roads.
`territory-art.js` draws polygon-clipped scorched ground and fissures plus a
horned skull marker for monster regions, without consuming simulation RNG.
Run `node scripts/map-territory-browser-probe.mjs` for occupied-region visual
checks, including selection and mobile zoom, and serialized-state preservation.
