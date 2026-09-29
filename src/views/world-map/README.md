# World map view extract

Helpers for the public module `src/views/world-map-pixi.js`, which remains the
orchestrator and still re-exports every previous public symbol.

This split is mechanical. Map interaction, packet rewind, and panel content
stay in `createWorldMapView`.

## Extracted modules

- `constants.js` — `MAP_RECT`, panel rects, colours, packet caps, tap windows
- `packets.js` — glyph spec, playback direction, pose, facing, rewind visual spec
- `glyphs.js` — worker/structure/ownership/vassal/pressure/currency builders
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
region panel; dismissal restores the overview camera. Chaos is a floating,
collapsible drawer. The camera in `camera.js` owns view-local pan, wheel/pinch
zoom, bounds, and drag/tap discrimination. Terrain, markers and transfer effects
share its transform and clipping; simulation state and replay are unchanged.

Regional tableaus show five larger Practices and an eight-cell construction
rail, with cells beyond regional capacity hatched and locked. Card inspection
continues to use the shared piece view.

Run `npm run probe:region-map` for disclosure, mouse/touch gestures, inspection,
and desktop/mobile screenshots, alongside the settlement/navigation probes.
