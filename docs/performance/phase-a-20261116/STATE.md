# Phase A — STATE (HC-20261116-A1)

Updated 2026-11-16 03:05 AEDT (Australia/Sydney). Builder: Code Health box executor (Grok Bot). Session start 23:02 AEDT, hard stop 02:32 AEDT. Scope: WP1 → WP2 → WP3, then WP3b (orchestrator, 00:14, max 60 min; WP4–5 only if WP3b passes). No audit (WP6).

**Phase A verdict: NOT SOUND (construction).** `HARNESS_REVIEW.md` is **NOT AUDITED**. No baseline, no scorecard, no gains.

Branch `perf/phase-a-20261116` from `origin/main` `930801a5` (v1.1.69). Worktree `/workspace/perf-phase-a-20261116` (box). `origin/perf/hillclimb-20261104@02b05d97` untouched.

## Package status

| WP | Status | Notes |
| --- | --- | --- |
| WP1 re-base + re-prove base | **PASS** (23:02–23:43, 41 min of 75) | See control table and findings. |
| WP2 A1-01 pre-dispatch stall | **PASS on design 2 of 2** (23:43–23:47) | Design 1 failed (input landed after the stall); design 2 passed. |
| WP4–5 three suites per profile + Node | **PARTIAL — STOPPED on mobile 4× drag controls (same failure twice)** (01:52–03:05) | Node PASS; desktop 1× 3 suites PASS on every gate; mobile 4× 6 suites (2 runs × 3) functional PASS on every job, but the drag deferred-completion control is not separable from A/A noise at the suite's n=9/arm (FAIL in `wp4-suites` and `wp4-suites-mobile-r2`). Resolution limit recorded. |
| WP3c mobile 4× touch drag: carry-over-balanced order, settle gap, n=21/arm | **PASS on attempt 2 of 2** (01:05–01:39, 34 of 50 min) | Attempt 1 (circuit 1, 2 s gap) failed delay+deferred vs A/A envelope; attempt 2 (position-balanced circuit, 5 s gap) passed every predeclared gate. WP4 not started (next session, per orchestrator). |
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
| **WP3c mobile 4× attempt 2** (84 drags, n=21/arm, `CARRYOVER_CIRCUIT_4B`, 5 s settle gap) | **PASS (all gates)** | 84/84 drags full oracle incl. Hold; wrong-target PASS ×21; **A/A** Δ −127.0 ms, 95% [−384.5, +134.9] (envelope 384.5); **delay** +925.8 [717.8, 1381.4]; **deferred** +696.6 [451.1, 1023.6]; **carry-over** −50.0 [−277.7, +332.3]. Pooled move p50: A1 1131.4 (n=136, [1032.5, 1266.6]), A2 1049.3 (n=133, [961.3, 1148.7]), delay 2012.2 (n=108), deferred 1760.2 (n=101). Gap 5005–5100 ms, idle reached ≤ 99 ms | wp3c-mobile-a2 |
| WP3c mobile 4× attempt 1 (circuit 1, 2 s gap) | FAIL (delay, deferred) | see WP3c section | wp3c-mobile-a1 |
| `npm run verify` (Linux) after WP3b/WP3c harness (tip 47254a58) | PASS (exit 0) | 01:51 AEDT; artifacts/…/verify-linux-wp3c/verify.log (WP3b attempt aborted by box restart / missing Playwright browsers, reinstalled) | — |
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

## WP4–5 — PREDECLARED pass rules (written 01:54 AEDT, before running)

Runs: (1) Node `node scripts/perf-phase-a-20261116/run.mjs --id=wp4-node --phase=forecast` (window 480 s ×120, horizon ×6, re-projection ×6, each with F-W1-3 diagnostics: wall start, loadavg1, heap before/after, GC pauses overlapping the call). (2) Browser `node scripts/perf-phase-a-20261116/run.mjs --id=wp4-suites --phase=suites --allow-suites`: profile-outer, 3 suites desktop 1280×800 1× then 3 suites mobile 844×390 4×. Each suite = fresh browser for ordinary New Game (+ bake, opening-unveil pacing, 40 warm scrub steps) and a second fresh browser for the prepared 424242 playing start with one 12-drag `CARRYOVER_CIRCUIT_4B` cycle (3 drags per arm A1/A2/+200 ms delay/+200 ms deferred), 5 s held-idle settle gap. Node runs are sequential with the browser suites (not concurrent) so they do not perturb each other.

