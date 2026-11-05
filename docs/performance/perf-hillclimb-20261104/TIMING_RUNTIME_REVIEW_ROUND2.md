# Independent timing runtime audit — round 2

**Scoped result: PARTIAL ACCEPTANCE.** The repaired synchronous terminal-readiness/frame-opportunity mechanism and finite harness-side deadline helper are technically supported at the hashes below. Timing-field attribution still requires correction or explicit restricted interpretation (R2-01/R2-02). **Full Phase A: PROOF: NOT SOUND.** No product score, performance gain, tail estimate or physical-device claim is granted.

Auditor `/root/timing_runtime_auditor_round2`, Codex gpt-6.1-sol / xhigh, separate from the root Builder. Date 2026-11-04. Only this review document was edited; no product/harness implementation changes. Audit evidence was retained separately. Read the performance-loop skill, repository instructions/invariants, HARNESS and prior artwork findings. This review concerns harness timing code, not simulation/timegraph implementation.

## Exact reviewed identities

HEAD `a9df52cbd6255ed95c51c9e7d524cf9ab557472b`. Harness files are uncommitted; the hash identifies the actual reviewed content. The actual Chromium run's source hashes matched the final reviewed files. Frozen copies are under `artifacts/perf-hillclimb/timing-runtime-audit-round2-20261104/reviewed-source/`.

| File under scripts/perf-hillclimb | SHA256 |
| --- | --- |
| browser-runtime.mjs | `28dbc6efd95572a75ead37e97cb3c01d97066120e8e2687a6ef627b1cfc467f4` |
| browser-runtime-test.mjs | `bf08405a107c7e30399becb9d0426ca1b69723eec0fcbccb99601d919ff19074` |
| deadline.mjs | `b38266f2e0e32344e1128150b7156868f95ad4f96a4c0d835ebcd1c44a747073` |
| deadline-test.mjs | `57b47ae59b4cd5d4fab35bbd789701a723e0ed06a8d044698d84e4a2a52be6d7` |
| mechanism-controls.mjs | `2c91391c429856bd77890d216dca2b69fb68627db32dc4ea028a7f5c61430ae0` |

## Independently reproduced checks

Executed sequentially, exit 0:

```powershell
node scripts/perf-hillclimb/browser-runtime-test.mjs
node scripts/perf-hillclimb/deadline-test.mjs
node scripts/perf-hillclimb/mechanism-controls.mjs artifacts/perf-hillclimb/timing-runtime-audit-round2-20261104
```

The virtual tests execute the actual serialized runtime in an explicit virtual-clock fixture. They check same-key false invalidation, false readiness during either frame, stale readiness at finish, rejected asynchronous terminal results, deadline overruns, absent frames and timer cleanup. A stable completion excludes later host delivery from its recorded frame timestamp. They are semantic controls, not browser-latency evidence.

The independent real Chromium run passed all seven mechanism groups:

- Trusted input and known deferred 200ms completion; a successful intermediate predicate does not terminate the later terminal wait.
- Same-key transient readiness through actual rAF callbacks: first true is replaced by false, then by the later 200ms result. The final semantic timestamp is later, not the first transient timestamp.
- Real Worker completion with the deliberate response-delivery delay inside the measured path.
- Committed IndexedDB transaction identity, wrong-slot distinction and replacement payload.
- Native Worker reference when interception is disabled, with other irreducible harness work still present.
- Precomputed-coordinate CDP input actually delivered during an existing renderer block; its trusted input timestamp is inside the busy interval and includes pre-handler queue time.
- Suppressed animation-frame opportunities reject at a finite deadline instead of leaving finish pending indefinitely while browser timers remain responsive.

Raw `controls.json` retains individual timings, input/frame/worker witnesses, exact contract/build metadata and Chromium/Node/Playwright identities. Environment is desktop Chromium 147.0.7727.15 with explicit SwiftShader, not a physical Pixel 6. `audit-evidence.json` records the reviewed hashes, outcomes and compact checks. These are controlled mechanism fixtures, not actual regular-game job runs or sufficient repeated tail samples.

## Repaired findings and accepted scope

**A8-02 is repaired for the reviewed readiness mechanism.** Same-key false results, changed explicit keys and later input invalidate the candidate. Both frame callbacks and finish revalidate the predicate/current candidate. The terminal probe keeps returning false until that readiness period survives the two frame opportunities. A Promise object cannot count as synchronous completed readiness. Pending frame completion is deadline-bounded, and successful/failed timer paths clean up their timeout.

The helper `withDeadline` correctly preserves original rejection identity, rejects a never-resolving wait and clears a long timer after success/rejection. Its deadline is a liveness guard; it does not replace browser timing with host elapsed time.

Root's retained actual no-request artwork control was inspected, not independently rerun in this audit: `artifacts/perf-hillclimb/artwork-no-request-control-r1/`. Actual artwork-off entry succeeds, then the deferred-request observation fails as a retained timed-out operation at its declared 1000ms gate deadline. That is evidence consistent with the A8-01 integration repair. Acceptance of the complete artwork integration, current source identities and remaining artwork findings belongs to a fresh artwork recheck.

This scoped acceptance assumes terminal predicates are synchronous, passive and bound to the intended request/generation/target, and that explicit predicate keys identify that same success condition throughout an operation. The runtime cannot infer semantic freshness from a generic ready Boolean or a reused key. Those bindings remain an independent all-job audit requirement.

## Remaining attribution findings

| ID | Priority / disposition | Evidence and required action |
| --- | --- | --- |
| R2-01 | Medium measurement attribution / open | `hostCompletionGapMs = hostFinishCalledAt - candidate.semanticEnd` includes the required frame wait, not just host delivery. It can also include real application work. An independent actual-browser boundary control placed a 200ms block later in the second rAF callback batch: recorded frame marker 86.1ms, block 86.2–286.2ms, host finish call 288.0ms. The named gap was229.8ms. Event Timing indicated the click's earlier next paint, so this is not proof that first response was late; it proves the excluded gap cannot be classified as pure driver/transport overhead. Rename/report the intervals accurately, distinguish semantic-to-finish-call from frame-to-finish-call, and do not discard later frame stalls from the overall stress window as host overhead. Raw: `same-frame-block.json`. |
| R2-02 | Medium metric semantics / open | `feedbackMs = semanticEnd - started` is time to the terminal semantic predicate, not an independently observed first press/feedback event. For a deferred job it measures final readiness. Rename it to terminal-semantic elapsed or label that definition explicitly. Actual immediate feedback needs its own job-specific observable and control before being scored against first-feedback targets. |

Neither finding changes the numeric frame-opportunity elapsed calculation that was validated here. They prevent broader interpretation of those fields as host-only overhead or immediate feedback. No invisible GPU work or physical scanout is proved by two rAF callbacks. Real-game paint/worker/I/O corroboration and continuous fixed-offered-input frame observation remain necessary. The runtime-local absent-frame deadline also assumes the browser event loop can run timers; a fully wedged renderer needs a host-side watchdog/teardown strategy in the collector, not a promise that an in-page timer can preempt arbitrary JavaScript.

## Gate remaining

The latch/deferred-completion repair is independently supported; the metadata definitions above must be fixed or explicitly deferred with restricted use. The main harness still needs all eight actual jobs, passive-selector integration and overhead proof, current generation/replay/clamp/save/art controls, frozen populations, complete repeated suites and adequate independent samples. This review does not accept those missing mechanisms or close other artwork findings. **No scoring or product optimization is technically authorized by this scoped review.**

CPU/browser slot was released after testing. The audit's Chromium process and server exited; no live handles remain.
