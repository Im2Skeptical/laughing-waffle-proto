# Timegraph performance: audit and implementation

Measured 2026-09-24; finalized 2026-09-25. Based on main `6556f38`, implemented on isolated branch
`codex/timegraph-performance`. The original checkout and its unrelated work are
untouched. This work does not use the abandoned refactor.

## Outcome

The supplied report identifies real costs, but its proposed changes are not all
safe as written. We implemented cheaper exact summaries, a persistent worker
runner, isolated preview restoration, and three additional defects found during
browser testing. After those changes, we retuned the existing dynamic reveal.
The authored long-lived fixture unveiled 200 years in approximately 18 seconds
on this desktop, compared with the old rate ceiling's theoretical minimum of
57 seconds. This is not instant access to the whole future: existing revealed
coverage and browse gates remain in place.

The real GPU browser used Chromium and an RTX 3080. Normal desktop and mobile
landscape layout tests met the probe's steady-frame and restore budgets. A 4x
CPU slowdown did not, even at the old reveal cap. This is not a guarantee of
hitch-free play on physical phones or large worlds.

## Audit decisions

- Keep every official 60-tick second. Atomic seconds change floating-point
  season boundaries. No simulation phases, population events, or years skipped.
- Keep every-second summaries. Existing graph sampling requests arbitrary
  seconds; sparse producer summaries can trigger expensive reconstruction on
  the main thread. Instead, reuse population, worker and civilization aggregates
  within one summary evaluation, then discard that evaluation context.
- Intern only a private, frozen canonical game config. Return an independent
  mutable state body. Direct cached-state pointers are unsafe because preview
  installation can mutate persistent knowledge.
- Preserve moon-turn and meal data. Moon-turn fields are continuation inputs
  for later simulation phases as well as preview data.
- Preserve the save serializer and today's schemas (state v22/config v14,
  advanced since the brief). Cloning an already stripped private restore body
  does not replace JSON serialization on the save path.
- Retain worker yields. The supplied 750ms stall hypothesis was not proven;
  browser testing found a different concrete worker failure.
- Do not extrapolate these small-fixture numbers into a large-world or
  thousand-year guarantee. A packed/WASM rewrite is not justified without
  profiling the remaining costs first.

The detailed independent audit and experimental results are in the sibling
`laughing-waffle-timegraph-audit` worktree under `docs/research/` and
`experiments/timegraph-audit/`.

## Changes

1. Summary evaluation computes shared aggregates once, preserving every output
   field and every second. The generic metric API's existing third resolver
   argument is preserved; the optional read context is fourth.
2. The worker keeps a live projection session between slices while retaining
   the existing chunk shape, scheduled action ordering, terminal behavior and
   asynchronous yields.
3. Built worker URLs resolve relative to the importing asset. The baseline
   browser requested the worker from the site root, received 404, and silently
   used main-thread fallback. The fixed browser loads the worker successfully.
4. A private, bounded 64-entry restore cache validates external snapshots with
   the full deserializer before trusting them. Each restore clones its mutable
   body and reuses frozen config. Off-anchor restore steps to the target without
   serializing or caching every intermediate second. Save and worker wire
   snapshots remain full snapshots; this is not a wholesale cache-format rewrite.
5. Coverage requests already satisfied by worker output no longer synchronously
   reforecast that range from the frontier during browsing. This was a separate
   source of large jump hitches.
6. A newly arrived terminal summary is checked before returning a cached
   unresolved result for the same 16-second bucket. This fixes terminal 1558
   being hidden by an earlier unresolved result at 1552. Displayed loss still
   follows revealed coverage.
7. The synchronous worker seed is reduced from 120 to 16 seconds. Existing
   dynamic reveal ceilings are retuned from 112 to 384 sim-seconds/second
   (pending edits: 132 to 448), with corresponding response/acceleration tuning.
   The coverage-following algorithm, browse rules and rendering are unchanged.

## Measurements

Results are fixture-specific. The authored debug fixture is different from
current player New Game. Long-lived probes set both monster thresholds to
10,000,000; this fixture override exists only in the test harness.

| Probe | Result |
| --- | --- |
| Independent Node audit, 200 years, same full summaries/anchors | Median 3.12s baseline, 1.77s with scoped aggregates |
| Production differential, 6400 seconds | Three full chunk comparisons match: all summaries, anchors and final state |
| Baseline foreground browser | Worker 404, fallback active; random restore plus render p95 about 50ms |
| Final optimized long-lived desktop, 384 ceiling | First sample beyond 200 years at 18.423s; steady worst frame 27.7ms; random restore plus render at most 12.9ms |
| Optimized mobile landscape layout, normal CPU | Steady worst frame 27.8ms; random restore plus render at most 12.1ms |
| Mobile layout, 4x CPU slowdown, new ceiling | Steady worst frame 284.7ms; restore plus render about 71ms |
| Mobile layout, 4x CPU slowdown, old ceiling | Steady worst frame 201.3ms; restore plus render about 63ms |

Browser steady-frame statistics exclude the first two seconds. Startup still
had frames around 77–105ms in these runs; do not describe the whole session as
having zero hitches. Arbitrary restore probes do not call `hasStateDataAt` first.
The whole-run memory bound and very large/long civilizations remain unmeasured.
Target restoration no longer densifies anchors into a permanent per-second
state cache; summaries and full wire anchors still consume memory.

## Validation and reproduction

- `npm run verify`: architecture, source reachability, assets, production build,
  model/replay and presentation/new-game tests pass.
- `npm run probe:settlement`: passes with the faster reveal.
- `npm run probe:navigation`: passes. The probe now waits for the portrait's
  scheduled screen transition instead of relying solely on a fixed delay;
  production navigation behavior is unchanged.
- Added tests compare exact summaries and sliced/live chunk results, including
  RNG-consuming actions on slice boundaries, terminal boundaries, isolated
  mutable restores, frozen config, off-anchor restoration, missing coverage,
  no intermediate cache densification, stale worker rejection, real edits at
  an off-anchor second, covered-range reuse and revealed loss gates.

From this worktree:

```powershell
node scripts/timegraph-differential-probe.mjs ../laughing-waffle-timegraph-audit
$env:PROBE_LONG_LIVED='1'
$env:PROBE_ASSERT_SMOOTH='1'
node scripts/timegraph-performance-probe.mjs long-lived
```

Browser results and screenshots are written to `artifacts/`; the differential
report is `artifacts/timegraph-node-differential.json`. For stress testing set
`PROBE_MOBILE=1` and `PROBE_CPU_RATE=4`. Clear those variables before normal
desktop measurements. The smooth assertion rejects steady frames over 50ms
or restore-plus-render p95 over 33ms; the CPU stress case intentionally fails
that acceptance gate.

Determinism, RNG streams, official tick order and serialization contracts are
preserved. Cache objects and contexts are runtime-only, outside GameState.
Model code imports no views. Remaining slow-device work needs separate frame
profiling; it cannot be declared solved by faster simulation alone.
