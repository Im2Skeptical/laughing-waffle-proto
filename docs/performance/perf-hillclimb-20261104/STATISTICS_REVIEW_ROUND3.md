# Independent statistics recheck — round 3

**STATISTICS SUBMECHANISM: ACCEPTED at the final reviewed identity below**, conditional on validated plain-JSON provenance, actual independent identically distributed launches and fixed complete offered schedules. Numerical, censoring, conservative session-bound and required identity checks pass independent reproduction. Two identity findings discovered at the initial snapshot were repaired by root and independently rechecked during this round. This is a scoped statistics acceptance, not acceptance of the full harness. **Phase A PROOF: NOT SOUND** remains unchanged: browser controls, all required jobs/populations, overhead and complete proof evidence remain separate gates.

Auditor: `/root/statistics_auditor_round3`, independent of root/statistics Builder and `/root/harness_builder`. Inherited Codex gpt-6.1-sol / xhigh. Date: 2026-11-04. Read AGENTS.md, ai/ai-context.md, HillclimbPerformanceLoop, HARNESS A2, HARNESS_REVIEW.md and STATISTICS_REVIEW.md. Owned edit: this file only. No implementation, simulation state, RNG, schemas, replay or layering changes. No browser or expensive process was started; root retained its browser-probe slot.

## Exact reviewed identities

HEAD: `ec49648ed1ef92d25a0d0a715f128044f907390e` / v1.1.52. Statistical files are uncommitted construction work. SHA-256, rechecked after independent controls:

| File | SHA-256 |
| --- | --- |
| scripts/perf-hillclimb/statistics.mjs | 4e31a65ce22dc96698950f634482472ad042c55b50a0f38ddec4312fdf0e5dce |
| scripts/perf-hillclimb/statistics-test.mjs | ca60eacfa429cb43a28d6d452d2d4e509639fb20e431f3d7277484df4f77bbe3 |

Root repaired the two findings during this ongoing review. Final reviewed identities, independently rechecked after the repair:

| File | Final SHA-256 |
| --- | --- |
| scripts/perf-hillclimb/statistics.mjs | 4a95a54c2e93b12f3928d34d42b35031fb27927b422457cce7ca3ae933ecaf0f |
| scripts/perf-hillclimb/statistics-test.mjs | dda12cb6a922564783159217ac3a55b3dae09d8dc5c945dae660c3f64dcc4149 |

Later edits require their own identity/disposition; this review does not implicitly accept changed code. The initial and final hashes differ only because of the during-round identity repair, not a new product implementation.

## Independent checks

1. `node scripts/perf-hillclimb/statistics-test.mjs` passed.
2. Independently recomputed binomial rank endpoints with Python `Decimal` at 80-digit precision and exact integer `math.comb`. Tested the Cartesian product of n = 1, 2, 5, 20, 40, 60, 72, 120, 240, 1000; p = .05, .5, .95, .99; confidence = .95, .99. All **80 cases matched** the JavaScript endpoints. This independently checks the current mode-centred recurrence rather than trusting fixed expected values in the implementation test.
3. Forty launches with two perfectly correlated operations each produce an unbounded P95 upper endpoint, not hard-inference eligibility. The earlier 40-cluster tail-resolution failure is repaired.
4. For 120 launches whose paired operation times are `[i+1, 2000]`, i=0..119, the conservative 99% session-extrema envelope returns `[107, 2000]`. This uses the lower rank of launch minima and upper rank of launch maxima, rather than treating 240 operations as independent.
5. Explicit unlike product identities and explicit unlike fixture identities form separate groups. Duplicate observation IDs and missing build IDs reject; nonfinite/negative successful timings and timeouts fail correctness/inference. A failed outcome at 500ms retains the unresolved completion interval `[500, unbounded]` and no unconditional P95.
6. At the initial snapshot, missing workload/configuration identity and unlike harness identities reproduced the findings below. At the final snapshot, independent controls reject missing fixture, population, empty configuration, undefined/nonfinite population leaves, job, step, harness and measurement-contract identity. Mixed harness revisions split into two groups of 60, both ineligible; changed contracts also split. A complete 120-independent-launch population remains eligible with its 99% interval.
7. Re-ran `node scripts/perf-hillclimb/statistics-test.mjs` at the final identity: passed. The during-round repair changes input validation/grouping only; the independently checked numerical and session-bound mechanisms remain unchanged.

