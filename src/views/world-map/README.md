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
