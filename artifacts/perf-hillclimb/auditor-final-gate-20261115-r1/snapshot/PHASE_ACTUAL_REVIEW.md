# Independent actual phase evidence review

**SUPPORTED: both main-terrain preparation awaits remained unreturned through the retained post-cancellation snapshots. The inner cause is unresolved. Whole Phase A remains NOT SOUND.** Auditor `/root/harness_auditor`, Codex gpt-6.1-sol / xhigh. This task performed bounded post-closure file analysis and narrow source reads only. No browser, benchmark, build, product/harness edit or new agent was started. Parent owns any subsequent implementation.

## Independent extraction and identities

I independently extracted from original sealed leaves, not the parent's derived `phase-0`/`phase-1` summaries:

- `artifacts/perf-hillclimb/j8-phase-off-20261115-r1/`
- `artifacts/perf-hillclimb/j8-phase-on-20261115-r1/`

Inputs were original manifests, summaries, failure JSON, failure-observation JSON and observation JSONL, each checked **≤2 MiB before reading**. The largest was692,972 bytes; no state/frame body was printed. Selected original operation markers, phase witnesses, identity comparisons and input SHA-256 values were reproduced into:

`artifacts/perf-hillclimb/auditor-phase-actual-20261115-r1/`

| Independent artifact | SHA-256 |
| --- | --- |
| `input-sha256.json` — exact original input identities | `2233227354bbba4723bb9e7b6b2aa7d8ba39bd485bdb1ae8e1c6ff6cfc36e51d` |
| `off-extraction.json` | `29b61bfa2b59f6d73daf7ea018a250ce3fa047fce4df1256c9e5df97b4f463af` |
| `on-extraction.json` | `11c09a15f02cd98ba9634c6226fe0d5d003de069814a09656fcedb6729467030` |

Both cases are normal exit1/null signal, original240000 ms preparation-wait failures, identity/phase-data available, confirmed context/browser closure, disconnected browser and zero cleanup errors/unconfirmed work. Completed reference cases are zero. Opening and Present passed; explicit reveal and later configured navigation cycles were not reached.

Independent metadata comparisons found no source-subset, build, contract, served asset/gzip or response-variant mismatch with the frozen phase plan. Actual observed namespace is present/version1. Scope remains fixed OFF then ON, reference/mobile4, cold prepared seed123, cycles5,240000 ms readiness/gate,600000 ms enclosing cap, all13 groups/16 atlas entries and unchanged common hooks. The served phase response is `17f47be07781132627ffca0cad656800c1f77b9871b58c241492ad16c467ead6`. No enclosing600-second cap triggered.

## Original markers and what they establish

All timestamps below are **document `performance.now()` milliseconds**, not time since entry or an official simulation second:

| Original datum | Optional OFF | Optional ON |
| --- | ---: | ---: |
| Atlas await entered | 62,228.4 | 61,917.3 |
| Atlas returned `ok:true` | 84,556.5 | 84,426.6 |
| Main terrain await entered | 85,298.0 | 85,454.1 |
| Original failing operation started | 64,049.5 | 63,662.0 |
| Original HC cancellation marker | 304,235.1 | 303,672.6 |
| Failed-row phase collected | 304,677.3 | 304,690.0 |
| Collection after cancellation | 442.2 | 1,017.4 |

I verified the markers against `browser-runtime.mjs`: `runtime.cancel` stamps `op.finished` with the original document clock, cleans up and clears the active operation. These failure rows have no successful completion clock. Their240,185.6 /240,010.6 ms elapsed values are cancellation intervals, **not successful readiness latencies**.

Each original phase witness has exactly one retained loader, no dropped loaders and no unlinked sites. Its per-loader site counters record one successful atlas return and one main entry, but **no main return, decision entry or ready handoff through collection**. The final failure-observation copy agrees, collected447.5 /1,034.9 ms after cancellation. This supports an unreturned main await at cancellation and through the later snapshots; a return would write the inspected main-return site before subsequent currentness/decision checks. This conclusion uses persistent per-site counters, not missing events from the truncated array.

Both event lists hit32 slots; **1,217 /1,185 additional events were disclosed as dropped**. The per-site/gate summaries continue updating and preserve the relevant entered/unreturned sites. Their last phase is an inner `idle-enter`, not a contradictory successful main completion.

Cooperative waits were still being entered and returned: whole-loader wait-enter counts311 /303; idle-return/wait-return counts310 /302, with latest returns at304,588.0 /304,664.3 ms. Thus ordinary shared yielding continued well after main entry; this is not evidence of one permanently unfired idle callback. All *recorded* gate results have zero denials and latest values true, but those sampled calls do not establish continuous gate state or every gate's value at the original deadline. Some latest gate timestamps are post-cancellation.

