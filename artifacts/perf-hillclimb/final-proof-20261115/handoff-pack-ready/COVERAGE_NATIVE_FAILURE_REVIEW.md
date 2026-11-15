# Independent native coverage-failure triage

**UNKNOWN NATIVE RUNNER TERMINATION; NO PRODUCT/ORACLE FAILURE LOCALIZED. Phase A remains NOT SOUND.** Auditor `/root/harness_auditor`, Codex gpt-6.1-sol / xhigh. This is source/artifact-only triage using the diagnosing-bugs evidence-first discipline. Parent retains the diagnosis/execution slot. No tests, browser, builds, process probes, Windows event queries, source edits or reproduction were performed by this Auditor. Only this report was written.

## Exact observed attempt

Preserved performance checkout: `C:/Users/User/.t3/worktrees/laughing-waffle-proto/perf-hillclimb-20261104`.

- Frozen schedule: `artifacts/perf-hillclimb/continue-knowledge-coverage-r1-20261115/plan.json`.
- Failure is **index23**, `continue-knowledge-coverage-r1-20261115-23-424242-warm-mobile4-save-opening`.
- Parent result starts `2026-11-14T22:53:07.752Z`, ends `22:53:12.345Z`: **4,593 ms** launch wall duration.
- Direct child exit is **3221226505 / 0xC0000409**, rather than this runner's ordinary JavaScript success/failure exits 0/1. This code alone does not identify the faulting module or establish a particular native cause.
- `cell-23.log` is **zero bytes**. The leaf contains frozen fixture/corpus/harness/contract copies and an initial manifest, but no operation observations, success/failure summary, caught-error artifact, final manifest fields or cleanup receipts.
- `actualLaunchValidation.ok` is false because `manifest.failed` was never finalized to false; `cleanupVerified` is false. The latest chunk explicitly records failed index23 and empty source/asset deltas.

The durable count is **24 attempted cells: 23 exit0 cells and one native-terminated attempt; 12 later planned cells remain unexecuted**. The outer driver's field named `completed:24` counts recorded attempt summaries, not 24 successful jobs. Do not describe this as 24 passes or a complete smoke suite.

## What source inspection can and cannot localize

`run.mjs` writes its initial manifest after validating/loading the frozen fixtures, prepared packet and harness snapshots, **before** spawning/verifying the static server. That durable checkpoint was reached; fixture setup and initial source/configuration recording are present.

Subsequent served-asset hashes, Chromium version, GPU details, launch records and warmup evidence are first accumulated in memory. The manifest is rewritten only in the final cleanup path. Consequently, absent `servedAssets`, `launches` or Chromium fields **does not prove** that server verification, Chromium startup, warmup or the job body never began. Empty stdout similarly does not identify a stage: the runner normally emits its summary/error late. Source inspection supplies a last durable checkpoint, not a native stack or the next failed instruction.

The ordinary JavaScript job catch would retain the original error, and final cleanup would add launch/browser state and a finished manifest. Their absence is consistent with native/external termination bypassing JavaScript cleanup. It does not establish which code path caused that termination, nor rule out an earlier runtime/OS fault during otherwise legitimate product setup. Do not call it a proven product correctness defect, an oracle rejection, a harmless environment flake, a memory-corruption diagnosis, or a confirmed Chromium failure without further evidence.

The **4,593 ms is not an input-to-save latency**: no browser clock/operation start or completion witness survived. Preserve the launch failure and unavailable timing; never insert zero, report it as a fast completion, or convert this host interval into the missing browser metric. A frozen-workload `comparisonEligible:true` flag in an initial manifest cannot grant acceptance to an uncompleted attempt.

## Smallest next diagnostic — parent only

First retain scoped OS/process/port evidence. Parent has reported no remaining task-related Node/Chromium processes, but that is a post-failure observation, not proof graceful cleanup ran; the port check was still pending at this review. Verify the owned static listener/ancestry without stopping unrelated previews. Persist an **external post-crash cleanup receipt**, leaving the original false/missing cleanup fields unchanged.

Read the Windows application-error/WER records in a narrow interval around `22:53:07–22:53:13 UTC`, if available. Keep matching executable/process, faulting module, exception code, event time and report/dump identity. Correlate with the actual child PID where retained; an unrelated concurrent crash is not evidence for this attempt. Missing event records remain unavailable evidence. The exit code by itself should not select a native-cause label.

