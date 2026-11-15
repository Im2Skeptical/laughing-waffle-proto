# Phase A — STATE (HC-20261116-A1)

Updated 2026-11-16 01:10 AEDT (Australia/Sydney). Builder: Code Health box executor (Grok Bot). Session start 23:02 AEDT, hard stop 02:32 AEDT. Scope: WP1 → WP2 → WP3, then WP3b (orchestrator, 00:14, max 60 min; WP4–5 only if WP3b passes). No audit (WP6).

**Phase A verdict: NOT SOUND (construction).** `HARNESS_REVIEW.md` is **NOT AUDITED**. No baseline, no scorecard, no gains.

Branch `perf/phase-a-20261116` from `origin/main` `930801a5` (v1.1.69). Worktree `/workspace/perf-phase-a-20261116` (box). `origin/perf/hillclimb-20261104@02b05d97` untouched.

## Package status

| WP | Status | Notes |
| --- | --- | --- |
| WP1 re-base + re-prove base | **PASS** (23:02–23:43, 41 min of 75) | See control table and findings. |
| WP2 A1-01 pre-dispatch stall | **PASS on design 2 of 2** (23:43–23:47) | Design 1 failed (input landed after the stall); design 2 passed. |
| WP3b prepared playing start + mobile touch + repeats/A-A | **STOPPED — mobile 4× deferred-completion control failed twice** (00:14–00:55, 41 of 60 min) | (a) prepared start PASS via documented direct URL, playing, Hold meaningful; (c) desktop 1× repeats + A/A + all controls PASS; (b) mobile 4× touch: correctness, wrong-target, A/A PASS, but deferred control not separable from A/A noise on attempts 1 (n=5) and 2 (n=10). WP4–5 **not started** per rule. |
| WP3 scrub-drag job | **PARTIAL PASS** (23:47–00:10, 23 min of 90) | Ordinary New Game desktop mouse drag: positive oracle and all 3 controls PASS on metric design 2 (r3). Prepared `?seed=424242` start **STOPPED** (same failure twice: Developer tools button not reachable). Mobile touch drag not run. Hold assertion vacuous (see F-W3-3). |

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
| A1-01 pre-dispatch input stall, design 1 | FAIL (design bug, kept as evidence) | stalled 0.7–4.8 ms; `arrivedDuringStall` false ×3: the awaited CDP `mouseMoved` waited out the stall, so the press was created after it | wp2-a1-01-r1 |
| **A1-01 pre-dispatch input stall, design 2** | **PASS** | 400 ms stall, raw CDP press 30 ms in. Stalled: harness `handlerNow − timeStamp` 369.3 / 369.4 / 365.3 ms, Event Timing `processingStart − startTime` 369.2 / 369.3 / 365.1 ms, all arrived during the stall. Unstalled twin: 3.6 / 0.5 / 0.4 ms and 3.5 / 0.4 / 0.3 ms. Every rep, both clocks, alternating order. | wp2-a1-01-r2 |
| scrub-drag positive (ordinary New Game, desktop mouse, 40 moves @50 ms) | PASS | `isScrubbing` latched mid-drag, edge skip active mid-drag, Hold after down, release clears scrubbing, settled state and packets equal never-dragged reference, frontier/seed/timeline unchanged, pointer mapping max error 0.2 s. Caught-up latency p50 506.6 / p95 798.5 ms, 21/21 delivered moves caught up (19/40 coalesced), own-target p50 221.8 ms (n=5), rAF p50 150 / max 567 ms | wp3-drag-r3 |
| drag wrong target (+offset) | PASS (fails closed) | caughtUp 21 → 0, own-target completed 0 | wp3-drag-r3 |
| drag added delay (capture pointermove busy-wait) | PASS on design 2 | p50 506.6 → 1511.3 ms (+1004.7). Design 1 (r2): +128 ms, FAIL | wp3-drag-r3 (r2 kept) |
| drag deferred completion (rAF busy-wait after move) | PASS on design 2 | p50 506.6 → 1087.5 ms (+580.9). Design 1 (r2): deferred read faster (172.3 vs 238.7), FAIL | wp3-drag-r3 (r2 kept) |
| prepared start `?perf=1&seed=424242` drag | STOPPED | `game-new-performance` inside collapsed Developer tools not visible; same failure after fix attempt | wp3-drag-dry1/dry2 |
| **WP3b prepared start** (`/?dev=1&perf=1&art=0&seed=424242&launch=new`, then Minimise → Present → Space) | PASS | seed 424242, loss 6138, opened 22.9 s desktop / 69–83 s mobile 4×; playbackTarget 1 before every drag; `holdMeaningful` now required and true on all 60 drags | wp3b-repeat-desktop-r2, wp3b-repeat-mobile-r3 |
| WP3b desktop 1× mouse, 5 drags × 4 interleaved arms | PASS (20/20 drags pass full oracle) | per-drag p50 median: A1 218.4, A2 230.5, delay 1293.4, deferred 1343.8 ms; pooled A1 p50 218.4 ms (n=121, 95% [196.5, 237.2]) | wp3b-repeat-desktop-r2 |
| WP3b desktop A/A (A1 vs A2) | PASS | Δ +12.1 ms, 95% bootstrap [−37.1, +88.1] (5 vs 5 drags) | same |
| WP3b desktop added delay / deferred | PASS / PASS | +1075.0 [1022.3, 1155.2] / +1125.4 [816.9, 1336.3] ms vs pooled baseline; both lower bounds > A/A envelope 88.1 | same |
| WP3b desktop wrong target ×5 | PASS | caught-up → 0 on every A1 drag | same |
| WP3b mobile 4× touch (844×390), attempt 1, n=5/arm | correctness PASS (20/20), wrong PASS, A/A PASS (Δ +186.7 [−630.8, +470.4]); **delay FAIL** (+1231.1, low 71.1 < env 630.8); **deferred FAIL** (+509.7 [−70.2, +1340.9]) | baseline p50 ~1.0–1.2 s; only 4–8 of 40 moves delivered per drag; rAF p50 ~300 ms | wp3b-repeat-desktop-r2 (mobile section) |
| WP3b mobile 4× touch, attempt 2, n=10/arm | correctness PASS (40/40), wrong PASS, A/A PASS (Δ +186.2 [−71.8, +543.4]), delay PASS (+1251.2 [644.3, 1558.1]); **deferred FAIL** (+673.5 [266.6, 1342.8], low < A/A envelope 543.4) | pooled p50 A1 981.4 [850, 1076] vs A2 1265.1 [1050.9, 1359.4] | wp3b-repeat-mobile-r3 |
| `npm run verify` (Linux) after product probe + WP3 harness | PASS (exit 0) | 00:13 AEDT; artifacts/…/verify-linux-wp3/verify.log | — |

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

