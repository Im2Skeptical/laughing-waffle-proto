# World map view extract

## Illustrated live worlds

New games use the shared v1.0.34 regional geography and artwork. The saved
`regional-v<revision>:<seed>` definition ID (revision 1 today, pinned by
`scripts/regional-map-golden-test.mjs`) fixes polygons, biomes and initial roads;
the same definition supplies simulation adjacency and view hit areas.
Explicit authored Map Lab maps remain supported as authored layouts.
`illustrated-terrain.js` retains one water/hinterland bake and updates water/clouds
from viewed time at at most 30 fps. `regional-presentation.js` preserves the
underlying natural biome, including the study's example monster regions.
Only the viewed state's `region.monster` selects occupied terrain; clearing or
rewinding restores the original biome, including island water topology.

The one-time bake, the road/terrain composition and the three variant builds are
generators (`bakePixelTerrainSteps`, `composePlayableTerrainSteps`,
`composeTerrainLandscapeSteps`, `buildSteps`, `prepareRegionalTilesSteps`) that
`yield` between phases. `bakePixelTerrain`, `composePlayableTerrain`, `build` and
`prepareRegionalTiles` run them straight through for the study and checks, with
identical output. `illustrated-terrain.js` drives them with `runCooperative`
(`map-generation-prototype/cooperative.js`), which returns the main thread to the
browser once a 250 ms slice is used, so the loading screen keeps painting (a
shorter slice repaints more often but, in the full app, cost seconds of total
loading time); the longest stretch between checkpoints is recorded in
`stats.cooperation.longestStepMs`. A request replaced or destroyed meanwhile
discards the finished result and frees its textures.

New Game starts the terrain bake early: the opening controller announces the new
world as soon as it exists (`onState`), the session controller calls
`prefetch(state)` on the view, and the forecast wait overlaps the bake. `prepare`
adopts the early bake only for the same world id; any other world, a cancel, a
failure or `destroy()` aborts it at its next checkpoint and releases its
textures. Continue/Load never prefetch. `update()` and `setState()` do nothing until `stats.ready`, which is
set after the variants are built.

Live water and atmosphere render to padded camera windows in source coordinates.
Small pans reuse those windows; larger moves and zoom changes refresh them even
while time is paused. Water resolves categorical palette data before reducing
only the colour LODs sampled by the display. Camera windows and mesh uniforms
are reused until the camera, render resolution or presentation mesh changes.
The live bake covers all region outlines plus 320 canonical illustration pixels
on each side, snapped to a 16-pixel lattice (`world-bounds.js`). It is opaque and
has no distant bake. Pan limits and minimum zoom keep the visible playfield
inside that extent, including the area beside an open settlement panel.
The standalone workbench retains its original fine/distant extent and exports.
Cloud timing and absolute-time sampling are unchanged.

At seed 1867, the live fine raster is 1528 x 736 versus 3152 x 1032 (65% fewer
pixels), with the former distant raster eliminated. In one matched local probe,
the initial terrain/scenery preparation stage fell from 8.6 s to 5.5 s. This
excludes asset fetching and the subsequent village/monster variant preparation;
it is not an end-to-end phone loading-time claim.

GPU water cycles with the same immutable palette bank share a reference-counted
CPU table and texture upload. Each ramp/variant evaluates its analytic phase
once per animation time, then applies it to all colours. The palette matches
the single-colour reference exactly, including long and reverse-time samples.

`npm run probe:map-animation` checks cropped/full shader output, padded panning,
LOD selection, render workload and exact forward/rewind restoration. Run the
regional presentation probe with `1867 --windowed` for the live camera path,
including wide views and exact camera restoration. Debug map
stats expose animation pass/pixel counts and active window dimensions; these
describe submitted rendering work, not phone GPU frame times.
At seed 1867 in that fixture, overview animation submitted 1,152,944 output
pixels in four passes, versus 6,472,468 in thirteen with full-image targets
(82% less pixel work). The isolated shader probe compares full/cropped output;
returning to the same camera/time is pixel-exact. This is workload evidence,
not a measured Pixel 6 frame-rate claim.

The map keeps separate retained sections for region markers/geometry, the active
Vassal, population/research, calendar/survival, Chaos and camera controls. Sections
replace their scene only when their visual inputs change. Calendar and Chaos
updates do not rebuild unchanged regional labels and hit areas. Explicit refresh
and a new definition clear the retained scene; disposal destroys every section.
A redraw-local vertex index resolves jagged region outlines without repeated
linear searches through the complete world vertex list.

