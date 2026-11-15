# Observer/warm draft static review, round 1

2026-11-05. Independent Harness Auditor, Codex gpt-6.1-sol / xhigh. I did not implement these drafts. **STATIC REVIEW ONLY / NOT EXECUTED. Phase A: NOT SOUND.** This review grants no scoped runtime acceptance, whole-harness technical acceptance, optimization permission, score, or performance win. Cam's eight jobs and all required populations remain required.

The preview-state Builder retained the exclusive CPU/build/browser/test slot throughout this review. I performed targeted text/metadata reads and wrote this artifact only. No Node execution, tests, simulation, builds, verify, browser, server, profiling, resource probing, task/process/PR polling, delegates, implementation edits, commits, or publication. In particular, I did not run the commands proposed below. Prior positive/control J8 runs use older source and are not proof of these frozen drafts; I did not reuse them as such.

## Exact reviewed input

Input directory: `artifacts/perf-hillclimb/observer-warm-static-review-inputs-r1-20261105/`. All source locations below refer to these copies, using the original paths in the manifest. I recomputed the twelve copy hashes with PowerShell `Get-FileHash`; all match `source-hashes.json`. That manifest's SHA-256 is `5f3e440b5c5fa12af9810527e8f27d25a81b140976cf4e67136de2e58726737c`.

| Original path (copy has the same basename) | SHA-256 |
| --- | --- |
| `scripts/perf-hillclimb/observation-windows.mjs` | `bb2b64fe4c3e4444e44d4493d70441a388827c7774d2b6d361c99266ee33d395` |
| `scripts/perf-hillclimb/observation-windows-test.mjs` | `8d63a92786e56e87e480fdd514e00bb85b8fc61675288860646c47e3515c6b31` |
| `scripts/perf-hillclimb/artwork-controls.mjs` | `738c6455eaccc6d5d3fb041c910197fc582ee5eccbf48d7b7180e862f66649eb` |
| `scripts/perf-hillclimb/scenario-storage.mjs` | `4a9d89c9fceaa9e677b317e636ac65ef9acce27e945e0a3578b10b428f6339a0` |
| `scripts/perf-hillclimb/scenario-storage-browser-controls.mjs` | `02e5723b379e03686d587050a0a927977f00d6ac4745c6e7ec0dfc7020248f4b` |
| `scripts/perf-hillclimb/run.mjs` | `61c7e2edcb2517b33efcc3f3bcf926c0e5af16eab301718fa88c5481fc6f3013` |
| `scripts/perf-hillclimb/main-discovery.mjs` | `a1bb2606865bf83114538c37cb5295a4f906c140154be295fa48e31f533f46db` |
| `scripts/perf-hillclimb/browser-runtime.mjs` | `f81efb2accba8b8ae3b7c35db109835c8639aa91c87c7e3ec69541fc608714f1` |
| `scripts/perf-hillclimb/deadline.mjs` | `b38266f2e0e32344e1128150b7156868f95ad4f96a4c0d835ebcd1c44a747073` |
| `docs/performance/perf-hillclimb-20261104/OBSERVER_ACCOUNTING_IMPLEMENTATION.md` | `a7fb9931773265b1bfc896a107813deeec81d14a5e6ecf8d09a3bc3ef9d373c9` |
| `docs/performance/perf-hillclimb-20261104/WARM_RESET_IMPLEMENTATION.md` | `2bae70eddbdeb75dbe0dd327a93c8322a5cd2e15581c0433bf9c3f01a6806a19` |
| `docs/performance/perf-hillclimb-20261104/HARNESS.md` | `a98cd87e6f8a56d518475272261c9cdd8c384fec35d81c34a4e427ac9241ba96` |

Read the performance-loop skill, root `AGENTS.md`, `ai/ai-context.md`, and `docs/performance/perf-hillclimb-20261104/STATE.md` (there is no root `STATE.md`). Before timegraph review, read the guardrails and their three current intent/implementation/supply-measurement documents. Also read game-design, aesthetic-UX guidance, relevant routing skills/repository-map sections and the sim-runner, UI-root, timegraph-model and timegraph-view READMEs before relevant source inspection. These are review constraints, not evidence that their described behavior ran.

## Findings requiring repair

Severity: P1 blocks the affected evidence mechanism or required coverage; P2 is a concrete correctness/reproducibility defect that must be repaired before promoting this driver. Findings are static deductions, not observed runtime failures.

