# Passive semantic instrumentation v2 handoff

Phase A remains **NOT SOUND**. This is uncommitted instrumentation, not
acceptance, optimization, scoring or observer-overhead proof. Parent owns full
verification, harness integration and independent v2 audit. Accepted v1 source,
OBSERVABILITY_REVIEW_ROUND1.md and the frozen evidence at
`artifacts/perf-hillclimb/passive-observability-accepted-v1-20261104T232005426/`
were preserved.

Checkout: `C:/Users/User/.t3/worktrees/laughing-waffle-proto/perf-hillclimb-20261104`,
branch `perf/hillclimb-20261104`, HEAD
`a9df52cbd6255ed95c51c9e7d524cf9ab557472b`. Other root/Builder edits were
preserved. No agents, commits, branch switches, pushes, PRs, deployments or
external contacts were initiated.

Impact: additive runtime readers/wiring only. Simulation state, RNG substreams,
JSON state/save schemas, authoritative independent replay/preview, every official
tick, worker algorithms/lifecycle, cache policy, reveal pacing/clamps, full
opening readiness and five Practice slots are unchanged. No reader was added to
a render/frame/tick path. Model imports no views. The optional artwork inventory
reads existing stores without drawing, loading, upload or revision changes.

## Exact DTO contract

`__SETTLEMENT_DEBUG__.getTimingSnapshot(options = {})` returns **version 2**.
All v1 fields retain their meanings. `?` below means omitted unless requested.
Unavailable facts are null; known empty cached lists are []. Objects/lists are
detached, IDs/phases/tokens strings or null, flags booleans or null, and numeric
values finite or null (existing async -1 sentinels remain).

| Path | Fields |
| --- | --- |
| top level | version, mode, selectedRegionId, regionSelectionActive, opening, runner, map, graph, life, artwork? |
| opening | phase, preparation, coverageSec, elapsedSec, lossSec |
| runner | frontierSec, cursorSec, viewedSec, previewActive, forecastPreview, revision, actionCount, checkpointCount |
| map | visible, detailVisible, camera:{x,y,zoom}, focusAnimating, panelPhase, panelAnimating, artReady, artPrepared |
| graph | visible, minSec, maxSec, plotRect, plotRectSpace, scrubSec, isScrubbing, latchedForecastScrubSec, historyEndSec, revealedSec, browseCapSec, targetSec, computedSec, requestedSec, pending, cacheVersion, subjectKey, asyncToken, asyncPollMs, asyncHistoryEndSec, asyncRequestedSec, asyncComputedSec, revealHistoryEndSec, animatedSec, visibleEndSec, startSecOverride, readinessCapSec, capEndSec, paused, presentationSuspended, openingRevealSec, requestedAnchorSec?, hasRetainedAnchor?, retainedAnchorSource?, retainedAnchorScope? |
| life | visible, selectedCandidateNodeId, displayedVassalId, entryConfirmationOpen, entryOpen, entryVisible, entryPhase, entryPoint, decisionOpen, decisionNodeId, observedDecisionNodeId, decisionPhase, pendingInteractionCount, family, selectedOptionId, resolving, shopTag, offerIds, purchaseOrder, boardPracticeIds, boardRegionId, decisionArtReady, decisionArtPrepared, processingPhase, sourceRevision, ready, processing, recapOpen, continueState, recapClock, recapClockStartedAt |
| life.processing | sourceRevision, sourceSec, baseRevision, baseSec, timelineMatches, sourceMatches, requestId, revision, adopting, workerActive, draftActive, draftActionCount, jobActive, phase, error, accepted, jobReady, ready, targetSec, computedSec, revealSec |
| life.recapClock | second, progress, locked (or entire clock null) |
| artwork (includeArtwork:true only) | version:1, revision, minimalGraphics, groups:[group] |
| artwork.groups[] | id, prefix, loadRequested, failed, loaded, textureCount, validTextureCount, hidden, drawingAvailable, drawingAvailableCount, sampleFile, sampleDrawingAvailable |

Opening uses the pure `opening.getSnapshot()` directly. Phase, preparation,
computed coverage, reveal elapsed and loss stay distinct. The seed 123 completed
witness has phase completed, elapsed 5, coverage/loss 3918 and preparation idle:
normal consume/cancel resets preparation. No synthetic ready flag is derived.

Shop arrays copy cached `lastDecision.offers`, purchases and settlement practices.
`observedDecisionNodeId` is its cached node ID, independent of logical
`decisionNodeId`/openNodeId; `boardRegionId` is cached `previewRegionId`.
Stale data is not relabelled current. `displayedVassalId` remains the Life Map's
independently cached identity. No board-specific Vassal/timeline token is already
cached: consumers must correlate identities and processing source-match flags.
Missing decisions, boards or offer lists stay null. Returned arrays cannot edit
drafts/boards.

