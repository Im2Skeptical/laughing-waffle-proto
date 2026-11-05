# Independent passive-observability review — round 1

**Scoped passive API: ACCEPTED at the hashes below. Full Phase A: PROOF: NOT SOUND.**

Auditor `/root/observability_auditor_round1`, separate from the T3 instrumentation Implementer and root/other Harness Builders; inherited Codex gpt-6.1-sol / xhigh. Date 2026-11-04. No source, script, runtime, package, gameplay, score or deployment change by Auditor. Owned edit is this report only. Generated reproduction evidence is retained separately.

The accepted scope is the additive, copied-primitive `__SETTLEMENT_DEBUG__.getTimingSnapshot()` facade and its component readers. It is sufficiently passive to integrate into the next harness construction stage. It does not certify complete workload coverage, fresh forecast correctness, paint/GPU completion, observer overhead, latency tails or the main harness's completion mechanism.

## Reviewed identities

Parent HEAD `a9df52cbd6255ed95c51c9e7d524cf9ab557472b`, v1.1.52. Instrumentation source is an uncommitted diff on that HEAD. Original corrected product baseline remains separately recorded by the parent. The reviewed local built app is `app-OF3QB4I7.js`, forecast worker `timegraph-forecast-worker-YOB3XRD7.js`, build fingerprint `b50bf80c7a54`; unintegrated and unpublished.

| File | SHA256 |
| --- | --- |
| src/model/timegraph/controller-core.js | 08a02197159aa99c9454dab66dbeef3ac4b457d46a85d25eee05539e76bd928a |
| src/controllers/life-decision-controller.js | b394ee2176e8b461aefceb1a724ac154d7c2b197d64817b8de2f35bf3c03572e |
| src/views/timegraphs-pixi.js | 5c1e7a0968461c6ea249a9ddbc661e49edfe40324ba1afddcff93f07cb5f0649 |
| src/views/world-map-pixi.js | 547fda5a03f869dd556d81e38bf495d579daf252669a05c5076553a8406e6b58 |
| src/views/vassal-life-map-pixi.js | f8a5a1e47f5dca77bd67467572eaf506a3d8bee277187a9c05434b60cad99f1b |
| src/views/vassal-node-decision-modal-pixi.js | fbdbdf73f0435fc7537a653d7cebf36da9596209a13434697159e16acd881797 |
| src/views/vassal-resolution-recap-pixi.js | d39fa9dd7c1769b347094c2ed1d9dfd111f737d37a5049081bd9f0d382493e09 |
| src/views/ui-root-settlement-pixi.js | 0db9fa61479cfacb5811da8158bbfa65b58abdefac1f3aaed60753489bf57978 |
| src/views/ui-root/settlement-debug-api.js | b43915ef64f37a4dc63db9eeb3b762fe7e7caf93a7c6516bd3e770795551ce9f |
| src/views/ui-root/settlement-timing-snapshot.js | fd3ee6b7fc89f899be2a7d47f25d0b70d315bfe1a6717ba2f454c4b495453b5a |
| scripts/timing-observability-test.mjs | af55f25ca41b9ef9f79e2762cfff223d9471c9828e15021dee88d143796de9f2 |
| scripts/timing-observability-browser-probe.mjs | 967d69eee04d74079516b7fd4ec778122e689a4571d4e0178f890cdf888af369 |
| package.json | bb2e3e49d8672b683557e747437d873332b1b8b9618bd4ebde38da18a5d66b30 |

`artifacts/perf-hillclimb/passive-observability-audit-round1/reviewed-source-hashes.json` also records the reviewed dependencies: camera/panel transition readers, entry-confirmation snapshot, consequential-time snapshot, SimRunner passive primitives and forecast-reveal helpers. Guardrails and required current intent/implementation/supply documents were read before graph review, together with relevant routes and folder READMEs. No historical decision archive was used.

## Independently reproduced evidence

Executed sequentially, with the exclusive CPU/browser slot:

```powershell
node scripts/timing-observability-test.mjs
node scripts/timing-observability-browser-probe.mjs
git diff --check
```

All returned exit 0. The fixed-name Builder `unit.json` and `browser.json` were copied before reproduction, independently regenerated, copied to the audit folder, then restored from the preserved Builder files. The audit folder contains `builder-unit.json`, `builder-browser.json`, `audit-unit.json`, `audit-browser.json`, `unit.log`, `browser.log` and exact reviewed hashes. No failed Builder evidence was removed.

Focused reproduction passed the real graph-controller and Life-controller checks, copied-getter/mutation controls and forbidden-call tests. The test executes the current view getter bodies extracted from source into explicit closure fixtures. This is not a substitute for real constructor wiring; source inspection and the separate integrated probe provide that evidence. The extraction regex currently selects the complete intended getter body in each reviewed file. It is deliberately coupled to that source shape and must fail/review on structural changes.

The integrated reproduction served and hashed the actual local built app, forecast worker, save-load worker and stylesheet against the retained manifest. Chromium 147.0.7727.15, desktop 1280×800, CPU rate 1 and explicit SwiftShader were used. The authored boot fixture is a diagnostic fixture, not ordinary/prepared startup performance evidence. No physical Pixel6 measurement is claimed.

