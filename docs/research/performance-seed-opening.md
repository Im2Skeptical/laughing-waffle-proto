# Performance-mode seed and opening forecast

Investigated 12 November 2026, v1.1.60, against main `7c8f084c`.

The fixed seed provides a real shortcut. `scripts/performance-fixture-recipe.mjs`
creates regular New Game with seed 123 and runs the official projection builder
ahead of time. The generated gzip contains the initial state, every-second
summaries, restore anchors and final forecast state, with shared config stored
once for the forecast. `npm start` and the production build regenerate it when
the simulation/recipe key changes. It is generated output, not a checked-in save.

At entry, `loadPerformanceStart` fetches that file, checks its key, decompresses
it and restores independent mutable initial state. The opening controller returns
this prepared result without constructing an opening forecast worker. Entry still
imports the summaries/anchors through the normal yielding handoff, prepares the
screen and writes the Dev save. Later actions use normal simulation and forecasting.
The fixed seed alone does not make those operations cheaper.

The current seed-123 bake ends at terminal second 3744 and is 9,819,524 compressed
bytes. Network transfer, decompression/JSON parsing and forecast handoff remain
real costs, especially on a phone. This investigation does not optimize them.

The new **Random seed** checkbox uses fresh entropy for each new performance
game, initializes the regular-game setup and completes the ordinary opening
forecast before play. It cannot load the seed-123 bake, even if entropy happens
to choose 123. It ignores the ordinary developer seed/profile/card overrides.
The setting is remembered; direct links support `seed=random` and `seed=123`.
Continue restores the saved world independently of the next-start selection.

## Reproduce the comparison

Run `npm start`, then:

```powershell
node scripts/performance-seed-probe.mjs http://localhost:<printed-port>/
node scripts/performance-entry-browser-probe.mjs http://localhost:<printed-port>/
```

The first probe runs the real browser opening controller, loader, worker and
projection cache in a blank same-origin page. It alternates three prepared loads
with three live forecasts of the **same seed 123 and same coverage**, and asserts
matching seeds, coverage and loss detection. Prepared loads construct zero
opening forecast workers; live runs construct one. It writes individual samples
and medians to `artifacts/performance-seed-probe.json`. Module imports precede
timing; game rendering, artwork, handoff and saving are excluded. Local desktop
measurements are not end-to-end entry times or physical-phone guarantees. Run
without competing tests for timing claims. This is an opening-path measurement,
not a comparison of survival lengths across random worlds.

The second probe exercises the real menu on phone layouts: fixed/random starts,
artwork on/off, no fixed fixture request in random mode, independent new random
seeds, reload/Continue preserving the saved seed, and switch-back to seed 123.
It emulates fullscreen/orientation platform calls; physical-device permissions
remain outside its coverage. Unit tests also cover stored preferences, explicit
URL precedence, blocked storage, cancellation and prepared-loader switching.

Simulation rules, tick order, RNG streams, GameState/save schemas and replay are
unchanged. Only launch selection and runtime-only preparation choose the path.

## Measured result

On this Windows desktop in headless Chromium 147, after the full verification
suite finished, three alternating runs per path gave:

| Opening preparation, seed 123 / terminal second 3744 | Median | Opening workers |
| --- | ---: | ---: |
| Load prepared forecast | 2.134 s | 0 |
| Compute the same forecast live | 14.758 s | 1 |

The baked path was 6.9 times faster for opening preparation in this local test.
These timings exclude screen preparation, artwork, handoff and saving, so they
must not be presented as complete game-entry times. They establish that the
prepared forecast is used and avoids live opening simulation, rather than
demonstrating a general performance benefit from using a fixed RNG seed.