Both final states retain13 loaded/valid/hidden groups, main/decision `artPrepared:null` and `artReady:false`. Page/console/request/collection errors and progressive warnings are zero. Raw `null` remains an unset completed-preparation flag, not false/ready or a missing accessor. It cannot identify an inner stage.

## Narrow conclusion and remaining ambiguity

The phase witness works on these actual routed responses and narrows the failure from “artwork never ready” to **main preparation entered and did not return**, after atlas loading successfully returned. The decision map was not yet entered. This remains true with optional instrumentation disabled.

The inspected main `prepare` still includes asset preparation, a cooperative terrain bake, flatten/render work, a second cooperative regional-variant build and final state/update work. Existing evidence does not distinguish which inner main substage dominates, how much wall time is yield waiting, or whether common hooks affect it. No product cause, stuck native/GPU operation, pure CPU duration, complete observer neutrality, performance gain, P95 or whole-harness acceptance follows. The earlier native coverage termination remains separately unresolved.

## One smallest useful next proof: paired wait/progress counters

**Idle-wall totals alone are smaller but incomplete; step counts alone are also insufficient because generator steps have unequal cost.** The useful discriminator is one small paired, response-only counter seam: aggregate the **existing cooperative-yield wait wall spans by active phase**, alongside the main job's **existing `runCooperative` steps/yields/longestStepMs**. This can test whether yield waiting accounts for most of the observed main window while work advances, versus substantial other work/waits. It still must not describe the residual as measured pure CPU.

Exact existing semantic source sites for parent implementation:

- `src/views/progressive-artwork.js`, existing `wait` entry/return and its existing idle/denied-delay awaits. Reuse the already-injected phase markers to accumulate paired intervals; add no gate call, timer or await.
- `src/views/world-map/illustrated-terrain.js`, `cooperativeOptions(stats)`: the background path explicitly uses `sliceMs:8` and `yieldTask:backgroundWait`. Do **not** change either policy.
- Same file, main `prepare`'s local `cooperation` object and its existing awaits of `runCooperative(bakePixelTerrainSteps(...), cooperativeOptions(cooperation))` and `runCooperative(prepareRegionalTilesSteps(...), cooperativeOptions(cooperation))`. Tag those two job identities and associate only their diagnostic scalar progress with the captured loader/main ID. No private mutable reference enters exported JSON.
- `images/dark-fantasy/map-generation-prototype/cooperative.js`, `runCooperative`: existing `stats.steps` update, the existing `await yieldTask()`, and existing `stats.yields` update. Copy bounded scalar progress at those already-existing boundaries; do not step the generator again or insert a scheduler boundary.

Parent should own implementation only in the response-injection helper and focused controls, plus minimal version/receipt plumbing if needed; no app source, scheduling policy, workload, oracle or timeout change. New data must have its own mechanism/version identity and fresh plan; preserve both completed phase cases.

Retain completed wait total/count/max, current open wait start/right-censoring, phase tag and progress snapshot timestamp. Guard unmatched/overlapping pairs and mixed loader IDs explicitly; do not sum ambiguous/overlapping waits into an apparent wall fraction. Report totals **through collection**, or an exactly declared snapshot boundary, rather than silently treating a later snapshot as deadline state. Preserve original HC cancellation markers separately.

Focused proof must separate known virtual work from known wait (for example a costly generator step plus a distinct delayed yield), preserve original step/gate counts/order/return/errors, detect an open/cancelled or overlapping wait, and show all bounded phase/progress counters survive. A predeclared hypothesis such as “cooperative waits account for at least80% of the observed pending-main window” is falsifiable from these bounds; if the bounds cannot resolve it, label the result inconclusive. A small wait fraction points to *other work/waits*, not automatically heavy CPU. Progress counters identify that the cooperative job is actually advancing and which of the two jobs is active.

After focused controls and independent affected review, admit **one fixed optional-OFF, phase-enabled reference/mobile4/cold seed123 case**, original240000 ms readiness,600000 ms enclosing cap,13 groups/16 atlases, cycles5 and all common hooks/oracles retained. This is one new diagnostic population, not an extra sample appended to either finished experiment. No automatic second case or retry. If the new observer changes completion, retain perturbation/ambiguity rather than claiming a fix.

Keep this proof to a short implementation/control lease plus independent check and one bounded case (aim under20 minutes). If the paired seam cannot be made valid within that budget, hand back the supported main-await localization rather than launching an unreviewed profiler. New actual-case admission must precede01:45 UTC and preserve the final35 minutes of Cam's overall run; no policy/workload reduction buys time.

No additional review iteration, implementation or benchmark was started by this task. Parent owns the next decision and execution; the two actual failures and Phase A's NOT SOUND gate remain intact.
