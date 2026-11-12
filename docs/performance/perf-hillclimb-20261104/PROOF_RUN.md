# PROOF_RUN — Builder, 2026-11-12 (second wrap, 12:36 PM AEDT)

**Builder's proposed verdict: PROOF: NOT SOUND.** Browser validity is mostly in place and the frozen-seed fixture is proven, but (1) the A1-01 queued-input stall control **failed**, (2) only **one** desktop 1× suite completed (not three consecutive, no completed 4×), and (3) there is no independent Auditor pass (`HARNESS_REVIEW.md` is **NOT AUDITED**). Tail inference is **INCONCLUSIVE**. This is not acceptance and does not enter Phase B.

Date: 2026-11-12, Australia/Sydney (AEDT, UTC+11). Product: `7c8f084c` / v1.1.59 (unchanged). Harness: `scripts/perf-hillclimb-20261112/`, contract `HC-20261112-A0`, harness id `perf-hillclimb-20261112-v1`. Fixture manifest `e2829909ede74f299cf9a7ca08f9338a004a43f374c9aff5c2505aadb67a34a5`. Oracle SDK `8ea60272837ee70eace9ac66104189d9edb01469b4dec07aa4c6c3a19f7f1714`. Build `app-ZBZWUQVW.js` / `timegraph-forecast-worker-EMUDGAG5.js`, `buildAssetSha256` `c8a7c6b72b7cb387634d2b3b47f1a1fb5c7b78c0873d9edacb0c89595e3463ab`. Machine: Linux box, 8-core Xeon @ 2400 MHz, 15 GiB, Node v24.22.1, Playwright 1.59.1, **Google Chrome 156 channel** + Angle/SwiftShader (see launch note below). Pixel 6 is the device floor; 4× CDP throttle + mobile viewport is a CPU proxy only. No physical Pixel 6 evidence.

Raw artifacts (gitignored): `/workspace/perf-hillclimb-20261112/artifacts/perf-hillclimb-20261112/proof-browser-1230/`. Run window 12:30:45–12:36:06 AEDT.

## Launch note (headless shell vs Chrome channel)

The Playwright Chromium headless shell (`chrome-headless-shell`) sat on a SwiftShader gpu-process at ~400% CPU for 6+ minutes without resolving `waitForUseful` (`proof-browser-1221`). The 12 Nov load probe on the same box, using `channel: 'chrome'`, finished New Game in 72–99 s at 1×. This harness now launches **`channel: 'chrome'`**. That is a box measurement choice, not phone GPU truth.

## Seed fixture (424242) — fixed and proven

`runner.baseSeed` of **12345** during opening *preparation* is the idle live runner (`devPlaytesting01` scenario `rngSeed`). It is **not** a fixture failure. The frozen seed is committed via `localStorage` init (`full-map-redesign-v1.newGame.devSettings`) plus fill + `change`, confirmed before click. Confirm is the empty-slot **"Start here"** button. After `enter()` (`resetToState`), `runner.baseSeed` is **424242** and stays that through reveal. The New Game oracle now **fails closed** if `baseSeed !== 424242`.

A first fail-fast that treated 12345 during preparation as a mismatch was a false positive and was removed.

`waitForUseful` no longer requires `opening.preparation === 'ready'`: after `enter()`, `begin()` sets `preparation` back to `idle` and `phase` to `revealing` with `lossSec` 5064. The wait is menu-hidden + (`revealing` or `completed`) + `lossSec > 0`, then a bounded 30 s wait for the authored 5 s reveal.

## Validity controls (proof-browser-1230)

