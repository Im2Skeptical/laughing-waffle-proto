# Timegraph optimisation guardrails

**Read before optimising or reviewing the timegraph** (forecast, restore, worker, summaries, reveal, scrub, preview).

## Read first
1. `docs/timegraph-ux-and-capacity-brief.md` (Cam's stated intent; status: Draft).
2. `docs/research/timegraph-performance-implementation.md` (what was built and measured).
3. Later supply/cache measurements: `docs/research/settlement-supply-performance.md`.
4. Historical context only: `docs/research/timegraph-performance-audit.md`, `docs/research/timegraph-codec-audit.md`.

## Already implemented (do not re-propose)
- Scoped summary aggregates computed once per summary (`6e60b57`).
- Target-only restore from isolated anchors, with a frozen interned canonical config and a bounded 64-entry LRU of validated anchors (`979e46e`, `src/model/timegraph/state-restorer.js`).
- Persistent worker projection session across yielding slices; built worker URL fix (`6e60b57`, `f12196c`).
- Reveal retune (`f12196c`, constants in `src/views/ui-root/settlement-graph-session.js`).
- Shared deep-frozen config per projection generation: snapshots carry no config copy, the cache counts it once (anchors keep the 16 s stride), the worker sends it to the main thread once per generation, MessageChannel slice yields, and round-trip-free detailed-settlement copies (8 Oct 2026, branch `perf/projection-shared-config`).
- Not done on purpose: sparse summaries. Not attempted: packed/WASM state, large-world or ~1000-year measurement.

## Non-negotiables
- Keep every official 60-tick second; no skipped phases, events or years.
- Keep every-second summaries and per-second loss detection.
- Determinism and RNG streams are unchanged; `GameState` stays JSON-only.
- Previews are read-only and get independent mutable state, never shared pointers or copy-on-write sharing of cached state.
- Keep moon-turn and meal fields (they feed later simulation phases).
- The model imports no views.
- Browsing is limited to revealed coverage (`clampScrubSecToRevealCap`).
- Interaction and scrubbing stay smooth during unveil. A Pixel 6 (8 GB RAM, Google Tensor) is the device floor.
- Smooth scrubbing outranks unveil speed and horizon length.
- New Game waits for the full opening forecast (Cam's decision, 8 Oct 2026); do not propose a progressive opening.

## Intent (stated by Cam; Draft, see the brief)
Ideally the simulation is effectively instant, with ~1000 years unveiled in about a second or less, without locking out interaction. The September 25 fixture measured ~200 years in ~18.4 s; that is a dated measurement, not a current performance guarantee. October 2 supply/cache measurements are in `docs/research/settlement-supply-performance.md`.

## Measured baseline (8 Oct 2026, Node worker-path replica, not a device)
- `gameConfig` was ~230 KB of a ~350 KB serialized snapshot, copied into every anchor, slice tail and wire message. It is now shared and frozen per generation.
- 198-year dev fixture (`devPlaytesting01` 99117, base pressure 0), median of 3: before 10.7 s (592 sim-s/s), 143 anchors with a 40 s median gap, wire 121 MB, main-thread 3.1 s. After: 5.9 s (1081 sim-s/s), 412 anchors at the 16 s stride, wire 67 MB, main-thread 2.4 s, restore-to-next-anchor p95 62 ms → 25 ms.
- 189-year new game (seed 424242): 13.3 s (454 sim-s/s) → 6.5 s (924 sim-s/s), 138 → 375 anchors.
- Worker CPU after: simulation ~42%, serialization ~22%, summaries ~15%, wire clone ~7%. Simulation is now the largest cost; `drainPracticeEvents` and `assignDetailedSettlementWorkers` lead it.
- The replica harness (real service, worker and cache in Node `worker_threads`) was ad hoc and is not checked in; it is described in the PR. In-repo checks: `node scripts/timegraph-performance-probe.mjs` and `npm run test:differential`.

## Mistakes to avoid
- Recommending "return only summaries/deltas from the worker" or "copy-on-write forks" without checking the existing design and the rules above.
- Copying schema versions from historical reports. Current numbers are checked in
  `ai/ai-context.md` against `src/model/state.js`,
  `src/controllers/sim-runner/save-slots.js`, and `src/model/game-config.js`.
- Treating the 40/200/600-year constants or the old 112 sim-s/s reveal ceiling as requirements; they are tuning values (live limits are in `settlement-graph-session.js`).
- Measuring only on desktop or only in Node; phone-class CPU and frame times matter (the 4x CPU mobile case currently fails the smooth gate).

## Measure first
- `node scripts/timegraph-performance-probe.mjs <label>` (browser; `PROBE_LONG_LIVED=1`, `PROBE_ASSERT_SMOOTH=1`, `PROBE_MOBILE=1`, `PROBE_CPU_RATE=4`).
- `node scripts/timegraph-differential-probe.mjs` and `npm run test:differential`.
- `npm run verify`, `npm run probe:settlement`, `npm run probe:navigation`, `npm run probe:timegraph-alignment`.

## Keep refactors bounded

Change the view, forecast worker, state restorer, and serialization envelope as
separate units. Each owns different mutable state and cache invalidation rules.
The abandoned combined rewrite was archived during repository maintenance;
current instructions do not depend on retaining its branch or worktree.
