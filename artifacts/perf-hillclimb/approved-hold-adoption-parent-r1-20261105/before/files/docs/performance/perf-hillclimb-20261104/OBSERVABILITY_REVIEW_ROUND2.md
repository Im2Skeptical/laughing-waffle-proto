# Independent passive-observability review ? round 2

**PASSIVE OBSERVABILITY ACCEPTED at the exact hashes below. Whole Phase A remains PROOF: NOT SOUND.** No current facade technical blocker was found. Two nonblocking findings follow. This accepts passive observation only; no performance score or complete harness acceptance is issued.

Independent Auditor, Codex gpt-6.1-sol / xhigh, separate from Implementer and root/Harness Builders. Checkout: `perf/hillclimb-20261104`, HEAD `a9df52cbd6255ed95c51c9e7d524cf9ab557472b`, v1.1.52, dirty/unintegrated. Source/scripts/package were read only. No delegation, source repair, branch switch, commit, push, PR, publication or external contact.

## Findings

1. **Low ? validation weakness, nonblocking:** `scripts/timing-observability-test.mjs:42` validates primitives after JSON normalization. NaN becomes null and undefined/function properties disappear first. Thus the guard does not independently prove raw DTO types. `primitive-guard-limitation.{mjs,json,log}` reproduces this with the actual guard: malformed raw output fails but normalized output passes. Shortest reproduction: `node AUDIT/primitive-guard-limitation.mjs`. An audit-only focused-test copy that checks every raw return before normalization passed (`raw-type-supplement.log`); no corresponding current product defect was found. Parent can harden the original test.
2. **Cosmetic ? stale comment:** `src/model/timegraph/controller-core.js:1120` says the projection LRU has no passive membership seam. The optional call at line 1124 and `projection-cache.js:295` now provide it. Behavior is correct; update the comment to distinguish default boundary reads from opt-in projection reads. The child semantic implementation note's earlier ?Remaining anchor gap? is historical and superseded by the projection addendum.

## Scope and source assessment

Read AGENTS/invariants, timegraph guardrails before graph code, their three required current intent/implementation/measurement documents, applicable routes/folder READMEs, game/aesthetic guidance, the supplied observability briefs/implementation notes/addendum, and Round 1. Reviewed actual source and raw child/parent evidence. Prior accepted-v1 and separate child-v2 artifacts remain preserved. Current focused hashes exactly match the parent's projection unit report. The fixed-HEAD diff is retained as `reviewed.diff`, including the single package test invocation; new/untracked source/test bytes are copied under `sources/`.

