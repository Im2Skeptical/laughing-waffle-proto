# Phase A measurement contract

Contract draft A3, 2026-11-04. Required job scope frozen by Cam; exact executable fixture/oracle bindings are being refined against current code. **PROOF: NOT SOUND — construction in progress.** No product scoring or optimization permitted until independent acceptance. Refinements must be recorded before proof; later mechanism changes require refreshed proof/audit and comparable re-baseline. A1/A2 repaired tail-resolution, clustering, identity and repeated-look policy. A3 records observer purity, terminal/frame scope and immutable-oracle requirements, plus source-supported startup pacing. All changes precede any accepted performance baseline, product score or optimization; old intrusive discoveries are ineligible for timing comparisons.

## Build and machine

Original baseline: `ec49648ed1ef92d25a0d0a715f128044f907390e`, v1.1.52, ordinary main behavior. Product sources remain the variable under test; retain baseline and candidate source identities, harness revision/hash, fixture hashes and build fingerprint with every run. Harness edits are not product gains.

Machine DESKTOP-R0AMF0N, Windows 11 Home 64-bit build 26200, Intel i9-10900K (10 cores / 20 logical CPUs), 34,272,436,224 bytes physical RAM. Node v24.15.0, npm 11.12.1. Record exact Playwright/Chromium version, launch flags, GPU/renderer, viewport, device scale, CPU throttle, visibility, OS/power/load notes, build mode and fixture identity in each run manifest. Initial installed dependencies: package-lock at baseline, `npm ci --no-audit --no-fund`.

Required browser populations: desktop 1280x800 at 1x CPU; mobile-landscape layout 844x390 at 1x and CDP 4x CPU (desktop proxies). Software SwiftShader rendering must be disclosed, never presented as physical-phone GPU performance. Pixel 6 / Android Chrome is the documented floor; there is **no physical-device evidence** at present. Node diagnostics corroborate work/correctness only.

## Jobs and completion oracles

| ID | Required workload and start/end | Functional oracle outside timed interval |
| --- | --- | --- |
| J1 | Ordinary New Game, separate cold/warm and minimal/illustrated populations. Measure navigation to ready menu separately, then real New Game action through full opening forecast and useful input/visible frame. Include total navigation-to-useful. | Current regular-game initializer/seed, 20 regions, two player holdings at authored start, exactly five Practice slots; full opening coverage/terminal readiness and accepted real navigation input. Seed and forecast outputs agree with deterministic authoritative replay. |
| J2 | Real menu Performance New Game / Continue with actual prepared fixture, separated by cold/warm and artwork off/progressive. Prepared fixture generation and file size/hash reported separately, excluded only from runtime entry and never disguised as ordinary startup. | Actual performance path, no accidental reload or terrain bake on entry, correct namespace/fixture/run identity, full prepared coverage, Continue preserves serialized nontrivial progress, responsive real input. |
| J3 | Repeated map drag/pan, zoom and settlement open/close while simulation/forecast work is evidenced active. Input dispatch to changed camera/finished panel plus rendered frame; first feedback and settled completion separate. | Camera changes as requested; intended region/panel mode; close returns usable map; no action mistaken for map selection; work counters advance in the interval. Do not silently idle the worker to improve measurements. |
| J4 | Life Map entry, reachable node choice, selection/confirmation and return to responsive play. Time each stage plus complete transaction. | Correct active vassal/node/choice, real costs and official seconds, action recorded once, expected state and independent replay/RNG match; returned map accepts input. |
| J5 | Real pointer scrub/restore at covered anchors and off-anchor seconds during reveal. Input to correct cursor state/visible graph/map completion, with active reveal coverage recorded. | Exact target clamped to revealed coverage, read-only independent preview, serialized authoritative rebuild equivalence and unchanged frontier/RNG; no shared mutable preview state. Anchor/off-anchor populations separate. |
| J6 | Real purchase/action to invalidation, recomputation and correct usable preview. Record feedback, action completion and usable forecast separately. | Expected committed action/cost/slots, generation invalidated then updated coverage/summaries, old output not accepted, independent replay of action and forecast agrees. Preserve all seconds and loss detection. |
| J7 | Save/load and Continue for opening plus nontrivial seeded runs including actions/history/off-anchor progress; save dispatch to persisted completion, load dispatch to correct interactive state plus frame. | Persisted envelope and resumed state match source; same subsequent official ticks/actions produce equal serialized state and RNG; correct save namespace, schema and five slots. Include storage I/O, not enqueue timing. |
| J8 | Progressive artwork preparation during play and explicit reveal. Preparation begins when real background work starts; readiness and actual explicit reveal/frame completion separate. Retain frame/long-task samples and memory before/after repeated navigation/reveal. | Complete required assets ready, no involuntary art swap before explicit action, correct illustrated state after reveal, active play stays functional; failed required asset/retry recognized. Distinguish JS heap from total process/GPU memory; unavailable resource metrics reported unavailable. |

