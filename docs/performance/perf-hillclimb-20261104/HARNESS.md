# Phase A measurement contract — HC-20261112-A0

Contract **HC-20261112-A0**, 2026-11-12. **PROOF: NOT SOUND** — construction in progress; see `STATE.md` and `PROOF_RUN.md`. No product scoring or optimization until independent acceptance.

This contract is a focused rebuild on `origin/main` `7c8f084c` (v1.1.59), incorporating recovered 2026-11-04/05 audit lessons. It covers Cam's five 12 Nov priority jobs, not the unclosed eight-job matrix from the paused T3 thread. A contract or mechanism change requires refreshed proof and a comparable re-baseline.

## Build and machine

- Product baseline: `7c8f084c`, v1.1.59, ordinary main behavior. Product sources are the variable under test. Harness edits are not product gains. Record build asset SHA, harness source SHA, fixture and oracle-SDK SHA, and contract id on every row (`scripts/perf-hillclimb-20261112/identities.mjs`).
- This measurement system: Grok Bot Linux box, 8-core Intel Xeon @ 2400 MHz, 15 GiB RAM, Node v24.22.1, npm 11, Playwright 1.59.1, Chromium 147 headless shell, SwiftShader software GL. One browser workload at a time.
- Populations: desktop 1280×800 at CDP CPU 1×; mobile-landscape 844×390 at CDP CPU **4×**. The 4× + mobile viewport case is a **CPU-bound Pixel 6 proxy**. SwiftShader is **not** phone GPU performance. **No physical Pixel 6 evidence.**
- Frozen ordinary fixture: New Game seed **424242** (same seed used in earlier timegraph guardrail notes). Expected Node-side opening loss on this exact build: **5064** sim-seconds (pinned in forecast controls; must fail closed if it changes).
- Install: `npm ci --no-audit --no-fund`. Build: `npm run build`. Serve `dist/` for browser jobs. Cold browser = new process/context. Warm Node forecast = one unmeasured warmup, then measured runs.

## Jobs

| ID | Workload and clocks | Functional oracle (outside the score of a speedup) |
| --- | --- | --- |
| new-game-opening | Cold ordinary New Game. Start at **input arrival** (`event.timeStamp`), not handler `performance.now()`. End at full opening-forecast readiness **and** authored opening reveal complete, plus menu gone / useful interaction. Report **forecast-ready** and **5 s authored reveal** separately. Preserve that pacing; reveal reduction is never a compute gain. | Seed matches 424242; opening preparation `ready`; finite `lossSec`; coverage reaches loss; opening phase `completed` (or elapsed ≥ 5 s of authored presentation); five Practice slots where reported. Deterministic loss agrees with the Node forecast oracle on this seed/build (5064 on 7c8f084c). |
| bake | Terrain bake wall time from the New Game session (`illustratedTerrain.bakeMs` and sub-parts). Same launches as New Game; not a substitute for time-to-useful. | Bake reported, finite, and New Game oracle passed. |
| scrub-step | After useful New Game, 40 warm `browseSecond` steps across revealed coverage. Start immediately before the call; end when `viewedSec` equals the requested second (clamped) **and** a subsequent frame opportunity. Two rAF alone is not completion if `viewedSec` is stale. | Viewed second matches target; read-only browse (frontier/RNG unchanged by the scrub itself, checked in later audit if a snapshot pair is retained). |
| unveil-reproject | **Compute:** Node official forecast from a mid-run official frontier of the no-further-changes opening trajectory (anchor near loss/3), "as if no further changes." This is the compute of post-vassal-death re-projection, **not** a browser death-recap path (that UI path is not yet automated). **Pacing:** opening reveal in the browser job is reported separately and must not be treated as compute. | Terminal forecast; re-projected loss ≤ opening loss and equal to an independent twin build from the same anchor. |
| forecast-window / forecast-horizon | Node `buildProjectionChunkFromStateData` on `createNewGameState(424242)`. Window: 480 official seconds (120 independent launches are in budget, ≈3–4 min). Horizon: full run to terminal loss (fewer launches; ~11 s each). Wall clock is `process.hrtime.bigint()`. Throughput = successfully completed sim-s / wall-s. | Window: `ok`, `endSec===480`, not terminal, summaries at 0 and 480. Horizon: `terminal`, `endSec===5064` on this build. Failures and timeouts stay in the record. |

## Timing, statistics, controls, samples

- Browser `performance.now()` / `event.timeStamp` for E2E; host enqueue is not latency. Node uses `hrtime`. CPU time is not end-to-end.
- Statistics: `statistics.mjs` (ported from the 2026-11-05 independently accepted module). Timeouts and failures are **not** dropped from tails; unsuccessful attempts are right-censored. P95 is omitted when the correctness gate fails. Session-clustered operations use a conservative exact envelope of launch minima/maxima; bootstrap is diagnostic only. Unlike build/fixture/harness/contract/population identities never pool. Hard-tail inference requires ≥120 **independent launches**, pinned corpus and oracle SDK, all complete, bounded interval. Otherwise **INCONCLUSIVE**, not a precise P95 claim. Per-look confidence is 99%.
- Predeclared sample budgets for this Phase A: three consecutive browser suites (smoke, required). New Game and bake: 3 launches per population — **P95 INCONCLUSIVE**. Scrub: 3 launches × 40 steps — operations may quote a diagnostic P50/P95, inference **INCONCLUSIVE** at 3 clusters. Forecast window: 120 independent Node launches when the run is executed — may become tail-eligible if all pass and the interval is bounded. Horizon and re-projection: 6 launches, INCONCLUSIVE tails. Practical effect later (Judge, not now): 10% **and** 10 ms interaction, 10% **and** 100 ms heavy paths.
- Validity controls (comparison-ineligible), every distinct mechanism: deliberate wrong result fails; +200 ms in the measured path appears (≥150 ms after warmup); deferred completion cannot look like a speedup; `instrument=false` does not wrap `Worker`; a main-thread stall after input arrival is included in arrival-to-useful (`queueDelayMs`). Restore the real path before proof (controls use isolated sessions, no product edits).
- Intentional opening reveal (~5 s) is included in time-to-useful and reported separately. Worker wrap stays off for acceptance timings. Profiling stays out of acceptance timings. Prior audits: `/workspace/scrub-load-audit-2026-11-01/REPORT.md`, `/workspace/perf-audit-2026-10-31/REPORT.md`. Parallel diagnostic profiles (not this contract): `/workspace/hillclimb-profile-load/REPORT.md`, `/workspace/hillclimb-profile-scrub/REPORT.md`.

## Reproduction

```
npm ci --no-audit --no-fund
npm run build
npm run test:perf-hillclimb-20261112          # statistics unit tests
node scripts/perf-hillclimb-20261112/run.mjs --id=NEW_ID --phase=controls
node scripts/perf-hillclimb-20261112/run.mjs --id=NEW_ID --phase=forecast
node scripts/perf-hillclimb-20261112/run.mjs --id=NEW_ID --phase=suites --suites=3
```

`--node-only` skips browser controls. Artifacts: `artifacts/perf-hillclimb-20261112/<id>/` (gitignored) and a pointer under `docs/performance/perf-hillclimb-20261104/runs/`. Probe detail goes to those files; stdout is a short pass/fail summary and the artifact path.