### F1 — P1: the newly advertised other-seed Performance Continue cells cannot execute

Locations: `run.mjs:551-555`; `main-discovery.mjs:17-24,25-38`; `WARM_RESET_IMPLEMENTATION.md:15,24`.

The driver allows `performance-continue` with all three seeds and the implementation note recommends exactly that schedule. The runner immediately asserts `config.seed === 123` in `performanceContinue()`, before opening a page or loading `fixtures['later-history']`. Thus the proposed broad warm command necessarily fails its 424242 and 99117 Continue cells. This is a harness restriction, not a product restriction: the actual menu calls `session.continueGame(PERFORMANCE_SAVE_SLOT, ...)`, which loads the stored run; its Continue path does not enforce seed 123. Prepared **New** is separately and correctly fixed to its real seed-123 workload.

Shortest proposed reproduction after slot release: `node scripts/perf-hillclimb/main-discovery.mjs --id=NEW_SEED_CONTINUE_CONTROL --jobs=performance-continue --seeds=424242 --caches=warm --populations=desktop`. Static expectation: a scheduled cell exits nonzero without executing the intended Continue. F3 currently obscures its original assertion message.

Minimum repair: support the explicitly installed frozen saved-history seed on Continue while keeping prepared New fixed to 123; retain actual fixture/seed identity. Execute warm and cold Continue for both other seeds, asserting full raw/decoded/replayed state, RNG and official-second continuation. Do not claim those populations covered by rejecting or relabelling them.

### F2 — P1: artwork failures discard the raw continuous evidence needed to audit them

Locations: `artwork-controls.mjs:460-473,474-505,508-513,662-669`.

Continuous session/post-action telemetry and the artwork witness exist only as local variables in `finishSession()` until the final successful write. Any preceding diagnostic failure bypasses collection; any publication/page-error/model-invariant assertion failure after collection discards those locals. The failure handler writes passive state, windows and errors, then closes the context. It does not retain continuous frames, long tasks, trailing censoring, or the partial artwork witness. Per-operation rows cannot recover diagnostic or between-operation stalls. In particular, a timed-out/unclosed diagnostic is labelled open but the raw session to which that label applies disappears. This contradicts the claimed raw-telemetry retention for failed paths; it does not mean the run falsely exits successfully.

Short static reproduction: make the current-context inspection fail after a deliberate diagnostic stall, or make the post-observation full-state oracle throw. Follow the catch path: only the failure JSON/screenshot and existing operation rows are written; no continuous evidence is persisted.

Minimum repair: persist collected raw telemetry/witness before fallible final assertions, and add bounded best-effort failure collection before context teardown, retaining partial availability/censoring and explicit collection errors. Preserve the original error and open diagnostics. Meaningful controls: a diagnostic containing a known stall that throws; a never-completing diagnostic; and an assertion failure after successful continuous collection. All must remain failed and retain raw evidence or explicit unavailable/censored evidence, never an apparently clean surviving subset.

### F3 — P2: pre-page failures are replaced by an undefined-page error

Locations: `run.mjs:551-555,934-939` (also affects any failure before assignment in `newPage()`).

The job catch unconditionally calls `currentPage.evaluate(...)`. On the first job, `currentPage` is undefined until page creation. F1's seed assertion therefore enters this catch and throws a new TypeError before `withDeadline` or its `.catch()` can handle it. The intended `<name>-job-failure.json` is not written, and `failure.txt` receives the secondary error. A previous closed page can also be consulted instead of an actual current-launch document. The run remains failed, but the actual failed precondition/source scope is lost.

Minimum repair: bind/reset page identity per launch, guard absent/closed/current-launch pages, and always serialize the original setup/job error with the launch identity and unavailable diagnostic reason before optional reads. A control that throws before page construction must retain that exact error with no invented operation timing, and must not read a prior launch's page.

### F4 — P2: alias expansion makes the saved discovery schedule differ from the executed schedule

Locations: `main-discovery.mjs:16-21,25-38`; `run.mjs:922-929`.

