# Independent harness audit — round 1

**PROOF: NOT SOUND.** Phase A is under construction. No scoring or product optimization is technically accepted by this review. This is an early contract/mechanism review; the running Builder retains the browser measurement slot. No browser reproduction was attempted in this round, and the required independent end-to-end reproduction remains outstanding.

Auditor: `/root/harness_auditor_round1`, separate from root/contract Builder and `/root/harness_builder`; inherited Codex gpt-6.1-sol, xhigh. Date: 2026-11-04. No product or harness implementation files changed by Auditor. Scope of owned edit: this review only. No finite review-round cap; continue repair/recheck.

## Reviewed identities

Repository HEAD: `ec49648ed1ef92d25a0d0a715f128044f907390e` (v1.1.52). Files were uncommitted and actively being constructed. SHA-256 of the mechanism contents inspected:

| File | SHA-256 |
| --- | --- |
| scripts/perf-hillclimb/statistics.mjs | 235b4ebb6e045becabc8f3117ebc1b0e620ec65c33fd451c8eb12cba3efabc24 |
| scripts/perf-hillclimb/browser-runtime.mjs | 3cf7fc3bc6e9c90b3d5c7e2e5651b84fbc749002d6d773a14d1cea43326a25da |
| scripts/perf-hillclimb/fixtures.mjs | 91a3900f5a1b3d36e54c52870b8eff3744684545cd4a127f93093e77e4d70281 |
| HARNESS.md, initial A0 | 442e46c8383bd04932f81f2fc68500f361a671cf36c240e37aa4ac66c8a86b39 |

Read skill, AGENTS.md, ai/ai-context.md, timegraph guardrails before timegraph review, and its current intent/implementation/supply documents; relevant routing and split-folder READMEs. Root updated the contract to A1 during review after receiving early findings. A1 now requires 120 observations and 40 independent interaction sessions, with clustered uncertainty. That fixes the draft policy, not the code or proof; inspect/reproduce the repaired implementation in a subsequent round.

No completed raw proof run IDs existed in PROOF_RUN.md at inspection. Only fixtures, runtime and statistics modules existed under scripts/perf-hillclimb at the point reviewed. A later runner must receive its own reviewed identity and evidence.

## Findings and dispositions

| ID | Priority / status | Evidence and required repair |
| --- | --- | --- |
| A1-01 | Blocking / open | browser-runtime.mjs:45 starts elapsed at the document capture handler's `performance.now()`. An input queued while the main thread is busy can arrive substantially earlier; that delay is omitted. `event.timeStamp` is retained but unused, and arm-to-dispatch includes host orchestration delay. Keep handler-to-visible as a diagnostic if useful, but add a validated input-arrival-to-visible clock (or a calibrated pre-dispatch clock with stated uncertainty). Demonstrate a deliberate main-thread stall after input arrival is included, and prove actual offered-load lateness/drops cannot disappear. This matters directly to J3/J5 under active work. |
| A1-02 | Blocking / code open; policy repaired in A1 | statistics.mjs:41 computes an iid binomial quantile interval over all successful operations regardless of launch/session clustering. Counting independentLaunches alongside it does not make the interval valid for correlated operations. The comment claiming otherwise is misleading. Use declared session-cluster inference for repeated interactions and require valid session/launch IDs and quotas before inference. For independent startup observations, the n=60 two-sided 95% P95 upper endpoint is unbounded: `0.95^60≈0.046>0.025`. Root's A1 increase to 120 addresses that minimum limitation; finite intervals can still be too wide for a 10% regression gate and must remain INCONCLUSIVE. |
| A1-03 | High / open, independently reproduced | statistics.mjs:16 initializes binomial recurrence with `(1-p)**n`. At n=1000, p=.95 this underflows to zero; recurrence never recovers. `quantileInterval([1..1000])` returned estimate 950, low undefined and high null. This is numerical failure, not a legitimate unbounded interval. Use a numerically stable distribution calculation and tests at expected operation/frame sample sizes; distinguish numeric failure from statistical uncertainty. |
| A1-04 | High / open, independently reproduced | statistics.mjs:35 filters to successful timings before reporting P95. In a 70-attempt control with 60 successes at <=100ms and 10 180000ms timeouts, it reports P95=100ms while >14% of attempts timed out. Reliability counts are retained, which is good, but this tail is conditional-on-success and currently unlabelled. Report censoring-aware bounds/unresolved tails for all attempts; explicitly label successful-only diagnostics. A failure must also prevent scoring/acceptance at the analyzer level. Missing/nonfinite successful elapsed values must be classified invalid, not disappear between passed/failed counts. |
| A1-05 | High / open | browser-runtime.mjs:20 replaces Worker even with `instrumentation=false`. Thus a plain on/off test cannot measure overhead of the full Worker interception path. Retain a native/unwrapped reference for matched overhead diagnostics (with minimal completion witness), disclose irreducible timing/oracle overhead, and compare code paths on the same build. Per-frame arrays, worker-event retention, polling/probe CPU and host round trips also need measured overhead before tight responsiveness claims. |
| A1-06 | Blocking / expected construction gap | Actual runner/population/reset/oracle bindings and controls are not yet executable in the reviewed files. The fixture module supplies ordinary/selected/shop/history from one regular seed and uses real actions/official replay, but no completed proof establishes all eight jobs, all required cold/warm/art/CPU populations, active-work J3/J5 overlap, true persisted J7 completion, required-art failure/retry, or safe read-only previews. Finish those bindings and freeze manifests/fixture hashes before proof; do not infer coverage from table rows or fixture existence. Include representative ordinary seeds and nontrivial continuation histories, not only the short first-shop transaction. |

## Independently reproduced checks

These were small Node semantic checks only; no browser/benchmark concurrency or expensive process was introduced. They validate findings, not end-to-end harness soundness.

1. `quantileInterval(Array.from({length:60},(_,i)=>i+1))` → estimate 57, low 53, high null, bounded false. Correctly exposes the draft n=60 resolution limitation.
2. `quantileInterval(Array.from({length:1000},(_,i)=>i+1))` → estimate 950, missing low, high null, bounded false. Numeric underflow reproduced.
3. `summarize()` with 60 operations from one launch → reports a nominal binomial 95% interval at n=60 despite independentLaunches=1. No cluster inference or rejection.
4. `summarize()` with those 60 successes and ten timeouts at 180000ms → attempted 70, timeouts 10, P95 100ms, interval still based on n=60 successes. Unconditional tail not represented.

Shortest reproduction for checks 1–2:

```powershell
node --input-type=module -e "import {quantileInterval} from './scripts/perf-hillclimb/statistics.mjs'; for(const n of [60,1000]) console.log(quantileInterval(Array.from({length:n},(_,i)=>i+1)));"
```

## Acceptance gate remaining

After repairs, independently inspect exact runner/controls/analyzer revisions and raw result identities; reproduce a representative actual browser job plus negative/delay/deferred-completion controls; verify all eight job oracles/populations; inspect at least three consecutive suites, sufficient raw samples, correct uncertainty and overhead evidence. No observed low variance or one passing job substitutes for this coverage. Current baseline scorecard and product candidates are **not reached**.