The exact-envelope reasoning is valid under the stated external conditions: independent identically distributed launches, fixed equal offered operation counts and schedules, unchanged declared workload population, no missing or duplicated outcomes. A randomly chosen operation in an equal-size session lies between that session's minimum and maximum; stochastic ordering and a union bound justify the selected exact interval sides. Unequal observed cluster sizes are rejected for hard inference. Wide intervals must remain INCONCLUSIVE. Equal row counts and launch IDs do not themselves establish the external conditions; actual runner manifests/schedules still require audit.

At 99% per-build/per-look coverage, a union bound over two builds and at most two predeclared decision looks gives at least 96% joint coverage **for that metric**. The current wording correctly makes no simultaneous all-job or unlimited-iteration false-positive claim. The later Judge/comparison implementation must enforce the planned-look rule; this module does not implement candidate promotion.

## Findings and during-round disposition

| ID | Priority / status | Actual result and required resolution |
| --- | --- | --- |
| S3-01 | High / resolved and independently rechecked | Initial snapshot allowed `fixture` to default to null and omitted population/job/step identity. With 120 otherwise valid rows it reported hard-inference eligibility. Final snapshot requires explicit nonempty fixture/workload, job, step, harness and contract identities plus a nonempty population with explicit finite JSON values. Independent missing/invalid identity controls now reject. A declared no-file workload can use an explicit stable identity such as ordinary-seed123; it need not fabricate a save fixture. Actual identity provenance/meaning still belongs to runner/manifest audit. |
| S3-02 | High / resolved and independently rechecked | Initial grouping ignored harness/measurement-contract identity, pooling a 120-row control containing two different timer revisions. Final grouping requires and separates harness and contract identities. The same mixed timer control now forms two 60-row groups, each ineligible; a separate changed-contract control also splits. Actual hashes must still be bound to the executable runner by the full Phase A audit. |

These were concrete failed contract controls, not evidence that Builder mixed actual production runs. Their repairs close the reproduced statistics-interface failures. Statistics eligibility remains conditional on the externally audited manifest, plain JSON inputs and actual workload/independence assumptions; it is not proof of those assumptions.

## Short reproductions

```powershell
@'
import {summarize} from './scripts/perf-hillclimb/statistics.mjs';
const rows=Array.from({length:120},(_,i)=>({
  buildId:'same-product',harnessId:i<60?'timer-v1':'timer-v2',
  fixture:'fixed-fixture',population:{cpu:1,art:'off',seed:123},
  job:'J1',step:'ready',launchId:`launch-${i}`,observationId:`obs-${i}`,
  ok:true,elapsedMs:i+1
}));
const mixed=summarize(rows);
const missing=summarize(rows.map(r=>({...r,fixture:undefined,population:undefined})));
console.log({mixedGroups:mixed.length,mixedEligible:mixed[0].eligibleForTailInference,
  missingEligible:missing[0].eligibleForTailInference});
'@ | node --input-type=module
```

At the initial reviewed hash: `{ mixedGroups: 1, mixedEligible: true, missingEligible: true }`. At the final hash, this old control first rejects its missing measurement-contract identity; supplying the required contract identity and rerunning the cases separately gives two harness groups of 60 (both ineligible), while missing fixture/configuration rejects. The independent final check also verifies rejection of empty configuration and undefined/nonfinite configuration leaves.

Independent binomial oracle method: for each stated n/p/confidence, sum `Decimal(comb(n,k)) * p**k * (1-p)**(n-k)` for k=0..n; choose the greatest lower rank satisfying CDF(k)<=alpha/2 and first upper rank satisfying CDF(k)>=1-alpha/2, with 0/n+1 represented as unbounded. Compare these endpoints with `quantileInterval([1..n],p,confidence)`.

## Disposition

- A1-03 numerical underflow: repaired and independently reproduced at the reviewed hash.
- A1-04 censoring/invalid timing: repaired and independently reproduced at the reviewed hash.
- S2-01 clustered hard-tail resolution: repaired by conservative session-extrema bounds, 120-launch quota and diagnostic-only bootstrap, conditional on actual runner independence/schedule evidence.
- S2-03 two planned looks: contract allocation is justified for metricwise coverage; implementation/enforcement belongs to the future comparison/Judge gate.
- S2-02 population identity: repaired at final identity; explicit product, harness, contract, fixture and population identities split correctly, missing required identities reject. S3-01/S3-02 are closed by independently reproduced during-round repairs.

No unresolved reproduced statistics-submechanism blocker remains at the final reviewed identity under its stated input/provenance and sampling assumptions. The future Judge must still validate actual manifest bindings, independence, fixed schedules and the complete comparison/promote implementation before using these intervals for product decisions.

No product score, performance improvement, full Phase A acceptance, or physical-device conclusion follows from this scoped review.
