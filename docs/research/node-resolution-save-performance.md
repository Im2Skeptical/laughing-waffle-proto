# Node-resolution / IndexedDB investigation — 2026-10-04

## Follow-up: first-vassal death and actual history plotting

The physical Pixel 6 retest disproved the seven-node result as a complete fix.
Its diagnostics recorded 6.1/7.1/9.2-second recap frame gaps at official seconds
1261/1560/1708 while the forecast worker remained enabled. All five recent saves
succeeded with seven checkpoints and about 3.16 million characters; synchronous
serialization took 32–45 ms and enqueue took 19–25 ms. Those stages do not explain
the multi-second stalls. Elapsed transaction duration is not pure storage time.

The extended seed-735 reproduction now plays through the first vassal's death
(ten nodes, official second 1093) and measures the following twelve seconds of
unveil. Before this change it caught a 20.53-second frame gap. Its main-thread
profile traced the large stall through `drawPlot → getSamplesForWindow →
getSeriesValuesForSeconds → ensureStateAtSecond → rebuildStateAtSecond`.
The history-promotion code used worker summaries, but actual plotting used a
separate sample grid and replayed historical states after derived caches cleared.

The controller now retains every supplied authoritative tick summary separately
from forecast eviction and plot/series/window caches. It publishes them before
the recap's first paint. Actual plotting and historical status reads reuse those
summaries; unsupported series and unavailable summaries keep authoritative replay
as the fallback. Timeline replacement, rewind, and the earliest changed action
invalidate affected summaries. Multiple edits between draws cannot hide an
earlier mutation behind the last mutation's timestamp.
Loaded saves initially lack runtime summaries for their older history. A cold
historical plot sample is reconstructed authoritatively once and its exact
summary is retained for subsequent node commits and metric/scope changes.

Covered views stay still while the recap owns interaction. Simulation/worker
commit orchestration keeps its ordinary cadence above that presentation gate,
and Pixi still draws control feedback. No future-preview restoration or covered
view geometry rebuild competes with Continue. Dismissal resumes presentation.

The remaining profile showed each new preview anchor cloning and validating the
same large config again. The existing 64-anchor restore codec now uses a private
reader: a new config takes the ordinary full deserialization path; identical
JSON config content reuses its validated, frozen canonical config. Every new
anchor body is independently cloned and still validates schema, world, Life Map,
and RNG. Ordinary save/replay deserialization retains mutable independent configs.
There is no serializer, schema, tick, loss-detection, checkpoint, or storage change.

Forecast delivery also cloned the same config independently for each anchor in
one message. Wire encoding now interns configs by exact JSON content within that
message. Structured clone preserves that identity; the receiving handler freezes
the config tree again because frozen descriptors do not survive transport. Only
the frozen config is shared, and no snapshots or every-second summaries are
removed. Wire JSON remains identical. Tests compare complete payloads, verify
independent mutable preview bodies, keep different configs distinct, and require
at least a 50% reduction in the real fixture's V8 structured-serialization size.
The browser probe confirms actual worker replies share the config identity.

The death-to-map transition also forced a redundant second geometry rebuild
after making the map visible. That extra forced rebuild is removed.

The actual plotting regression first failed with synchronous replay despite
prepared summaries. It now covers first paint, dense/focus sampling, metric/scope
and horizon changes, multiple timeline edits, rewind, replacement, and the
unsupported-series replay fallback. Restore tests compare complete state/RNG at
every off-anchor second, mutate returned states, and reject malformed config,
world, Life Map, schema and RNG after the reader is warm.

For the extended browser run:

```powershell
$env:PROBE_NODES='25'
$env:PROBE_UNVEIL='1'
$env:PROBE_LABEL='first-vassal'
npm run probe:recap-input
```

The fixture bypasses the ordinary new-game opening, so the harness waits for
initial loading coverage before playing. It never delays a tap after a recap.
Continue retains its 250 ms feedback / 750 ms dismissal budgets. Return to map
includes the first map draw and has a separate 1500 ms transition budget. The additional
unveil regression catches frame stalls of one second or more; optional
`PROBE_ASSERT_SMOOTH=1` applies the separate 100 ms p95 / 250 ms maximum smoothness
experiment. Software GL under 4× CPU slowdown does not establish physical-phone
frame rates. Do not overlap browser timing runs with other CPU-heavy checks or
rebuild `dist` while a probe is running. Detailed output stays in `artifacts/`.

The first complete passing 4× CPU/software-GL run through death recorded feedback
91/54/46/48/37/116/145/34/48/42 ms, ordinary dismissal at most 525 ms, and return
to map at 1000 ms. The following unveil's largest frame gap was 548 ms rather
than 20.53 seconds; the worker remained enabled with no failure/retry recorded.
This passes the multi-second-stall gate, not the optional strict smoothness
experiment. Physical Pixel 6 confirmation is still needed; these numbers are
not a claim of frame-perfect unveiling on the phone.

The final combined latest-main build, including cold loaded-history reuse,
passed the same ten-node run with ordinary autosaving enabled: feedback
155/53/204/45/41/52/58/42/58/49 ms, ordinary dismissal at most 749 ms, and return
to map at 953 ms. The following twelve seconds had 32 frames, p95 456 ms and
maximum 467 ms; revealed coverage reached second 4155 against target 4213.
The worker stayed enabled with no recorded failure. `npm run verify` and the
settlement, navigation and timegraph-alignment browser probes passed. The
software-rendered frame-smoothness limitation above still applies.

## Earlier seven-node investigation (limited scope)

Pixel 6 report, clarified by the player: Continue on **Turning point resolved**
loses its immediate response after roughly five successive nodes in a short
session, with about a one–two second delay. The original single-node frame probe
was insufficient: it waited 2.5 seconds before tapping and used artificial
checkpoint copies to stress save size.