Main-map art flags copy `illustrated.stats.ready/prepared`. The decision modal
forwards its independent embedded map's raw timing reader through world-screen,
never its state/presentation-driven semantic snapshot. Undefined prepared stays
null, including before progressive preparation and nonprogressive paths that
never retain it. Terrain readiness does not certify atlas publication.

`{anchorSec: nonnegativeInteger}` adds exact Map.has membership of the graph
controller's actual `stateDataByBoundary`. Scope is `graph-boundary-store`;
source is `graph-forecast-boundary` or `graph-history-boundary` according to the
cache's retained frontier. No store gives null membership/source; a store
without that key gives false. Invalid/omitted queries omit all four properties.
Defaults never enumerate anchors or query projection caches. This observes
storage, not fresh timeline correspondence or permission to browse unrevealed
time.

**Remaining anchor gap:** prepared forecast anchors also live in a private shared
projection LRU outside the owned files. It has no allowed direct passive
membership seam: getStateData warms LRU, nearest/debug APIs enumerate, and
signature APIs mutate. None is used. False here proves absence only in the
named graph store, not in that LRU or every authoritative checkpoint. Parent
must not use this scope as a whole-projection anchor oracle. J3 prepared-anchor
coverage still needs a separately owned passive seam or scoped contract.
Browser anchor 16 was known absent in this graph store; real retained positive
and negative cases have Node coverage after normal untimed materialization.

Artwork metadata uses the actual private packedTextures, packedLoads,
failedGroups and hiddenGroups used by loadTexture. It includes every built-in
nonresource group and registered presentation groups. Loaded means at least one
retained frame, not group-promise completion. Drawing availability means the
resolver can return at least one retained frame, separate from validity/upload.
sampleFile is one retained representative, or null; sample availability is null
when no representative exists. Actual packedGroupFor classification preserves
overlapping-prefix precedence. Retained frames are available when unhidden even
in minimal mode: loadTexture checks packed storage before minimalGraphics.
Unknown missing representatives are never promoted to readiness. No
promise-state/GPU-idle assertion is made. Optional inventory scans frames;
defaults do not invoke it.

graph.plotRect is {x,y,width,height}, computed only from existing plot geometry
and the renderer's retained world transform, in `stage-retained-transform`
coordinates. Ordinary renderer lag is preserved; absent/rotated/skewed matrices
give null. This does not update transforms, bounds, DOM layout or plot caches,
and is not CSS/screen geometry. life.entryPoint is {x,y} from the entry dialog's
existing pure retained-layout arithmetic while confirmation is open. The other
Enter dock needs intrusive bounds, so gives null. No geometry cache was added.

## Validation and evidence

Unique primary evidence:
`artifacts/perf-hillclimb/passive-observability-v2-20261105-semantic-01/`.
It contains unit.json, browser.json, browser-read-exports.txt, exact source
copies under sources/, validation logs and preview identity. Earlier focused
pass: `artifacts/perf-hillclimb/passive-observability-v2-2026-11-04T125901150Z/`.
An earlier focused attempt found no graph boundary after summary-only plotting;
the fixture now materializes one through the normal untimed accessor instead of
fabricating retained storage.

Sequential commands, all exit 0:

```powershell
$env:TIMING_OBSERVABILITY_OUTPUT='artifacts/perf-hillclimb/passive-observability-v2-20261105-semantic-01'
node scripts/timing-observability-test.mjs
npm run test:presentation
npm run check:architecture
npm run check:source
npm run check:docs
npm run build
node scripts/timing-observability-browser-probe.mjs
npm start
```

Node checks execute actual getter bodies with poisoned state/presentation/sync/
render/restore/projection callbacks; real graph and Life controllers run with
view closure fixtures. 500 reads/case test mutation isolation, state/RNG/timeline
invariance, active/stale jobs, replacement timeline identity, missing caches and
decisions, independent terrain, raw opening and option forwarding, and real
anchor membership without enumeration. Default composition poisons artwork
access. The actual artwork module body/resolver is evaluated with private-store
fixtures, including loaded-visible and loaded-hidden frames in minimal mode.
No duplicate drawing oracle or shipped write/fault API is introduced.

Browser: regular URL > Developer tools > Performance New, actual full-map
seed 123, 20 regions, loss/coverage 3918, desktop 1280x800, CPU rate 1, Chromium
147.0.7727.15/SwiftShader. Eleven stages cover menu, opening revealing/completed,
Present, candidate, entry dialog, decision, random category, first staged
purchase, prepared-hidden terrain and revealed terrain. Each stage cycles
default/anchor 16/artwork queries for 1000 synchronous reads total, corrupts DTOs,
poisons legacy debug methods, and checks identical primitives, private artwork
stores/revision, resource-entry count and Worker start/post/termination counts.
Both independent terrains are observed false/null initially, false/true when
prepared-hidden, and true/true after reveal. Zero page errors. Untimed full
snapshot parity/calibration and drawing lookups stay outside purity reads.
Shop offers/purchases and five-slot board match actual presentation diagnostics.

