# Native runtime work plan

## Handoff

- State: workspace setup complete; native implementation has not started.
- Active owner: none.
- Next ready item: N01, reproducible native bootstrap.
- Accepted choices: [README](README.md). C++/SDL3/RmlUi selection is settled;
  graphics backend and exact dependency/toolchain versions are still to prove.
- No native performance results or physical Android results yet.

Use `pending`, `ready`, `active`, `blocked`, `done` for item status. Split an oversized item
into bounded tasks with their own completion criteria. Before implementation
begins, create/link its GitHub issue following the repository issue workflow;
use that issue for detailed scope and discussion, and this file for resumable
status and evidence. Keep one active owner per item.

## N01 - Reproducible native bootstrap (ready)

Inventory the Windows C++/CMake and Android SDK/NDK/JDK tools available. Pin
supported dependencies and toolchain versions with licenses/notices. Establish
independent CMake build/test entry points, development/optimized build presets,
and a documented Android build path.
Add a minimal SDL window with RmlUi text and an input response, plus a headless
native test target. Keep the application-specific code under this directory.

Done when a clean checkout can follow documented commands to build/run on
Windows, compile an Android package, and run the headless test. Record actual
toolchain versions and missing physical-device access separately. Ignore native
outputs locally. No placeholder game simulation is needed for this item.

## N02 - Representative presentation and device viability (pending N01)

Render existing map/card artwork and a representative inspector using RmlUi.
Exercise layering, clipping, scrolling, glyphs/numbers, touch and window sizing.
Compare candidate graphics backends only as needed to satisfy this slice.
Exercise Android pause/resume and surface/resource recreation on a physical
Pixel 6; document any broader Android compatibility restrictions.

Done when the slice is usable on Windows and Pixel 6, the chosen backend and
required effects are documented, and build/startup/frame-time/memory baselines
are reproducible. Set explicit provisional frame-tail, scrub-latency and memory
budgets for the later playable slice from this evidence. Synthetic UI timings
are not full-game performance measurements.

## N03 - Simulation contract and headless native slice (pending N01)

This may proceed before N02 finishes in a separately owned task. Capture a
versioned behavioral reference from the browser game: revision, seed, config,
actions and expected semantic state/RNG at checkpoints. Define numeric types,
rounding, ordering and JSON serialization before implementing a bounded set of
representative settlement rules and generalized content operations in C++.

Done when native headless advance, save/load and authoritative reconstruction
agree for the covered rules; supported fixtures agree with the browser reference
and between Windows/Android native builds. List every unsupported rule and any
intentional difference. A partial fixture must not be described as full-game
parity. Test independence of mutable reconstructed states.

## N04 - Connected playable slice (pending N02 and N03)

Connect regional map -> settlement -> inspect/change a Practice -> forecast ->
scrub. Include enough representative world/simulation load to avoid a misleading
single-card benchmark. Keep expensive forecasting separate from responsive
input/presentation, with explicit ownership and cancellation of obsolete work.
Measure reconstruction, summaries and rendering independently.

Done when the slice preserves replay and the opening-forecast contract, supports
save/load and offline launch, and meets the recorded responsiveness budgets on
Windows and Pixel 6 during sustained forecasting. Report raw workload, horizon,
build/profile, device/OS, warmup and repeated-run results. Record failures rather
than changing gameplay or silently reducing the workload to pass.

## N05 - Iteration and installed profiles (pending N04)

Finish development, performance and full-art installed profiles sharing the same
core. Support quick content/layout/art iteration without mutating captured run
definitions. Package art locally, load textures by need, and make dependencies
and assets reproducible from a clean checkout.

Done when all profiles reproduce the same supported simulation fixtures; full
builds launch offline on both targets; development edit/build/run steps are
documented and timed; full-art memory/lifecycle checks pass. Add native CI for
the supported commands. Packaging/signing tasks must distinguish local install
from store publication.

## N06 - Expand coverage and assess cutover (pending N05)

Expand rules/screens against an explicit coverage list, carrying fixtures and
device checks forward. Existing saves need no migration. The browser game
remains playable while this work proceeds.

Done when intended gameplay/interaction coverage and performance evidence are
reviewable and remaining gaps are listed. Replacing the live game is a separate
user decision; this milestone does not authorize cutover.

## Session records

- Setup: created native entry, accepted scope, ownership/handoff procedure and
  milestones. No native sources, dependency downloads or toolchains added.
  Validation: `npm run verify` passed (documentation, architecture, source,
  assets, build/preview and all regression suites). `npm start` served the
  browser preview with matching version and fingerprint metadata. These are
  browser-project/setup checks, not native compilation or device measurements.