Any uncovered required job/population/oracle blocks complete Phase A. No quarantine counts as coverage. Legitimate authored diagnostic fixtures may supplement ordinary jobs but cannot replace them or suppress hazards in claimed regular-game performance.

## Timing, controls and samples

- Browser `performance.now()` owns start/end for E2E paths. Host round-trip/enqueue/CPU time never substitutes. Mark before real input dispatch and finish after semantic completion and a subsequent rendered frame; double-rAF is a frame opportunity proxy, not physical display scanout. Record feedback and settled completion separately when animations are intentional. Preserve intentional reveal pacing; report compute supply and visible reveal separately.
- Timing predicates use independently proven passive readers only. No global full debug snapshots, presentation/controller sync, knowledge-merging state access, restore or cache-warming getters under the clock. Predicates bind expected request/generation/target identity and must remain true through frame opportunities and finish. A transient true does not terminate the job. Terminal readiness is not first feedback; unmeasured first-feedback fields stay null and uncovered, never relabelled. Intervals after a frame marker may contain app work as well as driver delivery and are not subtracted as pure overhead.
- Shop staging binds the actual open/cached node, exact frozen offers/board/purchase IDs, matching source and expected draft count, with no active job/resolution and an open modal. The legacy pendingInteractionCount property has no assignment in current app code and is null in real DTOs; it is not an authoritative queue counter. Mirror the modal's actual >0 guard without asserting that null proves an empty queue. Subsequent real purchase/confirmation must work. Do not require a nonexistent zero-valued counter or relabel it as observed work completion.
- Saved UI state and authoritative replay state have separate exact expectations. Present and paid-time cursor commits explicitly pause the runner into planning (sim-runner.js commitCursorSecondInternal -> seekCursorSecond with paused:true -> syncPhaseToPaused). Derive that known expected UI pause on immutable baseline data with the frozen SDK; assert no other field changes. Compare raw/decoded output to that exact UI expectation and rebuilt output to the unchanged replay fixture. Never normalize actual raw flags, knowledge or RNG. Wrong raw phase/pause must fail even when replay reconstruction would repair them.
- Record continuous job-window frames/long tasks beyond transaction latency markers, including a declared post-action settling window. Keep right-censored trailing frame gaps and unavailable instrumentation explicit. Frame windows require positive duration and positive interval overlap; boundary touches are not observations. Transaction markers alone cannot establish hitch-free interaction or artwork preparation.
- Record raw observations (run/session/operation ID, config, fixture, input, elapsed, outcome, completion witnesses), timeouts/errors/dropped work, frame intervals and retained memory summaries. Error samples remain in reliability counts and block correctness gates; timeouts remain censored slow observations, not silently removed from tails.
- One browser workload at a time on this machine. No overlapping compile/test/profile jobs. User/external load and thermal/power drift must be reported. Fixed offered input schedules for responsiveness stress; record scheduled/dispatch/completion times and late/dropped events. Closed-loop transaction latency is labelled as such and cannot establish responsiveness under offered load.
- J3 offered gesture schedule:12 moves at nominal60Hz, then release at the next interval, with all host due times fixed before acknowledgements. Pan uses one pointer. Mobile zoom uses two trusted touch contacts centred on the map, initial span10% of viewport-map width in CSS pixels, expanding by1.35. Record14 protocol commands and each contact observation separately, stable actual pointer identity, coalescing, cancelled/missing events, queue/frame timestamps and protocol failures. No mouse wheel substitutes for mobile pinch. Host dispatch lateness above max(10ms, interval) marks generator saturation; calibration uncertainty above min(5ms, interval/4) is unresolved. Both block eligible offered-load evidence, as do missing required contacts/frame witnesses or invalid timestamps. These are pre-proof harness criteria, not product failures or accepted measurements.
- J3 captures a passive DTOv2 source once at the first trusted input, with its read timestamp/CPU cost retained. Default operations do not perform this optional read. An earlier host snapshot cannot establish work active at input. Require current pending forecast or current unready Life job and corresponding generation/source progress or a matching successful chunk reply within the operation. Retained desired coverage beyond terminal loss, a completed retained worker object, stale/unrelated messages and progress only before input cannot satisfy this check. Current in-flight work/delivery is a browser proxy, not a claim of continuous worker CPU occupancy; corroboration and overhead remain required.
- Browser-cache cold means new browser process/context with empty cache/storage except explicitly installed fixture. It does not mean cold OS disk cache. Warm means one declared unmeasured warmup followed by a new run with browser/HTTP caches retained and equivalent reset game/storage. Separate browser cache, prepared fixture, restored save and artwork variants.
- Stage smoke: one observation per job/population in at least three consecutive suites; this proves executability only. Before Phase A acceptance use at least 120 independent launches per scored job/population, with fixed equal offered operations per launch. Startup populations use independent starts. Retain actual launch/session/build/input-fixture/harness-mechanism/measurement-contract identities and globally unique observation IDs; reject duplicates, missing identities and unequal cluster counts for hard inference. Require explicit JSON population configuration. Never pool unlike seeds/fixtures/builds, mechanisms or contracts. No loop mean presented as an operation tail. Report nearest-rank P50/P95, min/max, count, error/timeout count, spread and uncertainty. Independent startup samples use exact binomial order-statistic quantile intervals (unbounded ends reported honestly). Repeated interactions use a conservative exact envelope: lower bound from independent launch minima, upper from independent launch maxima. Equal operation counts imply the operation quantile lies between those two population quantiles; a union bound covers the selected interval sides. Bootstrap of whole sessions is a diagnostic only. True independent identically distributed launches and fixed schedules must be evidenced, not inferred from IDs. Three suite means are insufficient for P95.
- Candidate comparisons use frozen order/crossover AB/BA matched fixtures, equal warmup, concurrent load zero. Compare against last accepted revision; periodically and on stop compare accumulated gains against original baseline. Predeclare minimum practical effect: at least 10% **and** 10ms for interaction, 10% **and** 100ms for startup/heavy paths. Use conservative bounds for quantile differences/ratios and require the practical-effect threshold to be supported, with no zero benefit. Every per-build/per-look hard-tail interval is 99%; at most two looks across baseline/candidate yields at least 96% joint coverage for each metric by union bound (not simultaneous coverage across all jobs). Inconclusive gets one predeclared extension to 240 independent launches with the same schedule, then remains inconclusive; choose another supported hypothesis. No rerun-until-win or extra promotion looks. A future Judge must freeze the complete comparison implementation and multiplicity assumptions before scoring.
- Hard candidate gates: 100% functional passes; no critical-job P95 >10% regression; no dropped required work; no unexplained retained JS-heap growth >10% or 20MiB (whichever larger) after equivalent repeated workload/settle/measurement policy. Quantile uncertainty too wide to exclude material regression means INCONCLUSIVE, not keep.
- Source-supported startup pacing: both ordinary and prepared New pass through `opening.begin(lossSec)` and the opening controller advances through 5s of authored presentation time. Preserve that pacing and include its wall time in reported time-to-useful. Report preparation/full-forecast-data readiness and opening reveal separately; reveal reduction is never a compute gain. The former 5s ordinary/2s prepared total targets could not include that intentional presentation and are superseded before baseline/scoring.
- Initial target bands (Judge freezes all job-specific anchors before scoring, not proof assertions): desktop/mobile-1x P95 immediate visible response <=100ms, interactive preview/restore <=100ms, ordinary New navigation-to-useful <=10s, prepared New action-to-useful <=8s and performance Continue <=3s. 4x proxy response <=200ms, preview/restore <=250ms, ordinary New <=25s, prepared New <=15s, performance Continue <=8s. Desktop/mobile-1x frame P95 <=33ms and max <=100ms; 4x proxy frame P95 <=50ms, max <=200ms. Authored node/travel animations likewise need separate compute/feedback/settled metrics and source-supported total allowances before their anchors freeze. These are engineering goals, not physical-device claims; no targets change after an optimization result to manufacture acceptance.
- Validity controls must exercise every distinct oracle and timing mechanism: deliberate wrong result/failed action must fail; real added 200ms delay in measured completion path must show approximately that addition; a deferred action must not pass before completion; stale generation, clamp bypass, wrong save and missing required art must fail corresponding oracles. No product behavior edits for controls. Restore controls before proof. Unit-only timer tests do not prove browser path sensitivity.
- Compare same build through every alternative runner path if used (A/A); identical path used for baseline/candidate otherwise. Independently corroborate representative worker, simulation-second, paint/frame, I/O and art work with matched diagnostic counters/trace. Measure instrumentation on/off overhead with matched runs; profiling stays out of acceptance timing. Unexplained >25% spread/drift is investigated, never automatically filtered away.
- Freeze logical input fixtures, raw expected states and a self-contained baseline oracle SDK before any optimization. Candidate code must not regenerate its own expected workload/results. Validate immutable corpus/SDK hashes on every accepted run, retain current actual product packet/hash separately, and prove same-build A/A conformance first. Generated fixtures/current-model expectations remain construction-only. Actual prepared packet key/encoding may change with product code; its fixed logical seed123 workload and expected outcome must not change or be relabelled as another seed.
- The central raw-row statistics reader also enforces frozen-workload eligibility: explicit comparison eligibility plus pinned 64-hex corpus and oracle-SDK identities are necessary for tail inference. Missing/false construction flags or unpinned identities stay diagnostic even at the numerical sample quota. Unlike corpus/SDK/eligibility groups never pool. These labels are necessary metadata, not a substitute for independent loader/oracle acceptance.

