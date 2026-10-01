# Timegraph performance audit

> **Historical note.** Written 2026-09-24 against baseline `e30ce3e` / target `6556f38`. Its recommendations were largely implemented in commits `6e60b57`, `979e46e` and `f12196c` (state is now v24 / config v15), so treat the measurements, schema numbers and sequencing below as historical. Current intent: `docs/timegraph-ux-and-capacity-brief.md`; guardrails: `docs/timegraph-optimisation-guardrails.md`. Body below is unedited.


Audited 2026-09-24. Baseline: `e30ce3e`, using the supplied investigation worktree and harness as read-only evidence. Current target: `6556f38`, isolated branch `codex/timegraph-performance-audit`. No production changes; unrelated work in the original checkout was left untouched. Do not apply the abandoned branch.

## Verdict

The brief correctly identifies repeated validation, dense restore serialization, repeated worker initialization, and summary construction as avoidable costs. Preserve its rejection of atomic one-second time, blanket structuredClone replacement, gameplay shortcuts, and reveal tuning as the first patch.

Revise the implementation order and two safety claims:

1. Retain every-second summaries initially, but calculate repeated aggregates once per summary. An independent experiment reduced current-code 200-year fill from a median **3.12s to 1.77s**, including full 16-second anchors. Every one of 6,401 summaries matched, and final serialized states matched.
2. Implement target-only restore plus an immutable-config projection codec with independent mutable restore bodies. Current-code trusted restore measured **0.48ms**; 15-second live catch-up **2.54ms**, excluding view apply. This is a promising experiment, not a production implementation.
3. Preserve worker live state across yielding slices. The direction is valid, but the supplied comparison mixes initialization savings with omitted packaging.
4. Defer sparse summaries until sample consumers can use them without rebuilding missing graph points on the main thread. A representative existing 40-year sample request asked for 300 seconds, **278 absent** from an absolute 16-second summary grid.
5. Reject direct cached-state pointers and moon/meal omission. Preview installation mutates the supplied state; currentMoonTurn is needed by subsequent simulation phases.

The dream of immediate access to a thousand-year future also requires a later product decision. At the unchanged 112 sim-sec/s ceiling, revealing 200 years takes at least **57.1 real seconds**, and 1,000 years **285.7 seconds**, even with instantaneous fill. The unresolved request horizon advances with browse coverage, and browsing is constrained by revealed coverage. A faster backend alone cannot eliminate that minimum or permit immediate access beyond the playhead. Preserve those gates in this task; treat a new request/reveal/access policy as separately authorized work. Sources: `src/views/ui-root/settlement-graph-session.js:33`, `src/controllers/settlement-forecast-controller.js:670`, and the brief's required browse contract.

## What was independently measured

Node v24.15.0 on this machine. Official 60-tick seconds, canonicalization after each second, devPlaytesting01 seed 99117. Long-lived runs set BOTH monster thresholds to 10,000,000. These are small authored-fixture results, not GPU/browser/mobile or large-world guarantees. Current player New Game is a different two-settlement setup (`ai/ai-context.md`), so this fixture is not representative of every new run.

Reproduce from the audit worktree:

```powershell
node experiments/timegraph-audit/audit.mjs
node experiments/timegraph-audit/audit.mjs C:/Users/User/.t3/worktrees/laughing-waffle-proto/t3code-timegraph-dream
node experiments/timegraph-audit/restore.mjs
```

Results: [current](../../experiments/timegraph-audit/results-current.json), [baseline](../../experiments/timegraph-audit/results-baseline.json), [restore/sampling](../../experiments/timegraph-audit/restore-results.json). The audit harness creates modified modules only in memory; it does not edit source files. Its memo table is reset for every summary call. This is a bounded experiment, not a suggested global cache implementation.

| Measurement | Baseline e30ce3e | Current 6556f38 |
|---|---:|---:|
| Starter death | 1828s, 58,318 JSON characters | 1828s, 59,821 characters |
| Summary, median | 0.232ms | 0.266ms |
| Same summary with scoped aggregate reuse | 0.074ms | 0.076ms |
| 200y, summaries each second + full 16s anchors, median of 3 | 2.94s | 3.12s |
| Same, aggregate reuse | 1.75s | 1.77s |
| 200y, summaries every 16s + full 16s anchors | 1.21s | 1.22s |
| Restore + canonicalize, median | 3.31ms | 3.53ms |
| Actual dense 15s window reconstruction | 20.13ms | 24.09ms |
| Live 15s catch-up, one final serialize | 5.74ms | 7.41ms |
| Worker-shaped 30s re-entry, 200y | 3.86s | 4.10s |
| Live synchronous stream with anchor and slice packaging, 200y | 3.01s | 3.19s |

The fill comparisons retain the generated summaries and anchors. All three fill variants produced the same full final serialized state. Scoped aggregate summaries matched at every second from 0 through 6400 on both revisions. Target-only catch-up matched the dense window's exact target state.