## Reproduction and cause

`npm run probe:recap-input` plays seven actual consecutive nodes from seed 735,
using a native IndexedDB save slot, the ordinary Starter_02 world, a touch
viewport of 844×390 and 4× CPU slowdown. It taps Continue shortly after each
recap appears. Read-only timing snapshots avoid the broad debug snapshot's
forecast-request side effects. Feedback and dismissal are measured from the
requested native touch event; they include input queueing and browser protocol
overhead. Artifacts contain timings and scalar worker status, not game state.

The initial run caught 1.8-second feedback on node five. Disabling autosave did
not remove it (approximately 1.8–2 seconds on several later nodes). The refined
read-only probe caught 3.3/1.9/3.5-second responses on nodes five/six/seven. Main
thread profiles showed `advanceCoverageLocally`, reached repeatedly through UI
forecast/status getters. Worker diagnostics recorded first-result deadlines
exceeded by approximately 7.3 and 9.3 seconds during later node preparation.
Those timeouts permanently disabled the worker until the next timeline edit.
The fallback then performed simulation and state serialization on the input
thread after the recap opened. No recap input lock was introduced by IndexedDB.

Two defects needed correction:

- A busy UI could declare a stall before queued worker progress was delivered.
  The watchdog now checks in a deferred task; valid progress cancels the check.
- One slow request immediately forced synchronous forecasting. A timeout now
  gets one background retry from accepted coverage, with doubled first-result
  grace. With default settings, a completely silent request/retry remains
  bounded by about 5+10 seconds, plus event-loop delays. Explicit worker errors
  still fall back immediately. Valid progress restores the ordinary retry
  allowance; timeline edits cancel obsolete watchdog tasks and workers.

The deferred check alone failed the consecutive test, so it is not described as
the complete fix. The bounded background retry removed the observed later-node
fallback. In the matched profiled seven-node run, feedback was
166/151/139/88/138/63/56 ms; dismissal was
429/403/310/200/329/252/246 ms. Nodes five and six exercised actual timeout
retries, and the worker remained enabled. These are desktop Chromium/software
GL measurements under CPU slowdown, not measurements on a physical Pixel 6.

The final unprofiled run with ordinary autosaving enabled also passed all seven
nodes: feedback 198/71/116/150/87/100/63 ms; dismissal
624/412/355/429/225/299/275 ms. Nodes five and six again exercised background
timeout recovery. The combined latest-main build passed `npm run verify`.
The existing Life Map and settlement browser probes also passed.

The regression budgets are 250 ms to feedback and 750 ms to dismissal after a
70 ms held touch, and no permanent worker disablement during this healthy run.
They catch the reported one–two second input stall; they do not establish
frame-perfect rendering or guarantee every large-world interaction is smooth.

## Other measurements and diagnostics

The earlier single-node save-size probe compared matched four-checkpoint
IndexedDB and pre-IndexedDB localStorage builds: worst post-popup frame gaps
were 496 and 497 ms respectively. That comparison did not establish a storage
regression. Its optional 500 ms frame gate was unstable across runs; it is a
separate smoothness experiment, not the Continue latency regression above.
Reducing forecast delivery slices did not reliably improve that gate and was
rejected. Production delivery sizes remain unchanged.

The final 24-checkpoint/6,274,919-character stress run passed that optional
500 ms gate (456 ms worst post-popup frame), overlapped a successful save
(28 ms synchronous invocation), and verified the downloadable runtime report.
This clears the previously failing experiment on this tested build, without
claiming consistently smooth frames across devices or arbitrary world sizes.

Profiles also found complete forecast messages being JSON-serialized solely
to estimate disabled production perf counters. Message sizing now runs only
when profiling is explicitly enabled; a real-handler production test guards
both disabled and enabled behavior.

The existing **Save & menu → Developer tools → Download report** now includes:

- Five recent save attempts, separating synchronous serialization/enqueue from
  elapsed access/transaction waits. Transaction wait includes unrelated main
  thread delays and is not pure disk-I/O time.
- First-three-second frame gaps for the last three recaps, excluding menu,
  rotation and background pauses. A gap starting within the window is recorded
  fully even when it ends outside that window.
- Current forecast worker status and its most recent failure/retry reason.

Runtime diagnostics are bounded and contain no game state or stored values.
The existing Export current game can provide a reproducible fixture if a
physical-phone retest still shows the delay.

## Impact and verification

No simulation ticks, every-second summaries, loss checks, RNG streams, state
or save schemas, replay rules, checkpoint retention or save envelope changed.
The node-resolution readiness gate still waits for recap/level-up assets and
next-node choices. Autosaving retains its ordinary ten-second schedule.

The service regression runs the real request/message/merge path with a fake
clock and scheduled task queue. It reproduces queued progress after a long UI
task, proves the first timeout does not advance simulation on the input thread,
and checks eventual fallback against complete deterministic state/RNG after
bounded silence. Explicit errors, new-chunk startup, stale replies and disabled
production telemetry remain covered.

```powershell
npm run verify
npm run probe:recap-input
# Isolate autosave or collect a main-thread profile:
$env:PROBE_SAVE='0'
$env:PROBE_PROFILE='1'
$env:PROBE_LABEL='profiled'
npm run probe:recap-input
```

Profiling adds overhead; leave `PROBE_PROFILE` unset for final latency checks.
The single-node save/report experiment remains available at
`scripts/node-resolution-performance-probe.mjs`; `PROBE_ASSERT_SMOOTH=1` enables
its separate frame-gap budget. Detailed results are written under `artifacts/`.