## Reproduction and roles

Dependencies: `npm ci --no-audit --no-fund`. Build: `npm run build`. Concrete source preview: `npm start` (capture printed address and build-info). No standalone prototype is an eligible target. Current **construction-only** commands follow; replace each NEW_ID with a unique ID. These do not yet implement the complete population/sample schedule.

```powershell
node scripts/perf-hillclimb/main-discovery.mjs --id=NEW_MAIN_ID --jobs=entry,performance,map,scrub,save,life --populations=desktop,mobile4 --illustrated=1
node scripts/perf-hillclimb/main-controls.mjs NEW_MAIN_CONTROLS_ID
node scripts/perf-hillclimb/artwork-controls.mjs --cases=reference,deferred,retry,exhausted --cycles=1 --id=NEW_ART_ID
node scripts/perf-hillclimb/artwork-controls.mjs --cases=early-publication --cycles=1 --id=NEW_EARLY_FAULT_ID
node scripts/perf-hillclimb/artwork-oracles-browser-controls.mjs
```

Main discovery currently covers seed123/cold and desktop/mobile4 only, plus a separate ordinary desktop illustrated sentinel. J8 defaults desktop/cold/progressive with an explicit required-resource retry off-mode control. Neither driver is the full frozen suite; mobile1, other seeds, warm/art populations, full-preview isolation, feedback, observer accounting/overhead, consecutive suites and tails remain required. Named negative controls are comparison-ineligible. The J8 missing-request control uses `--cases=deferred --control-no-request=1 --gate-timeout=1000 --cycles=1 --id=NEW_MISSING_REQUEST_ID` and must exit1 with the bounded request-observation timeout. Raw continuous sessions containing heavy diagnostics are not product-only frame evidence; explicit windows and overhead proof are required before acceptance.

