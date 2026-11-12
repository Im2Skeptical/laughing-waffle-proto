# Civilization Survivor Performance hillclimb — STATE

Updated 2026-11-12, 12:36 PM AEDT (Australia/Sydney). **Paused at Cam's 12:36 work / 12:39 commit wrap.** This is a Phase A checkpoint, not acceptance.

**Phase A verdict: NOT SOUND.** **HARNESS_REVIEW.md is NOT AUDITED** (Cam: a separate independent auditor runs after browser proof exists; leave this file NOT AUDITED). No scorecard, no scored candidate, no performance win, no PR. Do not enter Phase B.

## Cam decisions this wrap (recorded, followed)

1. Reusing the branch name `perf/hillclimb-20261104` on v1.1.59 (`7c8f084c`) and leaving the desktop copy untouched is **fine**. The desktop worktree at `C:\Users\User\.t3\worktrees\laughing-waffle-proto\perf-hillclimb-20261104` (HEAD `0e47aa72`, v1.1.53, dirty Hold files) was **not** modified, deleted, or merged.
2. Proceed with the **five-job** scope. The old **eight-job** matrix (J1–J8 from 4–5 Nov) is **deferred**. It remains in the recovered zip `/workspace/uploads/perf-hillclimb-20261104-src/` and is not claimed as coverage here.
3. Independent auditor after browser proof; `HARNESS_REVIEW.md` stays **NOT AUDITED**.

Five jobs in this contract: ordinary New Game through full opening forecast; timegraph scrub per-step (smooth scrub outranks unveil speed); unveil / re-projection after vassal death (Node re-projection proven; browser post-death unveil not yet a suite job); bake; forecast-horizon throughput (Node).

## Branch and worktree

- Box worktree: `/workspace/perf-hillclimb-20261112` (path kept).
- **Git branch: `perf/hillclimb-20261104`**, from `origin/main` tip `7c8f084c` (v1.1.59). Prior checkpoint `c8ac6f32`. Product code is still unchanged from `7c8f084c`. No merge to main, no Pages deploy, no PR, no deletes.
- A leftover local branch name `perf/hillclimb-20261112` may still sit at `7c8f084c` without this commit — do not delete it.

## This wrap — Phase A progress (Builder), 12:16–12:36 AEDT

Harness remains in `scripts/perf-hillclimb-20261112/` and `docs/performance/perf-hillclimb-20261104/`. Raw run: `artifacts/perf-hillclimb-20261112/proof-browser-1230/` (gitignored). Numbers are copied into `PROOF_RUN.md`.

| Item | Status |
| --- | --- |
| Frozen seed 424242 | **Fixed and proven.** 12345 during *preparation* is the idle live runner (`devPlaytesting` `rngSeed`), not the fixture. After `enter()`, `runner.baseSeed === 424242`. Oracle fails closed on mismatch. Seed is committed via localStorage init + fill + `change`; confirm is **"Start here"**. |
| `waitForUseful` | Fixed: after `begin()`, `preparation` is `idle` and `phase` is `revealing` with `lossSec` 5064. Wait is menu-hidden + revealing/completed + loss, then a bounded 30 s authored reveal. |
| Browser launch | Switched to Playwright `channel: 'chrome'` (Chrome 156) + SwiftShader. Headless shell hung 6+ min at ~400% GPU (`proof-browser-1221`) and was abandoned. Load probe on Chrome finished New Game in 72–99 s at 1× on this box. |
| A1-05 Worker wrap | **PASS** (off: no wrap; on: wraps). |
| New Game positive | **PASS.** 84.3 s to useful, loss 5064, phase `completed`, 5 s reveal, bake 26.2 s, heap 971 MB, oracle ok. |
| Scrub positive / wrong-result / +200 ms delay / deferred completion | All **PASS.** Delay delta +201.9 ms; deferred +183.8 ms (neither can look like a speedup). Wrong-target all failed closed. |
| A1-01 queued-input stall | **FAIL.** Game completed (82.3 s, oracle ok, seed 424242) but `queueDelayMs=1.9` (need ≥ 150). Stall listener is registered after the mark listener, so `handlerNow` is taken before the busy-loop; Playwright click is not queued behind a pre-handler stall. Open finding. |
| Suite 1× desktop | **One complete rep.** New Game 83.5 s, loss 5064, bake 27.5 s, reveal 5 s, oracle ok. Scrub **40/40**, min 165.6 / p50 221.2 / p95 561.1 / max 672.3 ms. **P95 INCONCLUSIVE** (n=1 session). |
| Suite 4× mobile | **Not complete.** Started 12:35:35; killed at 12:36:04 with coverage 4306/5064, still preparing. No 4× sample claimed. No 2nd or 3rd suite. |
| Forecast Node controls | Unchanged from the first wrap (PASS). Not re-run. |
| Independent audit | **Not started.** NOT AUDITED. |

