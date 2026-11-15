# Independent timing-runtime review — round 3

**Scoped result: PARTIAL ACCEPTANCE.** Runtime v3 repairs the two attribution findings from round 2 and retains the independently reproduced terminal/frame/deadline behavior for valid positive finite deadlines. Continuous rAF/long-task recording captures the tested post-marker stall and distinguishes unavailable data and a censored trailing frame. Two input/window edge findings remain below. **Full Phase A: PROOF: NOT SOUND.** No product speed, first-feedback, tail, memory or physical-device claim is accepted.

Auditor `/root/timing_runtime_auditor_round3`, inherited Codex gpt-6.1-sol / xhigh, independent of the root Builder. Date 2026-11-04. Only this review was edited; no product or harness source changes. Repository instructions/invariants, performance-loop skill and prior timing/artwork reviews were read. This review concerns generic harness runtime, not simulation/timegraph implementation. Simulation state, RNG, schemas and authoritative replay were not changed or exercised as product correctness proof here.

## Exact reviewed identities

HEAD `a9df52cbd6255ed95c51c9e7d524cf9ab557472b`; source files are uncommitted. All reviewed hashes remained unchanged through the independent runs and final check. Frozen source, raw controls and edge reproductions are retained under:

`artifacts/perf-hillclimb/timing-runtime-audit-round3-20261104T232323686/`

| File under scripts/perf-hillclimb | SHA256 |
| --- | --- |
| browser-runtime.mjs | `9c1bf20e43ea32c9fe8da01e4dc3e065b782bce8ef7fcbafaa84d87a6a927e95` |
| browser-runtime-test.mjs | `875057942d42adc8d38a72f69d788f0c23bbcfd2f00704c21dd653b9d5b33bf5` |
| deadline.mjs | `b38266f2e0e32344e1128150b7156868f95ad4f96a4c0d835ebcd1c44a747073` |
| deadline-test.mjs | `57b47ae59b4cd5d4fab35bbd789701a723e0ed06a8d044698d84e4a2a52be6d7` |
| mechanism-controls.mjs | `778cc9ebd0ad789edf42b4bbed0277ccf95eb4b214ecbd852b2980f1b01747c7` |

## Independently reproduced checks

Executed sequentially with exit 0:

```powershell
node scripts/perf-hillclimb/browser-runtime-test.mjs
node scripts/perf-hillclimb/deadline-test.mjs
node scripts/perf-hillclimb/mechanism-controls.mjs artifacts/perf-hillclimb/timing-runtime-audit-round3-20261104T232323686/browser-controls
```

The actual Chromium run passed all eight groups, including trusted queued input during an existing renderer block, delayed terminal/Worker work, transient same-key readiness, committed IndexedDB identity, native Worker reference and bounded missing-frame rejection. The new continuous-window group also passed. Environment: Chromium 147.0.7727.15, explicit SwiftShader, the recorded desktop configuration; no physical Pixel 6 evidence. Sources and exact runtime/build/contract identities are retained in `browser-controls/controls.json`; `audit-evidence.json` summarizes the independent checks.

The controlled 200ms block starts after the transaction's double-rAF marker. Its continuous record retains a roughly 200.1ms rAF interval and a 200ms long task. The metadata reports about 0.3ms terminal-semantic elapsed, 31.6ms semantic-to-frame opportunity, 201.1ms frame-opportunity-to-finish-call signed offset and 232.7ms semantic-to-finish-call. Those are diagnostic observations from one controlled case, not product measurements or uncertainty estimates. The decomposition no longer describes all of that time as driver overhead, and `firstFeedbackMs` is null.

The virtual controls execute the actual serialized function, rather than a duplicate implementation. They independently support false/stale readiness invalidation, synchronous-terminal enforcement, both-frame revalidation, late and absent-frame deadlines, successful timer cleanup, post-marker frame retention, copied window data and a right-censored trailing-frame lower bound. They do not prove browser latency or real-job coverage.

## Closed attribution findings and accepted scope

