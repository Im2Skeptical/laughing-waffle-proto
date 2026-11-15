# Passive timing instrumentation implementation

Bounded instrumentation handoff, 2026-11-04. **Phase A remains NOT SOUND.**
No product optimization, scored timing, tail estimate, or observer-overhead
acceptance is claimed. Parent retains the ongoing goal, full verification,
preview, integration, matched observer controls and independent audit.

Checkout verified before edits:
`C:/Users/User/.t3/worktrees/laughing-waffle-proto/perf-hillclimb-20261104`,
branch `perf/hillclimb-20261104`, HEAD
`a9df52cbd6255ed95c51c9e7d524cf9ab557472b`.
Instrumentation is uncommitted on that HEAD. Other Builders' untracked
`scripts/perf-hillclimb/**` files were preserved. No commit, push, PR, Pages,
other checkout, bot or webhook action.

Impact: additive runtime debug reads only. Simulation state, RNG, schemas,
JSON serialization, authoritative replay, worker orchestration, cache algorithms,
60 official ticks/second, reveal pacing/clamps and five Practice slots are
unchanged. No new getter calls were added to a frame/tick/render path. Model
imports no view code; views read their existing presentation closures.

## API and exact fields

`__SETTLEMENT_DEBUG__.getTimingSnapshot()` returns a fresh small JSON DTO with
`version: 1`. It uses only raw getters plus SimRunner's existing pure
`getPreviewStatus()` and direct `getTimeline()` reference for primitive copies.
Private timeline, state, job, layout, cache, origin and clock objects are never
returned. Optional/unavailable values are `null`; no extra readiness or counters
are inferred. Booleans are cached flags, IDs/phases/tokens are strings or null,
and seconds/revisions/counts are numbers or null.

| Path | Fields |
| --- | --- |
| top level | `version`, `mode`, `selectedRegionId`, `regionSelectionActive`, `runner`, `map`, `graph`, `life` |
| `runner` | `frontierSec`, `cursorSec`, `viewedSec`, `previewActive`, `forecastPreview`, `revision`, `actionCount`, `checkpointCount` |
| `map` | `visible`, `detailVisible`, `camera: { x, y, zoom }`, `focusAnimating`, `panelPhase`, `panelAnimating` |
| `graph` | `visible`, `minSec`, `maxSec`, `scrubSec`, `isScrubbing`, `latchedForecastScrubSec`, `historyEndSec`, `revealedSec`, `browseCapSec`, `targetSec`, `computedSec`, `requestedSec`, `pending`, `cacheVersion`, `subjectKey`, `asyncToken`, `asyncPollMs`, `asyncHistoryEndSec`, `asyncRequestedSec`, `asyncComputedSec`, `revealHistoryEndSec`, `animatedSec`, `visibleEndSec`, `startSecOverride`, `readinessCapSec`, `capEndSec`, `paused`, `presentationSuspended`, `openingRevealSec` |
| `life` | `visible`, `selectedCandidateNodeId`, `displayedVassalId`, `entryConfirmationOpen`, `entryOpen`, `entryVisible`, `entryPhase`, `decisionOpen`, `decisionNodeId`, `decisionPhase`, `pendingInteractionCount`, `family`, `selectedOptionId`, `resolving`, `processingPhase`, `sourceRevision`, `ready`, `processing`, `recapOpen`, `continueState`, `recapClock`, `recapClockStartedAt` |
| `life.processing` | `sourceRevision`, `sourceSec`, `baseRevision`, `baseSec`, `timelineMatches`, `sourceMatches`, `requestId`, `revision`, `adopting`, `workerActive`, `draftActive`, `draftActionCount`, `jobActive`, `phase`, `error`, `accepted`, `jobReady`, `ready`, `targetSec`, `computedSec`, `revealSec` |
| `life.recapClock` | `second`, `progress`, `locked` (or the whole field is null) |

Raw graph-controller `getTimingSnapshot()` exposes `cacheVersion`, `subjectKey`,
`historyEndSec`, `computedSec`, `requestedSec`, `pending`, `asyncToken`,
`asyncPollMs`, `asyncHistoryEndSec`, `asyncRequestedSec`, `asyncComputedSec`.
It reads `graphCache.window` and async-request locals without synchronizing the
projection cache. Async seconds retain the existing uninitialized `-1` sentinel;
the uninitialized nonfinite poll timestamp is represented by null.

`runner.cursorSec` means the runner's live cursor (`liveSec`), while `viewedSec`
uses preview time when a drag/forecast preview is active. `graph.targetSec` is
the raw reveal target, not a newly computed forecast completion promise.
`revealedSec`/`browseCapSec` use the normal pure cap arithmetic over raw frontier,
computed coverage and visible reveal history. A stale start override cannot
change the frontier result and is left untouched. Missing cache coverage gives
null, not synthetic completed coverage. These cached values can lag ordinary
orchestration; they do not force freshness or certify authoritative correctness.