The browser intercepts the built app only to append test-only read exports for
its existing drawing resolver and private-store fingerprint. These share the
actual app caches. Product source/dist bytes are not modified. Original/served
SHA256 and exact append-only text are in browser.json/browser-read-exports.txt.
This diagnostic read-export addition does not establish uninstrumented observer
overhead. Hidden/visible drawing lookups agree with metadata for all 13 built-in
nonresource groups. Lookups outside purity may invoke normal draw behavior.

Full npm verify, matched observer overhead, all eight jobs' functional/replay
controls, the actual-product early-publication negative control, whole-projection
anchor coverage, physical Pixel6 behavior and GPU idle/scanout remain parent
responsibilities. No legacy authored fixture is counted as required-job
coverage. No independent v2 acceptance is claimed.

## Source and build identity

Exact SHA256 bytes for every owned source/test file are in unit.json and
browser.json; exact source copies are under sources/. The table below duplicates
those hashes for review. It includes unchanged v1-owned reader files.

| File | SHA256 |
| --- | --- |
| `src/views/world-map-pixi.js` | `dab0eb94d73c4d8091cf196228a0d5a615b6f611b104078c6ae77388129ce3c5` |
| `src/views/vassal-life-map-pixi.js` | `cdb8021c4e46455f5741b15dd90535ff79d481b37f84e3f8b786e7474d7ea6ed` |
| `src/views/vassal-node-decision-modal-pixi.js` | `abe59eee5de1845c3ae6ddcc654235b6544945f84b408803455f00f43b3520a3` |
| `src/views/vassal-resolution-recap-pixi.js` | `d39fa9dd7c1769b347094c2ed1d9dfd111f737d37a5049081bd9f0d382493e09` |
| `src/views/timegraphs-pixi.js` | `24f06480ceaca1d8641188b506e703694c4f75dda7c0d003a3440dff8276501d` |
| `src/model/timegraph/controller-core.js` | `900ac4d8fac37613acd4394ecf3dcb3b25fff83db15d1ed58d4d618be82577fd` |
| `src/controllers/life-decision-controller.js` | `b394ee2176e8b461aefceb1a724ac154d7c2b197d64817b8de2f35bf3c03572e` |
| `src/views/ui-root/settlement-timing-snapshot.js` | `cd993134623615d50660d38898914fcedad2c35a7359fda90212dee77cde43c1` |
| `src/views/ui-root/settlement-debug-api.js` | `b43915ef64f37a4dc63db9eeb3b762fe7e7caf93a7c6516bd3e770795551ce9f` |
| `src/views/ui-root-settlement-pixi.js` | `7bf1efd13d27cffec055ac94c44ca9968c673174f31e213662c1a181d3a82ed8` |
| `src/views/chronicle-art.js` | `c5e6f91f1424e2f2f20f1bdbca0999af2431dd1e0c32deb0766950d2f41b1b71` |
| `src/views/vassal-node-decision/world-screen.js` | `1311988076eae98626801abeb3e5edd94d8ba71d7df94169feb43d1482f7fc78` |
| `scripts/timing-observability-browser-probe.mjs` | `3be1b9b6d530b8b8992f24e8dd7e2ca11c10eb38f800b0355ca0160415b53f3e` |
| `scripts/timing-observability-test.mjs` | `2286859b3aed692d97f97c2a105b91124cb8e60ee807a25784a5a81a49f00d24` |

Production artifact validated before diagnostic read-export interception:
v1.1.52, fingerprint `b2eb5700e3d3`, revision `a9df52cbd625`, branch
`perf/hillclimb-20261104`, dirty/unintegrated, preview true, preview label null,
channel pages (local build metadata; no publication). App
`assets/app-IYYBLZ2O.js`; original served app/worker/style hashes, machine,
Node/Playwright/runtime and flags are in browser.json.

npm start reused http://localhost:5184/ for this checkout. Mobile URLs:
http://192.168.1.103:5184/ and http://100.105.63.49:5184/. preview-final.json
records final version/label/fingerprint/branch/status, including this note.
Source serving is verified byte-for-byte. Documentation affects preview identity
without changing the tested production JavaScript. Idle preview remains;
the owned browser and temporary dist server were closed.

No package.json edit was needed; root's existing presentation chain was
preserved. Only owned additive source, the two focused scripts and this note
were edited in this pass. Final source/docs/diff checks are logged with evidence.