Then predeclare **one** standalone same-case reproduction under a fresh ID. Preserve exact source/assets, Node executable/version, flags, seed, warm-reset protocol, mobile4 configuration and logical input. Change only the output/run identity:

```powershell
node --experimental-vm-modules scripts/perf-hillclimb/run.mjs --id=native-repro-cell23-20261115-r1 --jobs=save-opening --seed=424242 --population=mobile4 --cache=warm --artwork=off --samples=1 --fixture-manifest=artifacts/perf-hillclimb/frozen-baseline-a9df52c-sourceproof-20261104/manifest.json --fixture-manifest-id=406f042f7e4a3142620b8d05023167d98893185d24347f4745740a3a3feac000
```

Use a fresh ignored parent wrapper to retain child PID, exact argv, executable identity, launch/end/exit/signal, complete stdout/stderr and source/asset comparisons. This does not require changing `run.mjs` or its timing/oracles. Admit no simultaneous browser/build/test load. Retain failure/cleanup evidence regardless of outcome.

Predeclared interpretation:

- Same native code again: the crash is reproducible under this bounded case; retain the OS evidence and next localize runtime/setup stages before a fix. Do not launch more copies merely to get a pass.
- Ordinary caught error/oracle failure: a **different observed failure mode**, retained separately; it does not explain the native termination automatically.
- Successful exact-state/continuation result and clean closure: **not reproduced in this one standalone diagnostic**. The original native failure remains unresolved. One pass is not a fix or a valid flake-rate estimate.

No minimized deterministic native reproduction or native root cause exists yet. Broad bisection, repeated retries, changed flags/drivers, or a speculative product fix would get ahead of that evidence.

## Honest coverage continuation

The original `resume.mjs` correctly refuses another run because it asserts all prior `cleanupVerified` values are true. **Keep this driver, plan, results and failed leaf unchanged.** Do not flip index23 to true, delete its row, replace its leaf, or disable the assertion. The diagnostic must not overwrite the canonical attempt or be silently substituted for it.

After external cleanup is evidenced and the parent assesses the one diagnostic, the remaining12 can be handled by a **separate explicit continuation plan** referring to the original plan SHA and exact original indices24–35. Copy their logical cells/argv under fresh continuation IDs; authenticate the same source/contract/assets before/between/after, preserve order and every outcome, and keep the original index in each mapping. This is authorized progress on the existing coverage task, not a reason to weaken its acceptance gates.

Report the composition honestly: original23 passing cells + original native-failed cell + whatever new continuation outcomes occur, with the diagnostic as an additional distinct attempt. Even if the diagnostic passes, the original schedule did not become a uniformly successful36-cell run; repeated-suite/tail acceptance remains blocked by the recorded failure and broader Phase A gaps. Do not pool new diagnostic timing into accepted tails or claim an infrastructure exclusion without a predeclared, evidenced disposition.

If no safe post-crash cleanup or repeated native behavior can be resolved within budget, stop additional browser workload and retain the blocked cells and next diagnostic. There is no need to mutate gameplay or the eight-job contract to make progress reviewable.

## Identities inspected

| Item | Raw SHA-256 |
| --- | --- |
| `scripts/perf-hillclimb/run.mjs` | `d1a81bf6d99be2e35ddc167e8688b11ae2907c0f35acb0526e8d0f3e53b6a714` |
| Original coverage `resume.mjs` | `991870000903d2aeb4183549c7172757a81e040c10bc5ce636928f9e3251f586` |
| Original coverage `plan.json` | `2ef6f8f4c6b87de9adaf0f69d6a663094a2acf06f1362696ce39846c34246f0f` |

Simulation state, RNG, schemas, replay, product behavior and all original evidence are untouched by this triage. No scored improvement, new scoped acceptance or whole-harness acceptance is issued.

## Standalone diagnostic and remainder mapping review

Parent's one predeclared unchanged-case diagnostic finished successfully: `native-setup-repro-r1-20261115`, exit 0, two strict observations, no source/asset changes, confirmed context/page/browser closure and no cleanup error. Its immutable compact receipt is `artifacts/perf-hillclimb/continue-knowledge-coverage-r1-20261115/native-reproduction-result.json`. **Native termination was not reproduced in this one attempt; no cause, fix or reliability conclusion follows.** Original index23, its missing cleanup receipts and false `cleanupVerified` remain unchanged.

I performed a **read-only mapping review**, not execution or syntax testing, of staged `artifacts/perf-hillclimb/continue-knowledge-remainder-r1-20261115/resume.mjs`. At this inspection it had no generated plan/results and had not run.