Life `jobReady` preserves the raw job flag; `ready` additionally requires the
base timeline identity, revision and second to match the current timeline.
No job gives null readiness. A stale ready job gives `jobReady: true`,
`sourceMatches: false`, `ready: false`, without terminating a worker, discarding
a draft, clearing a presentation or changing a request. Raw phase/accepted/error
remain available alongside correspondence; consumers must check `sourceMatches`
before treating a job as current. `revision` inside processing is the existing
Life presentation revision, distinct from source/base timeline revisions.

## Forbidden-call proof and remaining limits

`scripts/timing-observability-test.mjs` runs 500 repeated reads per case, with
state/cursor, full snapshot, getData, projection/restoration, render,
presentation, candidate, recap and synchronizing callbacks poisoned to throw.
It executes the actual view getter bodies in explicit closure fixtures (no
duplicate implementation and no fake renderer). It imports and exercises real
graph controllers with absent and populated caches, actual SimRunner primitives,
actual Life controller worker/draft orchestration, and the published facade.
Checks cover caller mutation isolation, state/RNG/timeline preservation,
cache/reveal/scrub invariance, active and deliberately stale active/ready jobs,
and a replacement timeline with the same revision. Normal `getStatus()` still
clears stale state. A settled full graph read is used only for untimed parity,
never as the purity oracle. Zero forbidden callbacks executed in passing runs.

`scripts/timing-observability-browser-probe.mjs` exercises the real built app and
constructors in six stages: menu, boot map, present map, selected Life candidate,
entry dialog and open decision. Each stage performs 1,000 reads and corrupts
returned DTOs, poisons all legacy public debug methods and checks unchanged raw
primitives and worker start/post/termination counts within one synchronous turn.
It does not freeze the ticker, worker or renderer. Cross-task async advancement
is intentionally outside that invariant. Settled full/primitive parity is a
separate untimed diagnostic. Four failed discovery attempts are retained:
early geometry calibration and the need for separate move/down/up dispatches.
The final probe waits for cached displayed-vassal data, then uses the existing
Life probe's input sequence. This is a harness binding repair.

Browser config: 1280x800, CPU rate 1, Chromium 147.0.7727.15,
`--use-gl=angle --use-angle=swiftshader`, authored boot fixture, `art=0`,
worker lifecycle wrapper enabled. No physical Pixel6 evidence. This is not an
ordinary/prepared startup benchmark and does not accept workload coverage.

Geometry is intentionally absent. Fixed blank drag coordinates may come from
`MAP_VIEWPORT_RECT`; settlement anchors require canonical fixture geometry or
untimed calibration. No broad geometry cache was added. Worker throughput,
render/paint completion, authoritative state/replay parity for critical jobs,
recap gameplay correctness and matched observer overhead remain parent harness
responsibilities. Recap raw copying has Node closure coverage; the browser run
does not resolve a node through recap. Timing-only reads cannot replace untimed
functional oracles. Existing full and legacy named timing APIs remain intrusive
and must stay outside timed predicates.

## Validation and evidence

Commands (sequential; no overlapping test/build/browser jobs):

```powershell
node scripts/timing-observability-test.mjs
npm run test:presentation
npm run check:architecture
npm run check:source
npm run check:docs
npm run build
node scripts/timing-observability-browser-probe.mjs
git diff --check
```

Focused checks, presentation chain, architecture/source/docs and build outcomes
are recorded in `artifacts/perf-hillclimb/passive-observability/`.
All listed commands passed (exit 0); the full presentation chain includes the
new focused test. Full `npm run verify` was not run by this child. Final tested
build: v1.1.52, fingerprint `b50bf80c7a54`, revision `a9df52cbd625`,
`preview: true`, preview label null, branch `perf/hillclimb-20261104`, dirty and
unintegrated. Built app `app-OF3QB4I7.js`; forecast worker
`timegraph-forecast-worker-YOB3XRD7.js`. `channel: pages` is the existing local
build tool's metadata label; no publication occurred. The temporary browser
server served those exact asset bytes and was closed after validation.
`unit.json` records exact source hashes, HEAD, branch and Node identity.
`browser.json` records the probe/source hashes, exact built/served asset hashes,
build metadata, runtime/machine/renderer/config identities and compact witnesses.
The browser closes its process and owned temporary server. Parent owns final
full `npm run verify`, `npm start`, preview identity and independent review.

Changed files: the nine owned source files in OBSERVABILITY_BRIEF, one imported
helper `src/views/ui-root/settlement-timing-snapshot.js`, the two new focused
scripts, this note, and only the focused `test:presentation` invocation in
`package.json`. No versions, dependencies, lockfiles, existing performance
harness scripts, statistics, artwork controls or parent status/proof/audit
documents changed.