The live caller supplies `getStateRevision` from the runner's timeline. Unchanged
state identity, definition, second, revision and compact UI inputs reuse the
derived summaries, indicators and full scene signature. Forecast survival info,
selection, disclosure, display options and art changes still invalidate while
paused. Callers without a revision retain exact input inspection; explicit
`refresh()` also covers definitions or state edited in place.

`npm run probe:map-retention` checks consecutive viewed seconds without spread,
current population labels, pixel-exact rewind, occupation, same-second edits,
forecast updates and repeated paused frames without derived reads/uniform work.
It captures a CPU profile and allocation counts in `artifacts/map-retention/`.
`--baseline --baseline-ref <ref>` compares the map view from a compatible Git
revision; `PROBE_CPU_RATE=4` adds diagnostic CPU throttling after preparation.
These are isolated rendering measurements, not a physical-phone smoothness gate.
In the seed-1867 eight-second fixture, retaining the scene reduced destroyed Text
objects from 225 to 14 and all destroyed display objects from 1,270 to 25. The
baseline image is pixel-identical. Population and collapsed Chaos labels follow
the current state; occupation invalidates the map, and rewind restores its image.

`regional-tiles.js` prepares wilderness, settlement-ground and monster variants
once, then combines regional pieces and exposed bone borders. Player and neutral
villages use the prototype's biome-specific building atlas and layout planner.
Sites are planned on dry land per region, with smaller layouts for narrow
regions. Flags, input targets and road endpoints use these same site positions.
Roads use the shared prototype router/painter for exact live connections, with
bridges and terrain clearances. Disconnected islands show a dotted sea connection.
Road changes reroute/repaint without recomposing the landscape. Recent complete
presentations and road layouts have bounded caches owned/disposed by the view.

The shared `playable-terrain.js` compositor serves both the standalone study and
live game. Raster town reservations and cached peak checks avoid repeating expensive
per-building checks for every candidate illustration pixel. Local headless probes
measured roughly 10–32 ms to assemble changed regional appearances; a new road
layout took about 62 ms. These CPU submission timings exclude GPU readback and
are not mobile-device measurements. Cold art preparation remains the main cost
and stays behind the loading screen. Hidden maps do not animate; presentation
objects never enter simulation state, RNG, saves or authoritative replay.

Run `node scripts/regional-presentation-browser-probe.mjs [seed]` to check monster
spread, island occupation, occupied towns, removal, road changes and pixel-exact
restoration with a single terrain/variant bake. `node scripts/settlement-sites-test.mjs`
checks explicit connection routing, per-region planning and compact towns.
`scripts/illustrated-map-browser-probe.mjs` exercises the built game, selection,
time browsing, mobile layout, asset URLs and the standalone study.

Helpers for the public module `src/views/world-map-pixi.js`, which remains the
orchestrator and still re-exports every previous public symbol.

This split is mechanical. Map interaction, packet rewind, and panel content
stay in `createWorldMapView`.

## Extracted modules

- `constants.js` — `MAP_RECT`, panel rects, colours, packet caps, tap windows
- `packets.js` — glyph spec, playback direction, pose, facing, rewind visual spec
- `glyphs.js` — worker/ownership/vassal/pressure/currency builders
  that take explicit parent/point arguments and do not close over the view
- `region-panel-cache.js` — retained regional panels, keyed by exact rendered
  inputs and art revision. Game entry prepares the entry settlement panel
  behind the menu; changing time/content replaces stale panels.
- `stock-tags.js` — deduplicated recipe supply/demand icons above every settlement.
  Red outlines mean demand without a local producer, green means production
  without a local consumer, and local production plus demand has no outline.
  Meal demand adds Edible; Consume and Require inputs add demand, but Charge
  triggers do not. Recipes accepting alternatives use matching local tags when
  present. Roles describe installed recipes, independent of current inventory.

Supply packets use the same Stock Trait icons as Practice cards between the
actual provider and consumer settlements. Each marker shows only the Trait
requested or consumed: meals show Edible, and recipes accepting alternatives
show the matching Trait. Substitutions name the requirement they satisfy.
Unknown Stock falls back to the generic Stock icon.
Require markers have an outlined translucent plate because their Stock is
retained. `stock-transfer-icons.js` reuses atlas sprites across frames and
reconciles them when the transfer batch changes. Packets use authoritative
transfer records and the viewed
simulation second, including during rewind; they do not move Stock themselves.

Packet reconstruction (`src/model/edge-transfers.js`) uses a private projection
anchor reader. It serializes only the mutable body and reuses one validated,
frozen configuration; each replay owns independent mutable state and still runs
all 60 ticks. Mutable/changed configurations are rechecked, and every body is
validated. Packet selection, ordering, timestamps and overlap remain unchanged.
Run `node scripts/edge-transfer-performance-probe.mjs 12c67e1` to compare with
the full-configuration-copy implementation at a compatible schema revision.
The two-seed, twenty-comparison fixture measured a median 33.8 ms before versus
2.3 ms after on this desktop; it does not establish a phone frame-rate result.
Settlement supply tests cover real Food/Practice packets, exact restoration,
source isolation and validation after configuration edits.