Only `map` expands in the driver. The child independently expands `scrub` into two jobs, `save` into save plus save-opening, and `performance` into New plus Continue. For example, `--jobs=save,save-opening` passes the driver's duplicate check and saves two cells, but the save child already executes save-opening; that opening job executes again in the second cell. `--jobs=performance,performance-continue` similarly repeats Continue. A scrub cell means two browser launches while the schedule describes one job. Raw launch IDs distinguish these launches, but the top-level schedule/result counts do not describe or enforce the actual fixed workload, contrary to the duplicate/schedule claim. This is especially material when converting the construction driver to complete equal-operation suites.

Minimum repair: normalize aliases once into an explicit executable-job schedule, validate duplicates after normalization, and ensure each child executes exactly its declared cell (or enumerate and validate every expansion in the saved schedule). Controls should compare saved planned launches against actual launch/job identities for `save`, `scrub`, `performance`, and alias-plus-explicit selections. The current file's lack of a complete final suite remains a separate gate; fixing alias accounting does not establish that suite.

### F5 — P1: unbounded final J8 browser reads can hang without a failure artifact

Locations: `artwork-controls.mjs:460-473` and the case lifetime at `596-669`.

The final operation-marker, continuous-window and full-witness reads use bare `page.evaluate`. There is no enclosing case deadline. `page.setDefaultTimeout()` does not bound a page evaluation awaiting execution/completion. A renderer that stops servicing evaluation after the last operation can therefore hang at line 461, 468 or 472 indefinitely, outside both the bounded post-action frame wait and `diagnostic()`'s host guards. The failure handler/summary/browser teardown are never reached. Bounded manual diagnostics do not make this final path bounded.

Minimum repair: apply finite host guards to final reads and a case lifetime/cleanup guard, preserving timeout/censoring and the original failed stage. Prove liveness with a deliberately nonresolving final evaluation after a valid operation; the case must terminate within its declared bound, retain an explicit failed/unavailable observation and close its owned browser. Do not substitute the host guard duration for a successful product latency.

## Source deductions without an identified defect

These are inspection observations only, not passing test results or acceptance:

- `observation-windows.mjs:20-42` uses positive overlap, ignores zero-width diagnostics, preserves endpoint touches, removes crossing frame/task samples whole, clips only gap-duration accounting, and unions nested/touching gaps without double-counting. The synthetic example's union is 30 ms and its surviving frame ends are 15, 20 and 100. An open window from 35 has a 65 ms clipped union and retains frame ends 15, 20 and 35. The pre-window crossing test is consistent with the implementation. Copying is adequate for the current flat numeric frame/task records and flat scalar diagnostic fields; this is not a generic deep-copy guarantee for future nested metadata.
- No E2E latency subtraction was found in the new attribution call sites. Operation timing still comes from the runtime, and `preparationTiming` retains full input/work-start-to-ready-frame spans. The result is correctly named `outsideDiagnostic`, with explicit gaps/censoring/availability and no smoothness certificate. The helper's whole-window frame-evidence flag relies on the supplied raw availability/censoring data and has no independent completeness/clock-identity proof. It must not be used as a standalone acceptance oracle.
- New manual J8 diagnostic call sites cover atlas inventory, legacy geometry, drawing lookup, current-context texture inspection, heap reads, normal screenshots, correctness oracles, exhaustion polling and the deliberate fault. Nested windows are retained and unioned. Rejected diagnostics remain open because a rejected Promise race does not cancel remote work. The failure screenshot at line 664 is outside this wrapper; any repaired failure collector must account for that work too.
- The warm witness is replaced after final navigation and carries the new document's `timeOrigin` and URL. The warmup/reset timestamps are retained separately. No cross-document timestamp subtraction was found in that setup. This is source-level identity handling, not proof that native browser/worker lifecycle and resource caching behaved as intended.
- `scenario-storage.mjs` targets the actual three current stores/key paths, checks correspondence, waits for transaction completion, aborts on synchronous enqueue/clone failures, restores preferences only after commit and closes its connection. Caller recapture/deep equality checks exact logical records/preferences; the immutable fixture text is checked before warmup. Native abort behavior and transaction/fresh-document races still need execution. Browser/HTTP cache retention is explicitly distinct from carried gameplay/restore-LRU state. No candidate regeneration of a frozen expected fixture was found in the frozen path; generated fallback remains construction-only.
- The central statistics reader distinguishes failures/censoring and pinned workload eligibility, but cannot create missing failed-launch or missing-telemetry records. J8 rows explicitly remain comparison-ineligible. Runtime first feedback remains null, and double-rAF is expressly a frame-opportunity proxy.

