# Harness Builder working notes

Builder `/root/harness_builder`, Codex gpt-6.1-sol / xhigh, 2026-11-04. **NOT SOUND; executable bindings and proof under construction.** Product sources are untouched by this Builder. Root owns the contract/proof and now owns `statistics.mjs` plus its tests. Independent Auditor owns technical acceptance.

## Files and reproduction

- `scripts/perf-hillclimb/fixtures.mjs`: construction recipe for the three fixed ordinary seeds 123, 424242 and 99117, five fixtures each including six-node histories. Every official tick and public action is retained. Candidate runs must reuse the frozen corpus described below, never regenerate this recipe as their expected workload.
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

Root owns the runtime. Its current repair requires explicitly designated terminal truth to stay true through two frame opportunities and revalidates at finish. Incidental waits are nonterminal; a missing terminal predicate fails. Changing predicate identity, receiving another input or a false predicate invalidates the candidate. The original control passes below did not catch a later same-key false predicate and are superseded by root's transient/deadline controls. Current schema names terminalReadinessMs, semanticToFrameOpportunityMs, frameOpportunityToFinishCallMs and postSemanticToFinishCallMs. These gaps are not isolated driver overhead; firstFeedbackMs remains null/unmeasured until a real job-specific witness exists.

The fixed ordinary corpus is seeds 123, 424242 and 99117. Two real six-node histories were first generated: seed 123 at second 439, 21 actions / 28 genuine checkpoints; seed 424242 at second 574, 21 actions / 29 checkpoints. Seed 99117 exposed a genuine original-baseline serialization blocker at second 740 after travel to a neutral market and founding training installed a Lyceum. Root's separate read-only diagnosis reproduced the actual enabled live view option, paused live model dispatch and normal simulation runner. Original-baseline evidence remains red and retained; the seed was never excluded or replaced. Root assigned separate corrective implementation; this Builder makes no product edit.

After root's separate correctness prerequisite `d05bab34417ff2af4fd280225e03bab316602105`, the unchanged ordinary corpus passed all three seeds / 15 fixtures in `artifacts/perf-hillclimb/fixture-corpus-d05bab3/manifest.json`. Seed 99117 reaches second 822 with 23 actions / 29 checkpoints. The original durable public-action trace remains legal and now reports the exact serializer symptom absent (`neutral-market-repro-fixed-d05bab3`, exit 0). Earlier red evidence is retained. This is a correctness repair, not a measured performance gain.

Updated mechanism controls passed five groups in `artifacts/perf-hillclimb/mechanism-controls-d05bab3-terminal-queue/controls.json`, with captured runtime/control source files/hashes, contract hash and build metadata. In addition to the original controls, the terminal-predicate control observes immediate intermediate success but still includes the later 200ms completion; an actual trusted CDP input dispatched while renderer JS is already busy records its event timestamp inside that busy window and approximately 297ms pre-handler queue time. This validates timer/queue sensitivity on the stated desktop Chromium configuration, not product-path or tail acceptance.

Durable repro: `node scripts/perf-hillclimb/repro-neutral-market.mjs` uses `scripts/perf-hillclimb/fixtures/neutral-market-99117.json` (18 public actions and all official ticks to second 740). It exits 1 on the exact neutral-market serializer symptom, exits 2 on an invalid altered itinerary, and exits 0 if the symptom is absent. Last valid / first invalid full states and concise repro output are written under `artifacts/perf-hillclimb/neutral-market-repro/`. Removing each of the 18 recorded actions removes the symptom under the recorded timing, generally by making subsequent required actions unavailable; this is action-omission minimal for that trace, not a claim about all possible gameplay paths.

Still required: all repaired bindings executed and audited; J3 actual simulation/forecast work overlapping map input; J5 actual anchor/off-anchor scrubs during advancing reveal with correct clamps and read-only independence. J5 does not require simultaneous forecast compute. J4/J6 current shop flow, expected costs/state and fresh forecast equivalence, J7 exact source/resume/continued state, all populations and actual-product controls remain unproved. Root's separately owned artwork controls cover required failure/retry/publication mechanisms but do not accept the complete harness. Fixed offered pan input is now wired, with due/dispatch/event/handler/frame and drop/lateness evidence, but unexecuted. Mobile pinch remains an explicit coverage gap; mouse wheel is not substituted for it.

Actual current save DB is `full-map-redesign-v1-saves`. Older probes using `civilization-saves` or legacy `selectedState()` are unsuitable as representative current-main fixtures.

No full three-suite smoke, sufficient-tail quota, actual-product negative controls, overhead proof, independent end-to-end reproduction, Phase A acceptance or scoring has occurred.

Full debug snapshot polling is materially intrusive: existing failed Life Map discoveries spent about 17–20% of elapsed time in polling, with individual reads around 11–23ms. Existing `getLifeDecisionTimingSnapshot` is also not a passive accepted substitute because it can call controller synchronization and heavy presentation getters. Root is arranging separate primitive, read-only observability; current run.mjs timing polls remain discovery only until that binding, overhead proof and independent audit are complete.

`offered-input.mjs` is an untested fixed-rate CDP input helper wired to the J3 pan binding. It schedules all requested events independently of ACKs and retains due/dispatched/arrival/handler/frame times, calibration uncertainty, coalescing, missing events, protocol errors and generator lateness. It now reads raw passive camera fields, with precomputed geometry and mouse/touch dispatch. Actual offered-load validity, overhead and saturation controls remain required.

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

## Frozen workload and baseline SDK handoff

Canonical immutable corpus: `artifacts/perf-hillclimb/frozen-baseline-a9df52c-sourceproof-20261104/manifest.json`.

