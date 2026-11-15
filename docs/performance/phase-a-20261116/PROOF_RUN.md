# PROOF_RUN — HC-20261116-A1

Builder evidence (WP1–WP5). **No proposed SOUND verdict:** WP4–5 passed every functional gate on desktop 1×, mobile 4× and Node, but the mobile 4× scrub-drag deferred-completion control failed at suite size in both mobile runs (stated resolution limit in `STATE.md`). `HARNESS_REVIEW.md` is NOT AUDITED. Every number below is emitted by `scripts/perf-phase-a-20261116/statistics.mjs` (`summarize`) or the seeded bootstrap in `scrub-drag.mjs`, from raw JSON committed under `runs/`. P95 is INCONCLUSIVE wherever `eligibleForTailInference` is false.

## Construction (WP1–WP3c)

- WP1 PASS (re-base v1.1.69, loss 6138, Node controls, browser controls, verify green). WP2 PASS (A1-01 pre-dispatch stall, design 2). WP3 PARTIAL PASS (ordinary desktop drag + controls, `wp3-drag-r3`).
- WP3b: prepared playing start PASS; desktop 1× 5×4 interleaved arms incl. A/A and all controls PASS (`wp3b-repeat-desktop-r2`); mobile 4× deferred FAIL ×2 (`wp3b-repeat-desktop-r2` mobile section, `wp3b-repeat-mobile-r3`).
- WP3c PASS on attempt 2 (`wp3c-mobile-a2`): mobile 4× touch, carry-over/position-balanced order, 5 s settle gap, n=21/arm. A/A −127 [−385, +135] ms; delay +926 [718, 1381]; deferred +697 [451, 1024]; carry-over −50 [−278, +332]. Attempt 1 (`wp3c-mobile-a1`) failed.

## WP4–5 proof runs

Runs: `wp4-node`, `wp4-suites` (desktop 1× ×3, mobile 4× ×3), `wp4-suites-mobile-r2` (mobile 4× ×3, fresh-ID rerun after the first drag-control failure). Each suite = one fresh browser for ordinary New Game (+ bake, opening-unveil, 40 scrub steps) and one fresh browser for the prepared 424242 playing start with a 12-drag `CARRYOVER_CIRCUIT_4B` cycle.

### Node (run `wp4-node`, statistics.mjs `summarize`)

> **Repair round 1 (B05):** the Node rows are **sequential calls inside one Node process** (shared JIT, heap and GC), not independent launches. The original summary got synthetic per-call launchIds, so `statistics.mjs` wrongly treated them as 120 independent launches and marked the window tail eligible. That tail claim is withdrawn: P95 is **INCONCLUSIVE**. From repair round 1 on, `run.mjs` gives all Node rows one process launch identity (`independence: "sequential-in-process"`), so `summarize` reports 1 launch, an unbounded P95 interval and `eligibleForTailInference: false` (proved in `scripts/perf-phase-a-20261116/failclosed-test.mjs`). The p50/p95 point values are descriptive only.

| Job | n pass/attempt | p50 ms | p95 ms | min–max ms | P95 99% interval | Tail inference |
|---|---|---|---|---|---|---|
| window | 120/120 | 1188.2 | 1285.5 | 1065.6–1402.7 | (not valid: see B05 note) | **INCONCLUSIVE** (sequential in-process calls) |
| horizon | 6/6 | 14535.6 | 15051.5 | 14036.2–15051.5 | [14611.6, null] | INCONCLUSIVE |
| reproject | 6/6 | 9281.1 | 9574.6 | 8839.6–9574.6 | [9400.5, null] | INCONCLUSIVE |

### Browser suites (run `wp4-suites`, statistics.mjs `summarize`)

| Job | Profile | Arm | n pass/attempt | launches | p50 ms | p95 ms | Tail inference |
|---|---|---|---|---|---|---|---|
| newGame | desktop 1× | — | 3/3 | 3 | 100016.3 | 111451.6 | INCONCLUSIVE |
| newGame | mobile 4× | — | 3/3 | 3 | 161867.9 | 176640.9 | INCONCLUSIVE |
| bake | desktop 1× | — | 3/3 | 3 | 28480.6 | 30688.7 | INCONCLUSIVE |
| bake | mobile 4× | — | 3/3 | 3 | 38548.6 | 39494.1 | INCONCLUSIVE |
| scrub | desktop 1× | — | 120/120 | 3 | 294.7 | 864.9 | INCONCLUSIVE |
| scrub | mobile 4× | — | 120/120 | 3 | 855.4 | 1130.9 | INCONCLUSIVE |
| scrubDrag | desktop 1× | A1 | 208/208 | 9 | 229.9 | 544.6 | INCONCLUSIVE |
| scrubDrag | desktop 1× | delay | 72/72 | 9 | 1389.9 | 2118.5 | INCONCLUSIVE |
| scrubDrag | desktop 1× | A2 | 199/199 | 9 | 244.8 | 615.4 | INCONCLUSIVE |
| scrubDrag | desktop 1× | deferred | 74/74 | 9 | 1220.1 | 2288.4 | INCONCLUSIVE |
| scrubDrag | mobile 4× | A1 | 59/59 | 9 | 1163.2 | 2519.5 | INCONCLUSIVE |
| scrubDrag | mobile 4× | delay | 48/48 | 9 | 2272.2 | 3194.7 | INCONCLUSIVE |
| scrubDrag | mobile 4× | A2 | 57/57 | 9 | 1376.2 | 2163.8 | INCONCLUSIVE |
| scrubDrag | mobile 4× | deferred | 47/47 | 9 | 2031.4 | 3040.1 | INCONCLUSIVE |
| openingUnveil | desktop 1× | — | 3/3 | 3 | 5000.0 | 5000.0 | INCONCLUSIVE |
| openingUnveil | mobile 4× | — | 3/3 | 3 | 5000.0 | 5000.0 | INCONCLUSIVE |