A separate current-code restore probe at t=1200 retained all moon/meal fields, omitted only config, cloned the mutable body, attached RNG helpers, restored flags/phase and canonicalized. Full JSON length was 60,717; mutable body 40,050; config 20,653. Median trusted restore was 0.483ms, p95 0.534ms; trusted 15s catch-up returned a fresh live state in median 2.538ms, p95 3.316ms. Official restore in that run was 3.109ms. Full serialized equality held at restore and every second through another 64 seconds. This probe does not establish trust for arbitrary worker payloads or custom worlds.

The separate codec investigation froze config and ran 6400 official seconds without a write error. See [codec ownership and readers](timegraph-codec-audit.md) for sources, limitations, and tests.

## Audit of the supplied evidence

**Revision/schema:** main has advanced; its save schema is v22, config v14. Preserve today's contract. Do not implement a v20-only projection path. Relevant projection/summary/worker orchestration remains largely unchanged between these commits; current cache adds exportForecastChunk and removes an unused history-pruning helper. Gameplay/config data have changed. Source: `src/model/state.js:449`, `ai/ai-context.md:30`; compare `git diff e30ce3e 6556f38 -- src/model/timegraph`.

**Cold restore:** confirmed. `buildProjectionStateWindowFromStateData` serializes AND summarizes every intermediate second (`src/model/projection.js:771–829`). `forecast-state-cache.js:125–160` retains the intermediates in both caches. The target-only probe removes unnecessary summaries as well as serialization. Do not attribute the full speedup to serialization alone.

**Summary cost:** confirmed, but the brief stops one layer too early. Each series getter can rebuild the civilization aggregate, including per-site population/worker work; even faith/happiness local getters first calculate population. Sources: `src/model/graph-metrics.js:134–162`, `:259–264`, `:328–348`; `src/model/detailed-settlements/view-model.js:29–144`; `src/model/projection-summary.js:17–36`. Measuring one worker assignment at 0.003ms does not account for repeated aggregates across all series. Reusing civilization/population/worker results for one immutable read of one state gives a measured win without removing any points. Implement an explicit evaluation context or bulk summary builder; do not memoize by mutable state identity across ticks.

**Worker benefit:** confirmed direction; magnitude must include packaging. Supplied `fillWorkerLikeLive` in `experiments/timegraph-dream/lib.mjs` builds then discards summaries and serializes only at the end, whereas worker-shaped calls package anchors/summaries every slice. Supplied `fillWithSummaryStride` in followup.mjs does not create anchors. Their timings are component experiments, not an end-to-end implementation of suggestions 1–5. Our stream measurement retains existing serialization at anchor/slice boundaries, but is still synchronous Node execution: no timer delays, worker cloning, main-thread merge or rendering. Slice-relative versus request-relative anchor placement also differs. Quote the measured ~22% packaged stream advantage as directional, not pure deserialization attribution.

**Clock:** retain official arithmetic. Independently summing 480 increments yields 7.999999999999977. The authoritative code updates the season clock every tick and can set season flags between second boundaries (`src/model/commands/simulation-commands.js:43–113`; `replay-second-runner.js:23–47`). A loop that preserves all floating-point operations in order could theoretically remove dispatch overhead; replacing them with one addition cannot. No bit-identical faster clock was established, and it is lower priority than measured wins.

**Canonicalization:** the supplied serialize equality over one no-action fixture is useful evidence, not a universal proof. Keep it initially. Removing it is neither necessary for the first gains nor justified across custom worlds/actions by that experiment alone.

**Clone choice:** preserve the existing JSON save path. The codec probe clones an already stripped JSON-shaped body, which is a different operation from structuredClone on live RNG-bearing state. The measured advantage bundles config omission and avoided validation, not a blanket faster clone algorithm.

**Browser stall:** unconfirmed. The 750ms disable exists, but is guarded by pending coverage and an in-flight request and uses the newer of last progress/request start (`timegraph-forecast-worker-service.js:488–510`). Idle time after fulfilling a horizon is not by itself a stall. No real GPU-window run was performed in this audit. Capture requested end, built end, request ID, done/reject/error reason, generation, tab visibility, and message receipt timestamps before attributing frozen coverage to timeout. Timer scheduling and foreground main-thread blockage must be distinguished from worker CPU. Do not remove yields or arbitrarily raise the timeout from the supplied headless evidence.

**Performance promises:** 4–5s/1000y remains an extrapolated fixture target. Our fully packaged stride-16 experiment is ~6.1s/1000y by linear extrapolation before further codec work, and ~8.9s/1000y with improved dense summaries. Neither is an actual 1000-year browser measurement. Packed arrays/WASM may help later; they are not established as the only remaining path. Profile post-optimization JS, object cloning, repeated queries, serialization and allocation/GC before choosing a kernel rewrite.

## Safety and architecture decisions