## WP2 notes

- Mechanism: `scripts/perf-phase-a-20261116/input-delay.mjs`. Cheap click target is the static menu title (no app handler). Each trial uses a fresh context, so Event Timing `first-input` is always present. The harness mark is a window capture listener registered at document start, which runs before any app listener.
- What this proves: once the browser has created the input event, `event.timeStamp` is set before a busy main thread dispatches it. The harness arrival clock then includes queueing delay, and Event Timing agrees within 0.2 ms. The New Game and scrub-drag jobs use `event.timeStamp` as their start clock.
- Stated limit (not a failure): CDP-injected input enters at the browser process, so OS, compositor and touchscreen latency before that point is not covered. There is no physical Pixel 6 touch-queue evidence.

## WP3 notes

- Mechanism: `scripts/perf-phase-a-20261116/scrub-drag.mjs`. Real CDP pointerdown → 40 moves (25 forward then back, 50 ms open loop) → up on the settlement timegraph, after minimising the recap. Start clock = earliest coalesced `timeStamp` of each move (window capture listener). End = first frame (post-frame MessageChannel stamp) at/after the handler where flag-gated `getScrubProbe()` shows viewedSec equal to that move's scrubSec. Never-dragged reference: browse away and back.
- Design 1 (r2) metric (own-target completed only, stamped inside rAF) failed the delay and deferred controls: survivorship bias (slow moves get superseded and drop out) and the stamp ran before deferred and Pixi render work. Design 2 (r3) fixed both; this was the 2nd and last allowed design.
- **Calibration caveat:** the controls prove sensitivity and direction, not linear calibration. Per-move work compounds across the open-loop stream: +200 ms injected per move → +1005 ms p50; deferred → +581 ms. Delivered moves also fall 21 → 7 under load. Each figure is n=1 drag (one run per arm); no A/A yet. WP4 must add repeated reps and an A/A before any comparison.

