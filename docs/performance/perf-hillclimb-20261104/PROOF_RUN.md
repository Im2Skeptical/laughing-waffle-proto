# PROOF_RUN — Builder, 2026-11-12

**Builder's proposed verdict: PROOF: NOT SOUND.** Browser jobs and three consecutive suites were not completed before Cam's 12:40 PM AEDT wrap. Controls that did run are recorded below. This is not independent acceptance.

Date: 2026-11-12 (Australia/Sydney). Product revision measured or intended: `7c8f084c` / v1.1.59. Harness: `scripts/perf-hillclimb-20261112/`, contract `HC-20261112-A0`. Machine: Linux box, 8-core Xeon, SwiftShader, Playwright 1.59.1 (see `HARNESS.md`).

## Validity controls and Node proof

| Check | Result | Evidence |
| --- | --- | --- |
| `statistics-test.mjs` | PASS | Independent binomial oracles n=60/120/1000; n=100000 numerical stability; timeouts do not become P95=100 ms; 40 correlated clusters unbounded; 120-launch envelope `[109, 219]`; unlike identities do not pool. |
| Forecast +200 ms delay (96 s window, after warmup) | PASS | Warm base 265 ms, delayed 460 ms, delta **+194 ms**. Without warmup the first/cold run hid the delay (rejected protocol). |
| Forecast wrong endSec / wrong loss | PASS | Oracle failed closed. Positive horizon: endSec **5064**, ~11.3 s, ~448 sim-s/s. |
| Re-projection from official frontier 1680 | PASS | Twin-agreed loss 5064, ~7.2 s. This is Node compute, not a browser vassal-death unveil. |
| A1-05 Worker wrap | PASS | `instrument=false`: `wrapped=false`, `sameRef=true`. `instrument=true`: wrapped, `sameRef=false`. |
| Browser New Game, bake, scrub, A1-01 stall, 3 suites | NOT COMPLETE | Diagnostic only: after slot click, opening `preparation=preparing`, coverage 1726 at ~5 s and 3556 at ~10 s, menu still visible, **`baseSeed` reported 12345** despite filling 424242. Interrupted before forecast-ready. |

A full `runForecastControls()` invocation (including horizon and re-projection) was executed once; the delay case in that first batch failed because warmup was missing (base 367 ms cold vs delayed 454 ms, delta 86 ms). The control was repaired to warmup first and the matched pair then passed. The first failed delay protocol is retained as a construction lesson, not as a product result.

## Sample counts and uncertainty

No accepted tail inference. Forecast window 120-launch budget was not executed this session. Horizon/re-projection positives are single or small-n construction runs. Browser P95 is not claimed.

## Exclusions

- Eight-job coverage from the 4–5 Nov harness is out of scope here (see `STATE.md`).
- Physical Pixel 6: none.
- Opening-forecast 5 s presentation: not yet measured end-to-end in the browser.
- Desktop worktree evidence (1904 files) was not re-run on this box.

Builder does **not** propose entering Phase B.