## Intentionally not extracted

- Packet spawn/draw/reset (closes over batch and playback state)
- `buildRegionMapIndicators` and worker-count adapters (state aggregation)
- Hit-testing, double-tap, tooltips, buttons, and chronicle panel wiring

`createWorldMapView` accepts optional `getDisplayOptions` for the Development Lab's
terrain/scenery/connections/workers/structures/actors/alerts toggles. Omitted flags
retain normal game rendering. `choiceRegionIds` optionally keeps those regions
bright and desaturates/darkens other terrain, borders, labels, landmarks and roads.
`chrome: false` omits civilization panels while retaining camera controls for an
embedded map. These options affect presentation only; callers own legal actions.

## Map disclosure and camera

The map fills the playfield beneath fixed chrome. Selection opens a right-hand
region panel; dismissal eases back to the saved overview camera while the panel
shrinks toward the settlement over 320 ms. Its content stays visible until the
transition ends; reopening reverses the shrink from its current pose. Opening or switching a
region horizontally centers the selected settlement in the left map area and adjusts zoom to
fit its own territory and only active player settlements that are both adjacent
and directly road-connected. Neutral settlements, empty land, and monster-occupied
regions do not widen the frame. Automatic framing can zoom in up to 2.5x but
never below the current zoom. When fitting the group would require zooming out,
the selected settlement is centered at the current zoom and neighbours may extend
outside the frame. Vertical framing otherwise stays as close to the selected settlement's
center as possible, shifting only enough to fit the actual territory span rather
than reserving matching empty margins above and below. Reset returns to this framing.
Flag double-taps remain anchored to the first screen position for 500 ms, including
when group framing moves the flag into empty map space or beneath fixed chrome.
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
Neutral tableaus instead show a teal wooden market billboard with current
Stock quantities and Currency prices. Generated market-village paintings with striped teal awnings and pennants
replace player-town paintings and workers on the map. Billboard rows expose
traits and replenishment on inspection; purchases follow simulation consumption.

Run `npm run test:region-map-camera` for deterministic focus/animation checks
and `npm run probe:region-map` for disclosure, mouse/touch gestures, inspection,
and desktop/mobile screenshots, alongside the settlement/navigation probes.

## Territory presentation

Selecting a region highlights only neighbours that share a polygon edge AND
have a live direct road connection to it. Allied settlements use bright solid
violet outlines with a pale inner stroke; neutral settlements use medium violet
dashes; empty regions use faint violet dots. Road ink follows the destination's
style, or the weaker style when linking two highlighted neighbours. Monster
regions retain strong red outlines and skull markers. The selected region keeps
its cyan outline, and stronger outlines are drawn above weaker shared borders. Physical
adjacency alone and indirect road connectivity do not qualify. Unrelated terrain
is dimmed. The selected territory and its adjacent, directly road-connected player settlements are framed together
by default, without a reach key, relationship badges, or Show group button.
`relationships.js` intersects the viewed state's existing physical-adjacency and
live-connection selectors. The render signature includes live connections so
adding or removing a road refreshes highlighting without changing simulation
state. Ownership and actual available Stock still govern resource sharing.

On authored maps, settlement paintings are 58 x 66 map units; zoom supplies the close view.
Structure-slot pictograms are omitted from the map and remain in settlement
panels. Player land has a dark-backed gold boundary; the selected polygon uses
an ice-blue/white outline drawn above neighboring terrain and roads.
On authored maps, `territory-art.js` tiles generated scorched ground inside polygon masks and
places a generated horned-skull lair painting for monster regions, without consuming simulation RNG.
Each monster marker shows moons remaining until its next spread attempt, out of
the simulation's configured spread interval. The countdown restarts after each attempt.
Run `node scripts/map-territory-browser-probe.mjs` for occupied-region visual
checks, including selection and mobile zoom, and serialized-state preservation.

Authored-map region art uses the `region-landmarks-v1` atlas, packed at 40% source
resolution. Complete town/lair cutouts preserve aspect ratio. The market
billboard uses a nine-slice wooden frame behind live quantities and prices;
monster region panels show the same lair painting. Source masters and exact
prompts are in `images/dark-fantasy/region-landmarks-v1/README.md`.

- `retained-scene.js` — view-owned scene sections; replacing a section disposes its old objects, while unchanged sections retain text textures, graphics, hit areas and listeners.
