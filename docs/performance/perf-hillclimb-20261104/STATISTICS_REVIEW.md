# Independent statistics subreview — round 2

**STATISTICS: NOT ACCEPTED for hard tail inference.** The repaired numerical and censoring mechanisms pass the checks below. Cluster-tail resolution and population identity still need repair or an enforced caller contract. This subreview does not accept Phase A; no browser or end-to-end reproduction was performed.

Auditor: `/root/statistics_auditor_round2`, separate from root (statistics Builder) and `/root/harness_builder`. Inherited Codex gpt-6.1-sol / xhigh. Date: 2026-11-04. Read AGENTS.md, ai/ai-context.md, HillclimbPerformanceLoop skill, HARNESS.md and prior HARNESS_REVIEW.md. Scope is statistical analysis only; product state, simulation RNG, schemas, replay and UI are untouched. Owned edit: this document only.

## Exact reviewed contents

Files were uncommitted and construction continues. These SHA-256 values identify the version reviewed, not a later repaired version:

| File | SHA-256 |
| --- | --- |
| scripts/perf-hillclimb/statistics.mjs | da0e6dcc375b7bcedd55b70b90e34d7ad8ce3e81dce371fb63d97427d1c6509c |
| scripts/perf-hillclimb/statistics-test.mjs | 74f7b7a972afba302985d97fced013c4a9fa59b6c8ce59ed189b36c7b82d2ef4 |
| HARNESS.md | 442e46c8383bd04932f81f2fc68500f361a671cf36c240e37aa4ac66c8a86b39 |

## Independently reproduced checks

1. Ran `node scripts/perf-hillclimb/statistics-test.mjs`: passed. This includes n100000 numerical stability, censoring, invalid-success classification, fixed rank oracles and deterministic cluster resampling.
2. Independently calculated **56 binomial rank pairs** using Python Decimal at 70-digit precision and exact `math.comb`, without calling the implementation for expected results. Grid: n in `[1,5,20,60,72,120,1000]`; p in `[.5,.9,.95,.99]`; confidence in `[.8,.95]`. Every returned lowerRank/upperRank matched. The oracle sums `C(n,k) p^k (1-p)^(n-k)` against the two tail thresholds. This independently corroborates the mode-centred repair rather than merely rerunning the Builder's fixed test values.
3. Tested 40 launches with three identical operations within each launch, durations 1..40ms by launch. Summary: attempted 120; independentLaunches 40; bootstrap high 40ms; **eligibleForTailInference true**. This reproduces S2-01 below.
4. Tested one job/step/population containing 60 independent rows from fixture-fast/build-A at 10ms and 60 from fixture-slow/build-B at 10000ms. Summary pooled them into one group and returned **eligibleForTailInference true**. This reproduces S2-02; it does not assert that the current browser runner actually supplies mixed builds.

Short reproduction for checks 3–4:

```powershell
@'
import {summarize} from './scripts/perf-hillclimb/statistics.mjs';
const row=(launchId,elapsedMs,extra={})=>({job:'J5',step:'scrub',population:{layout:'desktop',cpu:1},launchId,ok:true,elapsedMs,...extra});
const clustered=Array.from({length:40},(_,i)=>Array.from({length:3},()=>row(`launch-${i}`,i+1))).flat();
const a=summarize(clustered,{replicates:1000,seed:123})[0];
console.log({n:a.attempted,launches:a.independentLaunches,upper:a.p95Interval.high,eligible:a.eligibleForTailInference});
const b=summarize(Array.from({length:120},(_,i)=>row(`independent-${i}`,i<60?10:10000,{fixture:i<60?'fixture-fast':'fixture-slow',productHead:i<60?'build-A':'build-B'})));
console.log({groups:b.length,p95:b[0].p95,eligible:b[0].eligibleForTailInference});
'@ | node --input-type=module
```

## Findings and disposition

