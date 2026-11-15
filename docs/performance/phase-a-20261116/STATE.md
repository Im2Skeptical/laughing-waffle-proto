# Phase A — STATE (HC-20261116-A1)

Updated 2026-11-15 23:46 AEDT (Australia/Sydney). Builder: Code Health box executor (Grok Bot). Session start 23:02 AEDT, hard stop 02:32 AEDT. Scope this session: WP1 → WP2 → WP3 of the Code Health audit. No suites (WP4–5), no audit (WP6).

**Phase A verdict: NOT SOUND (construction).** `HARNESS_REVIEW.md` is **NOT AUDITED**. No baseline, no scorecard, no gains.

Branch `perf/phase-a-20261116` from `origin/main` `930801a5` (v1.1.69). Worktree `/workspace/perf-phase-a-20261116` (box). `origin/perf/hillclimb-20261104@02b05d97` untouched.

## Package status

| WP | Status | Notes |
| --- | --- | --- |
| WP1 re-base + re-prove base | **PASS** (23:02–23:46, 44 min of 75) | See control table and findings. |
| WP2 A1-01 pre-dispatch stall | pending | |
| WP3 scrub-drag job | pending | |

## Control table (raw evidence committed under `docs/performance/phase-a-20261116/runs/`)

| Control | Result | Key numbers | Run id |
| --- | --- | --- | --- |
| statistics-test (`statistics.mjs` sha256 9443d670…) | PASS | unchanged bytes from 12 Nov port | all runs |
| `npm run verify` (Linux) | PASS (exit 0) | on `4d7ad7fd` + runs README; artifacts/…/verify-linux-20261115/verify.log | — |
| Seed 424242 opening loss pin | PASS | 6138 in Node (2 derive runs + 6 horizon + 3 controls), build baker 6138, browser lossSec 6138 | wp1-forecast-20261115 |
| forecast +200 ms after 3× warmup | PASS | +200.6 ms (r2), +191.5 ms (browser run) | wp1-node-controls-r2, wp1-browser-controls |
| forecast wrong endSec | PASS (fails closed) | ok=false | same |
| horizon positive / wrong loss | PASS / PASS (fails closed) | endSec 6138, 13.5–13.6 s, ~450 sim-s/s | same |
| re-projection twin | PASS | anchor 2032 → 6138, twin agrees, 8.9–9.0 s | same |
| Node window 480 s ×120 | PASS 120/120 | p50 1006.7, p95 1128.9 ms (tail-eligible, 99% interval [1091.4, 5738.1]); max 5738 at launch 118 (unexplained, see F-W1-3) | wp1-forecast-20261115 |
| Node horizon ×6 / re-projection ×6 | PASS 6/6, 6/6 | horizon p50 14.26 s (13.2–18.0 s), re-projection p50 8.01 s (7.84–8.70 s); INCONCLUSIVE tails | wp1-forecast-20261115 |
| A1-05 worker wrap off / on | PASS / PASS | | wp1-browser-controls |
| New Game positive (1×) | PASS | 84.36 s to reveal complete; loss 6138; bake 25.4 s; graphics pinned; Chrome 156.0.8078.47 | wp1-browser-controls |
| scrub positive / wrong / +200 ms / deferred | PASS ×4 | p50 198.6 ms (n=8); wrong all failed; delay +201.9, deferred +202.0 (quantile p50) | wp1-browser-controls |
| A1-01 pre-dispatch input stall | pending (WP2) | | |
| scrub-drag positive + controls | pending (WP3) | | |

Superseded run: `wp1-node-20261115` used a stale `controls.mjs` (first commit missed the rewrite), so it kept no raw control rows. Results matched r2, but it is not evidence; use `wp1-node-controls-r2`.

## WP1 audit items closed

- **F-3** Node forecast/horizon/re-projection now have raw JSON retained and committed (above).
- **F-4** Re-based on v1.1.69. Opening loss moved 5064 → **6138** on this build; pinned in `scripts/perf-phase-a-20261116/identities.mjs` and enforced by both oracles.
- **F-5 grounded.** New Game split milestones from the same in-page poll (`wp1-browser-controls/controls/raw-ctrl-ng-positive.json` `milestones`, ms after input arrival, upper bounds): worker coverage first 803; **coverage reached loss 17,906 = preparation ready 17,906**; revealing 69,690; menu hidden 71,469; reveal complete 84,347. `coverageSec` is the opening controller's worker `requestCoverage` result and `ready` is set only on a `runComplete` summary (`src/controllers/new-game-opening-controller.js`), so the forecast itself finishes at ~18 s. The 12 Nov PROOF_RUN reading (~15 s) was right. The load profile's "forecast span ≈ wall" did not measure forecast completion. The remaining ~52 s before reveal is main-thread work after the forecast (long tasks: 65 ≥200 ms, longest 15.6 s, sum 61.7 s; bake 25.4 s). Recorded as a Phase B gap observation, not optimised here.
- **F-6** Every control median now comes from `statistics.mjs` `quantile()`; hand-rolled medians removed. (Changes the reported p50 convention to nearest-rank lower median for even n.)
- **F-7** Graphics pinned: `full-map.dev.graphics` set to shipped defaults (all true) before load, read back on every New Game row (`graphicsApplied`, `graphicsPinned`); an unpinned row fails. The 12 Nov label `artwork:minimal` was wrong (ordinary New Game is always illustrated); now `illustrated-default-graphics`.
- Browser pin: Playwright Chrome channel 156.0.8078.47, `--use-gl=angle --use-angle=swiftshader`, recorded per row.

## Findings (Builder; not audited)

- **F-W1-1 (product observation, not a bug):** seed 424242 loss is 6138 on v1.1.69 (5064 on v1.1.59). Expected from product changes since; any later change must re-pin and re-baseline.
- **F-W1-2 (harness):** the first WP1 commit `4d7ad7fd` carried the old `controls.mjs` because a chained shell step did not run; fixed in `b48618a1`. Raw rows in the runs table all come from the fixed version, except `wp1-forecast-20261115`, which does not use `controls.mjs`.
- **F-W1-3 (variance, open for WP4):** Node window launch 118 took 5.74 s against a 1.0 s median, and horizon spread was 13.2–18.0 s (36%). Box 1-min load was 1.35 at start and no other workload was running. WP4 must check for recurrence before pooling.
- **Product measurement hook (flag-gated, view-only):** `__SETTLEMENT_DEBUG__.getScrubProbe()` returns null unless `globalThis.__PERF_MEASUREMENT_HOOKS__ === true`. It reads viewedSec, playbackTarget, graph `isScrubbing`/`scrubSec`, the edge-transfer skip gate and current packet descriptors. No model, save, RNG or replay change. Files: `src/views/ui-root/settlement-debug-api.js`, `src/views/ui-root-settlement-pixi.js`, `src/views/timegraphs-pixi.js`, `src/views/world-map-pixi.js`. No version bump, because there is no PR.

## Screenshots

- New Game finished (1×, reveal complete, Foreseen Extinction recap): `artifacts/perf-phase-a-20261116/wp1-browser-controls/controls/ctrl-ng-positive-new-game-finished.png` (box path under the worktree; gitignored, sha256 in the run MANIFEST).

## Next step

WP2: `node scripts/perf-phase-a-20261116/input-delay.mjs --id=wp2-a1-01-r1`.
