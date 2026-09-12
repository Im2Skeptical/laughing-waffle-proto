# Repository and Verification Map

Use this guide to make narrow changes without loading unrelated systems. Start
with `rg` for the named symbol or visible label, then read only the routed file
and its direct dependencies.

## Active application path

- Browser entry: `src/views/ui-root-pixi.js`
- Main UI/controller wiring: `src/views/ui-root-settlement-pixi.js`
- Simulation runner/save/load: `src/controllers/sim-runner.js`.
  Slot key/meta, timeline payload, and inspect/read/write helpers live in
  `src/controllers/sim-runner/save-slots.js`. Public factory stays on
  `sim-runner.js`. See that folder's README.
- Landing menu and active save slot: `src/views/game-menu-dom.js` and
  `src/controllers/game-session-controller.js`
- Fullscreen/landscape entry: `src/views/game-display-mode.js`
- Player fresh-run setup: `src/model/new-game.js` and `src/model/starter-boot-profile.js`
- Forecast orchestration: `src/controllers/settlement-forecast-controller.js`
- Forecast worker service: `src/controllers/timegraph-forecast-worker-service.js`
- Forecast worker entry: `src/controllers/timegraph-forecast-worker.js`

`ui-root-settlement-pixi.js` is a high-coupling orchestration file. Search for
the relevant function before reading it. Playback, vassal chooser flow,
navigation-state, and graph-session helpers live in `src/views/ui-root/`. Do
not use the root file as the default location for new rendering or model rules.

## UI routes

### Shared presentation

- Frame and stone materials: `src/views/chronicle-skin.js`
- Original atlases and texture regions: `src/views/chronicle-art.js`,
  `images/dark-fantasy/README.md`
- Illustrated pieces and inspection: `src/views/settlement-piece-pixi.js` and
  `src/views/chronicle-inspection.js`
- Shared resource symbols and cost footers: `src/views/resource-cost-pixi.js`
  and `images/dark-fantasy/resource-language-v1/`
- Pure time samplers and scene effects: `src/views/timeline-presentation.js`
  and `src/views/chronicle-effects-pixi.js`
- Reversible sound: `src/views/timeline-audio.js`
- Design and time-first extension contract: `ai/visual-overhaul.md`

### Map

- Map orchestrator (`createWorldMapView`): `src/views/world-map-pixi.js`.
  Glyphs: `src/views/world-map/glyphs.js`. Packet pose helpers and map
  constants live in `src/views/world-map/`.
- Selected-region/chaos panel content: `src/views/chronicle-world-panels.js`
- Pure map/civilization selectors: `src/model/world-state.js` and
  `src/model/detailed-settlements.js`
- Administration packet reconstruction: `src/model/edge-transfers.js`

### Detailed settlement

- Overview/Demographics layout and labels:
  `src/views/settlement-prototype-view.js`
- Vassal candidate drawer, Life Map, and shared navigation/time-status dock:
  `src/views/world-map-vassal-drawer-pixi.js`,
  `src/views/vassal-life-map-pixi.js`, and
  `src/views/settlement-navigation-pixi.js`
- Vassal node-decision modal (`createVassalNodeDecisionModalView`):
  `src/views/vassal-node-decision-modal-pixi.js`. Cards, mortality plate,
  regional preview, and vassal-impact helpers live in
  `src/views/vassal-node-decision/`. Drag/confirm stay in the orchestrator.
- Shared survival strip: `src/views/civilization-survival-hud.js`
- Season/moon wheel: `src/views/sunandmoon-disks-pixi.js`
- Six-phase reference and viewed moon totals: `src/views/moon-phase-reference-pixi.js`
- Time lever: `src/views/time-controls-pixi.js`

### Timegraph

- Graph orchestrator (`createMetricGraphView`): `src/views/timegraphs-pixi.js`.
  Constants, plot math, plot ink, key-cabinet paging, forecast-reveal state,
  scrub-session, snapshot-cache, action-second caches, scale high-water,
  scale-max flash, boot-fade, projection-replacement, and time-window
  animation helpers live in `src/views/timegraphs/`. Search
  `forecast-reveal-state.js` / `scrub-session.js` for cadence and playhead;
  `plot-snapshot-cache.js` / `action-seconds-cache.js` / `scale-high-water.js`
  for cache keys, action-second lists, and run-scoped scale;
  `scale-max-flash-state.js` for series scale-max flash numbers;
  `boot-fade-state.js` / `projection-replacement-state.js` for overlay
  transition numbers; `time-bounds-state.js` for window lerp/reset; do not
  read the orchestrator end-to-end for ordinary label/layout work.
- Scope, series, and labels: `src/model/graph-metrics.js`.
  Fallback Gold lives in `src/model/graph-metrics/legacy-metrics.js`;
  legend tooltip copy lives in `src/model/graph-metrics/tooltips.js`.
  See that folder's README.
- Series menu: `src/views/ui-root/settlement-graph-series-menu.js`
- Series groups: `src/views/ui-root/settlement-graph-groups.js`
- Graph session (reveal config, horizon/window numbers, context switching,
  pending-commit reveal restart):
  `src/views/ui-root/settlement-graph-session.js`