Reproduction (from the worktree, after `npm ci` and `npm run build`):

```
node scripts/perf-hillclimb-20261112/statistics-test.mjs
node scripts/perf-hillclimb-20261112/run.mjs --id=PROOF1 --phase=controls --node-only
node scripts/perf-hillclimb-20261112/run.mjs --id=PROOF1 --phase=forecast --forecast-window-n=120 --forecast-horizon-n=6 --reproject-n=6
node scripts/perf-hillclimb-20261112/run-browser-session.mjs proof-N all
```

`run-browser-session.mjs` is the time-boxed browser controls + suites runner used this wrap (skips already-proven Node forecast; deadline 12:36 AEDT this session). `npm run test:perf-hillclimb-20261112` is statistics only (not in `verify`).

Machine: Grok Bot Linux box, 8-core Intel Xeon @ 2400 MHz, 15 GiB RAM, Node v24.22.1, Playwright 1.59.1, Chrome 156 channel, SwiftShader. **Pixel 6 is the device floor.** 4× CDP throttle + mobile viewport is a **CPU-bound phone proxy only**. SwiftShader frame times are not phone GPU truth.

## Parallel diagnostic profiling (other workers; pointers only)

These are **not** owned by this harness and are **not** Phase A acceptance evidence.

- New Game load: `/workspace/hillclimb-profile-load/REPORT.md` — **present** (written ~12:25 PM AEDT). Read-only scratch on `7c8f084c`, seed 1867. Under box contention (load up to 23): New Game wall **71.9 s and 98.9 s at 1×**, **169.6 s at 4×**. Forecast is the critical path; bake 27–45 s overlaps it (main-thread paint, no composition worker). Not a clean v1.1.59 vs v1.1.42 regression baseline.
- Scrub: `/workspace/hillclimb-profile-scrub/REPORT.md` — **present**. Seed 1867, PR #73 on the tip. Desktop warm **P50 342 / P95 593 ms**; 4× warm **P50 909 / P95 1145 ms**. Top costs: `roadBorderCrossings`, three `getStateAt` restores/step (probe never latched `isScrubbing`, so packet skip was not measured), GC/clones. LRU hit 33–40%. Diagnostic hooks were scratch-only, not in this branch.

Prior context (not this harness's baseline): `/workspace/scrub-load-audit-2026-11-01/REPORT.md`, `/workspace/perf-audit-2026-10-31/REPORT.md`.

## Open findings and next steps (on explicit resume)

1. **Fix A1-01** so a 200 ms main-thread stall *after input arrival and before the handler* appears in `queueDelayMs` and in arrival-to-useful. Do not stall inside a listener registered after the mark recorder. Re-run that control until it passes.
2. Run **three consecutive** suites at desktop 1× and mobile-viewport 4×. Predeclared: New Game n=3 is a smoke, **P95 INCONCLUSIVE**; scrub cluster envelope at 3 launches is also **INCONCLUSIVE**. Forecast window 120 Node launches may become tail-eligible (~3–4 min).
3. Distinct Auditor pass from raw artifacts. Leave **NOT AUDITED** until then. Do not enter Phase B on a self-review.
4. Do not score or change product code until Phase A is independently SOUND. Timegraph work must still follow `docs/timegraph-optimisation-guardrails.md`.
5. Optional: wire `run.mjs --phase=suites` to `channel: 'chrome'` and the corrected `waitForUseful` (already in `browser.mjs`, so `run.mjs` should pick it up).

## Recovered prior state (unchanged)

See the 12:16 PM checkpoint in git `c8ac6f32` and Trello https://trello.com/c/PfsQcDH5. Paused 2026-11-05 Phase A **PROOF: NOT SOUND**. Statistics module independently ACCEPTED (round 3) in that era; the port here passes unit tests under a new identity.