Original Harness/Artwork Builders and the later main-binding Builder completed their scoped stages; root owns their integrated harness files, contract, evidence and repair ledger. The next full-preview Builder has separate ownership in PREVIEW_STATE_BRIEF.md. Auditor must be independent of the implementation they accept and own HARNESS_REVIEW.md. Judge remains separate from product Implementer. Root orchestrates and maintains STATE.md / ATTEMPTS.md. All exact revisions/raw run IDs/controls and limitations belong in PROOF_RUN.md and independent review. No maximum audit rounds; repair until sound.


## Feedback/native construction protocol, 2026-11-05

Phase A remains NOT SOUND. This construction extension preserves all eight jobs,
workloads, targets, independent-launch/tail policy and regression gates above.
`feedback-runtime.mjs` retains original HC v4 start/queue/terminal fields unchanged.
Each operation names a pure `feedback-bindings.mjs` reader. It samples arm and
window-capture quiescence before HC/app dispatch, a cancellable timer task, and
rAF reads. Drift fails closed; no silent rebaseline. Source loss, no-op, failed
reader, cancelled/replaced host, missing frames, deadlines and late validation
remain distinct. Raw cue/read/CPU samples, first semantic change, first changed
frame sample, rejected transients and two-frame persistent validation are kept.
`firstFeedbackMs` is the existing persistent retained-cue/double-rAF opportunity
upper-bound proxy, NOT first physical pixels. A one-frame/transient cue can be
missed by persistent validation; absence of that metric never proves absence of
paint. Original terminal readiness and stabilization gates are unchanged.