- Illustrated assembly, fixed key paging layout, controls, and ink palette:
  `src/views/timegraph-scroll-pixi.js`
- Window/horizon helpers: `src/views/ui-root/settlement-timegraph-window.js`
- Graph controller/cache internals: `src/model/timegraph/`
  (`controller-core.js` orchestrator, `forecast-state-cache.js` for
  retained-anchor/cache helpers; do not rewrite with the forecast worker).
  See that folder's README.
- Projection summaries: `src/model/projection-summary.js`

### Debug tools

- Shared debug shell: `src/views/settlement-debug-menu-dom.js`
- Map Lab view/controller/model:
  `src/views/map-lab-dom.js`, `src/controllers/map-lab-controller.js`,
  `src/model/map-lab-draft.js`
- Game Settings/Gamepieces:
  `src/views/debug-configuration-dom.js`,
  `src/controllers/debug-configuration-controller.js`,
  `src/model/game-config.js`
- Debug world-map widget: `src/views/debug-world-map-dom.js`
- Vassal Lab: `src/views/vassal-debug-dom.js`
- Vassal Lab presets: `src/controllers/vassal-debug-preset-controller.js`
- Life Map Lab view/controller/model:
  `src/views/life-map-lab-dom.js`, `src/controllers/life-map-lab-controller.js`,
  `src/model/life-map-lab-draft.js`
- Named browser presets: `src/model/debug-draft-library.js`
- Debug profiles: `src/controllers/debug-profile-controller.js`,
  `src/model/debug-profile-library.js`

## Simulation routes

- Detailed settlements barrel (keep this import path):
  `src/model/detailed-settlements.js`. Internals:
  `queries.js`, `scopes.js`, `practices.js`, `phases.js` (stepper;
  phase bodies in `phases/`), `vassals.js`, `view-model.js`. See that
  folder's README and `phases/README.md`.
- Vassal Life Map definitions and barrel:
  `src/defs/gamepieces/vassal-life-map-defs.js` and
  `src/model/vassal-life-map.js`. Internals: `selectors.js`, `shop.js`,
  `lifecycle.js` (candidates / node-confirm / step in `lifecycle/`),
  `presentation.js`. Generated topology lives in
  `src/model/vassal-life-map-generator.js`. See `lifecycle/README.md`.
- Lunar phase definitions/timing: `src/defs/gamesettings/moon-phase-defs.js`,
  `src/model/moon-phases.js`
- Detailed structure/practice definitions:
  `src/defs/gamepieces/detailed-settlement-defs.js`
- Pure construction placement and practice draft projection:
  `src/model/structure-layout.js`, `src/model/practice-draft.js`
- Shared sparse face and inspection data: `src/model/gamepiece-presentation.js`
- Settlement tests (runner path unchanged): `src/model/tests/detailed-settlements.js`
  imports `queries.js` / `practices.js` / `phases.js` / `vassals.js` in that folder.
- Vassal Life Map tests: `src/model/tests/vassal-life-map.js` imports
  `selectors.js` / `shop.js` / `lifecycle.js` / `presentation.js`.
- Draft gesture/preview/confirmation replay checks:
  `src/model/tests/settlement-redesign.js`, `npm run probe:settlement-draft`
- World definitions/state: `src/defs/world/` and `src/model/world-state.js`
- Timeline and authoritative rebuild: `src/model/timeline/index.js`
- One-second replay path: `src/model/replay-second-runner.js`
- Serialization and schema validation: `src/model/state.js`
  (`createEmptyState`, serialize/deserialize, validate, load, season/RNG).
  Legacy hub/board/env constructors and occupancy rebuilders live in
  `src/model/state/board-legacy.js`; pawn field helpers in
  `src/model/state/pawn-legacy.js`. Public names stay on `state.js`.
  See that folder's README.
- Projection building: `src/model/projection.js`,
  `src/model/projection-chunk.js`, and `src/model/projection-summary.js`
- Current/selected vassal lineage reads: `src/model/vassal-life-map.js`
  (`selectors.js`). Remaining hub/history helpers, slot readers, and
  `isSettlementPrototypeEnabled`: `src/model/settlement-state.js`.
  Hub-core constructors, floodplain/hinterland tile food, and stockpile
  accessors live in `src/model/settlement-state/hub-legacy.js`. Public names
  stay on `settlement-state.js`. See that folder's README.

Some active state/replay modules still contain substrate inherited from the
pre-redesign prototype. Do not extend that substrate for new detailed-settlement
features. Prefer the detailed definitions and generalized operations described
in `ai/ai-context.md`.

## Proportional verification

- Documentation only:
  `npm run check:architecture` and `npm run check:source`
- Pure map selectors or map glyph helpers:
  `npm run test:world`, then `npm run build`
- Settlement simulation/game settings/gamepieces:
  `npm run test:detailed-settlements` (or the matching slice file), then
  `npm run verify`
- Timeline, forecast, survival, graph scope, or vassal history:
  `npm run test:detailed-replay`, `npm run test:world`, then
  `npm run probe:settlement`