- **Passivity and invariants:** new calls are composition/export/startup wiring, with no frame/tick/render invocation, synchronization, restore, knowledge merge, LRU touch, asset load/upload or shipped fault/write hook. SimRunner's direct `getTimeline` and scalar-only `getPreviewStatus` (`sim-runner.js:1739`, `:206`) are safe here. Camera/panel, entry, opening and recap dependencies were inspected. Official ticks, every-second summaries/loss, RNG substreams, JSON schemas, authoritative independent mutable replay/preview, reveal pacing/clamps, full opening readiness and five Practice slots remain untouched. Model imports no view.
- **Copied DTOv2 and source lag:** real readers return fresh objects/scalars and copied offer/purchase/board arrays. Mutation controls passed; no timeline/state/Map/job/stats/texture/decision pointer escapes. Cached `observedDecisionNodeId`/`boardRegionId` are not relabelled as the logical open node. No board-specific timeline/Vassal token is retained; consumers cannot infer one. Life raw jobReady stays separate from ready, which additionally requires matching timeline identity, revision and second. Observation leaves deliberately stale jobs/workers intact; normal orchestration still clears them.
- **Opening and terrain:** raw phase/preparation/coverage/elapsed/loss remain distinct, including normal preparation reset to idle after consume. Independent main-map and decision-map stats are forwarded without semantic/state access. Browser evidence observes both false/null initially, false/true prepared-hidden, and true/true revealed. Terrain flags do not certify atlas publication.
- **Projection and anchors:** `projection-cache.js:295` compares the existing signature through the same pure computation as normal orchestration, without ensure/reset. Stale token/anchors survive observation. Actual Map.has membership performs no get/touch/enumeration. Signature covers base/actions references, count, last-action reference/second and official action-content version; checkpoint/revision churn is intentionally ignored. It is not an arbitrary state/content hash. Supplemental tests covered every component and these exceptions. Controller defaults/anchor-only reads invoke neither projection observation nor its raw timeline callback; explicit projection observation reads it once. The graph view separately retains its pure frontier timeline read. Missing reader/source and uninitialized caches preserve null/unknown distinctions. Graph-boundary scope remains distinct from projection-store scope; neither claims authoritative-history/restore-cache membership or browse permission. Cached coverage/cap arithmetic preserves lag without clearing stale reveal overrides.
- **Artwork:** `chronicle-art.js:157` reads the actual packed texture/load/failure/hidden stores used by loadTexture and the real prefix classifier. Loaded means retained frame presence; drawing availability means resolver availability, independently of validity/upload/GPU completion. Retained unhidden frames remain available in minimal mode, matching resolver ordering. All 13 non-resource built-in groups were checked against actual drawing lookup. Defaults skip inventory; explicit inventory scans retained frames and needs separate overhead validation.
- **Geometry:** `timegraphs-pixi.js:2257` uses retained plot dimensions and an existing axis-aligned transform, returning null for absent/rotated/skewed transforms. Its declared stage-retained-transform space can lag rendering and is not CSS screen geometry. Entry points use fresh retained-layout arithmetic (`life-map-entry-confirm-pixi.js:400`) and describe the settled animation target. No bounds/transform/layout update or geometry cache was added.

## Independent evidence and limits

New exclusive artifact directory (`AUDIT` below):
`artifacts/perf-hillclimb/passive-observability-audit-round2-20261104T134104791Z`.

Sequential reproduction, all exit 0:

```powershell
$env:TIMING_OBSERVABILITY_OUTPUT='artifacts/perf-hillclimb/passive-observability-audit-round2-20261104T134104791Z'
node scripts/timing-observability-test.mjs
node scripts/timing-observability-browser-probe.mjs
node AUDIT/additional-projection-controls.mjs
node AUDIT/primitive-guard-limitation.mjs
# Raw-type supplement uses TIMING_OBSERVABILITY_OUTPUT=.../raw-type-supplement
node AUDIT/raw-type-supplement.mjs
git diff --check
```

`unit.json`, `browser.json`, logs, supplemental scripts/results, source/dependency copies/hashes and build metadata retain the raw evidence. Additional projection controls passed 12 checks. The raw-type supplement changes only generated-test import paths and adds checks before serialization. Product/source bytes remain unchanged.

The actual browser passed all 11 stages: menu, opening revealing/completed, Present, candidate, entry, decision, random shop category, staged purchase, artwork prepared-hidden/revealed. Each cycled default, anchor-only, artwork and projection-plus-anchor queries for 1,000 synchronous reads total. All recorded zero legacy calls, unchanged Worker lifecycle, unchanged private artwork inventory/revision and resource-entry counts, and isolated caller mutations; zero page errors. Untimed runner/camera/graph/shop parity passed, including the five-slot board. Regular URL > Performance New used real full-map seed 123, 20 regions, coverage/loss 3918. Anchor 16 was present/current in projection and absent in graph boundaries at all stages. Actual drawing lookup matched inventory for all 13 groups, hidden and revealed.

These controls have bounded meaning. Node view extraction/closure fixtures complement real controllers and browser constructor wiring. Browser poisoning covers public legacy methods, not every closed-over private helper; source review and Node seams matter. Browser diagnostic exports append reads to the real bundled module sharing the app's caches. Exact original/served hashes and append-only text are retained; product/dist bytes were not changed. Temporary test-only Map poisoning is restored in finally. Synchronous read blocks/resource counters do not establish neutral asynchronous frame overhead, GPU idle or physical scanout.

