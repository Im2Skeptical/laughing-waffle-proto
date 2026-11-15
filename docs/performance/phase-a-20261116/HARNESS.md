# Phase A measurement contract — HC-20261116-A1

Contract **HC-20261116-A1**, started 2026-11-15 23:02 AEDT. **PROOF: NOT SOUND** (construction; see `STATE.md`). No scoring or optimisation before an independent Auditor writes PROOF: SOUND in `HARNESS_REVIEW.md`.

Plan: Code Health audit `/workspace/phase-a-audit-20261115/AUDIT.md` (box path), WP1–WP3 this session; WP4–5 (3-rep suites) and WP6 (audit) are later sessions. Lineage: ported from the 12 Nov box harness on `origin/perf/hillclimb-20261104@02b05d97` (contract HC-20261112-A0, v1.1.59), which stays untouched as history. The 4–5 Nov desktop and 15 Nov T3 lineages contribute rules only, no code.

## Build and machine

- Product baseline: `origin/main` `930801a5` (v1.1.69). Product sources are the variable under test; harness edits are not product gains. Every row carries build-asset SHA, harness/contract ids, fixture id and oracle-SDK SHA (`scripts/perf-phase-a-20261116/identities.mjs`). Run-level `identities.json` adds git HEAD, harness-dirty flag, harness file hashes, machine and 1-min load.
- Machine: Grok Bot Linux box, 8-core Intel Xeon @ 2.4 GHz, 15 GiB, Node 24, Playwright 1.59.1, **Google Chrome channel** headless, `--use-gl=angle --use-angle=swiftshader` (software GL). One browser workload at a time; record `uptime` before timed batches and abort if 1-min load > 3.
- Populations (never pooled): desktop 1280×800 @ CDP CPU 1×; mobile-landscape 844×390 @ CDP CPU 4× (CPU-bound Pixel 6 proxy only; **no physical Pixel 6 evidence**). Start kinds: `ordinary-new-game` (cold) and, for scrub/drag only, `prepared-424242` (performance-mode prepared start, minimal graphics; labelled separately).
- Graphics pin (F-7): ordinary New Game URL has no `?dev=1`/`?perf=1`, so artwork is full illustrated. `localStorage['full-map.dev.graphics']` is set to the shipped defaults (fog, clouds, shadows, wisps, water all true) before load and read back on every row (`graphicsApplied`, `graphicsPinned`); an unpinned row fails its oracle. Population label `artwork: illustrated-default-graphics` (the 12 Nov label `minimal` was wrong: ordinary New Game never used minimal graphics).
- Frozen fixture: seed **424242**. Expected opening loss on v1.1.69 = **6138** sim-s (Node oracle, two runs; also printed by the build's performance-start baker). v1.1.59 was 5064. Both Node and browser oracles fail closed on any other loss.
- Install/build: `npm ci --no-audit --no-fund && npm run build`. Linux `npm run verify` is the repo gate. Windows `verify` is not required (0xC0000409 in `test:build-preview` is out of scope).

## Jobs (five-job scope, Cam 12 Nov)

| ID | Clocks | Functional oracle |
| --- | --- | --- |
| new-game-opening | Cold ordinary New Game. Start = input arrival (`event.timeStamp` of the first `pointerdown`/`click` mark). End = menu hidden + opening `revealing/completed` with loss + bounded authored 5 s reveal. Split milestones (F-5) are recorded relative to arrival from the same 200 ms in-page poll: `coverageReachedLoss` (opening controller `coverageSec`, set from the worker `requestCoverage` result), `preparationReady` (controller sets `ready` only after the worker summary is `runComplete`), `menuHidden`, `revealing`, `revealComplete`. They are upper bounds (poll interval + long tasks). | Seed 424242 after enter; loss == 6138; coverage ≥ 99% of loss; reveal reached; graphics pinned; no slot-count violation. |
| bake | `worldMap.illustratedTerrain.bakeMs` (+ parts) from the same launch. | Reported, finite, New Game ok. |
| scrub-step | After useful New Game, warm `browseSecond(sec)` steps. Start immediately before the call; end when `viewedSec === sec` **and** one later rAF. | `viewedSec` equals the target; wrong target fails. |
| scrub-drag (WP3) | Real CDP mouse/touch drag on the timegraph plot (PR #73 path). See `STATE.md` WP3 for status. | `graph.isScrubbing === true` mid-drag; Hold set; viewed second tracks the pointer; after release+settle equals a never-dragged browse. |
| unveil-reproject | Node official forecast from a mid-run anchor (≈loss/3) of the no-action opening trajectory; compute only. Browser death-recap unveil is uncovered (Cam decision pending). | Terminal; re-projected loss ≤ opening loss; equals an independent twin build; opening loss == 6138. |
| forecast-window / forecast-horizon | Node `buildProjectionChunkFromStateData` on `createNewGameState(424242)`; `process.hrtime.bigint()`. Window 480 s; horizon to terminal. | Window: ok, endSec 480, not terminal. Horizon: terminal, endSec == 6138. |

## Timing, statistics, controls

- Browser `performance.now()`/`event.timeStamp`; Node `hrtime`. Statistics: `scripts/perf-phase-a-20261116/statistics.mjs`, byte-identical to the 12 Nov port (sha256 `9443d670…`; Auditor must re-accept at this hash). **Every summary number, including control medians, is produced by `quantile()`/`summarize()` from that module** (F-6); no hand-rolled medians remain.
- Sample budgets (unchanged): 3 suites per population; New Game/bake 3 launches → P95 INCONCLUSIVE; scrub 3×40 → INCONCLUSIVE; Node window 120 launches; horizon/re-projection 6.
- Validity controls (comparison-ineligible, retained raw): forecast +200 ms after warmup, wrong endSec, wrong loss, horizon positive, re-projection twin; A1-05 worker wrap off/on; New Game positive; scrub positive / wrong / +200 ms / deferred; A1-01 pre-dispatch input stall (WP2); scrub-drag controls (WP3).

## Reproduction

```
npm ci --no-audit --no-fund && npm run build
npm run test:perf-phase-a-20261116
node scripts/perf-phase-a-20261116/run.mjs --id=NEW_ID --phase=controls --node-only
node scripts/perf-phase-a-20261116/run.mjs --id=NEW_ID --phase=controls
node scripts/perf-phase-a-20261116/run.mjs --id=NEW_ID --phase=forecast --forecast-window-n=120
node scripts/perf-phase-a-20261116/input-delay.mjs --id=NEW_ID      # A1-01 (WP2)
node scripts/perf-phase-a-20261116/scrub-drag.mjs --id=NEW_ID       # scrub-drag (WP3)
```

Raw output: `artifacts/perf-phase-a-20261116/<id>/` (gitignored). Each run writes `docs/performance/phase-a-20261116/runs/<id>/MANIFEST.json` (sha256 of every artifact file) and copies JSON files ≤ 256 KiB there for commit. Suites (`--phase=suites --allow-suites`) are WP4 only.
