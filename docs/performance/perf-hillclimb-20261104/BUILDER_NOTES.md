# Harness Builder working notes

Builder `/root/harness_builder`, Codex gpt-6.1-sol / xhigh, 2026-11-04. **NOT SOUND; executable bindings and proof under construction.** Product sources are untouched by this Builder. Root owns the contract/proof and now owns `statistics.mjs` plus its tests. Independent Auditor owns technical acceptance.

## Files and reproduction

- `scripts/perf-hillclimb/fixtures.mjs`: ordinary current New Game seed 123; selected founder; entered first shop; real purchased/confirmed node history at second 54. Five recorded public actions and every official simulation tick. Nontrivial live/replay full serialized equality including RNG is asserted. No gameplay settings or graph generators are modified. Fixture savedAt is frozen for stable hashes. More representative seeds/history required before acceptance.
- `scripts/perf-hillclimb/browser-runtime.mjs`: browser monotonic event timestamp through semantic completion and double-rAF, captures handler delay separately; deadline rejection; optional worker/frame/long-task and completed save transaction evidence. Instrumentation-off preserves the native Worker and IndexedDB implementations. Instrumentation overhead controls/evidence remain required.
- `scripts/perf-hillclimb/run.mjs`: sequential real regular-game/browser paths, job/population arguments, JSONL raw operations, per-run manifests and summaries. A fresh browser is created for each job/suite repetition. Contexts are isolated. Cold excludes OS disk-cache coldness. Warm performs one full unmeasured equivalent entry then clears save records, reinstalls fixture if any and navigates again in the retained context.
- `scripts/perf-hillclimb/mechanism-controls.mjs`: standalone reversible browser fixtures using the same timer and completion primitive. Deliberate preceding input-handler stall, 200ms deferred completion, wrong result, late success, wrong slot/payload and native unwrapped reference checks. These supplement, and do not replace, required actual-product controls.

Commands (one browser workload at a time; production `dist` must already be built):

```powershell
node scripts/perf-hillclimb/fixtures.mjs
node scripts/perf-hillclimb/mechanism-controls.mjs
node scripts/perf-hillclimb/run.mjs --jobs=entry --artwork=off --population=desktop --cache=cold --samples=1 --id=smoke-minimal
node scripts/perf-hillclimb/run.mjs --jobs=entry --artwork=illustrated --population=desktop --cache=cold --samples=1 --id=smoke-illustrated
node scripts/perf-hillclimb/run.mjs --jobs=performance,map,life,save,art --population=desktop --samples=1 --id=smoke-interactions
```

Other arguments: `--population=mobile|mobile4`, `--cache=warm`, `--worker-delay=200`, `--instrumentation=off`, `--timeout=180000`, `--dist=dist`, `--output=<path>`. Worker-delay and instrumentation-off runs are controls/diagnostics and never acceptance samples mixed with the default population. Default raw output is `artifacts/perf-hillclimb/<id>/`.

## Discovery evidence and required repairs

`builder-discovery-entry` ran the initial scaffold against built v1.1.52, desktop SwiftShader, regular illustrated game. It reached semantic entry (65.9s) and accepted Present (713ms), with no browser page errors. **This is invalid timing/proof evidence:** its artwork was mislabeled off; its 60s timeout flag was true but late semantic success was incorrectly accepted. Root was informed; use the run only to understand bindings. Timer rejection and labels have since been repaired but need controls/reproduction. No score or product performance conclusion follows from this run.

`builder-discovery-life` reached Life Map, selected the reachable first node and confirmed actual entry exactly once. It failed at category selection after 90 seconds because the generic option hit target inspected the category face; the actual separate tag-confirm point is now bound. This is a failed discovery, not proof or a product latency score.

`mechanism-controls` passed four fixture mechanism groups (trusted input + preceding main-thread stall; deferred/wrong/deadline completion; actual delayed worker; IndexedDB identity/native reference). These control results predate later runtime timing refinements and lack exact code/build hashes, so they are discovery evidence only and must be rerun after the mechanism freezes.

Current `runtime.probe` captures explicitly designated terminal semantic success and the next double-rAF entirely in the browser; `finish` consumes those timestamps and reports host delivery delay separately. `wait()` is a precondition; `complete()` designates terminal readiness. A missing terminal predicate fails the operation. Changing predicate identity or receiving another input invalidates an earlier completion candidate. Final controls include an immediate successful intermediate wait followed by a deferred 200ms terminal wait with no further input, and must verify the refined mechanism.

The fixed ordinary corpus is seeds 123, 424242 and 99117. Two real six-node histories were first generated: seed 123 at second 439, 21 actions / 28 genuine checkpoints; seed 424242 at second 574, 21 actions / 29 checkpoints. Seed 99117 exposed a genuine original-baseline serialization blocker at second 740 after travel to a neutral market and founding training installed a Lyceum. Root's separate read-only diagnosis reproduced the actual enabled live view option, paused live model dispatch and normal simulation runner. Original-baseline evidence remains red and retained; the seed was never excluded or replaced. Root assigned separate corrective implementation; this Builder makes no product edit.

After root's separate correctness prerequisite `d05bab34417ff2af4fd280225e03bab316602105`, the unchanged ordinary corpus passed all three seeds / 15 fixtures in `artifacts/perf-hillclimb/fixture-corpus-d05bab3/manifest.json`. Seed 99117 reaches second 822 with 23 actions / 29 checkpoints. The original durable public-action trace remains legal and now reports the exact serializer symptom absent (`neutral-market-repro-fixed-d05bab3`, exit 0). Earlier red evidence is retained. This is a correctness repair, not a measured performance gain.

