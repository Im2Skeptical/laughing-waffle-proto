---
name: change-timegraph
description: Change the timegraph. Use when editing series labels, plot ink, key cabinet, scroll chrome, series menu, window/horizon, reveal, scrub, or playhead. Route via ai/repository-map.md Timegraph section.
---

# Change the timegraph

Start in `ai/repository-map.md` **Timegraph**. Search the named symbol or
visible label, then read only that file and its direct imports.

## Where drawing and labels go

| Concern | File |
|---|---|
| Series / labels / scope | `src/model/graph-metrics.js` |
| Plot ink / constants / key paging | `src/views/timegraphs/` |
| Illustrated scroll chrome | `src/views/timegraph-scroll-pixi.js` |
| Series menu | `src/views/ui-root/settlement-graph-series-menu.js` |
| Series groups | `src/views/ui-root/settlement-graph-groups.js` |
| Window / horizon | `src/views/ui-root/settlement-timegraph-window.js` |
| Reveal / scrub / playhead | `src/views/timegraphs/forecast-reveal-state.js`, `src/views/timegraphs/scrub-session.js` |

`timegraphs-pixi.js` is huge. Search `forecast-reveal-state.js` /
`scrub-session.js` for cadence and playhead, or the orchestrator for PIXI
pointer/`drawPlot` work. Ordinary label or series work belongs in
`src/model/graph-metrics.js` or `src/views/timegraphs/`; do not read the
orchestrator end-to-end for that.

After the map lands in a split folder, read that folder README before the
orchestrator file (`src/views/timegraphs/`, `src/model/timegraph/`,
`src/views/ui-root/README.md`).

## Do not

- Rewrite `timegraphs-pixi.js` together with the forecast worker or
  `src/model/state.js`.
- Load `ai/history/` for routine graph work.
- Add simulation rules in views; views render and emit input.

Probe with `npm run probe:navigation` or `npm run probe:settlement` as
relevant.
