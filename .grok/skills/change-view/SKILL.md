---
name: change-view
description: Change prototype UI. Use when editing Pixi/DOM views, map, timegraph, settlement layout, navigation, or presentation. Routes via ai/repository-map.md. Do not load historical plans.
---

# Change a view

Start in `ai/repository-map.md` **UI routes**. Search the named symbol or
visible label, then read only that file and its direct imports.

## Where drawing goes

| Concern | File |
|---|---|
| Map orchestrator | `src/views/world-map-pixi.js` |
| Map glyphs | `src/views/world-map/glyphs.js` |
| Map packets / constants | `src/views/world-map/packets.js`, `constants.js` |
| Settlement overview/demographics | `src/views/settlement-prototype-view.js` |
| Timegraph drawing / reveal | `src/views/timegraphs-pixi.js` |
| Timegraph series labels | `src/model/graph-metrics.js` |
| Timegraph plot ink / constants | `src/views/timegraphs/` |
| Timegraph series menu / window | `src/views/ui-root/settlement-graph-*.js` |
| Illustrated scroll chrome | `src/views/timegraph-scroll-pixi.js` |
| Shared nav / time dock | `src/views/settlement-navigation-pixi.js` |
| Piece faces / inspection | `src/views/settlement-piece-pixi.js`, `chronicle-inspection.js` |
| Vassal node-decision modal | `src/views/vassal-node-decision-modal-pixi.js` (helpers in `src/views/vassal-node-decision/`) |

Do **not** put new drawing in `src/views/ui-root-settlement-pixi.js`. That
file is high-coupling orchestration (screen mode, wiring). Search it for a
symbol if you must change transport; add pixels in a focused view.

`timegraphs-pixi.js` is huge. Search for the visible behavior,
`createMetricGraphView`, or the relevant constant first. Ordinary label
or series work belongs in `src/model/graph-metrics.js` or
`src/views/timegraphs/`; do not read the orchestrator end-to-end for that.

## Do not

- Load `ai/history/` unless the task is explicitly about a past design
  decision.
- Add simulation rules in views; views render and emit input.
- Restore removed inventory / environment-board / scroll-graph UI.

View-only edits should leave simulation state, RNG, schemas, and replay
untouched. Probe with `npm run probe:settlement` or
`npm run probe:navigation` when the change is visual or interactive.