| Suggestion | Decision and missing requirement |
|---|---|
| Omit/intern gameConfig | Approve conditionally. Private immutable canonical config per run/generation; clone the mutable body. Validate external input before marking it trusted. Preserve normalization, RNG attachment, flags and phase. |
| Target-only catch-up | Approve. Step every official second; stop at loss; respect scheduled actions and coverage. Return an isolated state or serialize only the target when the public data API needs it. |
| Live worker across slices | Approve independently. Resumable runner with the same chunk shape, per-second action order and terminal detection; keep yielding and generation rejection. Do not switch to the existing synchronous stream and call it yielding. |
| Summary stride 16 | Defer. Missing samples fall back to state reconstruction. Preserve exact terminal and vassal resolution metadata every second even if graph values become sparse later. A 16-second summary stride is never a simulation stride. |
| Pointer anchors | Keep private immutable anchor data, return clones. A pointer to a mutable preview violates present ownership. |
| Remove moon/meal fields | Reject. currentMoonTurn affects faith, migration and death continuation; fields also feed preview UI. |

The direct pointer hazard is concrete: `src/controllers/sim-runner.js:1712` merges persistent knowledge into the passed preview. Moon continuation readers include `phases/faith.js:54`, `phases/migration.js:491`, `phases/death.js:50`. Details and config writers are in the codec audit.

Sparse summaries are not a local producer-only change. `controller-core.js:1334–1388` falls back from missing summaries to reconstructed state; `getSummaryAt` does the same at `:1576`. `sampling.js:58` uses a decimal grid, plus actions/cursor/edges in `:213`; it does not align to a universal 16-second grid. At the representative request tested here, 278/300 samples miss. Fewer emitted summaries could therefore move substantial work onto the UI thread. `MAX_HISTORY_POINTS` caps graph history points, not all projection summaries. Detect loss from state every simulated second, not only when a sampled summary happens to be emitted.

Memory needs an explicit ownership design. `projection-cache.js:113–190` estimates JSON lengths and evicts its own state map, retaining summaries. `graphCache.stateDataByBoundary` is another strong owner; its writes in `forecast-state-cache.js:17` have no equivalent byte budget. Evicting the first map cannot free objects held by the second. The 512MB setting is not a proven whole-graph heap bound. JSON character count is also not actual JS heap consumption. At 40KB retained bodies and 2000 anchors, 1000y is roughly 80MB of JSON-equivalent mutable bodies, plus config, summaries, slice tails, caches and JS overhead—not the brief's 46MB, which assumes unsafe moon removal. Keeping every restored target forever would still densify the cache even after intermediate serialization is removed.

Use one authoritative anchor owner plus a small bounded hot-state cache (or sequential replay cursor), with explicit shared references and eviction policy. Preserve retained coverage via checkpoints/recomputation; do not evict anchors while continuing to promise constant bounded catch-up from them. Ordered anchor lookup can avoid scanning the growing map (`forecast-state-cache.js:30–42`). These are architectural recommendations, not measured wins. Full copy-on-write needs an immutable mutation discipline and accounting of all changed subtrees; it is not achieved by retaining mutable pointers.

## Implementation sequence and acceptance gates

1. **Scoped summary aggregates:** change only summary/metric evaluation, preserve the exact result shape and every-second delivery. Compare every field against official summaries across fixtures, player/frontier region ownership, classes, worker allocation, custom config, births, migration, vassal resolution and loss. Measure worker fill and main-thread merge.
2. **Interactive restore:** target-only reconstruction, followed by private config interning/trusted cloning behind getStateAt. Keep public save/timeline serialization unchanged. Bound hot target retention. Full serialized differential equality, repeated-restore mutation isolation, mid-moon continuation and edits at/off anchors are mandatory. Test past history and future separately.
3. **Worker runner lifetime:** independent patch, preserving yield points and message packaging. Compare concatenated chunk outputs and final state against the official runner; actions on slice boundaries must apply exactly once. Test cancellation, stale generation replies, terminal before slice end, failure and fallback. Do not mix worker orchestration and controller-core rewrites.
4. **Memory/coverage:** audit all retaining owners, summaries, worker messages and ingress validation costs. Stress random scrub, sequential unveil, repeated edits, cache eviction, and branch-from-edit replay. Measure memory plateau and worst-case anchor gap. Keep existing revealed loss/browse gates.
5. **Browser acceptance:** foreground real GPU browser and target mobile; separately record worker simulation/packaging, message clone/merge, cold/warm getStateAt, preview apply and actual frame times. Report distributions and worst cases, not just averages. No prewarming through hasStateDataAt. Test initial fill, arbitrary backward/forward flings, edit rebuild and cancellation. Existing ~9ms Swiftshader render is not a GPU measurement.
6. **Only after profiling again:** consider sparse graph summaries with compatible consumers, then data layout/kernel work if still needed. Large-state tests must vary sites, cohort count, structures/practices and Life Map history as well as population. Speculative choices multiply CPU/memory by branch count; require isolated RNG/config ownership and correct edit-generation invalidation.

For a production implementation, run `npm run verify` plus the targeted differential/browser gates above. This audit changes no simulation state, RNG, schema, replay, or view behavior. Its harnesses exercise official replay and do not establish ship readiness for their experimental replacements.