Bindings: J1 slot picker and launch loading are separate; J2/loading/J7 load
use connected viewport-visible loading ink; J3 applied camera and panel pose;
J4 retained Life, candidate, entry and decision state; category/purchase keys
exclude hover identities and use committed tag/purchase/tableau IDs; J6 includes
actual modal pose/disappearance, existing processing-view visibility and recap;
J5 retained issued scrub draw signature's scrubbing/second/cursor fields omit
autonomous bound/reveal fields; J7 visible Menu and recovery summary are distinct
from native I/O and hidden utility phase; J8 actual ready-seal symbol/readiness
and explicit reveal. Pure app extensions copy retained pose/signature/visibility
only. No new product cue or per-frame bookkeeping is added. Background artwork
waits may explicitly attach to the original HC startNow clock with no input
claim; loading feedback and ready-seal feedback keep different bindings.

Main Life strict reads execute first after each marker, in heavy correctness
windows outside frame/heap acceptance. Untouched draft/actions/decision/runner
bodies and costs precede assertions. Frozen Life addendum pin
6b7456c5594cf05393b81c16a3cfc3682bff8c92fbba8821bfe8af16e911d8b8 and original
base pin406f042f7e4a3142620b8d05023167d98893185d24347f4745740a3a3feac000
remain fixed. Use explicit `node --experimental-vm-modules` for run.mjs Life
and propagated child runs. Expected full DTOs execute authenticated frozen
zero-import bytes in a separate Chromium context, outside product windows;
actual outputs are not normalized. Only initial second0 five-action itineraries
are supported, followed by legal committed history16/17 and Present54/54/64.

Native diagnostics use `feedback-native-controls.mjs <fresh-id>`: twelve fixed
controls in desktop/mobile1/mobile4, fresh contexts, no scoring. Known faults
are comparison-ineligible. Queue200ms and capture-reader60ms stay separately
labelled. DOM render-delay250ms is a diagnostic visibility gate on the real
public slot-picker, not a proven Pixi/GPU-render seam. Transient hiding and
missing-rAF controls retain raw bounds/failures. Event Timing threshold16ms,
receipt capacity2048, fixed unique timestamp/target/type join tolerance0.25ms;
ambiguous/missing/excluded entries never become zero-latency observations.
Trace categories are discovered and restricted to supported devtools.timeline,
blink.user_timing, disabled-by-default-devtools.timeline.inputs and cc. One owned
ReturnAsStream trace,32MiB maximum,15s flush/drain,5s per read, complete/loss/partial
and handle cleanup records. Same-surface frame lineage remains UNPROVED until
raw native frame/surface identity is established; nearby paint is insufficient.
These limits govern diagnostic liveness, not the continuous performance goal.

