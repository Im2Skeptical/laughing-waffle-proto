# Chronicle visual overhaul

Implemented September 2026. This document describes the shipped presentation and its extension points. Current game rules live in `ai/ai-context.md` (invariants), `ai/sim.md`, and `ai/ui.md`.

## Art direction and layout

The references in `ai/References/` were accessible and inspected before design: Diablo II, Age of Empires II, Baldur's Gate II, and the supplied pixel illustration/card references. They informed the palette, material treatment, and composition; the shipped paintings and sprites are newly generated originals.

The game keeps its fixed 2424 × 1080 landscape canvas, uniformly fitted and letterboxed. The menu can adapt to portrait; fullscreen and landscape entry are handled inside that same menu. Losing focus returns to the menu, and Continue resumes the live game. Main screens share engraved brass borders, dark stone panels, bone-colored headings, and readable body text. The lower band holds the shared navigation dock, Chronicle graph, and enlarged astrolabe. The dock is a thumb pad: two sculpted capsule halves with large icons and short titles, without subtitles. Life Map and Settlement share equal emphasis on the Regional Map; elsewhere Map is the smaller companion to the main destination. A circular Vassal portrait/location shortcut sits above the pad outside the Life Map, opposite a small auxiliary clock. Clock hands and colored directional arrows distinguish Present, History, and projected future; hover supplies context. A brief, reduced-motion-aware input highlight explains attempts to edit fixed history or projections. The wheel sits in the right corner, with a compact vertical lever immediately to its left. The lever locks forward/rewind movement around a neutral centre. The two discs and central phase medallion accept drags. Six phase sprites turn with the moon face; a tap on the upright centre opens the six-phase rules and results reference. The approved Sun, Moon, Phase, Prestige, Food, and Money sprites also label live resource amounts and framed choice/shop costs.

- Region polygons and roads still come from the world definition. Terrain is clipped to those polygons; no authored map image determines geography.
- Hamlet smoke, braziers, dust, and transfer packets follow the viewed timeline.
- Gamepieces use illustrated cards. Small slots use thumbnails; tap or hover reveals their information. Choice-card art opens an inspection, while its footer stages or chooses. The separate confirmation step remains authoritative.
- Long descriptions can be dragged or scrolled inside the inspection panel. The mortality estimate and confirmation controls remain visible.
- Lifegraph geometry is spaced for readability in the view without changing serialized nodes, edges, availability, or outcomes.
- Portrait art is assigned deterministically from the existing serialized portrait traits. Eight portrait archetypes are reused; every individual trait is not separately painted.
- Hold the small workshop seal in the upper-right corner for 850 ms to open development tools. Ctrl+Shift+D also toggles them; Escape closes them. A normal tap does not open the workshop.
- The ♪ control enables or mutes timeline sound. Sound starts off.

## Time-first rendering contract

`src/views/timeline-presentation.js` contains pure samplers for looping frames, finite events, dust positions, visual time, and audio phase. A renderer must be able to request a frame at any time without simulating all intervening visual frames.

1. Model snapshots and `tSec` remain authoritative. A fractional view time is used only when it belongs to the displayed integer snapshot.
2. World animation samples viewed time directly. Do not accumulate emitter state, use wall-clock particle lifetimes, or use a mutable random source for world visuals.
3. A sprite sequence is sampled with `sampleSpriteFrame(time, clip)`; it is not independently advanced by an AnimatedSprite ticker.
4. Finite effects have a deterministic simulation start second and duration. Administration and migration packets are reconstructed from the existing replay batch. Scrubbing backward visits the same positions and orientations in reverse order.
5. Pausing retains the fractional picture. Returning to a previously viewed time restores the same world pixels after assets have loaded, on the same renderer.
6. Hover, long-press, drag, and audio de-click envelopes are interface behavior and may use wall time. Forecast calculation/reveal remains the existing interface behavior; it cannot advance the authoritative simulation.
7. All textures, audio nodes, lookup Maps, and UI scroll state stay outside GameState. No simulation RNG, schema, definitions, controllers, or replay rules were changed.

