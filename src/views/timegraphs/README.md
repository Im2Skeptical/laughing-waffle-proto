# Timegraph view extract

Focused helpers used by the public metric-graph module
`src/views/timegraphs-pixi.js`. That file remains the orchestrator and still
exports `createMetricGraphView`, `createGoldGraphView`, and the existing helper
re-exports from `src/views/timegraphs-helpers.js`.

This split is mechanical. PIXI construction, pointer handlers, snapshot
sampling I/O, and the frame loop stay in the orchestrator. Reveal cadence,
playhead follow, scrub session math, snapshot-cache keys, action-second
caches, run-scoped scale high-water, series scale-max flash numbers, boot-fade,
projection-replacement, and time-window animation state live in the modules
below as explicit state objects plus pure updates.

## Extracted modules

- `constants.js`
  - Theme palette and every previous module/function-scoped numeric constant
    (reveal throttle, plot throttle, snap threshold, series-line widths, etc.).
  - Values are unchanged.
- `scale.js`
  - Pure sticky-scale merge, visible-range value clipping, and scale-range
    helpers. The freeze-during-reveal flag is now an explicit argument.
- `scale-high-water.js`
  - Run-scoped comparison ceilings keyed by timeline identity, subject, and
    series group. Functions take the state object plus explicit args.
  - No PIXI. Reset is object-identity of the timeline, not value equality.
- `scale-max-flash-state.js`
  - Series scale-max flash start times and duration numbers. Functions take
    the state object plus explicit previous/next range maps.
  - No PIXI. Strength/render-key and series-line overlay ink stay in
    `plot-draw.js`. Plot-version invalidation after a trigger stays in the
    orchestrator.
- `plot-snapshot-cache.js`
  - Snapshot cache key, bounds quantization, lead-window target max, cache
    hit/store/invalidate, previous-snapshot compatibility, and stable-prefix
    end. Functions take the cache object plus explicit args.
  - No PIXI. `getPlotSnapshot` sampling I/O stays in the orchestrator because
    it closes over the controller.
- `action-seconds-cache.js`
  - Windowed action-second list and sampled marker-second list, keyed by
    timeline action-seconds version, range, and marker cap. Functions take the
    cache object plus explicit timeline and range args.
  - No PIXI. Timeline range queries stay behind `getActionSecondsInRange` /
    `getActionSecondsInRangeSampled`.
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
- `forecast-reveal-state.js`
  - Mutable reveal coverage, velocity, start delay, pause, follow, preview
    target, and restart. Functions take the state object plus explicit args.
  - No PIXI. No DOM. Cadence numbers are unchanged.
- `scrub-session.js`
  - Scrubbing flag, pointer-local-x to seconds, latched forecast preview, and
    clamp-to-reveal-cap. Functions take the session object plus explicit args.
  - No PIXI. Commit / `getStateAt` / `drawScrub` stay in the orchestrator.
- `boot-fade-state.js`
  - Boot overlay duration, color, start time, and fade alpha/key. Functions
    take the state object plus explicit args.
  - No PIXI. `drawBootFadeOverlay` stays in `plot-draw.js`.
- `projection-replacement-state.js`
  - Staged/active overlay, truncation floor, flash/fade numbers, render key,
    and debug snapshot. Functions take the state object plus explicit args.
  - No PIXI. Snapshot sampling for `stageProjectionReplacementTransition`
    stays in the orchestrator because it closes over the plot cache. Overlay
    ink stays in `drawPlot`.
- `time-bounds-state.js`
  - Displayed min/max, animated min/max, last tick, snap reset, and bound lerp.
    Functions take the state object plus explicit args.
  - No PIXI. Visibility, zoom, scrubbing, and projection-floor I/O stay in the
    orchestrator `setTimeBounds` adapter.

## Remaining inner-function map (`createMetricGraphView`)

Stateful orchestrator work that was not extracted:

- Metric/series resolution: `resolveMetric`, `getActiveSeries`, `getMetricLabel`
- Snapshot sampling I/O: `getPlotSnapshot`, `buildDynamicSnapshotParts`,
  `refreshPlotSnapshotForecastState`
- Reveal/scrub I/O wrappers: `getVisibleForecastScrubCapSec`,
  `clampScrubSecToRevealCap`, `syncForecastRevealPreview` (`getStateAt` /
  `setPreviewState`), `tryRestoreLatchedForecastPreview`,
  `updateScrubFromPointer` (PIXI `toLocal` + action snap),
  `applyPreviewThrottled`, `endScrub` (commit / policy / draw),
  `restartForecastRevealFrom` (timeline/controller I/O)
- Window chrome / legend wiring: `drawLegend`, `setLegendPage`,
  `updateHeaderButtons`, `drawWindow`, tooltip/hover handlers
- Frame loop: `drawPlot`, `drawScrub`, `render`, `open`, `close`, `destroy`,
  debug/screen rect accessors

Thin adapters in the orchestrator (`timeToX`, `applyActionSnap`,
`getMarkerSeconds`, `refreshLegendStyles`, `drawSeriesLinesForRange`,
`getDisplayHistoryEndSec`, `getVisibleForecastCoverageEndSec`,
`getForecastRevealFollowTargetEndSec`, `getRenderedHistoryEndSec`,
`getAnimatedForecastCoverageEndSec`, `syncForecastRevealTarget`,
`resetForecastReveal`, `pauseForecastReveal`,
`suspendForecastRevealPlayheadFollow`, `setForecastRevealConfig`,
`syncScaleHighWaterTimeline`, `applyRunScaleHighWaterRanges`,
`invalidatePlotSnapshot`, `resolvePlotSnapshotTargetMaxSec`,
`beginBootFadeTransition`, `clearBootFadeTransition`,
`getBootFadeRenderState`, `getProjectionReplacementScaleRanges`,
`clearProjectionReplacementTransition`, `getProjectionReplacementMaxFloorSec`,
`buildProjectionReplacementRenderState`, `getProjectionReplacementRenderKey`,
`stageProjectionReplacementTransition`, `setTimeBounds`,
`clearAnimatedTimeBounds`, `getActionSecs`, `getMarkerActionSecs`,
`triggerSeriesScaleMaxFlash`) only pass explicit arguments through
to the extracted helpers. Snapshot lookup for staging still closes over the
plot cache. `setTimeBounds` still reads PIXI visibility, zoom, scrubbing, and
the projection max floor before calling the extracted lerp/reset.
`triggerSeriesScaleMaxFlash` still invalidates the plot version after a hit.

## Intentionally not extracted

- `getPlotSnapshot` / `refreshPlotSnapshotForecastState` / `buildDynamicSnapshotParts`:
  sampling I/O still closes over the controller, history-zone resolvers, and
  series-value overrides. Cache keys and lead-window math live in
  `plot-snapshot-cache.js`.
- Boot-fade and projection-replacement PIXI overlays: `drawBootFadeOverlay`
  and replacement-zone/line ink stay in the orchestrator/`plot-draw.js`.
  Numbers, flags, and pure updates live in `boot-fade-state.js` /
  `projection-replacement-state.js`.
- Full key-cabinet PIXI construction: pointer handlers close over tooltip and
  hover state; only paging/paint helpers were lifted.
- `endScrub` / `applyPreviewThrottled`: they close over controller restore,
  commit policy, and `drawScrub`.