The final representative schedule is frozen in the owned matrix plan before
execution, retaining all attempted cells/failures. Minimal all-job runs cover
desktop/mobile4 seed123 cold; other seeds cover Life/J5/Continue/J7 separately;
warm ordinary/prepared and progressive/illustrated artwork remain distinct.
This is representative construction, never three complete suites,120-launch
tails, negligible overhead, physical Pixel6 or independent Phase A acceptance.
Matched B/F/N overhead blocks/native render-lineage proof remain required if
not actually executed and resolved. `--feedback=off` preserves original HC-only
reference behavior for future matched controls; do not infer bias from virtual
control counts or single-launch timing differences.


The separate native gesture command is `node scripts/perf-hillclimb/feedback-gesture-controls.mjs NEW_ID`.
It runs actual12-move60Hz pan, actual two-contact pinch, and six independently
scheduled repeated wheel events on the real prepared game. A250ms delayed
completion is explicitly injected; these are mechanism-only controls and do
not replace active-work J3. Before/after PNG diagnostics are outside clocks.
The native control ordering asserts pre-reader <= original HC <= native target
and the timer task after the native target callback. Per-frame J7 acknowledgement
samples separately retain visible Saving and Saved summary text after actual
native transaction completion; unavailable samples remain censored. Costs and
512-sample overflow are retained. Saving is not assumed to paint.

Final representative driver: `node scripts/perf-hillclimb/feedback-proof-matrix.mjs NEW_ID`.
It records a complete plan before execution, exact app/harness/package/contract
hashes and dist/worker/style/prepared fixture bytes, executes stages sequentially,
and rechecks those identities before each stage and at the end. Canonical jobs
are normalized by the existing schedule helper. Other metadata documents may
change; the gate does not assert whole-worktree stability. Original raw continuous
sessions and post-action right-censored gaps remain; product arrays explicitly
exclude expensive frozen expected-data setup and post-clock diagnostic windows,
and those exclusions cannot prove smoothness across the gaps. All failures and
unexecuted required populations remain visible. The isolated expected realm is
closed after each DTO; it is never the product frame surface.


`--visual-evidence=1` main runs are separately comparison-ineligible diagnostics:
PNG captures precede arm and follow the post-clock oracle, with explicit visual
windows excluded from product frame arrays and all raw continuous data kept.
They show captured content only, not first pixels. The final driver includes
seed123 desktop/mobile4 visual sentinels for ordinary entry, Life, save, panel
opening and anchor scrub; native gesture controls separately capture map
before/after and J8 retains its existing drawing/publication/context diagnostics.
A failed active-work/reveal precondition in a screenshot diagnostic is retained;
it does not authorize an easier positive workload.


Final native trace diagnostics record Page root-frame identity and the actual
Menu DOM backend-node identity before trace start. Ten uniquely named same-realm
performance.mark brackets (five before/five after) derive trace-microsecond to
page-millisecond offset bounds. A valid clock requires ten unique marks, a
nonempty offset intersection and width<=1ms. Paint corroboration requires exact
root-frame and backend-node identity, not a nearby event. This establishes only
same-document Menu DOM Paint; compositor-to-content/frame and physical pixels
remain unproved. PipelineReporter fields are retained as observed; raw native
>53-bit frame identifiers are not joined through lossy JS numeric parsing.
Parser work and source/version/category/stream/cleanup identities stay explicit
and outside product acceptance windows.