| ID | Priority / status | Evidence and required resolution |
| --- | --- | --- |
| S2-01 | Blocking / open in reviewed code | A1's 120 operations / 40 launches permits a finite bootstrap 95% P95 interval and hard-inference eligibility with only 40 independent timing vectors. Under perfect within-launch correlation, all operations in a launch equal one IID launch value. Probability every observed launch is below the true P95 is `.95^40 = .128512156565...`. A nonparametric bootstrap upper endpoint cannot exceed the observed maximum; therefore its upper coverage is at most 87.15%, below both 95% and the required 97.5% one-sided level. The approximation disclaimer does not repair this known resolution failure. At least 72 independent values are needed merely to make an observed-maximum upper bound possible at 97.5%; that alone does not prove bootstrap coverage or sufficient precision. Require stronger independent-launch resolution and a justified hard bound. |
| S2-02 | High / caller precondition not enforced | summarize groups by job, step and population only; fixture, input, product and harness identities do not participate and heterogeneity is not rejected. The reproduced mixed-build/fixture input silently yields a single inference-eligible population. Either enforce that one invocation is homogeneous in its manifest/product/harness identity and split each fixture/input population, or make those identities explicit grouping/validation keys. A predeclared representative mixture is permissible only with frozen composition/weights and an inference method that respects its design. Do not accidentally pool unlike files when combining raw runs. |
| S2-03 | High / decision-policy clarification needed before comparisons | The contract's predeclared optional extension from 120 to 240 observations permits two opportunities to promote at the nominal 95% level. Predeclaring the extension prevents arbitrary retesting but does not by itself preserve overall 95% coverage/false-positive control across looks. Predeclare alpha spending, a valid sequential method, or an independent confirmatory decision; record that rule before product comparisons. No candidate comparison was performed in this review. |

The following round-1 issues are resolved **in the reviewed statistical mechanism**, subject to maintaining these tests in later revisions:

- A1-03: large-n binomial tail underflow. Mode-centred weights match the independent exact-combination oracle on all 56 cases.
- A1-04: successful-only latency no longer appears as unconditional P95 when any observation fails, times out or has invalid timing. Failed/invalid attempts remain counted, successful-only diagnostics are labelled, right-censored latency bounds are retained, and correctness/inference gates fail.
- A1-02, partial: actual launch IDs are required and whole-launch resampling replaces iid operation inference. The independent-launch resolution gap in S2-01 remains.

## Proposed A2 remedy discussed with root — not reviewed code

Root proposed requiring at least 120 independent launches, a fixed equal number and schedule of operations per launch, diagnostic-only bootstrap, and conservative hard-tail bounds built from per-launch minima and maxima. Under the stated assumptions this is mathematically justified:

For a random launch vector with equal operation count, its minimum is no greater than a uniformly selected operation, which is no greater than its maximum. Their distributions are stochastically ordered, so `q95(min) <= q95(operation mixture) <= q95(max)`. An exact 97.5% lower confidence bound for `q95(min)` and exact 97.5% upper confidence bound for `q95(max)` jointly cover the operation-mixture P95 with at least 95% confidence by the union bound. Perfect within-launch correlation is then handled honestly.

Required limitations: true independent identically distributed launches; identical declared fixture/configuration population; fixed equal operation counts and offered schedules; no missing/duplicated/dropped operations; preserve all failed outcomes. Unequal cluster sizes or unrecorded changing workload composition invalidate this simple operation-mixture argument and must be rejected for hard inference. Wide extrema bounds must remain INCONCLUSIVE. For two planned decision looks, one simple conservative alpha-spending choice is 97.5% total interval per look (1.25% in each extrema side), giving at least 95% overall across the two looks; comparisons across two builds need their own explicitly allocated joint uncertainty.

This reasoning supports the proposal, **not acceptance of an uninspected implementation**. Re-audit the actual repaired hashes, independently reproduce controls, and inspect actual launch/operation identities before closing S2-01/S2-02. Full Phase A remains NOT SOUND until its separate browser, coverage, timing, overhead and proof-run requirements pass.
