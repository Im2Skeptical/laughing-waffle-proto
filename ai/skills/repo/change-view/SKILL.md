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
| Map, glyphs, packets | `src/views/world-map-pixi.js` |
| Settlement overview/demographics | `src/views/settlement-prototype-view.js` |
| Timegraph drawing | `src/views/timegraphs-pixi.js` |
| Timegraph series menu / window | `src/views/ui-root/settlement-graph-*.js` |
| Illustrated scroll chrome | `src/views/timegraph-scroll-pixi.js` |
| Shared nav / time dock | `src/views/settlement-navigation-pixi.js` |
| Piece faces / inspection | `src/views/settlement-piece-pixi.js`, `chronicle-inspection.js` |

Do **not** put new drawing in `src/views/ui-root-settlement-pixi.js`. That
file is high-coupling orchestration (screen mode, wiring). Search it for a
symbol if you must change transport; add pixels in a focused view.

`timegraphs-pixi.js` is huge. Search for the visible behavior,
`createMetricGraphView`, or the relevant constant first. Do not read it
end-to-end for ordinary label/layout work.

## Do not

- Load historical plans (`ai/detailed-settlement-redesign-plan.md`,
  `ai/debug-tools-expansion-plan.md`, `ai/milestone2-substage3-report.md`,
  older prompts) for routine UI work.
- Add simulation rules in views; views render and emit input.
- Restore removed inventory / environment-board / scroll-graph UI.

View-only edits should leave simulation state, RNG, schemas, and replay
untouched. Probe with `npm run probe:settlement` or
`npm run probe:navigation` when the change is visual or interactive.