Reused the exact parent-verified production build: served app/worker/style bytes and current focused source hashes match parent evidence. No rebuild or repeat full verify was needed. Parent verify identity/tail is retained in `parent-verify-summary.json`; exit 0 is parent evidence, not a newly executed auditor suite. Built v1.1.52 fingerprint `a40864ef29f0`, app `app-CLB6GCI6.js`, revision `a9df52cbd625`, dirty/unintegrated, preview true/label null, artifact channel pages (unpublished). App original SHA256 `ec7f5c671422ed9c77867886dfcb1671b737b96be39b790f5fcdc1f6acb16798`; diagnostic response SHA256 `8ec663484c16e10e74a4c025099ed3de6798806d47f5a4d7c57d4e9bcd5bc93a`. Runtime: Node 24.15.0, Playwright 1.59.1, Chromium 147.0.7727.15, 1280?800, CPU rate 1, explicit SwiftShader, DESKTOP-R0AMF0N/i9-10900K. No physical Pixel 6 evidence.

All 18 reviewed source/test/package hashes are in `reviewed-source-hashes.json`, SHA256 `c2cb7474cf5e4f36df28032de6783b35be3c049f5eae0bdb290206c15181c15e`, alongside exact source copies; dependency hashes are separate. Key extension identities:

| File | SHA256 |
| --- | --- |
| `src/model/timegraph/controller-core.js` | `f02f3f622284a17da567bd1247bb329021e5f3b5f0b62483560f7a0168610b6b` |
| `src/model/timegraph/projection-cache.js` | `5293d1d30bd5caf194a9941d1a9af0746a73c5230b2aab4e90e672f91bcc97d4` |
| `src/views/timegraphs-pixi.js` | `515acd487d4b42d53cd06ec09b78558a0b543488f5eee2e0184c6fababf124c5` |
| `src/views/ui-root/settlement-timing-snapshot.js` | `cd993134623615d50660d38898914fcedad2c35a7359fda90212dee77cde43c1` |
| `src/views/chronicle-art.js` | `c5e6f91f1424e2f2f20f1bdbca0999af2431dd1e0c32deb0766950d2f41b1b71` |
| `scripts/timing-observability-test.mjs` | `0a57086bed19d043b5334c8292493752491990c62679d5e525724400dd673708` |
| `scripts/projection-timing-observability-test.mjs` | `9234668cb4a086a77961a336aef28c0d3f395ede3b9dd4c4294b885fde1de0b1` |
| `scripts/timing-observability-browser-probe.mjs` | `ae3b9a275906081f519533e510df8340cdaf9b509c1b135cac00bbdd4b20c113` |

This acceptance does not establish complete eight-job populations/negative controls, first-feedback, offered-input/mobile pinch, independent authoritative replay/output correctness, actual-product early-publication fault detection, all target-retention populations, observer overhead, latency tails/uncertainty, three complete suites or the whole Phase A audit. Browser active/stale resolution and recap are not covered by this probe; focused Node controls cover inspected reader behavior. Whole Phase A remains NOT SOUND.

Browser/owned temporary server closed; no audit test/browser process or listener 18263 remains. Pre-existing idle source preview PID 4484 remains. Its pre-report identity in `preview-build-info.json` was v1.1.52 ? Preview 5184, fingerprint `63d44fa74159`, branch `perf/hillclimb-20261104`, revision `a9df52cbd625`, dirty/unintegrated. Live mobile URLs: http://192.168.1.103:5184/ and http://100.105.63.49:5184/. Documentation changes can change that fingerprint; final handoff metadata is recorded separately in this audit directory. Source/dependency hashes were rechecked unchanged. Only this report and the new audit directory were written. CPU/build/browser slot released.