## WP3c (started 01:05 AEDT, max 50 min, 2 attempts) — PREDECLARED before running

Mobile 4× touch drag only (844×390, prepared 424242 playing start). Run: `node scripts/perf-phase-a-20261116/scrub-drag.mjs --id=wp3c-mobile-a1 --kinds=prepared-mobile --repeat=20 --design=williams --settle-gap-ms=2000`.

- Ordering: Williams balanced Latin square (`WILLIAMS_4`), 20 rows = 5 blocks → n=20 drags per arm (80 drags). Within each block every arm immediately follows every other arm exactly once; the 4 row-boundary transitions per block add one extra C→B, D→C, A→D, B→A each (recorded via `prevArm`).
- Settle gap before every drag after the first: wait until `playbackTarget === 0`, `isScrubbing === false`, edge skip off, then 2000 ms (recorded as `settleGap`), then Space to resume playing (Hold stays meaningful).
- Pass rule (all required): every drag passes the full oracle incl. `holdMeaningful`; wrong-target fails closed on every A1 drag; **A/A**: 95% bootstrap interval of median(per-drag p50) A2−A1 contains 0; **delay** and **deferred**: Δ vs pooled A1+A2 ≥ 150 ms, lower bound > 0 and lower bound > A/A envelope (max |A/A bound|); **carry-over (F-W3b-1)**: baseline drags preceded by a control arm vs preceded by a baseline arm, 95% bootstrap interval of the median difference contains 0.
- If deferred still cannot be separated after 2 attempts: record the resolution limit = A/A envelope (smallest per-drag-p50 shift distinguishable from A/A noise at n=20/arm) in ms and STOP. No third design. WP4 is not started this session regardless.

## WP3b notes

- (a) Root cause of the WP3 prepared-start STOP (harness, not product): any `?perf=1` URL auto-enters the performance game on load (`startPerformanceEntry` in `src/views/game-menu-dom.js`), so the menu was already leaving when the harness looked for the Developer tools button. The documented entry (`docs/development-workflow.md`: numeric `&seed=` pins a direct launch, `&launch=new` forces a fresh start) is used instead. The menu button path cannot pin seed 424242 without `perf=1` (it draws uniformly from the five prepared worlds), so it is not used. No product UI change.
- Playing state reached by user actions: Minimise the Foreseen Extinction recap (Pixi click point mapped from 2424×1080 design space), press the Present time action, press Space (`togglePause`). Before each drag the harness presses Space again if Hold left it paused. The WP3 ordinary-desktop "Minimise" was a DOM-role lookup that never matched (Pixi button); fixed for all paths.
- Repeat design: per rep the 4 arms (A1, A2, +200 ms in-path delay, +200 ms deferred rAF work) are rotated; uncertainty = deterministic seeded percentile bootstrap (5000 reps) over whole drags of the difference in median per-drag p50. Predeclared pass: A/A 95% interval contains 0; a control passes if Δ ≥ 150 ms, lower bound > 0 and lower bound > A/A envelope (max |A/A bound|).
- **Stated limit (mobile 4×):** with only 4–8 of 40 moves delivered per drag and ~300 ms frames, a +200 ms deferred perturbation shifts the drag metric by +510–674 ms, detectably positive at n=10 (lower bound +267) but not beyond the A/A envelope (±543 ms). The mobile 4× drag job therefore cannot yet resolve changes smaller than ~0.5–0.6 s per-drag p50 at n=10/arm. Desktop 1× resolves ~0.1 s.
- **F-W3b-1 (harness, for Auditor):** mobile A/A shows a consistent +186 ms A2−A1 offset in both attempts (pooled intervals barely overlap in attempt 2). The rotation puts A2 directly after A1 in 3 of 4 positions, so carry-over between consecutive drags is a candidate. Within the predeclared rule it passed, but full counterbalancing (or a settle gap between drags) should be checked before WP4.
- **F-W3b-2 (environment):** the box restarted at about 00:26 AEDT during the first mobile attempt (uptime reset; `node_modules`, `dist` and uncommitted edits were lost). The WP3b edits were re-applied, committed (`9664a877`) and pushed; `npm ci` and `npm run build` were rerun. The first desktop repeat run (00:20, all controls PASS, A1 p50 ≈ 131 ms) was lost with its artifacts; only console output exists, so it is not evidence. The retained desktop run (r2, post-rebuild) has a higher baseline (≈218 ms), which is also a between-session variance signal for WP4.
- WP4 suite integration for scrub-drag is drafted but NOT run: `docs/performance/phase-a-20261116/wp4-scrub-drag-suite.UNRUN.patch` (adds 5 prepared playing drags per population per suite to `run.mjs`).

