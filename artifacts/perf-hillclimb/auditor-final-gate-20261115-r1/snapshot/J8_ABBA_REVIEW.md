# Independent J8 ABBA evidence review

**RESULT: optional instrumentation removal was insufficient to avoid the readiness failure. Whole Phase A remains NOT SOUND.** Auditor `/root/harness_auditor`, Codex gpt-6.1-sol / xhigh. This was read-only source/artifact assessment after the parent closed the fixed batch; no test, browser, build, source edit or new agent was started. Only this report was written.

## Fixed evidence and failed stage

Batch authority in the preserved performance checkout:

`artifacts/perf-hillclimb/j8-optional-abba-r1-20261115/{plan,results}.json`

Driver hash independently matches its pinned plan: `062fea08cc12e3093b64b6c02eef201cd91272f6d3e801942fb1ce48db95ac82`.

I inspected every exact leaf manifest, summary and `reference-failure.json`. Observation headers were independently extracted with a **streaming 4096-character maximum prefix per JSONL row**, discarding row bodies as they streamed; no full state/frame ledger was printed or materialized for those header checks. A separate bounded streaming field read found zero progressive warning entries in each retained failure-observation witness.

| Leaf ID under `artifacts/perf-hillclimb/` | Optional mode | Exit | Actual failed operation |
| --- | --- | --- | --- |
| `j8-optional-on-a-20261115-r1` | ON | 1 | `remaining-background-wait-to-prepared` — 240000 ms wait timeout |
| `j8-optional-off-b-20261115-r1` | OFF | 1 | Same operation and timeout |
| `j8-optional-off-a-20261115-r1` | OFF | 1 | Same operation and timeout |
| `j8-optional-on-b-20261115-r1` | ON | 1 | Same operation and timeout |

Each leaf has exactly the same three observation headers: `performance-entry-full-opening` passes, `opening-to-responsive-present` passes, then `remaining-background-wait-to-prepared` fails. These are four **failed complete-case attempts**, not four successful J8 runs. `completedCases` is zero for every leaf. Explicit reveal and the later two five-cycle navigation blocks were configured but never reached; their coverage is not inferred.

All four are normal exit1 with null signal, consistent `manifest.failed:true` / `summary.ok:false`, verified identity, and confirmed closed context/browser, disconnected browser, zero cleanup errors and **zero unconfirmed guarded work**. Lifetime status is correctly `cancelled`, not completed. No 600000 ms enclosing case cap was reached; the actual failure is the original 240000 ms readiness wait.

I independently compared each recorded source-file subset, build/build ID, contract, all five served asset hashes and original/served app variant against the pinned plan: no mismatches. The parent retains empty source/asset-change receipts. Every config remains reference/mobile4, gate/readiness240000, enclosing case600000, cycles5, private publication trace enabled; instrumentation is the only planned factor. Prepared gzip identity remains pinned. This is desktop Chromium/SwiftShader with a 4x CPU proxy, not a physical Pixel 6 measurement.

## Retained state and uncertainty

Every failure snapshot has **13/13 non-resource groups loaded, valid and hidden**, main/decision `artReady:false`, and main/decision **`artPrepared:null`**. There are zero recorded page errors, console errors, request failures, collection errors and progressive warning entries in all four. Those facts do not establish all atlas promises/current-context uploads or either terrain preparation completed.

The existing nullable seam is present: the minimal terrain wrapper starts without a `prepared` property and sets `prepared:true` only after successful preparation/adoption. Timing exports use `??null`, including the decision map's delegated seam. Preserve `null` literally; it is not false/ready and does not distinguish queued, in-progress, cancelled or otherwise unfinished work. The four failures do not yet localize that unfinished stage.

The initial expensive progress-reader concern is retained in `progress-read-interruption.json`. The later `progress-read-ordering.json` establishes first ON lifecycle/cleanup finished at **23:27:24.214 UTC**, before the metadata-read invocation around **23:28:05 UTC**; the first ON measured/post-clock work therefore did not overlap that particular read. Both receipts remain. This resolves only that specific ordering question, not all host contention or observer overhead, and does not promote any timing sample to acceptance.

## Preregistered interpretation

The frozen rule was: **all fail at the same gate → optional bundle removal was insufficient**. That is the observed branch. The experiment does not identify the product as the cause, rule out a contribution from optional instrumentation, prove common hooks harmless, or establish observer/native neutrality. It narrows the next investigation to mechanisms shared by both arms and the common preparation path.

No P95, failure-rate estimate, performance improvement, physical display conclusion or product optimization credit follows. Do not append more ABBA samples merely to seek a pass; the declared four-cell experiment is complete, with all failures preserved. The earlier native coverage termination remains a separate unresolved event.

## One next diagnostic: bounded common-path phase witness

**Do not optimize an assumed full-inventory readiness poll.** Source inspection confirms the actual 240-second reference predicate calls **`getTimingSnapshot()` without `includeArtwork:true`**. The optional 250 ms sampler uses full artwork inventory, and explicit endpoint/failure inspections use it, but that sampler was disabled in both OFF cells. Reducing an invented per-rAF inventory read would test the wrong mechanism.