Native protocol r3 preserves r2's mobile4 queued-input failure at1209.3ms against
its1200ms diagnostic cap. Normal native controls now have a5000ms liveness cap;
missing-frame remains1200ms and its explicit1300ms wait is unchanged. These are
resource/deadline controls, not latency targets or shortened product work. A new
actual clipped-slot negative control verifies ancestor overflow clipping. All
visible readers intersect ancestor clip rectangles; save acknowledgement requires
the entire summary inside that clip/viewport, a newly observed saving-to-saved
phase transition and a new native completion. Hidden status is only a causal
generation gate, never the visible cue. Old Saved text alone is insufficient.
Native JS receipt/callback/export costs are measured separately and quantized;
they do not establish complete observer overhead. R2's nonintersecting raw trace
clock brackets remain failed/unavailable alignment, without widened tolerances.
Same-node Paint identity can be recorded without claiming an aligned first-frame
or compositor/physical-pixel endpoint. Remaining native clock/lineage proof stays
explicitly open.


Gesture r1's first case failed before any offered gesture: its Present click
preceded full opening readiness and was correctly ignored. The superseded
runner's second incomplete case/process tree is recorded and closed. Fresh
gesture controls require actual completed full-opening coverage/loss, then a
real Present click and naturally settled map focus before arming. No input lock
is bypassed, model time skipped or worker paused. These remain prepared-game
mechanism controls, separate from active-work positive J3. Setup failures now
retain passive source/input/native evidence instead of only a timeout stack.


Observer protocol v3 corrects an exposed observation delay: if the timer task
sees baseline and the first changed cue is detected in rAF, that callback is
frame sample1, followed by sample2. It no longer waits an unintended third
callback. Task-detected candidates still require two subsequent sampled frames;
transient return/source loss still rejects. This changes an unaudited proxy,
not physical first-pixel claims or original HC terminal stabilization. V2 runs
remain separate and ineligible for comparison to this mechanism. A dedicated
virtual control requires exactly two sampled frames in this branch.

Gesture r2 retained2/5 passing outcomes. Its centre/rightward pan produced no
applied movement, and desktop wheel validation followed the final short-stream
event. Fresh r3 uses the exact canonical J3 clear-east-background pan coordinates
and direction, unchanged12 moves at60Hz plus release. Pinch uses the canonical
J3 zoom centre and genuine contacts. Repeated wheel is strengthened from6 to18
commands at the same40ms offered interval, all scheduled before acknowledgements;
this sustains same-source armed events after early feedback. Actual earlier
failures and raw semantic/first-frame/persistent-validation bounds are retained.
These diagnostic changes never replace or ease the canonical positive workloads.


Gesture r3's pan/pinch cells pass; its two wheel cells fail the former assumption
that18 CDP commands imply18 DOM events. Both raw ledgers retain17 trusted wheel
receipts and HC counts exactly17. Fresh r4 keeps all18 commands at40ms and asserts
HC/native-receipt parity plus actual repeated events, retaining offered/received
counts and unresolved missing-or-coalesced count explicitly. It does not label
that difference zero, prove protocol-to-DOM conformance, or weaken canonical
positive J3 pointer delivery/generator gates. Wheel controls are comparison-
ineligible lifetime diagnostics; unresolved wheel delivery remains a Phase A gap.


Matrix r1 was interrupted after exposing two real binding gaps, with unchanged
source/asset hashes through interruption retained in partial-provenance-after.
Canonical Settlement navigation calls prototypeView.setVisible and hides the
map; it does not use the legacy world-map detail-panel transition. Fresh binding
copies actual retained Settlement visibility/region/tab through that view's
existing passive semantic accessor, plus actual map visibility. The retained
legacy panel pose remains available for paths that use it. No240/320ms pacing
is changed or claimed to have run on the canonical surface-switch path.

Present now keys the issued draw signature's cursor and forecast-preview
presence, excluding the autonomously advancing scrub/forecast positions. This
rejects true source drift without treating reveal progression as input drift.
Existing real history Present still changes its drawn cursor. A registered pure
check executes the actual specific retained accessor/root wiring500 times with
active calls poisoned, and tests autonomous reveal, real Present, canonical
surface visibility and purchase-hover isolation. Product state/RNG/schemas,
rendering rules, original terminal gates and all workloads are unchanged.