Scrub-drag controls and between-session check (`wp4-suites/scrub-drag-evaluation.json`, seeded bootstrap of median per-drag p50, 95%):

| Profile | Drags ok | Wrong target | A/A Δ [CI] | Delay Δ [CI] | Deferred Δ [CI] | Session baseline medians | Pairwise session Δ [CI] | Cross-session envelope |
|---|---|---|---|---|---|---|---|---|
| desktop-x1 | 36/36 | PASS | 33.4 [-45.4, 89.5] PASS | 1061.3 [992.1, 1145.1] PASS | 888.0 [791.2, 1480.0] PASS | suite0 186.6, suite1 218.0, suite2 255.8 | suite0→suite1 31.4 [-44.4, 99.7]; suite0→suite2 69.2 [-25.0, 102.9]; suite1→suite2 37.8 [-61.1, 75.3] | 102.9 ms |
| mobile-x4 | 36/36 | PASS | 153.2 [-740.0, 603.0] PASS | 1200.4 [616.4, 1594.8] FAIL | 925.4 [306.3, 1556.2] FAIL | suite0 1237.9, suite1 959.8, suite2 1196.2 | suite0→suite1 -278.1 [-446.1, 457.1]; suite0→suite2 -41.7 [-351.7, 701.9]; suite1→suite2 236.4 [-596.7, 909.7] | 909.7 ms |

### Browser suites (run `wp4-suites-mobile-r2`, statistics.mjs `summarize`)

| Job | Profile | Arm | n pass/attempt | launches | p50 ms | p95 ms | Tail inference |
|---|---|---|---|---|---|---|---|
| newGame | mobile 4× | — | 3/3 | 3 | 158985.6 | 168673.7 | INCONCLUSIVE |
| bake | mobile 4× | — | 3/3 | 3 | 37161.4 | 38310.8 | INCONCLUSIVE |
| scrub | mobile 4× | — | 120/120 | 3 | 865.5 | 1094.3 | INCONCLUSIVE |
| scrubDrag | mobile 4× | A1 | 57/57 | 9 | 1164.7 | 2553.5 | INCONCLUSIVE |
| scrubDrag | mobile 4× | delay | 45/45 | 9 | 2404.9 | 3114.4 | INCONCLUSIVE |
| scrubDrag | mobile 4× | A2 | 55/55 | 9 | 1087.4 | 1705.5 | INCONCLUSIVE |
| scrubDrag | mobile 4× | deferred | 44/44 | 9 | 1560.4 | 3024.8 | INCONCLUSIVE |
| openingUnveil | mobile 4× | — | 3/3 | 3 | 5000.0 | 5000.0 | INCONCLUSIVE |

Scrub-drag controls and between-session check (`wp4-suites-mobile-r2/scrub-drag-evaluation.json`, seeded bootstrap of median per-drag p50, 95%):

| Profile | Drags ok | Wrong target | A/A Δ [CI] | Delay Δ [CI] | Deferred Δ [CI] | Session baseline medians | Pairwise session Δ [CI] | Cross-session envelope |
|---|---|---|---|---|---|---|---|---|
| mobile-x4 | 36/36 | PASS | -39.6 [-774.4, 364.5] PASS | 1399.2 [852.4, 1726.3] PASS | 446.7 [74.8, 1139.5] FAIL | suite0 884.1, suite1 1153.3, suite2 1180.9 | suite0→suite1 269.2 [-53.8, 871.0]; suite0→suite2 296.8 [-171.3, 452.7]; suite1→suite2 27.6 [-732.4, 229.6] | 871.0 ms |

## Between-session check (answers the 131 vs 218 ms desktop question)

Cross-session A/A envelope = max |bound| of the pairwise 95% bootstrap intervals between the 3 sessions' baseline per-drag p50s (6 drags per session). Desktop 1×: **102.9 ms** (session medians 186.6 / 218.0 / 255.8 ms, all pairs contain 0). Mobile 4×: **909.7 ms** and **871.0 ms** (two runs; all pairs contain 0). A baseline-vs-candidate comparison made in different sessions must exceed these envelopes. The earlier 131 vs 218 ms desktop gap is inside the desktop cross-session noise.

## F-W1-3 recheck

Not recurred: in 120 window launches the maximum was 1402.7 ms (1.18× median 1188.2 ms, launch 0); no launch exceeded 3× the median. Load 0.4–1.8. The GC observer recorded no entries, so GC attribution is unavailable (diagnostic limit). Window median moved +18% vs WP1 (1006.7 → 1188.2 ms) between sessions.

## Spreads flagged (>25% on a critical step)

- Desktop New Game rose 86.1 → 100.0 → 111.5 s across three back-to-back sessions (+29%); cause not established; labelled.

## Verify

Linux `npm run verify` exit 0 on `dcfdb071` (02:59–03:12 AEDT), log `artifacts/perf-phase-a-20261116/verify-linux-wp4/verify.log` (box, gitignored).
