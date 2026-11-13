# Runtime modernization proposal

**Superseded recommendation:** Cam clarified that the successor should be
assessed as a clean rebuild, with no preference for retaining the implementation
or Pixi renderer. The current recommendation and prototype scope are in
[native runtime workspace](../../native/README.md). The preservation-first
sequencing below is retained as an earlier proposal, not the current plan.

Draft for discussion, 13 November 2026. Targets: **Windows and Android first**, with
the existing Pixel 6 device floor. This is a research and migration proposal;
none of the proposed architecture or performance targets below is implemented
or an accepted gameplay change.

## Recommendation

Develop a parallel successor in small, testable slices, while keeping the current
game playable. Establish one authoritative rules/content core and build it into
fast development, representative performance, and installed release profiles.
Decide the simulation implementation from measured end-to-end results, and the
application shell from installation, lifecycle and asset requirements. These are
separate decisions.

The first candidate should reuse the current rules, tests and Pixi presentation
with a cleaner build and headless timeline interface. Test a compiled simulation
candidate only after identifying the remaining CPU and copying costs. Keep a
full Godot/Unity rebuild available if the complete interaction demonstrates a
material advantage that justifies replacing the presentation and tooling too.
A new engine is a credible option, but its name alone does not establish the
speed of this particular forecast/replay workload.

The accompanying [platform research](runtime-platform-options.md) evaluates the
external technology choices and links their official documentation. The
repository evidence and proposed decision gates are recorded here.

## What the current project tells us