Gates (all required; a failure of the same gate twice = STOP):
- New Game: every launch ok (seed 424242, loss 6138, graphics pinned, reveal reached); bake reported and finite; opening-unveil ok.
- Scrub step: all 40×3 per profile reach the target; wrong target fails (WP1 control).
- Scrub drag: every drag passes the full oracle incl. `holdMeaningful`; wrong-target fails closed on every A1 drag; per profile, pooled over 3 sessions (n=9/arm): A/A 95% interval contains 0; delay and deferred Δ ≥ 150 ms with lower bound > 0 and > A/A envelope.
- Node: window 120/120, horizon 6/6 terminal at 6138, re-projection 6/6 with twin agreement.
- Statistics: every number from `statistics.mjs` (`summarize`, `quantile`, `quantileInterval`) or the seeded bootstrap in `scrub-drag.mjs`; P95 INCONCLUSIVE wherever `eligibleForTailInference` is false (expected for New Game n=3, scrub, drag).

Reported, not stop gates:
- **Between-session check:** per profile, the 3 sessions' baseline (A1+A2, 6 drags each) per-drag p50s compared pairwise by the seeded bootstrap of the median difference. **Cross-session A/A envelope** = max |bound| over the 3 pairwise 95% intervals; a later baseline-vs-candidate comparison made across sessions must exceed it. Also New Game / scrub-step medians per session.
- **F-W1-3 recheck:** does any window launch exceed 3× the median? If so, which diagnostics coincide (GC pause, load, heap, launch index)? Record only.

## WP4–5 results so far (Builder; not audited)