| Check | Result | Raw evidence |
| --- | --- | --- |
| `statistics-test.mjs` | PASS (prior wrap) | See previous `PROOF_RUN` and the unit file. |
| Forecast +200 ms delay, wrong oracles, horizon, re-projection | PASS (prior wrap) | Warm +194 ms for 200 ms; loss 5064; re-projection from 1680 twin-agrees. Not re-run this wrap. |
| A1-05 instrument-off no Worker wrap | **PASS** | `wrapped=false`, `sameRef=true`, `instrumentFlag=false` at 12:30:48 AEDT. |
| A1-05 instrument-on wraps | **PASS** | `wrapped=true`, `sameRef=false`, 12:30:50 AEDT. |
| New Game positive | **PASS** | 12:30:50–12:32:19 AEDT. `elapsedMs=84278.6`, `lossSec=5064`, `coverageSec=5064`, `openingPhase=completed`, `openingElapsedSec=5`, bake `bakeMs=26216.2` (`terrainBakeMs=3081`, `variantBuildMs=6335.6`), `heapMB=971`, `workerWrapped=false`, `oracle.ok=true` reasons `[]`, fixture `ordinary-new-game-seed-424242`, `queueDelayMs=15.1`. Forecast coverage 796 / 2506 at 5 s / 10 s; 5064 by ~15 s (seed already 424242); menu hidden + revealing at ~70 s; reveal completed by 84 s. File: `ctrl-ng-positive.json`. |
| Scrub positive (8 steps) | **PASS** | n=8, failed=0, p50 **374.2 ms**, max **623.9 ms**, 12:32:22 AEDT. `ctrl-scrub-positive.json`. |
| Scrub wrong-result | **PASS** | 3 steps, all `ok=false` (required). viewedSec `[2532, 2784, 3034]`, 12:32:23 AEDT. |
| Scrub +200 ms in-path delay | **PASS** | baseMed **222 ms**, delMed **423.9 ms**, delta **+201.9 ms** (≥ 150), 12:32:27 AEDT. |
| Scrub deferred completion +200 ms | **PASS** | baseMed **222 ms**, defMed **405.8 ms**, delta **+183.8 ms** (≥ 150), 12:32:29 AEDT. Deferred completion cannot masquerade as a speedup. |
| A1-01 New Game queued-input stall (200 ms busy-loop on `pointerdown`) | **FAIL** | Game itself **ok**: `elapsedMs=82291.4`, `lossSec=5064`, `openingPhase=completed`, `oracle.ok=true`. But `queueDelayMs=1.9` (need ≥ 150). `handlerElapsedMs=82289.5`. The stall runs in a capture `pointerdown` listener registered *after* the input-mark listener, so `handlerNow` is recorded before the busy-loop, and Playwright's click is not queued behind a pre-handler main-thread stall. Control does **not** yet demonstrate that arrival-clock elapsed includes queued time. `ctrl-ng-stall.json`. |

Overall `controls.json` `passed: false` because of A1-01 only.

## Suite reps (as many as the 12:36 AEDT deadline allowed)

**suite0-desktop-x1** (1×, 1280×800) — **complete, functionally ok**. Started 12:33:55 AEDT, New Game done 12:35:22, scrub done 12:35:35.

- New Game: `elapsedMs=83510.1`, `ok=true`, `timeout=false`, `lossSec=5064`, `coverageSec=5064`, `openingPhase=completed`, `openingElapsedSec=5` (authored reveal, **not** a compute gain), bake `bakeMs=27498.7` (`terrainBakeMs=2902`, `variantBuildMs=6794.4`), `heapMB=880`, `queueDelayMs=1.3`, `oracle.ok=true` reasons `[]`. File: `raw-ng-suite0-desktop-x1.json`.
- Opening-unveil pacing: 5000 ms, phase completed. Report separately from compute.
- Scrub: **40/40 ok**. Raw `elapsedMs` (ms): `410.7, 550, 484.9, 530.6, 189.2, 188, 239.5, 165.6, 605.7, 172.7, 208.3, 269.3, 253, 494.4, 525, 194.3, 168.3, 203.1, 195.8, 221.2, 192.1, 210.4, 181.2, 190.1, 213.1, 194.8, 196.6, 231.7, 215.9, 279.3, 214.6, 515.9, 208.6, 286.3, 221.7, 672.3, 271.4, 555.8, 561.1, 166.4`. min **165.6**, p50 **221.2**, p95 **561.1**, max **672.3**. File: `raw-scrub-suite0-desktop-x1.json`. One clustered launch of 40 steps is **INCONCLUSIVE** for a two-sided P95 (need 120 independent launches or a conservative session envelope at many more sessions).

**suite0-mobile-x4** — **not a complete observation**. Started 12:35:35 AEDT; at 12:36:04 (deadline kill) coverage was 4306 / 5064, menu still visible, still preparing. No 4× sample is claimed. No second or third suite.

Additional 1× New Game walls in this wrap (same machine, nearby minutes; not a suite): control positive 84.3 s, stall (functionally ok) 82.3 s, suite0 83.5 s. These are on a box that earlier had load average 12–18 from parallel profilers; this 12:30–12:36 window was quieter (load ~7–8 at the Chrome-channel restart).

## Sample counts and uncertainty

No accepted tail inference. Forecast 120-window was not re-run this wrap. Browser New Game n=3 at 1× is only a smoke if counting control + stall + suite0 (stall is a control, comparison-ineligible). Scrub: 1 clustered launch. **P95 INCONCLUSIVE.**

## Exclusions and deferred scope

- The original **eight-job** matrix (J1–J8 from 4–5 Nov) is **deferred**, per Cam. This contract covers the five priority jobs: ordinary New Game through full opening forecast; timegraph scrub per-step; unveil / re-projection after vassal death (Node re-projection is proven; browser post-death unveil is not yet a suite job); bake (read from the New Game snapshot); forecast-horizon throughput (Node).
- Physical Pixel 6: none.
- A1-01 stall control: failed (see above).
- Independent audit: not done.
- Desktop original worktree (`0e47aa72`) not re-run.

Builder does **not** propose entering Phase B.