- The LAN preview deliberately sends `Cache-Control: no-store` on **all** responses
  in [local-preview.mjs](../../scripts/local-preview.mjs). The reload experience
  therefore includes repeat asset transfers by design. This is evidence about
  the development server, not a measured explanation of every delay on Cam's
  phone. HTTP `no-store` prevents normal response caching; versioned asset URLs
  allow a different production policy. See [MDN's cache-control reference](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cache-Control).
- The [HTML entry](../../index.html) still loads Pixi 7.2.4 from a CDN. The
  [production builder](../../scripts/build-pages.mjs) already bundles application
  JavaScript and workers with esbuild and hashes their filenames, but retains
  that HTML dependency. Offline packaging must include Pixi, fonts, workers and
  every required asset; wrapping the current HTML is insufficient.
- [Minimal graphics](../../src/views/minimal-graphics.js),
  [progressive artwork](../../src/views/progressive-artwork.js), and a
  [prepared development forecast](../../scripts/performance-fixture.mjs) already
  exist. Build on these capabilities. The prepared forecast is a useful iteration
  shortcut and must be excluded from real opening-forecast timing.
- The [forecast worker service](../../src/controllers/timegraph-forecast-worker-service.js)
  already uses a persistent worker, generation-specific configuration and
  streamed chunks. [State restoration](../../src/model/timegraph/state-restorer.js)
  already uses bounded validated caches and independent mutable restores.
  [Projection snapshots](../../src/model/projection-chunk.js) already share frozen
  configuration. Moving simulation to a worker or sharing that config is not
  new work to propose.
- Existing full-map integration tests documented costly startup, restores and
  substantial heap use, under concurrent workstation load. Those are
  [dated diagnostics](../full-map-main-integration.md#verification), not a current
  benchmark. September/October smaller-fixture results must not be extrapolated
  to today's full-map game. We have not measured the current checkout on a
  physical Pixel 6 in this planning task.

Installation can remove repeat network transfer. It cannot eliminate image
decoding, GPU texture upload, terrain preparation, state restoration or
simulation. Diagnose those costs independently. Full artwork on disk also does
not mean keeping every full-resolution texture resident in memory.

## The proposed structure

Start with logical modules and explicit dependencies; create workspace packages
only where they improve independent builds and ownership. Folder churn alone
does not make the runtime faster.

1. **Rules and content module.** The authoritative simulation, seeded RNG streams,
   declarative gamepiece definitions, captured configuration, actions and replay.
   It runs without a renderer, DOM or application shell. Keep the existing
   DSL-first authoring model so content iteration remains straightforward.
2. **Timeline module.** Owns projection generations, anchors, replay/restore,
   summaries, cancellation and inspection. Its interface lets callers open a
   session, submit an action, request projection, inspect a second, and export a
   save. Callers do not assemble caches or deserialize arbitrary anchors.
   The current JS implementation is the reference adapter; a second implementation
   makes this a real replacement seam when justified by experiments.
3. **Presentation module.** Map, timeline, cards and input. Begin with Pixi to
   preserve the existing visual work. It consumes time-stamped results and emits
   commands. Measure graph redraw, overlays and texture activity separately from
   timeline requests. Updating a label or dragging a marker must not implicitly
   recompute a projection.
4. **Platform module.** Installation resources, application storage, lifecycle,
   file export and input/platform integration. Windows and Android adapters share
   core rules and content, with platform-specific packaging and storage tests.
5. **Asset build module.** Converts source paintings and fonts into a validated
   runtime manifest and packs. Editors, source masters and experimental art are
   excluded unless explicitly needed by a development tool.

These are proposed responsibilities, not permission for a combined rewrite of
the graph, worker, restorer and serializer. Each extraction remains a bounded
change under the [timegraph guardrails](../timegraph-optimisation-guardrails.md).

## Build profiles and formats

**Development:** fast reloads, readable traces, content editors and selectable
minimal graphics. A prepared fixed-seed start remains available and clearly
labelled. Game rules stay identical to release rules.

**Performance:** the same optimized compilation, target runtime and worker path
as release, with optional low-overhead instrumentation. Provide both minimal-art
and full-art runs. Separate instrumented attribution from clean timing runs.
Always measure an ordinary uncached New Game as well as prepared-start interaction.

**Release:** installable Windows package and Android APK for direct testing;
store distribution can follow if wanted. Include the full supported art package
locally, load assets on demand and exclude development editors. Application code,
content revision, simulation implementation and asset-pack revision are recorded
in build identity. An Android App Bundle is a store artifact, not the APK Cam
installs directly.

Use TypeScript for new interfaces and tooling if the web candidate proceeds;
incrementally check existing JavaScript rather than mix a whole-language port
with the first performance experiment. TypeScript improves contracts, not
simulation speed by itself. Vite is a candidate for development/build workflow;
the existing esbuild output remains a valid baseline and should be replaced only
for a demonstrated workflow benefit. Pin toolchain versions and lock dependencies.

Keep authored content as data in the existing DSL. Preserve JSON-compatible
GameState and JSON save envelopes. Runtime-only indexes or packed buffers may
be experimental implementation details outside GameState; they require an exact
JSON round-trip and isolated preview ownership. Do not introduce an ECS, binary
save format or database merely because a new engine supports one.

Asset manifests should contain stable logical IDs, content hashes, dimensions,
runtime paths and pack membership. Produce phone-appropriate and desktop texture
variants from the same masters; test readability at actual display size. Use
existing WebP/PNG support first. GPU-compressed texture formats, atlases and
precomputed terrain are candidates only when their measured decode/upload/memory
benefits justify their additional toolchain. Full installation and texture
residency are independent policies.

Bundle mandatory resources in installed releases. Add optional downloadable packs
only if package size warrants it. Pin compatible code/content/art versions and
activate a completed update together at a safe restart. Keep a known-good set if
an update is interrupted. A PWA can provide cached browser testing, but its
storage and secure-context requirements differ from the current LAN HTTP preview;
it is not equivalent to guaranteed installed resources. See [browser storage
persistence](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria).

## Measure before selecting the simulation runtime

Build a reproducible benchmark record from the **current full-map ruleset**.
Record revision/fingerprint, seed/config/action log, device and OS/runtime,
build profile, art profile, thermal conditions and cache state. Compare candidates
using the same fixture and identical output requirements. Use warmups and repeated
runs; keep raw traces under ignored artifacts and a concise result in research.

Include ordinary opening-to-loss, a controlled long-lived fixture, busy
cross-settlement supply/reaction chains, and a multi-tenure action transcript.
Distinguish simulation seconds from in-game years using the captured game
configuration. Increase horizon and civilization workload independently to
establish a useful capacity envelope, rather than only timing one small opening.

Collect:

- Cold launch, warm launch and offline relaunch: transferred bytes, script startup,
  asset decode, texture upload, terrain preparation and actual forecast completion.
- Forecast: official ticks, simulation time, summary production, serialization,
  wire copying, receiver merge, anchors retained and loss detection. Distinguish
  computing coverage from the aesthetic reveal animation.
- Scrub: pointer input to marker movement and to **correct inspected world**,
  restore/clone/replay time and final render. Cover sequential drag, random
  off-anchor jumps, revisits, previous-future inspection and simultaneous unveil.
- Action commit: invalidation, cancellation delay, replacement forecast and stale
  result rejection. Report tail latencies, not only average throughput.
- Memory: JS heap, native/process use and texture estimates separately, plus peaks
  during projection replacement. Check repeated cycles for growth and Android
  background/resume/context-loss behavior. Heap size alone is not total memory.

Run clean Windows production builds, Chrome Android and the installed Android
candidate on the real phone. Desktop CPU throttling remains a diagnostic aid,
not an Android result. GPU browser probes and Node compute tests answer different
questions and must retain that distinction.

Proposed acceptance gates, to calibrate against the first physical-phone run:

- Preserve the existing probe gate: no steady frame above 50 ms and restore plus
  render p95 at or below 33 ms, in a defined steady interaction window. Aim for
  60 Hz feedback and measure end-to-end inspection separately. Do not discard
  startup hitches from launch reporting just because steady gates exclude them.
- Offline installed launch can enter and play an ordinary new game with the
  network disabled; there are no runtime CDN dependencies. Warm relaunch does
  not fetch unchanged required art.
- Memory stays bounded through a scripted repeated forecast/scrub/replace cycle;
  establish the absolute phone budget from real process/texture measurements.
- A compiled candidate must meet a currently unmet interaction budget or deliver
  a substantial repeatable end-to-end gain over the best bounded JS candidate.
  A proposed investment threshold is roughly twice as fast on the selected
  critical workload without unacceptable memory or iteration cost. This is a
  decision criterion, not a predicted speedup.

The existing ambition of about 1000 years in a second remains a directional
goal, not a promised result. Smooth scrubbing outranks unveil speed and horizon.
Gameplay tuning can then use a measured supported envelope; do not reduce
mechanics to accommodate an uncharacterized slowdown.

## Technology experiments and decision gates

**First experiment: packaged existing core.** Produce a full-art offline Android
build and Windows build using unchanged mechanics and presentation. Compare
Tauri across both targets against Tauri on Windows plus Capacitor on Android
for toolchain and lifecycle complexity. Do not maintain both shell combinations
after the experiment. A PWA is useful as a browser control. The platform research
contains the supported capabilities; selection remains provisional until a
release build loads its workers, resumes correctly and passes offline tests.

**Second experiment: complete timeline slice.** Characterize and isolate the
current headless JS path. Investigate dominant costs without re-proposing the
already implemented caches. If worker transport dominates, compare bounded
transfer buffers with full state ownership maintained. ArrayBuffer transfer can
avoid copying that buffer, but conversion and restoration still cost time; see
[MDN transferable objects](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Transferable_objects).
Do not simply remove full anchors or every-second summaries.

If simulation CPU dominates, implement a representative Rust candidate behind
the same timeline interface, compiled to WASM for the worker. Keep crossing the
JS/WASM interface coarse: project a batch and inspect a state, not one call per
tick, resource or card. A native Rust host is a separate adapter worth testing
only if WASM/runtime constraints still matter; keep shell IPC out of per-frame
inner loops. Neither Rust nor WASM guarantees a speedup for object-heavy rules.

Before implementing that candidate, decide the authoring plan: a second manually
maintained ruleset must not become permanent. Keep card behavior in shared DSL
data and port generalized operations; centralize gameplay changes once a
candidate becomes authoritative. Differential fixtures are the temporary bridge.

**Full-engine alternative.** If presentation scheduling, memory handling or asset
production remains the limiting factor, test one Godot or Unity implementation
of the same complete slice with release exports on both devices. Include its
content authoring, graph/touch inspection and tool maintenance cost. A headless
deterministic rules module remains necessary inside that engine; engine physics
and the render frame clock cannot take over authoritative game time. Choose one
engine for this experiment after the platform review, rather than fund two full
rewrites concurrently.

## Parallel migration and cutover

1. Capture the current contract corpus and physical-phone baseline. Deliver a
   reproducible report and bottleneck attribution. No gameplay changes.
2. Build one offline package and the three profiles around the existing core.
   Deliver installable Windows/Android artifacts and cold/warm/offline results.
3. Extract the timeline seam in bounded changes. Deliver replay parity and a
   complete interactive slice using the existing implementation.
4. Run the smallest justified replacement experiment. Deliver comparative
   correctness, frame latency, memory, throughput and iteration evidence. Stop
   here if it does not justify a larger migration.
5. Expand the winning candidate to ordinary New Game, all supported content,
   action/inspection flows, multi-tenure endings, saves and development editors.
   Keep existing play available until these gates pass and Cam has playtested it.
6. Switch the default build after parity, target-device performance and offline
   lifecycle acceptance. Preserve a reference tag/artifact for diagnosis. Use an
   explicit clean save-schema cut if required; this prototype does not maintain
   compatibility shims for obsolete saves.

Use the same repository and shared rules/data where practical, with an isolated
entry/build target for the successor. Keep artifacts, save namespaces and app IDs
separate during experiments. Prefer small independently reviewable PRs to a
long-lived fork of every gameplay system. Pin contract fixtures to a rules
revision; when main changes gameplay, advance the fixtures intentionally rather
than silently comparing different games. Only one implementation becomes the
permanent authority after cutover.

## Correctness and impact

This document changes no simulation state, RNG, schemas, UI or replay behavior.
Implementation must preserve all serialized RNG streams, official 60 ticks per
second, exact event and provider ordering, every-second summaries/loss checks,
captured definitions, five Practice slots and `rebuildStateAtSecond(tSec)` as the
authoritative path. Keep independent mutable preview states and private anchors;
do not share writable preview pointers or introduce copy-on-write state sharing.
Full opening forecast remains a gate before ordinary New Game starts.

A cross-language port must specify integer wrapping/bitwise RNG behavior, numeric
precision and operation order, stable iteration order, rounding and event ties.
Using fixed point or a different timestep changes semantics and needs a separate
explicit design decision. Do not introduce such changes as an optimization.
Regions with shared Stock and reactions are not independent simulation jobs.

Verification for future code changes: `npm run verify`, `npm run test:differential`,
replay/save round-trips and full-state/summary/anchor differential checks across
the shared corpus, plus applicable settlement/navigation/timegraph probes. Add
cross-runtime differential tests before accepting a new implementation. Confirm
stale-generation rejection, action/terminal boundaries, previous-future limits,
preview isolation, package upgrades, offline resources and Android lifecycle.
Follow the normal local-preview/build-identity and explicit Pages publication
workflow. Planning-document validation alone establishes none of these runtime
claims.