- **R2-01 is repaired in the reviewed metadata.** `hostCompletionGapMs` is removed. The separately named intervals have explicit scope, and `finishCallRelativeToFrameOpportunityMs` can legitimately be negative when finish is invoked before its awaited frame marker. That signed offset is not pure transport overhead. Continuous recording persists after an operation closes; callers must use a declared complete observation window rather than discard later app work at the early latency marker.
- **R2-02 is repaired by honest nonmeasurement.** `feedbackMs` is removed. `terminalReadinessMs` describes the first observed terminal readiness period that survives the frame checks. `firstFeedbackMs` stays null, with explicit scope. This does not close the required actual first-feedback job bindings or permit a responsiveness score based on an unmeasured metric.
- The terminal mechanism remains a **browser predicate plus double-rAF opportunity proxy**. It does not establish physical scanout, GPU idle, earliest paint, or completion of every later application task. Actual predicates still need passive, target/request/generation-sensitive semantics; the runtime cannot infer freshness from a generic ready Boolean.
- `readContinuousWindow` copies returned samples, distinguishes instrumentation-off from zero observed stalls, reports long-task observer availability, and preserves a right-censored uncompleted trailing frame. Future collectors/analyzers must retain that censoring instead of interpreting its lower bound as a completed fast frame. Long tasks can arrive asynchronously; callers must allow the declared settling/observation period and preserve read time.

## Remaining findings

| ID | Priority / status | Evidence and repair required |
| --- | --- | --- |
| R3-01 | High deadline validation / open | `browser-runtime.mjs:100` accepts `timeoutMs: NaN` and `Infinity`. A semantic reproduction using the actual serialized runtime returns a successful 32ms operation with `timeout:false` for both inputs, because comparison with NaN never exceeds the deadline and Infinity is unbounded. Zero/negative values are also not rejected at arm, though they eventually fail after completion. Validate the supported positive finite deadline domain before arming or creating timers, and add rejection controls. This finding does not contradict the eight successful runs with valid declared deadlines; it prevents a malformed configuration silently escaping the timing/liveness contract. |
| R3-02 | Medium frame-window boundary contract / open | `readContinuousWindow` allows `startMs === endMs`, and its frame/long-task filters include intervals that merely touch an endpoint. With real runtime recording under a virtual clock, frames at 16ms, 216ms and 232ms produce two samples for the zero-duration window `[16,16]`, including the 200ms interval `[16,216]`. The positive window `[0,16]` also includes that later interval despite no positive-duration overlap. Decide and freeze the intended duration-window semantics: reject/empty zero-length windows, and use positive-overlap tests (or explicitly label boundary-touch samples and exclude them from duration-window tail claims). Frame intervals that genuinely overlap a boundary may intentionally retain their full raw delta; make that distinction explicit. Apply the same convention to long tasks and cover it with controls. |

Both edge reproductions are retained in `edge-controls.mjs` and `edge-controls.json`. They are virtual semantic controls, not extra actual-browser or product claims. Short reproduction:

```powershell
node artifacts/perf-hillclimb/timing-runtime-audit-round3-20261104T232323686/edge-controls.mjs
```

The reproducer imports the frozen runtime from `reviewed-source/` and writes a uniquely named reproduction result, so subsequent implementation repairs or reruns cannot replace the original red evidence.

## Integration requirements that remain outside this scoped review

Per-operation long-task arrays currently reflect observer deliveries while an operation is active; they are not an independently filtered attribution of every task to that operation. Use the explicitly time-filtered continuous window for temporal frame/stall claims and account for pending deliveries/censoring. Worker/save events still have their own transaction-marker scope. None of these arrays by themselves proves all awaited work or correct semantic output.

Whole Phase A still requires the two edge dispositions, actual per-job first-feedback and completion bindings, passive observer integration/overhead proof, all eight real-game oracles and product-path negative controls, frozen populations, repeated complete suites, adequate independent samples and fresh independent acceptance. No product scorecard or optimization is authorized by this partial mechanism review.

CPU/browser slot was released after the sequential checks. The audit's Chromium process and local server exited; no live process handle remains.