- Manifest ID: `406f042f7e4a3142620b8d05023167d98893185d24347f4745740a3a3feac000`.
- SDK SHA256: `8c163025e51f71818016c358c1f10055beaf343dfc249f3db6713965d5fc40b0` (1,329,028 bytes, one ESM bundle).
- Captured source ID: `94afaa581ff65f0fdde91ef35bfea36e40129dc58e0ac39bc73a6d1dc9b87ea7` (141 exact input byte snapshots).
- Construction runtime: Node v24.15.0; esbuild version and complete runtime versions recorded in the manifest. Only `node:assert/strict` and `node:crypto` remain external. Dynamic imports, CJS require, split outputs and mutable repository imports are rejected.

The source snapshot rebuild reads its inputs solely from the captured byte map and reproduces the exact SDK SHA. All 15 text/state identities match the retained corrected `fixture-corpus-d05bab3` without normalization. Each immutable save and raw expected frontier state is retained. `conformance.json` records 141 full-state comparisons across all three seeds: raw/decode parity, authoritative rebuilds at 0/16/17/frontier, then three official continued seconds including all RNG fields. Normal losses/actions are not suppressed. This is baseline construction conformance, not independent Phase A acceptance and not browser latency evidence.

The earlier `frozen-baseline-a9df52c-20261104` construction output is preserved, with the same SDK/source bytes. The canonical sourceproof manifest adds the source-only reproduction witness and packet identity checks; the loader requires that stronger witness. Expected model semantics never changed between those construction outputs.

Construction command (already run; the existing output directory must not be overwritten):

```powershell
node scripts/perf-hillclimb/freeze-corpus.mjs --retained=artifacts/perf-hillclimb/fixture-corpus-d05bab3/manifest.json --output=artifacts/perf-hillclimb/frozen-baseline-a9df52c-sourceproof-20261104
```

Loader/isolation controls passed 11 groups; exact current script hashes and results are retained in `artifacts/perf-hillclimb/frozen-loader-controls-a9df52c/controls.json`. The controls reject a wrong pin, altered manifest, altered frozen bytes, duplicate fixture pairs and external/dynamic imports. They leave the immutable source untouched.

```powershell
node scripts/perf-hillclimb/freeze-corpus-test.mjs artifacts/perf-hillclimb/frozen-baseline-a9df52c-sourceproof-20261104/manifest.json 406f042f7e4a3142620b8d05023167d98893185d24347f4745740a3a3feac000 artifacts/perf-hillclimb/frozen-loader-controls-a9df52c/controls.json
```

Exact reuse command for a focused Life Map discovery, after root grants the browser slot and DTO v2 is implemented/audited (not yet run):

```powershell
node scripts/perf-hillclimb/run.mjs --fixture-manifest=artifacts/perf-hillclimb/frozen-baseline-a9df52c-sourceproof-20261104/manifest.json --fixture-manifest-id=406f042f7e4a3142620b8d05023167d98893185d24347f4745740a3a3feac000 --seed=123 --jobs=life --population=desktop --artwork=off --cache=cold --samples=1 --id=life-passive-frozen-discovery
```

The same manifest path/ID must be used for A/B. Seed 424242 and 99117 select their existing immutable ordinary fixtures; Performance New/Continue use their actual fixed logical seed 123. Each run validates all frozen byte hashes, records the frozen manifest/SDK/source IDs, and includes the frozen identity in population grouping. Without an explicit manifest and pinned ID the runner labels output `generated-construction-only`, sets comparison/tail-inference eligibility false and cannot support a baseline or candidate score. It never silently creates a new frozen expectation.

Prepared fixture bytes remain separate from logical expected state. Baseline packet SHA is `cad1a039895f5bba1aceb50ea693c17c06550b8c068b436c624c2b803994d9a6`, baseline source key `db9c9cfa0b929b060892b105c668dfa45cc3fafa1e5665b641a265877ceabe79`, loss second 3918 and 245 retained forecast states. Its initial state exactly matches immutable ordinary seed123 state `df5bbc7c7ea715cb09ca038063adcb776736fb61e74a3ab4905aa9664123c24f`. Candidate packet key/hash may vary with source: the runner validates its actual key against its actual build and its seed/state against the frozen logical workload, then records both separately.

`run.mjs` now uses the frozen SDK for expected preview/replay and continued expected states; current product code only validates actual results. Save correctness compares raw, decoded and authoritative rebuilt actual states to the immutable raw expected state, including persistent knowledge and RNG, outside the timed interval. Any legitimate knowledge delta needs a separately derived exact expectation and audit; mismatches are not normalized. Syntax checks pass for runner, SDK entry, freezer and focused controls. No browser job has run through the new loader yet.

The new timed bindings use passive DTO v2/DOM fields and require expected node/source/target/generation. Full/legacy snapshots are guarded against timed use. Geometry is calibrated explicitly outside clocks and retained; point-getter passivity and calibration side effects remain subject to audit. Missing v2 opening phase/loss/coverage, cached shop fields, anchor membership and artwork prepared/publication fields deliberately block their jobs rather than weakening terminal criteria. Root owns the DTO extension and shared timer/artwork files.

Impact: these are harness-only changes. Product simulation, RNG streams, schemas, replay, UI behavior and layering are untouched. The frozen SDK copies the verified model; conformance executes all 60 ticks per official second. Remaining gates include passive DTO audit, real execution of all repaired jobs/populations and controls, correct visible completion, mobile pinch, timing/observation overhead, first-feedback witnesses, required smoke/tail samples and independent Harness Auditor acceptance. **Phase A remains NOT SOUND.**