Inspected SHA-256:

| Item | SHA-256 |
| --- | --- |
| Staged remainder driver | `5f2f4939bed1261bc09a77d73f3d31c9ea1617e0d639f661752203355e8d890b` |
| Original plan | `2ef6f8f4c6b87de9adaf0f69d6a663094a2acf06f1362696ce39846c34246f0f` |
| Original 24-attempt results | `ae5741a35f7d633baaf8dfe34c35ffcf3aed499ad8c8fc360840bc863cc5d122` |
| Standalone diagnostic receipt | `0d10d4087d2c963258b9b3e6dc7e699db5cd4263b453dedc94185517a0b4cd29` |

**Mapping/source preservation: acceptable in the inspected code.** It derives exactly `original.cells.slice(24)` and asserts 12 cells; direct source-data inspection confirms original indices24–35, all seed99117, with the same cold/warm × desktop/mobile4 × three job combinations. Every new ID is in the remainder namespace, retains `originalIndex`/`originalPlannedId`, and changes only the `--id` argv field. No original cell23 retry is inserted into this schedule.

The new plan inherits original source/asset/build inventories; pins its own driver and original plan/results/reproduction receipt; rechecks those pins each chunk; checks source/assets before/between/after; refuses existing leaf IDs and unordered results; and stops admission after unresolved new cleanup. Each leaf retains `assertDiscoveryCell` checks for exact job, seed, cache, population, artwork, one sample and one measured browser launch, plus closed contexts/pages/browsers and no cleanup errors. Product failure rows remain recorded rather than being converted to passes. The original driver assertion is neither edited nor bypassed, and the standalone diagnostic is explicitly not a replacement for the native-failed attempt.

**One admission evidence gap:** the staged source describes recovery as independently inventoried but currently verifies/pins only the successful reproduction's own cleanup. That does not itself establish that the original abrupt termination left no owned server/process. Before first admission, retain a scoped external post-crash/post-diagnostic process and port18244 inventory receipt and pin it in this new plan. A current no-leftovers observation suffices for admitting the next owned workload; it must not retroactively claim original graceful cleanup or flip the old flag. Parent previously reported no task-related processes, but the original port check was pending at the prior review. This is a small evidence/plan addition, not a request for new product or oracle work.

After that receipt is identified/pinned, no other blocker was found in this narrowly inspected remainder mapping. Any driver edit requires recording its new hash before execution. The original failed schedule remains a failed schedule; this separate remainder may add honest construction coverage but cannot become a clean36/36 suite or close Phase A. Parent retains the execution slot and admission decision; this Auditor started no runtime work.

### Admission repair recheck

**SCOPED REMAINDER MAPPING/RECOVERY ADMISSION: ACCEPTED by read-only inspection at the revised driver identity below.** This is not runtime acceptance of the twelve unexecuted cases, resolution of the native failure, or whole Phase A acceptance.

Parent added `external-recovery-2304.json` without modifying the original plan/results/driver. The receipt's actual timestamp is `2026-11-14T23:03:19.5240151Z`: zero matching task-related Node/Chromium processes, zero port18244 listeners, retained unrelated source-preview PID40528, and `originalFailedCleanupStillUnresolved: true`. Its scope correctly identifies fresh external inventory rather than reconstructing original lifecycle or replacing missing cleanup.

The revised remainder driver now asserts those two empty inventories and the unresolved-original flag before plan creation, SHA-pins the receipt in the new plan and rechecks its bytes on every resume. The twelve-cell mapping and per-leaf/source/asset/cleanup checks are otherwise retained. No plan or leaf execution existed at this recheck.

| Rechecked item | SHA-256 |
| --- | --- |
| Revised remainder `resume.mjs` | `f3bd36a1e2e45773575b8b648959f4ffa31faaf508de5f1fea3335253b0bfc0e` |
| `external-recovery-2304.json` | `e2a1941b1c3b90eaeb971fc264aaed0df659104bcfa3ded6e82596119341299f` |

Original plan SHA `2ef6f8f4c6b87de9adaf0f69d6a663094a2acf06f1362696ce39846c34246f0f` and original results SHA `ae5741a35f7d633baaf8dfe34c35ffcf3aed499ad8c8fc360840bc863cc5d122` remain unchanged. The narrow admission evidence gap is closed. Parent can make the first mapped smoke concrete under this fixed orchestration, preserving every new outcome and the original unresolved failure. No Auditor process/test/browser was started; parent retains the execution slot.