| Actual stage | Reads | Legacy facade calls | Observed state |
| --- | ---: | ---: | --- |
| menu | 1000 | 0 | map; entry closed; decision closed |
| boot-map | 1000 | 0 | map; entry closed; decision closed |
| present-map | 1000 | 0 | map; entry closed; decision closed |
| candidate | 1000 | 0 | vassalLife; selected candidate; entry closed |
| entry-dialog | 1000 | 0 | vassalLife; entry open; decision closed |
| decision | 1000 | 0 | vassalLife; entry closed; decision open |

Each stage mutated returned DTOs, observed unchanged raw primitive output and worker start/post/termination counters within the same synchronous browser turn, and restored poisoned legacy methods afterward. No page errors occurred. Full/primitive parity in the settled present-map stage passed separately and untimed. Those legacy debug methods were not used as the browser purity oracle.

## Requirement assessment

- **No causal state/work:** component bodies read closure values only. Camera `snapshot`/`isAnimating`, panel `snapshot`, entry-dialog `getSnapshot` and consequential-time `getSnapshot` were inspected and are passive reads. The facade uses SimRunner's direct `getTimeline` and pure `getPreviewStatus`, not state accessors. New graph-controller reads never call `getData`, projection or restoration; graph-view cap arithmetic leaves stale overrides untouched. No synchronization/render/presentation call was introduced.
- **No hidden hot-path work:** only new getter definitions, return-object exports and startup facade wiring were added. The root publishes its debug facade once during initialization; no new tick/frame/render invocation was added. There are no state/RNG/schema/save-envelope/worker-algorithm or gameplay changes in this diff, and the model imports no view code.
- **Detached data:** map/camera, graph, Life-processing and recap clock values are copied scalars in fresh objects. Existing dependency snapshots can contain private nested objects, but the new readers select only needed scalar fields. Mutation controls passed, including dependencies whose fixture readers intentionally returned private objects.
- **Life source correspondence:** raw `jobReady` remains distinct from `ready`; readiness requires the same timeline object, revision and frontier second as the captured base. Actual controller tests covered active and ready jobs made stale by revision, and a replacement timeline with the same revision. Observation did not terminate the stale worker or synchronize the draft; normal `getStatus()` still performed its existing cleanup. This is stronger than exposing an unqualified cached ready flag.
- **Reveal/cap semantics:** the passive arithmetic matches the existing visible-coverage rule for the raw cached coverage and actual history frontier, including stale reveal context and computed-coverage bounds. The normal stale-start-override accessor returns the actual frontier while clearing the override; the new reader returns the same frontier without that mutation. Missing coverage remains null. Settled real-browser parity passed. These are cached observations, not a request to synchronize future data.
- **Test strength:** real graph controllers with cold/populated caches and real Life orchestration with controlled worker delivery supplement extracted view closures. Poisoned dependencies cover forbidden paths, rather than merely counting returned fields. The integrated constructor probe complements that seam coverage. The actual browser poisons the public legacy facade only; it cannot by itself intercept closed-over private functions. Source/dependency inspection and the Node seam tests are essential parts of this acceptance.

No blocking defect in this bounded passive API was reproduced or found in the reviewed implementation. This verdict is limited to the explicit requirements above, not inferred from green tests alone.

## Integration and full-proof limits

1. Raw cache/reveal/job fields can lag normal orchestration. In particular, graph metadata is not an authoritative proof of current-generation forecast correctness. J6 and stale-output controls must bind the expected source/revision/request and independently compare correct output; do not treat `pending:false` or a coverage number alone as usable-preview proof.
2. Existing geometry helpers remain outside passive coverage. They can call injected state accessors; accepted input generation needs canonical fixture geometry, a safe raw geometry seam, or clearly untimed calibration. Do not place legacy point/full snapshot/status calls inside timing polls.
3. The actual browser run did not resolve a node through an active computation/ready/stale worker and recap, nor exercise arbitrary scrub anchors, off-anchor restores, late-game saves or the complete ordinary seed corpus. Active/stale controller conditions have Node evidence, and recap copying has body/dependency evidence. Required real-job integration, read-only preview/RNG oracles and broader workload populations still need their own proof.
4. Six synchronous blocks of 1000 reads demonstrate bounded purity, not normal offered-load responsiveness. They naturally occupy one JS turn and do not establish neutral frame/tail overhead under concurrency. Matched observer/reference runs, suitable repetition and independent end-to-end proof remain mandatory.
5. No latency or retained-memory gain is accepted. The shared completion-latch defect and artwork-specific oracle findings being repaired by root are outside this API's implementation and remain separate proof gates. Full verification, complete job coverage, three consecutive suites, adequate samples/uncertainty and a complete Harness Auditor verdict are still outstanding.

CPU/browser slot was released to root after both reproductions. Browser and owned temporary server were closed. **Full Phase A remains PROOF: NOT SOUND; no scoring or product optimization is authorized by this scoped acceptance.**