## WP3 findings (Builder; not audited)

- **F-W3-1 (product observation):** during a drag on the ordinary New Game end state, frames are long (r3 rAF p50 150 ms / max 567 ms; r1 ~467 ms p50) and ~half of 50 ms moves are coalesced. Phase B gap observation; not debugged.
- **F-W3-2 (harness limit, resolved in WP3b):** prepared-start population stopped in WP3; root cause and fix in WP3b notes.
- **F-W3-3 (resolved in WP3b for prepared starts):** Hold assertion is vacuous on the ordinary end state: playbackTarget was already 0 before the drag because the run is at the loss/recap state. Recorded as `holdMeaningful=false` (informational). A meaningful Hold check needs a playing start (prepared start).
- Mobile 4× touch drag not run this session.

## Screenshots

- New Game finished (1×, reveal complete, Foreseen Extinction recap): `artifacts/perf-phase-a-20261116/wp1-browser-controls/controls/ctrl-ng-positive-new-game-finished.png` (box path under the worktree; gitignored, sha256 in the run MANIFEST).

- A1-01 trial screens (menu after the cheap click): `artifacts/perf-phase-a-20261116/wp2-a1-01-r2/a1-01-stalled-0.png`, `artifacts/perf-phase-a-20261116/wp2-a1-01-r2/a1-01-unstalled-0.png`.

- WP3 drag (r3): mid-drag `artifacts/perf-phase-a-20261116/wp3-drag-r3/ordinary-desktop-mid-drag.png`, after settle `artifacts/perf-phase-a-20261116/wp3-drag-r3/ordinary-desktop-after-settle.png` (r2 equivalents also kept).

- WP3b: desktop playing-before-drag / mid-drag / after-settle `artifacts/perf-phase-a-20261116/wp3b-repeat-desktop-r2/prepared-desktop-{playing-before-drag,mid-drag,after-settle}.png`; mobile 4× `artifacts/perf-phase-a-20261116/wp3b-repeat-mobile-r3/prepared-mobile-{playing-before-drag,mid-drag,after-settle}.png`.

## Next step

WP3b STOPPED (same failure twice: mobile 4× deferred control within A/A noise). WP4–5 not started. Cam/orchestrator decision: (1) accept the mobile 4× drag job with a stated resolution limit (~0.5–0.6 s) and proceed to WP4; (2) raise mobile reps (n≈20/arm, ~10 min) and add full counterbalancing / a settle gap (F-W3b-1) as a new package; or (3) measure mobile drag at 1× touch and keep 4× as diagnostic. HARNESS_REVIEW.md stays NOT AUDITED (not ready for audit until WP4–5).
