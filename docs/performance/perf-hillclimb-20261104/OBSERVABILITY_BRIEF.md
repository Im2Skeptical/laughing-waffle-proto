# Passive timing observability prerequisite

Phase A remains **NOT SOUND**. This is additive measurement instrumentation, not product optimization. All old intrusive discovery timings remain ineligible for scoring. Same model/effort: Codex gpt-6.1-sol / xhigh.

## Evidence and traps

Full snapshot polling consumed material CPU: 195.7ms/1156.9ms over11probes; 17,570.1ms/90,015ms over1564probes. More importantly, read-only Explorer found causal effects:

- Life timing snapshots call presentation/frontier helpers. `lifeDecisionController.getStatus()` calls `sync()`, which can terminate workers and clear drafts.
- Runner `getState()` / `getCursorState()` merge persistent knowledge; frontier access can restore through graph `getStateAt()`.
- Timegraph controller `getData()` synchronizes coverage/cache version. Graph view `getDebugState()` synchronizes replacement data and samples plots.
- `getDisplayHistoryEndSec()` may clear stale reveal overrides; `getForecastStatus()` records lag metrics/resolves loss.
- World-map point helpers call the injected state getter. They are not passive observation primitives.

## Narrow implementation map

Add copied JSON-primitive getters behind `__SETTLEMENT_DEBUG__.getTimingSnapshot()` (version1). No hot-path call sites, caching changes, gameplay, RNG, time, schema, replay or worker-algorithm changes.

| File | Additive responsibility |
| --- | --- |
| src/model/timegraph/controller-core.js | Raw graphCache.window/version/subject and lastAsyncForecast locals, no getData/projection/cache synchronization. |
| src/views/timegraphs-pixi.js | Visibility/bounds/scrub/reveal/cap primitives, using raw controller reader and nonmutating arithmetic. No plot sampling or replacement sync. |
| src/views/world-map-pixi.js | Visibility, selected panel/camera/focus/panel phase from existing pure local readers; never getState or full semantic snapshot. |
| src/views/vassal-life-map-pixi.js | Cached selected candidate/displayed vassal IDs and entry dialog phase. Avoid presentation-driven getCandidateNodeId. |
| src/views/vassal-node-decision-modal-pixi.js | logicalOpen/openNodeId/motion/pending interaction count/cached lastDecision scalars; never getDecisionPresentation. |
| src/controllers/life-decision-controller.js | Raw job/base/request/source revision status without sync. Report correspondence explicitly; do not make stale state look current. |
| src/views/vassal-resolution-recap-pixi.js | Cached open/continue/clock scalars, no getRecap. |
| src/views/ui-root-settlement-pixi.js | Wiring only, compose readers plus local mode/selection/processing state. |
| src/views/ui-root/settlement-debug-api.js | Publish versioned facade, retain full API for explicitly untimed diagnostics. |

No SimRunner change needed initially: `getPreviewStatus()` is pure and exposes primitive times/flags; `getTimeline()` directly exposes timeline for copying revision/counts only. Do not return pointers to those objects. A focused composition helper under ui-root is acceptable if imported by app and supported test.

Suggested shape (derive exact names/types from current implementation; unavailable fields null, never invented values):

```js
{
  version: 1, mode, selectedRegionId, regionSelectionActive,
  runner: { frontierSec, cursorSec, viewedSec, previewActive, forecastPreview, revision, actionCount },
  map: { visible, detailVisible, camera: { x, y, zoom }, focusAnimating, panelPhase, panelAnimating },
  graph: { visible, minSec, maxSec, scrubSec, isScrubbing, revealedSec, targetSec, computedSec, requestedSec, pending },
  life: { selectedCandidateNodeId, entryPhase, decisionOpen, decisionNodeId, decisionPhase, processingPhase, sourceRevision, ready, recapOpen, continueState }
}
```

Input geometry remains a separate limitation: fixed blank drag coordinates may come from MAP_VIEWPORT_RECT; settlement anchors need canonical fixture geometry outside browser or an explicitly untimed calibration. Do not introduce a broad geometry-cache refactor.

## Checks

- Forbidden callbacks (state/cursor/getData/full snapshot/restoration/render/presentation/sync) throw if a new getter calls them.
- Repeated reads preserve state/RNG, timeline revision, worker lifecycle, cache version and raw reveal/scrub state. A deliberately stale Life decision token must stay stale until normal orchestration syncs it.
- Mutating returned objects cannot mutate private state. Return only newly copied primitives/small DTOs.
- Verify primitive parity in settled untimed diagnostics; full snapshots themselves are not a purity oracle.
- Build and run focused actual-browser purity/discovery checks sequentially, retain exact source/build/config identities and concise artifact paths.
- Measure observer overhead with matched runs and independently audit before accepting timing evidence. This implementation alone cannot accept Phase A or claim performance gains.

Root owns HARNESS/PROOF/STATE and all scoring gates. Instrumentation Implementer owns only listed additive source seams plus focused tests and its implementation note; no primary harness/statistics/artwork script edits. No PR/commit/deploy in child.