- **Node `wp4-node` (01:55–02:01): PASS.** Window ×120 120/120, p50 1188.2 / p95 1285.5 ms, min 1065.6, max 1402.7, tail-eligible (99% P95 interval [1258.3, 1402.7]); horizon 6/6 terminal at 6138, p50 14535.6 ms (14036–15052), INCONCLUSIVE tail; re-projection 6/6, p50 9281.1 ms (8840–9575), INCONCLUSIVE tail.
- **F-W1-3 recheck: did not recur.** No window launch exceeded 3× the median (max 1402.7 ms = 1.18× median, launch 0, the first measured launch after warmup). Load 0.4–1.8 during the run. Window median moved 1006.7 (WP1) → 1188.2 ms (+18%) between sessions. Trigger diagnostics: wall time, load and heap were recorded per launch; the GC PerformanceObserver recorded **no entries** (gcCount 0 although heap dropped), so GC attribution is not available from this run (harness diagnostic limit, recorded only). The 5.74 s WP1 outlier remains unexplained and non-recurring in 120 further launches.
- **Desktop 1× `wp4-suites` (02:02–02:15): PASS on every gate.** New Game 3/3 (86.1, 100.0, 111.5 s; loss 6138), bake 3/3 (25.8, 28.5, 30.7 s), opening-unveil 3/3, scrub step 120/120 (p50 294.7, p95 864.9 ms), scrub drag 36/36 full oracle incl. Hold; pooled n=9/arm: A/A +33.4 [−45.4, +89.5], delay +1061.3 [992.1, 1145.1], deferred +888.0 [791.2, 1480.0].
- **Between-session (desktop):** session baseline medians 186.6 / 218.0 / 255.8 ms; all three pairwise 95% intervals contain 0; **cross-session A/A envelope = 102.9 ms**. Answer to the 131 vs 218 ms question: drift of that size between sessions is within the cross-session noise at 6 drags/session, so a baseline-vs-candidate comparison across sessions must exceed ~103 ms (desktop) to count. New Game drifted upward across the three sessions (+29%, 86 → 111 s), above the 25% spread flag: labelled, cause not established (no other workload; load was the run's own).
- **Mobile 4× `wp4-suites` (02:15–02:37): functional PASS** (New Game 3/3, 176.6 / 160.0 / 161.9 s; bake 3/3; scrub 120/120 p50 855.4 / p95 1130.9 ms; drag 36/36 full oracle). **Drag controls FAIL #1:** A/A +153.2 [−740.0, +603.0] passes but the envelope (740 ms) is above the delay (+1200.4 [616.4, 1594.8]) and deferred (+925.4 [306.3, 1556.2]) lower bounds. Cross-session envelope 909.7 ms. Expected from WP3c (resolution ≈ 0.4 s needed n=21/arm; the suite gives 9). Attempt 2 is a fresh-ID rerun of the mobile profile only (`--profiles=mobile-x4`, CLI filter added in d5623b39; no measurement change).
- **Mobile 4× attempt 2 `wp4-suites-mobile-r2` (02:37–02:58): functional PASS** (New Game 3/3 159.0 / 168.7 / 152.3 s; bake 3/3 37.2 / 38.3 / 35.8 s; scrub 120/120; drag 36/36 full oracle incl. Hold). **Drag controls FAIL #2:** A/A −39.6 [−774.4, +364.5] PASS; delay +1399.2 [852.4, 1726.3] PASS; **deferred +446.7 [74.8, 1139.5] FAIL** (lower bound below envelope 774.4). Same gate failed twice → STOP for this gate, per rule.
- **Stated resolution limit, mobile 4× drag (recorded, not repaired):** at the suite design (3 sessions × 3 drags/arm = n=9/arm) the within-profile A/A envelope is **740–774 ms** of median per-drag p50, and the cross-session envelope is **871–910 ms**. So at mobile 4× a suite can only detect per-drag-median drag shifts larger than **~0.77 s** (same profile, pooled) or **~0.9 s** (across sessions). WP3c showed n=21/arm in one session brings this to ~0.39 s. The +200 ms deferred control (+447 to +925 ms effect) sits inside that limit. Desktop 1× resolves ~0.09 s within profile and ~0.10 s across sessions.
- **Between-session (mobile, 6 sessions over 2 runs):** session baseline medians 1237.9 / 959.8 / 1196.2 and 884.1 / 1153.3 / 1180.9 ms; every pairwise 95% interval contains 0; cross-session envelope 909.7 and 871.0 ms. Mobile New Game across 6 sessions: 176.6, 160.0, 161.9, 159.0, 168.7, 152.3 s (spread 16%).
- Observation for the Auditor (not debugged): the ordinary New Game recap shows Year 92 at loss 6138 while the prepared start recap shows Year 191 at the same loss second.

## WP3c (started 01:05 AEDT, max 50 min, 2 attempts) — PREDECLARED before running

Mobile 4× touch drag only (844×390, prepared 424242 playing start). Run: `node scripts/perf-phase-a-20261116/scrub-drag.mjs --id=wp3c-mobile-a1 --kinds=prepared-mobile --repeat=21 --design=circuit --settle-gap-ms=2000`.

- Ordering: `CARRYOVER_CIRCUIT_4` = Eulerian circuit of the complete directed graph on the 4 arms (A1,A2,delay,deferred), repeated 7× = 84 drags, **n=21 per arm**. Every ordered pair of different arms occurs exactly 7 times (the one missing wrap pair 6 times), including across cycle boundaries. (A Williams square was drafted first, but its row boundaries doubled 4 pairs, so it was replaced before any run.) Each drag records `prevArm`.
- Settle gap before every drag after the first: wait until `playbackTarget === 0`, `isScrubbing === false`, edge skip off, then 2000 ms (recorded as `settleGap`), then Space to resume playing (Hold stays meaningful).
- Pass rule (all required): every drag passes the full oracle incl. `holdMeaningful`; wrong-target fails closed on every A1 drag; **A/A**: 95% bootstrap interval of median(per-drag p50) A2−A1 contains 0; **delay** and **deferred**: Δ vs pooled A1+A2 ≥ 150 ms, lower bound > 0 and lower bound > A/A envelope (max |A/A bound|); **carry-over (F-W3b-1)**: baseline drags preceded by a control arm vs preceded by a baseline arm, 95% bootstrap interval of the median difference contains 0.
- If deferred still cannot be separated after 2 attempts: record the resolution limit = A/A envelope (smallest per-drag-p50 shift distinguishable from A/A noise at n=20/arm) in ms and STOP. No third design. WP4 is not started this session regardless.

### WP3c attempt 1 result (01:06–01:19) — FAIL

`wp3c-mobile-a1`, 84/84 drags pass the full oracle incl. Hold; wrong-target PASS; A/A Δ +355.2 ms [−19.9, +469.5] (PASS, but envelope 469.5); carry-over Δ +58.0 [−217.3, +458.6] (PASS); delay +1236.5 [397.1, 1438.3] **FAIL** (low < envelope); deferred +894.4 [343.5, 1115.8] **FAIL** (low < envelope). A2 slower than A1 for the 4th time (+187, +186, +355); circuit 1 places A1 early (positions 0,2,4) and A2 later (1,6,8) in each 12-cycle, with controls bunched at the end.

### WP3c attempt 2 — PREDECLARED (same pass rule)

Change only: `--design=circuit2` (`CARRYOVER_CIRCUIT_4B` = [A1,delay,A2,deferred,A2,delay,deferred,A1,deferred,delay,A1,A2], still every ordered pair once per cycle, plus A1/A2 mean position equal and at most 2 controls in a row) and `--settle-gap-ms=5000`. n=21/arm. Last attempt; if deferred or delay still fail, record the resolution limit and STOP.

### WP3c attempt 2 result (01:20–01:38) — PASS

All predeclared gates passed (numbers in the control table). The A/A sign flipped (−127 ms vs +186/+186/+355 before), so F-W3b-1 was a **position effect of the ordering** (A1 early, controls bunched late in each cycle), not a label or runner bias; the position-balanced circuit plus 5 s gap removed it. Carry-over check within noise.

- **Resolution at mobile 4× (stated, not a failure):** the A/A envelope at n=21 drags/arm is ±385 ms of median per-drag p50, so per-drag-median shifts smaller than ~0.4 s are not resolvable at this sample size; desktop 1× resolves ~0.09 s at n=5. Each control effect is larger than the +200 ms injected per move, because per-move work compounds across the coalesced stream.
- One session (one browser launch) per run: these intervals cover drag-to-drag noise within a session, not between sessions. WP4's 3 back-to-back suites must test between-session variance (the WP3b desktop baselines differed 131 vs 218 ms between sessions).

## WP3b notes

- (a) Root cause of the WP3 prepared-start STOP (harness, not product): any `?perf=1` URL auto-enters the performance game on load (`startPerformanceEntry` in `src/views/game-menu-dom.js`), so the menu was already leaving when the harness looked for the Developer tools button. The documented entry (`docs/development-workflow.md`: numeric `&seed=` pins a direct launch, `&launch=new` forces a fresh start) is used instead. The menu button path cannot pin seed 424242 without `perf=1` (it draws uniformly from the five prepared worlds), so it is not used. No product UI change.
- Playing state reached by user actions: Minimise the Foreseen Extinction recap (Pixi click point mapped from 2424×1080 design space), press the Present time action, press Space (`togglePause`). Before each drag the harness presses Space again if Hold left it paused. The WP3 ordinary-desktop "Minimise" was a DOM-role lookup that never matched (Pixi button); fixed for all paths.
- Repeat design: per rep the 4 arms (A1, A2, +200 ms in-path delay, +200 ms deferred rAF work) are rotated; uncertainty = deterministic seeded percentile bootstrap (5000 reps) over whole drags of the difference in median per-drag p50. Predeclared pass: A/A 95% interval contains 0; a control passes if Δ ≥ 150 ms, lower bound > 0 and lower bound > A/A envelope (max |A/A bound|).
- **Stated limit (mobile 4×):** with only 4–8 of 40 moves delivered per drag and ~300 ms frames, a +200 ms deferred perturbation shifts the drag metric by +510–674 ms, detectably positive at n=10 (lower bound +267) but not beyond the A/A envelope (±543 ms). The mobile 4× drag job therefore cannot yet resolve changes smaller than ~0.5–0.6 s per-drag p50 at n=10/arm. Desktop 1× resolves ~0.1 s.
- **F-W3b-1 (harness, for Auditor):** mobile A/A shows a consistent +186 ms A2−A1 offset in both attempts (pooled intervals barely overlap in attempt 2). The rotation puts A2 directly after A1 in 3 of 4 positions, so carry-over between consecutive drags is a candidate. Within the predeclared rule it passed, but full counterbalancing (or a settle gap between drags) should be checked before WP4.
- **F-W3b-2 (environment):** the box restarted at about 00:26 AEDT during the first mobile attempt (uptime reset; `node_modules`, `dist` and uncommitted edits were lost). The WP3b edits were re-applied, committed (`9664a877`) and pushed; `npm ci` and `npm run build` were rerun. The first desktop repeat run (00:20, all controls PASS, A1 p50 ≈ 131 ms) was lost with its artifacts; only console output exists, so it is not evidence. The retained desktop run (r2, post-rebuild) has a higher baseline (≈218 ms), which is also a between-session variance signal for WP4.
- WP4 suite integration for scrub-drag is drafted but NOT run: the former UNRUN patch, now applied to `scripts/perf-phase-a-20261116/run.mjs` (35872c47) (adds 5 prepared playing drags per population per suite to `run.mjs`).

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

WP4–5 partial: every functional gate passed on both profiles and Node; desktop drag controls and between-session check passed; the mobile 4× drag deferred control failed twice at suite size (resolution limit above). Decision for Cam/orchestrator: (1) accept mobile 4× drag with the stated ~0.8 s suite-level resolution (WP3c's n=21 single-session result as the control evidence) and launch the independent audit (`AUDITOR_PACKET.md`), or (2) a WP4b that raises mobile drags per suite to n≥21/arm (≈ +15 min per mobile suite). `HARNESS_REVIEW.md` stays NOT AUDITED.
