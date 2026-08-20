# Repository and Verification Map

Use this guide to make narrow changes without loading unrelated systems. Start
with `rg` for the named symbol or visible label, then read only the routed file
and its direct dependencies.

## Active application path

- Browser entry: `src/views/ui-root-pixi.js`
- Main UI/controller wiring: `src/views/ui-root-settlement-pixi.js`
- Simulation runner/save/load: `src/controllers/sim-runner.js`
- Forecast orchestration: `src/controllers/settlement-forecast-controller.js`
- Forecast worker service: `src/controllers/timegraph-forecast-worker-service.js`
- Forecast worker entry: `src/controllers/timegraph-forecast-worker.js`

`ui-root-settlement-pixi.js` is a high-coupling orchestration file. Search for
the relevant function before reading it. Do not use it as the default location
for new rendering or model rules.

## UI routes

### Map

- Rendering, region selection, ownership/worker/structure glyphs, packet
  animation, and map panels: `src/views/world-map-pixi.js`
- Pure map/civilization selectors: `src/model/world-state.js` and
  `src/model/detailed-settlements.js`
- Administration packet reconstruction: `src/model/edge-transfers.js`

### Detailed settlement

- Overview/Demographics layout and labels:
  `src/views/settlement-prototype-view.js`
- Vassal candidate drawer, Life Map, and primary control:
  `src/views/world-map-vassal-drawer-pixi.js`,
  `src/views/vassal-life-map-pixi.js`, and
  `src/views/settlement-vassal-controls-pixi.js`
- Shared survival strip: `src/views/civilization-survival-hud.js`
- Season/moon wheel: `src/views/sunandmoon-disks-pixi.js`
- Pause/time controls: `src/views/time-controls-pixi.js`

### Timegraph

- Graph rendering, reveal/playhead animation, history zones, brackets, and old
  versus new projection drawing: `src/views/timegraphs-pixi.js`
- Scope and series definitions: `src/model/graph-metrics.js`
- Series menu: `src/views/ui-root/settlement-graph-series-menu.js`
- Window/horizon helpers: `src/views/ui-root/settlement-timegraph-window.js`
- Graph controller/cache internals: `src/model/timegraph/`
- Projection summaries: `src/model/projection-summary.js`

`timegraphs-pixi.js` is large. Search for the visible behavior, exported
`createMetricGraphView`, or the relevant constant; do not read it end-to-end
for ordinary label/layout work.

### Debug tools

- Shared debug shell: `src/views/settlement-debug-menu-dom.js`
- Map Lab view/controller/model:
  `src/views/map-lab-dom.js`, `src/controllers/map-lab-controller.js`,
  `src/model/map-lab-draft.js`
- Game Settings/Gamepieces:
  `src/views/debug-configuration-dom.js`,
  `src/controllers/debug-configuration-controller.js`,
  `src/model/game-config.js`
- Vassal Lab: `src/views/vassal-debug-dom.js`
- Named browser presets: `src/model/debug-draft-library.js`

## Simulation routes

- Detailed settlements, workers, food, demographics, housing, Elder Orders,
  and view models: `src/model/detailed-settlements.js`
- Vassal Life Map definitions and authoritative lifecycle:
  `src/defs/gamepieces/vassal-life-map-defs.js` and
  `src/model/vassal-life-map.js`
- Lunar phase definitions/timing: `src/defs/gamesettings/moon-phase-defs.js`,
  `src/model/moon-phases.js`
- Detailed structure/practice definitions:
  `src/defs/gamepieces/detailed-settlement-defs.js`
- World definitions/state: `src/defs/world/` and `src/model/world-state.js`
- Timeline and authoritative rebuild: `src/model/timeline/index.js`
- One-second replay path: `src/model/replay-second-runner.js`
- Serialization and schema validation: `src/model/state.js`
- Projection building: `src/model/projection.js`,
  `src/model/projection-chunk.js`, and `src/model/projection-summary.js`
- Vassal history/timegraph selectors: `src/model/settlement-state.js`

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
  the matching `test:*` command, then `npm run verify`
- Timeline, forecast, survival, graph scope, or vassal history:
  `npm run test:detailed-replay`, `npm run test:world`, then
  `npm run probe:settlement`
- Map/settlement visual or interaction changes:
  `npm run verify`, then `npm run probe:settlement`
- Map Lab/debug form changes:
  `npm run verify`, then `npm run probe:map-lab`
- Shared mobile layout or input changes:
  both browser probes and a 1280x800 visual check

Browser probes write details under `artifacts/` and print concise failures.
Do not paste their full artifact JSON into chat.

## Maintenance guards

- `npm run check:architecture` rejects `Math.random()` and model imports from
  view/controller layers.
- `npm run check:source` rejects JavaScript under `src/` that is unreachable
  from the app, forecast worker, or supported tests.
- `npm run build` emits hashed app and forecast-worker bundles plus the
  stylesheet and records all three in `dist/build-manifest.json`.
- Generated output and `.codex-remote-attachments/` are not source cleanup
  targets.

## Documentation status

- Current behavior: `ai/ai-context.md`
- Current routing: this file
- Implemented design records:
  `ai/detailed-settlement-redesign-plan.md` and
  `ai/debug-tools-expansion-plan.md`
- Superseded history: `ai/milestone2-substage3-report.md` and older prompts

Historical records are useful when a design decision is questioned, but they
should not be loaded for routine UI work.

## Known, bounded debt

- `src/views/timegraphs-pixi.js` is the largest active UI module. Extract a
  focused helper only when a real graph change gives that helper a stable
  boundary; avoid speculative rewrites of the working timeline behavior.
- `src/views/ui-root-settlement-pixi.js` still coordinates many graph, preview,
  vassal, and screen-mode concerns. New drawing belongs in focused views, while
  runner/timeline mutations belong in controllers.
- `src/controllers/sim-runner.js`, `src/model/state.js`, and the active
  settlement/timeline modules retain some pre-redesign substrate because it is
  still on serialization or replay paths. Reachability is not proof that those
  internals are good extension points.

These hotspots are manageable with symbol-first reads and the verification
matrix above. Split them incrementally alongside concrete features rather than
performing a high-risk whole-file rewrite.