PixiJS 7 remains appropriate: textures and sprite frames can be selected manually, without an engine migration. The shipped game uses the browser's normal graphics path. Relevant primary documentation: [Pixi AnimatedSprite](https://pixijs.download/v7.0.4/docs/PIXI.AnimatedSprite.html), [Pixi render loop](https://pixijs.com/7.x/guides/basics/render-loop).

## Audio

The initial original ambient score is a quiet 24-second synthesized drone, wind, and asymmetric bell loop. The implementation builds forward and reversed PCM buffers and follows timeline position, speed, and direction with Web Audio. Reverse playback uses a reversed buffer at a positive rate, avoiding dependence on negative browser playbackRate support. The held timeline, menu, hidden page, and portrait viewport are silent. Sound also stops when viewed time cannot move at a history/forecast boundary, even if the lever requests movement. Seeks restart at the appropriate buffer offset; short de-click fades are intentional.

This is an implemented reversible ambient layer, not a complete authored soundtrack or a library of simulation-event sound effects. Browser playback resynchronizes when phase drift exceeds 90 ms, so it is not a claim of sample-exact audio/display hardware synchronization. Future sound effects should use deterministic event times and the same transport, including a reversed PCM version where appropriate. [Web Audio playbackRate](https://developer.mozilla.org/en-US/docs/Web/API/AudioBufferSourceNode/playbackRate).

## Asset library

All seven atlases live in `images/dark-fantasy/` and are loaded as nearest-neighbor textures. Illustration crops preserve aspect ratio. Atlas cells share base textures; only texture regions are cached.

See [asset provenance and exact generation prompts](../images/dark-fantasy/README.md), including the approved [resource and timepiece family](../images/dark-fantasy/resource-language-v1/README.md).

The current library contains thirty-six paintings, including a distinct illustration for each of the thirty current Practices and Structures, eight portraits, four terrain types, one menu panorama, and four-frame hamlet/fire loops. The presentation test guards unique gamepiece illustration coverage. Additional terrain variants, portrait archetypes, and combat/weather animation sets would expand its production depth; those extra sets are not represented as completed assets.

## Implementation routes

- Shared frame and materials: `src/views/chronicle-skin.js`
- Resource sprites and framed costs: `src/views/resource-cost-pixi.js`
- Solar/lunar discs and phase reference: `src/views/sunandmoon-disks-pixi.js`, `src/views/moon-phase-reference-pixi.js`
- Asset loading, atlas regions, aspect-preserving crops: `src/views/chronicle-art.js`
- Gamepiece cards and readable inspection: `src/views/settlement-piece-pixi.js`, `src/views/chronicle-inspection.js`
- Map information: `src/views/chronicle-world-panels.js`
- Sprite and particle sampling: `src/views/chronicle-effects-pixi.js`, `src/views/timeline-presentation.js`
- Audio transport: `src/views/timeline-audio.js`
- Main composition/transport getters: `src/views/ui-root-settlement-pixi.js`
- Navigation dock, portrait gestures, and time-lock feedback: `src/views/settlement-navigation-pixi.js`

## Verification and manual review

Run `npm run verify`, `npm run probe:settlement`, `npm run probe:game-menu`, `npm run probe:map-lab`, and `npm run probe:chronicle`.

The new pure-sampler test covers unique gamepiece art, nonsequential/reversed seeks, frame bounds, finite events, reverse audio phase, bounded score amplitude, and non-mutating Lifegraph layout. The Chronicle browser probe first requires a painted scene, then checks all art loads, workshop gestures, keyboard access, frozen and rewind-identical world/astrolabe pixels, signed audio transport, phone resizing, and inspection without staging or choosing. WebGL failures fail the probe.

Browser probes use an explicit software GL driver for their trusted local fixtures, via `scripts/browser-probe-config.mjs`; this does not change the shipped game's renderer. Run graphics probes serially on hosts with limited rendering resources. [Chromium's software rendering documentation](https://chromium.googlesource.com/chromium/src/+/main/docs/gpu/swiftshader.md).

Review at 1280 × 800 and 844 × 390, including settlement Overview/Demographics, Vassal candidates, Lifegraph, choices, inspection, and menu. On a physical phone, check the long press, pinch-free landscape layout, card inspection scrolling, and audible time-lever behavior. Automated phone coverage uses Chromium viewport/input emulation; physical mobile Safari/audio output needs device review.
