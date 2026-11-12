# Civilization Survivor Performance hillclimb — STATE

Updated 2026-11-12, 12:25 PM AEDT (Australia/Sydney). **Paused at Cam's 12:40 PM AEDT hard wrap.** This is a Phase A checkpoint, not acceptance.

**Phase A verdict: NOT SOUND.** No scorecard, no scored candidate, no performance win, no PR. Independent Harness Auditor acceptance was not reached. A same-agent self-review would not count; if an auditor is obtained, they should start from the raw artifacts and this file.

## Branch and worktree (this resume)

- Box worktree: `/workspace/perf-hillclimb-20261112` (path kept; created 2026-11-12 from `origin/main`).
- **Git branch: `perf/hillclimb-20261104`**, created locally from `origin/main` tip `7c8f084c` (v1.1.59).
- Why not continue the original 2026-11-04 commit history: that branch was **not on origin**. It still lives, untouched, on Cam's desktop DESKTOP-R0AMF0N at `C:\Users\User\.t3\worktrees\laughing-waffle-proto\perf-hillclimb-20261104`, HEAD `0e47aa72` (v1.1.53) with uncommitted Hold-adaptation files. Main has since moved through v1.1.54–v1.1.59 (scrub skip-packets, replay LRU, trade corridors, Crown/Monster/Unrest, etc.). This resume rebuilt a focused harness on current main and, per the 12:40 instruction, reused the **branch name** `perf/hillclimb-20261104` from `origin/main`. The desktop worktree and its branch were not modified, not deleted, and not merged.
- No merge to main. No Pages deploy. Product code in this worktree is unchanged from `7c8f084c`.

## Recovered prior state (2026-11-04 / 2026-11-05)

Sources: Trello card https://trello.com/c/PfsQcDH5 (Icebox, read-only); settled T3 thread `mcp:launch:5af258825e6de9d04e4b79ebf1a7833ca0b4dc2a63cf16061366fe48f4d23941` (read-only); desktop worktree (read-only). Harness docs+scripts were copied to `/workspace/uploads/perf-hillclimb-20261104-harness-src.zip` and unpacked at `/workspace/uploads/perf-hillclimb-20261104-src/` (56 docs, 68 scripts). The ~1904 evidence files were left on the desktop and not copied.