- Map/settlement visual or interaction changes:
  `npm run verify`, then `npm run probe:settlement`
- Shared screen navigation, portrait shortcuts, or Present/time-state feedback:
  `npm run probe:navigation`
- Map Lab/debug form changes:
  `npm run verify`, then `npm run probe:map-lab`
- Landing menu, save slots, or new-run setup:
  `npm run verify` and `npm run probe:game-menu`
- Shared mobile layout or input changes:
  all three browser probes and a 1280x800 visual check
- Timeline-driven art, sound, or card inspection:
  `npm run test:presentation`, `npm run probe:chronicle`, and the relevant
  existing interaction probe; inspect 844x390 screenshots as well

Browser probes write details under `artifacts/` and print concise failures.
Do not paste their full artifact JSON into chat.

## Maintenance guards

- `npm run check:architecture` rejects `Math.random()`, model imports from
  view/controller layers, and new `src/model/` imports of leftover
  settlement exec/defs (tests excluded; current importers allowlisted).
- `npm run check:source` rejects JavaScript under `src/` that is unreachable
  from the app, forecast worker, or supported tests.
- `npm run build` emits hashed app and forecast-worker bundles plus the
  stylesheet and records all three in `dist/build-manifest.json`.
- Generated output and `.codex-remote-attachments/` are not source cleanup
  targets.

## Documentation status

- Invariants and schema numbers: `ai/ai-context.md`
- Simulation behavior: `ai/sim.md`
- UI behavior: `ai/ui.md`
- Ubiquitous language: `CONTEXT.md`
- Art/presentation contract: `ai/visual-overhaul.md`
- Current routing: this file
- Routing skills: `.grok/skills/`
- Historical decision records (not pending work, not current routing):
  `ai/history/`

Historical records are useful when a design decision is questioned, but they
should not be loaded for routine work.

## Known, bounded debt

- Overlay extracts from `timegraphs-pixi.js` are exhausted. Remaining inner
  functions close over PIXI or the controller; skip rather than lift
  `drawPlot` / metric resolution / snapshot I/O. Do not re-run
  `.grok/workflows/modularity-extract-*.rhai` or `modularity-legacy-split.rhai`.
- `src/views/timegraphs-pixi.js` still owns PIXI construction, pointer
  handlers, snapshot sampling I/O, and commit/preview I/O. Reveal cadence,
  scrub session math, snapshot-cache keys, run-scoped scale high-water,
  boot-fade, projection-replacement, and time-window animation state live in
  `src/views/timegraphs/`. Do not rewrite those with the forecast worker or
  `src/model/state.js` (see `codex/abandoned-timegraph-refactor-do-not-merge`).
- `src/views/ui-root-settlement-pixi.js` still wires graph composition,
  preview, and screen mode. Playback, vassal-flow, navigation-state, and
  graph-session helpers live in `src/views/ui-root/`. New drawing belongs
  in focused views.
- `src/controllers/sim-runner.js`, `src/model/state.js`, and
  `src/model/settlement-exec.js` retain pre-redesign substrate on the
  serialization/replay path. File-top comments mark them as non-extension
  points for new detailed-settlement rules. Hub/board/pawn constructors
  and occupancy rebuilders live in `src/model/state/`; hub-core
  constructors, floodplain/hinterland food, and stockpile accessors live
  in `src/model/settlement-state/`. Slot key/meta, timeline payload, and
  inspect/read/write helpers live in `src/controllers/sim-runner/`.
  `loadFromSlot` apply wiring, tick, playback, and rebuild stay on the
  runner. Do not add new detailed-settlement rules there.
  `src/model/actions.js` `applyAction` handles live vassal/region/debug
  kinds. Leftover `placePawn` / inventory-move/split/stack /
  `buildDesignate` / tile-and-hub tag kinds stay in `ActionKinds` because
  sim-runner planner helpers still switch on those strings. Do not rewrite
  those helpers to finish the trim.
- Leftover hub/practice defs and settlement exec helpers
  (`src/defs/gamepieces/hub-structure-defs.js`,
  `src/defs/gamepieces/settlement-practice-defs.js`,
  `src/model/settlement-vassal-exec.js`,
  `src/model/settlement-order-exec.js`,
  `src/model/settlement-leadership.js`,
  `src/model/settlement-upgrades.js`, and
  `src/model/settlement-exec.js`) are non-extension points. File-top
  comments mark them. `npm run check:architecture` rejects new
  `src/model/` imports of those modules (tests excluded; current
  importers allowlisted). Live site rules belong in
  `detailed-settlements`; live pieces in `detailed-settlement-defs.js`;
  Life Map rules in `vassal-life-map.js`.
- `src/model/graph-metrics.js` owns live civilization/settlement series.
  Leftover Gold/Grain/AP and hub-vs-prototype food/population metrics live
  in `src/model/graph-metrics/legacy-metrics.js`. Gold remains the unscoped
  controller fallback (`timegraphs-pixi.js` / `controller-core.js`).
  Grain/AP are unused by UI groups. Detailed food tooltip copy lives in
  `src/model/graph-metrics/tooltips.js`.

Repo navigation skills: `.grok/skills/`.
