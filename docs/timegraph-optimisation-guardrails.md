# Timegraph optimisation guardrails

**Read before optimising or reviewing the timegraph** (forecast, restore, worker, summaries, reveal, scrub, preview).

## Read first
1. `docs/timegraph-ux-and-capacity-brief.md` (Cam's stated intent; status: Draft).
2. `docs/research/timegraph-performance-implementation.md` (what was built and measured).
3. Historical context only: `docs/research/timegraph-performance-audit.md`, `docs/research/timegraph-codec-audit.md`.

## Already implemented (do not re-propose)
- Scoped summary aggregates computed once per summary (`6e60b57`).
- Target-only restore from isolated anchors, with a frozen interned canonical config and a bounded 64-entry LRU of validated anchors (`979e46e`, `src/model/timegraph/state-restorer.js`).
- Persistent worker projection session across yielding slices; built worker URL fix (`6e60b57`, `f12196c`).
- Reveal retune (`f12196c`, constants in `src/views/ui-root/settlement-graph-session.js`).
- Not done on purpose: sparse summaries. Not attempted: packed/WASM state, large-world or ~1000-year measurement.

## Non-negotiables
- Keep every official 60-tick second; no skipped phases, events or years.
- Keep every-second summaries and per-second loss detection.
- Determinism and RNG streams are unchanged; `GameState` stays JSON-only.
- Previews are read-only and get independent mutable state, never shared pointers or copy-on-write sharing of cached state.
- Keep moon-turn and meal fields (they feed later simulation phases).
- The model imports no views.
- Browsing is limited to revealed coverage (`clampScrubSecToRevealCap`).
- Interaction and scrubbing stay smooth during unveil. A Pixel 3 is the device floor.
- Smooth scrubbing outranks unveil speed and horizon length.

## Intent (stated by Cam; Draft, see the brief)
Ideally the simulation is effectively instant, with ~1000 years unveiled in about a second or less, without locking out interaction. Today: ~200 years in ~18.4 s on a desktop fixture.

## Mistakes to avoid
- Recommending "return only summaries/deltas from the worker" or "copy-on-write forks" without checking the existing design and the rules above.
- Taking schema versions from docs; read `src/model/state.js` (currently state v24; config v15 in `src/model/game-config.js`).
- Treating the 40/200/600-year constants or the old 112 sim-s/s reveal ceiling as requirements; they are tuning values (live limits are in `settlement-graph-session.js`).
- Measuring only on desktop or only in Node; phone-class CPU and frame times matter (the 4x CPU mobile case currently fails the smooth gate).

## Measure first
- `node scripts/timegraph-performance-probe.mjs <label>` (browser; `PROBE_LONG_LIVED=1`, `PROBE_ASSERT_SMOOTH=1`, `PROBE_MOBILE=1`, `PROBE_CPU_RATE=4`).
- `node scripts/timegraph-differential-probe.mjs` and `npm run test:differential`.
- `npm run verify`, `npm run probe:settlement`, `npm run probe:navigation`, `npm run probe:timegraph-alignment`.

## Stale references
`ai/repository-map.md` (Timegraph notes), `src/model/timegraph/README.md` and `ai/history/refactor-token-navigation-plan.md` refer to `codex/abandoned-timegraph-refactor-do-not-merge`. That branch is not on the remote (`Im2Skeptical/laughing-waffle-proto`), so its contents cannot be checked; the instruction "do not rewrite these together" stands.