The smallest useful next step is one **test-response-only phase witness**, shared by both optional modes, around the existing progressive-loading boundaries. Keep all normal product/harness endpoints and the 240-second gate unchanged. Its falsifiable question is: **which awaited stage has been entered without returning, or which existing load gate remains denied, before the timeout?**

Record only bounded phase transitions/scalars in a private test namespace:

- Progressive loader entered; atlas-loading await entered/returned, including its actual returned success flag.
- Existing pre-terrain cooperative wait entered/returned; last actual `canLoad`/`isCurrent` result and bounded denial/transition counters, obtained from calls the original path already makes.
- Main terrain preparation await entered/returned; decision terrain preparation await entered/returned.
- Existing ready/error/cancellation path reached.

Exact existing source authorities for those routed-response bindings:

| Site | Existing operation to mark |
| --- | --- |
| `src/views/progressive-artwork.js`, `loadProgressiveArtwork`, line3 | Loader entry. |
| Same file, `wait`, line5 | Existing `isCurrent()` loop guard; record its evaluated result without a second call. |
| Same file, lines6 and11 | Existing pre-idle and post-idle `canLoad()` checks; retain each actual result/counter without additional gate calls or changed short-circuit behavior. |
| Same file, line8 | Existing idle callback wait; mark enter/return if needed to distinguish gate denial from unreturned idle scheduling. Preserve callback/options. |
| Same file, line14 | Existing `await loadProgressiveChronicleArt(...)`; mark before/after the same await and actual returned `ok`. |
| Same file, line16 | Existing `await wait()` before terrain and following currentness guard. |
| Same file, line18 | Existing `await prepareTerrain(wait,isCurrent)`. |
| `src/views/ui-root-settlement-pixi.js`, root `prepareTerrain` callback, line1889 | Existing `await worldMapView.prepareProgressive(...)`; distinguish main terrain from its enclosing wait. |
| Same root callback, line1891 | Existing `await vassalNodeDecisionModalView.prepareProgressive(...)`; distinguish decision terrain. |
| `src/views/progressive-artwork.js`, line20; root callback line1894 | Ready handoff and actual pending-reveal assignment, with existing errors/cancellation branches preserved. |

These line references identify semantic source sites, not instructions to patch by line number. The implementation must inspect/pin the actual bundled counterparts and reject missing/duplicate/ambiguous bindings. A marker adjacent to an existing await does not require a replacement asynchronous wrapper; avoid introducing a new scheduling boundary.

Prefer inserting small markers **adjacent to existing awaits/branches in the routed response**, leaving the original awaits, Promise identities, call order, return values and error propagation intact. Do not add independent repeated state reads, await extra frames, call gates extra times, pause workers, change idle budgets or publish artwork. Bound the event list (for example32 transitions) and disclose overflow; do not log every frame/texture/gate call. The new phase data is read after completion/failure and never substitutes for actual readiness or selects an easier expected result.

A useful readout would distinguish unfinished atlas/upload work, waiting behind the shared cooperative gate, main terrain, decision terrain, or ready-callback handoff. Even a localized stage remains compatible with product work, common hooks and scheduling; the witness does not automatically identify a causal defect. If adding markers changes success/failure, retain that perturbation as a diagnostic limitation rather than claiming the old failure fixed.

### Minimal ownership and proof plan

Parent should assign one Implementer ownership of only:

- `scripts/perf-hillclimb/artwork-bundle-controls.mjs` and its existing focused test for the optional routed phase markers.
- Narrow `artwork-controls.mjs` flag/manifest/receipt plumbing. Default phase witness off must retain the old response bytes and behavior.

Parent owns a predeclared HARNESS addendum and fresh immutable two-cell plan. No app source, gameplay, asset, schema or pacing change is needed. An independent Auditor owns the affected review; no self-acceptance.

Before actual cases, focused controls must prove exact unique source bindings (missing/ambiguous targets fail closed), bounded events/overflow, original call counts/order, unchanged returns/Promise identity/error propagation, no game-state writes and correctly retained delayed/rejected/gate-denied phases. The actual served response/phase flag and witness must be pinned and present; a silently ignored new CLI option is not execution evidence. Preserve original raw outputs and readiness predicates.

Then run **two fixed fresh reference/mobile4 diagnostics, OFF followed by ON**, both with the same new common phase witness, original240000 ms gate,600000 ms enclosing cap,13 groups/16 atlases, cycles5 and private publication/feedback/asset hooks unchanged. Declare these two cells before execution; no conditional extra case. They are a new harness-mechanism population, separate from the completed ABBA batch and ineligible for speed comparisons. The new witness option does not exist yet; do not launch a purported phase-witness command until its implementation and manifest guard are reviewed.

Budget this as a narrow implementation/control pass plus at most two ten-minute case lifetimes and bounded cleanup. Reserve the final35 minutes of Cam's overall window; if there is insufficient time for the complete declared proof, retain the implementation/partial evidence and label unexecuted cases rather than compressing work or changing the gate. There is no need for a whole-harness rewrite or all-tail/native-pixel study to answer this next stage question.

No executable changes were made by this review. Parent retains execution/admission ownership.
