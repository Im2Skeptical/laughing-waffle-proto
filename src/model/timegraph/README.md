# Timegraph model

Controller, cache, and sampling for metric graphs. Views import through
`src/views/timegraphs-pixi.js`; series labels live in
`src/model/graph-metrics.js` (legacy fallback and tooltip copy in
`src/model/graph-metrics/`).

Do not rewrite this folder together with the forecast worker, `state.js`, or
`createMetricGraphView` follow/scrub/playhead. These have separate state ownership
and replay boundaries; see `docs/timegraph-optimisation-guardrails.md`.

Before optimising: `docs/timegraph-optimisation-guardrails.md`.

## Files

- `forecast-wire.js` — shares only frozen identical configs within forecast messages; keeps full snapshots and every-second summaries
- `authoritative-history-summaries.js` — committed tick summaries for plotting; survives metric/window changes and invalidates with timeline edits
- `controller-core.js` — `createTimeGraphController` orchestrator
- `forecast-state-cache.js` — retained-anchor / cache helpers
- `state-restorer.js` — validated immutable anchors and isolated mutable restores
- `projection-cache.js` — projection window cache
- `sampling.js` — sample-second builders (do not rewrite the body for routing)
- `metric-helpers.js` — series/label/value resolvers used by the controller
- `edit-policy.js` — editable-range and scroll-window policy
- `constants.js` / `utils.js` — sample caps and `clampSec`

`projection.js` / `projection-chunk.js` stay outside this folder.
