# Timegraph view extract

Focused helpers used by the public metric-graph module
`src/views/timegraphs-pixi.js`. That file remains the orchestrator and still
exports `createMetricGraphView`, `createGoldGraphView`, and the existing helper
re-exports from `src/views/timegraphs-helpers.js`.

This split is mechanical. Timing, reveal cadence, scrub, playhead follow, and
sampling stay in the orchestrator.

## Extracted modules

- `constants.js`
  - Theme palette and every previous module/function-scoped numeric constant
    (reveal throttle, plot throttle, snap threshold, series-line widths, etc.).
  - Values are unchanged.
- `scale.js`
  - Pure sticky-scale merge, visible-range value clipping, and scale-range
    helpers. The freeze-during-reveal flag is now an explicit argument.
- `plot-math.js`
  - Grid step, time/value mapping, action-marker sampling, and action snap.
- `plot-draw.js`
  - Plot ink (series lines), history-zone fill, grid, forecast/action/event
    markers, scrub ticks, boot-fade overlay, and scale-max flash strength.
- `key-cabinet.js`
  - Legend signature/title, key-page slice, page clamp, and glyph hover paint.
  - PIXI entry construction and tooltip wiring stay in the orchestrator because
    they close over hover/tooltip/scroll state. `scroll.layoutKey` is still
    called there so cabinet caption/page-button side effects stay intact.

## Remaining inner-function map (`createMetricGraphView`)

Stateful orchestrator work that was not extracted:

- Metric/series resolution: `resolveMetric`, `getActiveSeries`, `getMetricLabel`
- Run-scoped scale high-water: `syncScaleHighWaterTimeline`,
  `applyRunScaleHighWaterRanges`, `getProjectionReplacementScaleRanges`,
  `triggerSeriesScaleMaxFlash`
- Snapshot cache and sampling: `invalidatePlotSnapshot`, `getPlotSnapshot`,
  `buildDynamicSnapshotParts`, `refreshPlotSnapshotForecastState`,
  `resolvePlotSnapshotTargetMaxSec`
- Boot fade ownership: `beginBootFadeTransition`, `clearBootFadeTransition`,
  `getBootFadeRenderState`
- Projection replacement state machine: `clearProjectionReplacementTransition`,
  `getProjectionReplacementMaxFloorSec`,
  `buildProjectionReplacementRenderState`, `getProjectionReplacementRenderKey`,
  `stageProjectionReplacementTransition`
- Forecast reveal / playhead / preview: `getDisplayHistoryEndSec`,
  `getVisibleForecastCoverageEndSec`, `getForecastRevealFollowTargetEndSec`,
  `getRenderedHistoryEndSec`, `syncForecastRevealPlayhead`,
  `syncForecastRevealPreview`, `getVisibleForecastScrubCapSec`,
  `getForecastRevealDesiredVelocitySecPerSec`,
  `getForecastRevealEffectiveStartDelayMs`, `resetForecastReveal`,
  `restartForecastRevealFrom`, `clearForecastRevealRestart`,
  `getAnimatedForecastCoverageEndSec`, `syncForecastRevealTarget`,
  `pauseForecastReveal`, `suspendForecastRevealPlayheadFollow`,
  `setForecastRevealConfig`
- Scrub / time bounds: `setTimeBounds`, `animateBoundToward`,
  `resetAnimatedTimeBounds`, `updateScrubFromPointer`, `applyPreviewThrottled`,
  `endScrub`, `clampScrubSecToRevealCap`, latched-preview helpers
- Action-second caches: `getActionSecs`, `getMarkerActionSecs`
- Window chrome / legend wiring: `drawLegend`, `setLegendPage`,
  `updateHeaderButtons`, `drawWindow`, tooltip/hover handlers
- Frame loop: `drawPlot`, `drawScrub`, `render`, `open`, `close`, `destroy`,
  debug/screen rect accessors

Thin adapters in the orchestrator (`timeToX`, `applyActionSnap`,
`getMarkerSeconds`, `refreshLegendStyles`, `drawSeriesLinesForRange`) only pass
explicit arguments through to the extracted helpers.

## Intentionally not extracted

- Reveal cadence, throttle `Ms`, forecast follow, scrub, playhead, and sampling
  logic: forbidden for this split; those functions close over mutable view
  state and must not be rewritten.
- `getPlotSnapshot` / forecast snapshot refresh: sampling and cache keys.
- Projection-replacement and boot-fade ownership: they mutate transition
  objects in the view closure.
- Full key-cabinet PIXI construction: pointer handlers close over tooltip and
  hover state; only paging/paint helpers were lifted.
