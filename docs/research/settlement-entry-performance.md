# Game entry and first-settlement latency

Investigated 2026-10-06 against `ce326c1`. The reproducible cold-save fixture
starts with seed 123 and advances 1,024 seconds through all official ticks,
using ordinary checkpoint maintenance and the real save serializer. It has
70 checkpoints and a roughly 25 MB save. It is a diagnostic fixture, not a
claim about the user's particular save or physical phone.

## Main cause: cold historical graph samples

The save worker parsed, validated and restored the saved cursor, but returned
no historical summaries. Entry immediately drew the graph on the main thread.
Each uncached plotted second then rebuilt historical state, validated its
configuration and computed its summary. Retaining summaries helped subsequent
draws, but did not remove this first-load cost.

At 844 × 390 on an RTX 3080 with Chromium's CPU throttling set to 4×, the
profiled load spent about 24 seconds in historical graph sampling. The save
loader itself was already running in a worker; moving parsing again would
not address this stall.

The save worker now prepares every historical summary in one isolated replay
with the official tick and action order. Entry installs those summaries in
the existing authoritative-history cache before its first graph draw. Runtime
summaries do not enter GameState, saved timelines or the serialization envelope.
The authoritative loaded state and timeline are unchanged. Unsupported workers
retain the existing ordinary inspector and cold-history fallback.
Preparation yields every 128 seconds and reports progress to the loader's
inactivity watchdog, so a progressing large history is not mistaken for a
stalled worker. Back still terminates the job.

## Other measured costs

- The existing preload prepared the separate settlement overview, while map
  flags open regional panels. Entry now prepares the entry settlement's actual
  panel. An eight-entry LRU retains panels across navigation and replaces them
  when rendered inputs or art change. Preparing every settlement upfront was
  rejected after it increased slow-CPU loading time.
- A completed new-game forecast was merged in one synchronous operation. Its
  profiled entry callback took about 1.3 seconds at 4× CPU. The handoff now
  imports all summaries and anchors in 64-second slices, yielding between them
  behind the loading menu. Cancellation guards prevent obsolete preparation
  from completing entry.

## Measurements and limits

These two cold-load profiles used the same saved fixture, viewport, GPU and
4× CPU setting. Profiling adds overhead; these are diagnostic measurements.

| Cold saved-history load | Before history preparation | With history preparation |
| --- | ---: | ---: |
| Click Continue to menu hidden | 31.5 s | 7.4 s |
| Main-thread plot drawing during load | 24.0 s | 45 ms |

The final sequential comparison without CPU profiling used the same save and
4× CPU setting. Continue took 30.7 s before and 7.6 s after, a 75% reduction.
The worst load frame fell from 26.2 s to 2.45 s; the worst main-thread task fell
from 25.9 s to 2.33 s. Loading still has a noticeable main-thread handoff.
These results are in `artifacts/settlement-entry-final-baseline.json` and
`artifacts/settlement-entry-final-prepared.json`.

First-flag probes verify that the prepared panel is reused and committed
history is unchanged. The warm panel is the entry settlement; other panels are
cached as opened. Actual population, Stock, timing and content changes still
invalidate rendered panels.

New Game still prepares a full loss forecast, and its introduction still
restores previews and replays map-transfer boundaries on the main thread.
The 4× CPU runs retain opening frames around 500 ms. This work does not claim
smoothness on physical phones, very large worlds or thousand-year saves.
Preparing every historical summary adds runtime memory proportional to retained
history; the large-run/phone memory budget remains unmeasured.

## Reproduction and checks

After `npm run build`, run the focused cold-save regression in PowerShell:

```powershell
$env:PROBE_FIXTURE_SEC = '1024'
$env:PROBE_SAVE_ONLY = '1'
$env:PROBE_CPU_RATE = '4'
$env:PROBE_ASSERT_LOAD_MAX_MS = '15000'
$env:PROBE_ASSERT_PREPARED = '1'
npm run probe:settlement-entry -- cold-history
```

Omit `PROBE_SAVE_ONLY` for New Game, opening, map-flag selection, overview
navigation and reload coverage. `PROBE_SAVE` accepts an existing save instead
of generating the fixture. `PROBE_PROFILE=1` captures the main-thread CPU
profile; use it for diagnosis, not final timing claims. Detailed output stays
under `artifacts/settlement-entry-*`.

The save-worker regression compares every historical summary with authoritative
replay, including second-zero actions, RNG-consuming rerolls and later vassal
selection. It preserves the entire loaded state, RNG and timeline, and checks
invalid saves, unavailable workers and cancellation. The new-game handoff
regression compares complete summaries and anchors with a synchronous import
and checks yielding and cancellation.

Validation includes `npm run verify` and the menu, regional-map, settlement,
navigation and timegraph-alignment browser probes. Navigation now waits for
the historical modal's dock portrait update; alignment waits for the scroll
atlas before measuring its bounds. Their existing behavioral and geometry
assertions remain in place.

Simulation rules, all 60 ticks per second, every-second summaries and loss
checks, RNG streams, schemas and independent mutable previews are unchanged.
