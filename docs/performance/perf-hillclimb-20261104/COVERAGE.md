# Construction coverage ledger

2026-11-04. All eight jobs remain required. **No job is yet accepted for Phase A.** Passing application tests or a standalone mechanism control does not fill missing end-to-end oracle/timing/population proof.

| Job | Executable path / discovery | Remaining proof blockers |
| --- | --- | --- |
| J1 ordinary New Game | Real ordinary menu, seed preference, full opening forecast, Present input reached in first discovery. | Discovery exceeded deadline and mislabeled artwork; repaired path requires fresh runs. Full initial click and navigation timing, correct cache/art reset, complete oracle and all required populations/samples. |
| J2 Performance New/Continue | Actual prepared fixture/menu path and separate current `performance-dev` save; New and nontrivial Continue get separate launches. | Execute and validate precise bindings, fixture/file hashes and preparation cost, full correct continuation, cold/warm/art modes and uncertainty. |
| J3 map/settlement under active work | Pointer camera/panel primitives scaffolded. | A completed opening has idle forecast compute despite continuing reveal. Need real action/recompute overlap evidence; fixed offered schedule, queue/lateness/drops, rendered completion and oracle controls. |
| J4 Life Map | Current ordinary action-derived fixture and canvas hit targets. | Execute real entry/choice/confirmation/return, assert exactly-once costs/time/state and replay equality, full populations/control/overhead evidence. |
| J5 scrub/restore | Pointer scrub/anchor and off-anchor scaffolding. | Exact target/reveal clamp, actively advancing reveal, correct independent authoritative state, unchanged frontier/RNG and mutable-preview independence; negative controls and tails. Concurrent compute is an additional diagnostic, not a J5 requirement; J3 separately requires actual active work. |
| J6 action/reforecast | Actual first-shop transaction path scaffolded. | Execute action and full invalidation/new-generation completion, prove actual usable preview matches replay and reject stale output; keep heavy independent checks outside timed interval. |
| J7 save/load | Current full-map IndexedDB namespace, committed-transaction witness, untimed full-state checks; all3 seed corpus now passes15 fixtures after separately verified storefront correction d05bab34. | Execute source/load/resume equivalence and subsequent official ticks, fail closed on all serialized/RNG differences. Any intended persistent-knowledge merge needs an independent exact expectation. No seed excluded. |
| J8 artwork | Progressive real preparation/explicit reveal path scaffolded; Worker/IDB/frame instrumentation available. | Execute actual prep/reveal controls including required-asset failure/retry, pre-action no-swap, responsive play, before/after repeated navigation memory and frame stalls; separate art populations from minimal graphics. |

Common blockers: exact runner/config/fixture contract freeze, whole-suite 3 consecutive smoke runs, all required populations and sufficient independent samples, measured instrumentation overhead/native reference, independent actual-browser reproduction, and complete Auditor acceptance. Statistics subreviews do not accept any of these common gates.

Mechanism fixtures passed in `artifacts/perf-hillclimb/mechanism-controls/controls.json`: trusted input queue delay/deferred visible completion; wrong/late result rejection; delayed Worker completion; committed IndexedDB identity; native Worker reference. Product-path negative controls remain required.

Current commands (construction only, one browser workload at a time):

```powershell
node scripts/perf-hillclimb/statistics-test.mjs
node scripts/perf-hillclimb/mechanism-controls.mjs
node scripts/perf-hillclimb/run.mjs --jobs=entry --artwork=off --population=desktop --cache=cold --samples=1 --id=smoke-minimal
```

See BUILDER_NOTES.md for evolving command bindings; these are not a substitute for final frozen reproduction instructions in HARNESS.md.

Scope clarification before proof: the initial construction ledger and root messages overstated J5 as requiring concurrent compute. Cam's J5 requires scrubbing during reveal; cached supply with an actively advancing reveal is eligible and must be labelled honestly. J3 still requires actual simulation/forecast work in flight. No user job or oracle was removed.