Paused 2026-11-05 ~1:07 PM AEDT (operator pause at 02:04Z). Phase A was already **PROOF: NOT SOUND**. HEAD `0e47aa72`, approved Hold (PR #80 / `83c00497` / v1.1.53) integrated locally as `bebc4ead`. Uncommitted Hold getters/feedback/J5-J6 witnesses preserved on the desktop.

**Original critical jobs (8, frozen in that contract):** J1 ordinary New Game through full opening forecast; J2 Performance New Game/Continue; J3 map pan/zoom/settlement while forecast work is active; J4 Life Map entry/choice/return; J5 timegraph scrub at anchors and off-anchor during reveal; J6 purchase → invalidation → usable preview; J7 save/load/Continue; J8 progressive artwork. Pixel 6 is the floor; desktop and 4× CPU browser were labelled proxies. Machine then: DESKTOP-R0AMF0N, Windows 11, i9-10900K, RTX 3080.

**What made Phase A not sound (recovered findings, condensed):**

Round-1 auditor (`HARNESS_REVIEW.md` on the desktop, **PROOF: NOT SOUND**):

- **A1-01** (blocking): elapsed started at the input *handler's* `performance.now()`, omitting time queued behind a busy frame. Need input-arrival (`event.timeStamp`) and a stall-after-arrival control.
- **A1-02** (blocking): iid binomial P95 over operations ignored session clustering; n=60 cannot bound a two-sided P95.
- **A1-03** (high, reproduced): binomial weights underflowed at large n (`(1-p)**n`).
- **A1-04** (high, reproduced): timeouts dropped from P95 (60 successes at 100 ms + 10 timeouts at 180 s reported P95=100 ms).
- **A1-05** (high): `instrumentation=false` still wrapped `Worker`, so on/off could not measure wrap overhead.
- **A1-06**: runner/oracles/populations not yet executable at that inspection.

Later scoped work (still not whole-harness acceptance): statistics submechanism independently **ACCEPTED** (round 3) at a specific hash — numerical stability, censoring, conservative session-extrema envelope, 120-launch quota, construction rows ineligible. Neutral-storefront Structure eligibility was a real game defect (seed 99117 at second 740), fixed as a correctness prerequisite (`d05bab34`), not a speed gain. Stock-role assertion in the region-map probe was stale and repaired. Hold adaptation: 21/21 scoped controls and 18/18 strict J5/J6 reference cells passed; **three negative cells** (wrong-target / stale-generation / clamp-bypass) were **unexecuted** when paused. Remaining gaps at pause: J3 active-work overlap, Continue/J7 knowledge timing, J8 mobile4 artwork readiness, matched observer/native overhead, three complete suites and 120-launch tails, moving-coast feedback, independent full audit.

This 12 Nov resume uses **Cam's five priority jobs**, not the unclosed eight-job matrix, so a 5-round audit budget can actually finish. The eight-job contract is preserved in the recovered zip and is not claimed as coverage here.

## This session — Phase A progress (Builder)

Harness lives in `scripts/perf-hillclimb-20261112/` (folder name from the original 12 Nov brief) and `docs/performance/perf-hillclimb-20261104/`.

| Module | Status |
| --- | --- |
| `statistics.mjs` + `statistics-test.mjs` | Ported from the accepted 2026-11-05 module. Unit tests **PASS** (stable intervals, honest unbounded/censored tails, clustering, identity isolation). |
| `forecast.mjs` (Node) | Window (480 sim-s), full horizon to loss, mid-run re-projection. Seed 424242 on v1.1.59: **loss at 5064 sim-s** (~11 s, ~450 sim-s/s); re-projection from official frontier 1680 twin-agrees on the same loss (~7 s). |
| Forecast validity controls | After an unmeasured warmup, **+194 ms appears for a 200 ms added delay**. Wrong end and wrong loss **fail closed**. Horizon and re-projection positives **PASS**. Frozen expected loss 5064 must fail closed if product code changes it. |
| `browser.mjs` | Playwright New Game, bake readout, scrub (`browseSecond` waits for viewed-second + frame, not two rAF alone). Input-arrival clock via `event.timeStamp`. Worker wrapped **only** if `instrument=true`. |
| A1-05 worker wrap | Smoke **PASS**: instrument-off leaves `Worker === original`; instrument-on wraps. |
| Browser New Game / scrub suites | **Not completed.** One diagnostic reached in-game forecast preparation (coverage 1726 at ~5 s, 3556 at ~10 s) with the menu still up (correct: New Game waits for the full opening forecast). The run was interrupted by wrap. Under headless Chromium + SwiftShader, a GPU process ran at high CPU for several minutes — duration on this box is not yet a trusted number. |
| Seed fixture | **Open bug:** the harness fills the "New game seed" field with 424242, but a diagnostic snapshot reported `runner.baseSeed` **12345**. The New Game oracle must fail closed on that mismatch; the fixture is not yet proven. |
| 3 consecutive browser suites, 1× and 4× | **Not run.** |
| Independent audit | **Not done.** Do not treat this checkpoint as SOUND. |

Reproduction (from the worktree, after `npm ci` and `npm run build`):

```
node scripts/perf-hillclimb-20261112/statistics-test.mjs
node scripts/perf-hillclimb-20261112/run.mjs --id=PROOF1 --phase=controls --node-only
node scripts/perf-hillclimb-20261112/run.mjs --id=PROOF1 --phase=forecast --forecast-window-n=120 --forecast-horizon-n=6 --reproject-n=6
node scripts/perf-hillclimb-20261112/run.mjs --id=PROOF1 --phase=suites --suites=3
```

`npm run test:perf-hillclimb-20261112` runs the statistics unit tests only (not the long browser suite; not part of `npm run verify`).

Machine for this resume: Grok Bot Linux box, 8-core Intel Xeon @ 2400 MHz, 15 GiB RAM, Node v24.22.1, Playwright 1.59.1 / Chromium 147 headless shell, SwiftShader. **Pixel 6 is the device floor.** CDP CPU throttle 4× with a mobile viewport is a **CPU-bound phone proxy only**. There is **no physical Pixel 6 evidence**. SwiftShader frame times are not phone GPU truth.

Prior measurement context (not this harness's baseline): `/workspace/scrub-load-audit-2026-11-01/REPORT.md`, `/workspace/perf-audit-2026-10-31/REPORT.md`.

## Parallel diagnostic profiling (other workers)

These are **not** owned by this harness and are **not** Phase A acceptance evidence. Pointers for the next session, once those workers finish:

- New Game load profiling: `/workspace/hillclimb-profile-load/REPORT.md`
- Scrub profiling: `/workspace/hillclimb-profile-scrub/REPORT.md`

At 12:15 PM AEDT those `REPORT.md` files were not yet present (the scratch copies of the repo had been created). Re-read them on resume.

## Open audit findings and next steps (on explicit resume)

1. **Fix the New Game seed path** so a filled 424242 is the actual `baseSeed`. Fail the oracle if not. Find whether a "Regular game" / default profile overrides the spinbutton.
2. Finish one instrumented New Game (log opening phase, coverage, menu-hidden, bake, 5 s authored reveal separately from forecast-ready). Confirm SwiftShader load time is a real completion, not a hang.
3. Complete browser validity controls: wrong-result scrub, +200 ms in-path delay, deferred completion, main-thread stall after input arrival (A1-01) visible on `event.timeStamp`.
4. Run **three consecutive** suites: desktop 1× and mobile-viewport 4×; New Game (includes bake), 40 warm scrub steps, opening-unveil pacing reported separately from Node re-projection compute. Predeclared: New Game n=3 per population is a smoke, **P95 INCONCLUSIVE**; scrub is 3 clustered launches of 40 steps (120 operations) — cluster envelope at 3 launches is also **INCONCLUSIVE** for a 99% tail. Forecast window can take 120 independent Node launches (≈3–4 min) and may become tail-eligible.
5. Distinct Auditor pass from raw artifacts (reproduce statistics tests, controls, and `summarize()` from JSON). If no separate auditor is available, leave **NOT AUDITED** and do not enter Phase B.
6. Do not score or change product code until Phase A is independently SOUND. Timegraph work must still follow `docs/timegraph-optimisation-guardrails.md` (full opening forecast wait, intentional reveal pacing is not a compute gain, smooth scrub outranks unveil speed).

## What was unrecoverable

- The original branch was never pushed, so it is not on GitHub. Byte-for-byte continuation of `0e47aa72` plus dirty files would have been possible from the desktop; this resume did not do that, to measure v1.1.59. Full 1904 evidence files were not copied. Scoped statistics acceptance hashes refer to desktop file bytes; the ported `statistics.mjs` matches that recovered source and passes its tests, but is a new identity on this branch.