I found no statically certain failing assertion in the new `observation-windows-test.mjs` or the native storage-control assertions. They are **NOT EXECUTED**, so this is not a pass claim. The proposed non-123 Continue integration schedule has the definite static failure in F1. Assertions/comments are not proof of the mechanisms they describe.

## Required later measurements/audits, distinct from the defects

After the exclusive slot is released, repairs require refreshed focused tests plus exact-current-source actual-product controls. Keep all failures and source identities; none of the old 28-observation J8 results or early-publication results validate these edits.

At minimum: verify successful and failed/unclosed diagnostic attribution against raw stalls and exact union accounting; show unchanged full latency/preparation spans; perform native storage mutation/restore/abort and cache controls; then actual warm ordinary/prepared New/Continue and nontrivial histories with new-document menu identity, all storage fields, frozen expected state/RNG/continuation, actual resource-cache corroboration and terminated warmup workers. Exercise desktop/mobile1/mobile4 and all required seeds/art populations without pooling unlike cells. A native isolated cache test alone does not prove actual-game cache hits.

Matched sampling/private-hook/driver on-off and A/A overhead evidence, independent native corroboration, first feedback, full serialized mutable-preview equality/isolation, direct stale-commit control, a frozen complete schedule, at least three consecutive complete smoke suites, adequate independent per-population tails/uncertainty and independent whole-harness audit remain required. The preview-state Builder's separate work was not reviewed or accepted here. These are existing proof gates; this review does not request gameplay changes or optimizations.

## Supporting interface scope

Auxiliary source reads were targeted integration checks, not a replacement frozen harness review. Supporting file hashes recorded during review:

| Path | SHA-256 |
| --- | --- |
| `scripts/perf-hillclimb/freeze-corpus.mjs` | `183d90188538396078becfc9a87bab1675115de7bebcc13463f6d30448271f79` |
| `scripts/perf-hillclimb/save-state-oracle.mjs` | `6b8633f93324007f6a2592fb0de93b7d514d957875261187146c8df2962e0aff` |
| `scripts/perf-hillclimb/main-job-oracles.mjs` | `9e162823376c56cba35b2fe0b43fade1c9b18462a3251bcf21bbca7cdb276d24` |
| `scripts/perf-hillclimb/active-work-oracle.mjs` | `678596e562a19bde6a8fba7ce715b64974a2493903c56d4c1d2aaf3a2e749778` |
| `scripts/perf-hillclimb/statistics.mjs` | `9443d67041037fe97b1f9198067be8cfb2e0a9c065b40ed02f6ef24521bd4153` |
| `scripts/perf-hillclimb/artwork-oracles.mjs` | `4734399c176668d6e0da3bee14f961eaa9c9595869e3627a9908e3f7a12030d2` |
| `scripts/perf-hillclimb/artwork-bundle-controls.mjs` | `74da29d61ca2758498170efeca46e38e77148e26f91ff6e72a05c92a463d80ac` |
| `scripts/perf-hillclimb/browser-runtime-test.mjs` | `d46195a4a3c65b70a9b244b72fc1309932e2affbd4cb1beeb65833514dd37bd7` |
| `scripts/perf-hillclimb/deadline-test.mjs` | `57b47ae59b4cd5d4fab35bbd789701a723e0ed06a8d044698d84e4a2a52be6d7` |
| `src/controllers/sim-runner/save-storage.js` | `dea15a4ebe0bf0a497bb094e20f626f5d290477f54a98e143dcf8efc3e95ce36` |
| `src/controllers/game-session-controller.js` | `91831867ab422071b778d0d693f97e4eeef0687bf7823640237082f8fe41c07c` |
| `src/views/game-menu-dom.js` | `54dae44cccd256b2c65d51a48bb4647b06dc9760b66522ad9c78e72fabbb124b` |

Additional narrow routing/presentation reads located the live debug publication/geometry integration; no acceptance is asserted for concurrent preview-state changes. No product files were changed. Simulation state, RNG, schemas, replay and layering are untouched by this review artifact.

**Disposition: five unresolved static findings; STATIC REVIEW ONLY / NOT EXECUTED; Phase A NOT SOUND. No source-only acceptance.** Root may repair and execute meaningful controls after slot release; a later independent recheck is a new review task.