Updated mechanism controls passed five groups in `artifacts/perf-hillclimb/mechanism-controls-d05bab3-terminal-queue/controls.json`, with captured runtime/control source files/hashes, contract hash and build metadata. In addition to the original controls, the terminal-predicate control observes immediate intermediate success but still includes the later 200ms completion; an actual trusted CDP input dispatched while renderer JS is already busy records its event timestamp inside that busy window and approximately 297ms pre-handler queue time. This validates timer/queue sensitivity on the stated desktop Chromium configuration, not product-path or tail acceptance.

Durable repro: `node scripts/perf-hillclimb/repro-neutral-market.mjs` uses `scripts/perf-hillclimb/fixtures/neutral-market-99117.json` (18 public actions and all official ticks to second 740). It exits 1 on the exact neutral-market serializer symptom, exits 2 on an invalid altered itinerary, and exits 0 if the symptom is absent. Last valid / first invalid full states and concise repro output are written under `artifacts/perf-hillclimb/neutral-market-repro/`. Removing each of the 18 recorded actions removes the symptom under the recorded timing, generally by making subsequent required actions unavailable; this is action-omission minimal for that trace, not a claim about all possible gameplay paths.

Still required: all repaired scripts executed; exact field/target bindings repaired from real snapshots; active compute/reveal overlap J3/J5 (not merely a static prepared forecast); J5 exact pointer-to-target mapping, full oracle/read-only independence; J4/J6 current first shop flow, expected costs/state and fresh generation/forecast output equivalence; J7 full source/resume/continuation equality and nontrivial action/off-anchor histories; J2 nontrivial Continue and prepared-fixture metadata; J8 real preparation start, no automatic reveal oracle, assets failure/retry and repeated-navigation memory. Fixed offered input schedule/drop/lateness is not yet implemented. Current runner is closed-loop and declares that limitation.

Actual current save DB is `full-map-redesign-v1-saves`. Older probes using `civilization-saves` or legacy `selectedState()` are unsuitable as representative current-main fixtures.

No full three-suite smoke, sufficient-tail quota, actual-product negative controls, overhead proof, independent end-to-end reproduction, Phase A acceptance or scoring has occurred.

Full debug snapshot polling is materially intrusive: existing failed Life Map discoveries spent about 17–20% of elapsed time in polling, with individual reads around 11–23ms. Existing `getLifeDecisionTimingSnapshot` is also not a passive accepted substitute because it can call controller synchronization and heavy presentation getters. Root is arranging separate primitive, read-only observability; current run.mjs timing polls remain discovery only until that binding, overhead proof and independent audit are complete.

`offered-input.mjs` is an untested, unwired fixed-rate CDP input helper. It schedules all requested events independently of ACKs and retains due/dispatched/arrival/handler/frame times, clock calibration uncertainty, coalescing, missing events, protocol errors and generator lateness. Its current reference-region projection getter also needs passivity review; bind to root's new passive observability before claiming accepted responsiveness evidence.

`builder-discovery-life-d05bab3-r2` failed at final entry confirmation because a second click arrived before the entry-confirmation dialog settled. Current run.mjs now has a separate measured entry-dialog-open step waiting for phase=open, followed by final confirmation. That repair is unexecuted. The same discovery retained real asynchronous forecast coverage (computed 1280s while reveal was 162s), so current selected-run Continue is a promising J3 workload; map/scrub now start from that fixture. Actual worker/progress overlap must still be demonstrated per operation.

Next executable work after root's passive-observation implementation and browser-slot release: integrate and audit the new passive terminal predicates, run focused Life r3 (including exact draft-batch + persisted full-state oracle), then Performance New/Continue, map/scrub with actual work/reveal witnesses, and opening/nontrivial save/load. Integrate offered input and actual product-path negative controls only after these bindings are sound. Refresh all mechanism identities/proof after changes. Root owns the coverage contract and independent audit.

## Proposed population applicability (not yet frozen by root)

Avoid treating warm/cold as a per-click switch after a session is already running. They apply to startup/load/preparation boundaries. All three documented browser configurations remain required desktop/mobile proxies; seed and asset/cache populations stay separate.

| Jobs | Relevant populations |
| --- | --- |
| J1 ordinary New Game | Fixed ordinary seed corpus; cold/warm HTTP/browser caches; minimal versus illustrated; all three browser configurations. Progressive background artwork is measured as J8. |
| J2 prepared New | Its actual seed-123 generated fixture, not the seed corpus substituted into its payload; cold/warm cache; artwork off/progressive; all three browser configurations. Generation and gzip size/hash remain separate from runtime. |
| J2 Continue, J7 load | Seeded action-derived histories plus opening save; cold/warm cache; actual performance namespace versus ordinary slots remain distinct. Minimal and progressive performance Continue are separate; ordinary illustrated loading is a distinct necessary sentinel, not pooled with the minimal loader. |
| J3–J6 steady interaction | Sessions with declared startup/cache/art state and fixed operation counts; actual active compute/reveal required at the operation boundary. Distinct anchor/off-anchor, action stage/commit and exact fixture identities stay separate. Session clustering must not create false independent samples. These still need actual illustrated/minimal binding coverage and fixed offered-input stress beyond current closed-loop transactions. |
| J8 progressive art | Progressive preparation and explicit reveal, cold/warm resource cache, each browser configuration; matched artwork-off reference for frame/memory overhead, not a meaningless “off preparation latency” cell. Repeated post-reveal navigation memory is separated from intentional asset allocation. |

This is an applicability proposal. Root's exact contract/coverage matrix and independent acceptance govern proof; no missing cell is implicitly waived.
