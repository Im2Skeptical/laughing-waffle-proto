# Timegraph model

Controller, cache, and sampling for metric graphs. Views import through
`src/views/timegraphs-pixi.js`; series labels live in
`src/model/graph-metrics.js`.

Do not rewrite this folder together with the forecast worker, `state.js`, or
`createMetricGraphView` follow/scrub/playhead. See
`codex/abandoned-timegraph-refactor-do-not-merge`.

## Files

- `controller-core.js` — `createTimeGraphController` orchestrator
- `forecast-state-cache.js` — retained-anchor / cache helpers
- `projection-cache.js` — projection window cache
- `sampling.js` — sample-second builders (do not rewrite the body for routing)
- `metric-helpers.js` — series/label/value resolvers used by the controller
- `edit-policy.js` — editable-range and scroll-window policy
- `constants.js` / `utils.js` — sample caps and `clampSec`

`projection.js` / `projection-chunk.js` stay outside this folder.
