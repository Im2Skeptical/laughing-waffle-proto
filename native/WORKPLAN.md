# Native runtime work plan

## Handoff

- State: N01 implementation is complete, pending PR integration. Windows dev and
  optimized builds, both headless cases per profile and rendered input smoke
  checks pass. The merged source builds an arm64 Android debug APK.
  No physical-device run or performance result is claimed.
- Active owner: none; the Nov14 campaign releases ownership at this handoff.
  Bootstrap scope is tracked by issue #95. A worktree copy is not a lock.
- Next ready items: N02 representative presentation/device viability and N03
  a separately owned native simulation slice. The browser reference corpus is
  available, but no C++ gameplay or cross-language parity exists yet.
- Accepted choices: [README](README.md) and [THIRD_PARTY.md](THIRD_PARTY.md).
  C++/SDL3/RmlUi stays the stack. The bootstrap renderer is SDL3's default 2D
  renderer, not RmlUi's SDL_GPU/SDL_GL3 samples.

Use `pending`, `ready`, `active`, `blocked`, `done` for item status. Split an oversized item
into bounded tasks with their own completion criteria. Before implementation
begins, create/link its GitHub issue following the repository issue workflow;
use that issue for detailed scope and discussion, and this file for resumable
status and evidence. Keep one active owner per item.

## N01 - Reproducible native bootstrap (done, pending integration)

Issue: #95. Commands: [README](README.md), [AGENTS](AGENTS.md).
Pins and licenses: [THIRD_PARTY](THIRD_PARTY.md).

The independent native demo has no gameplay simulation, GameState, RNG or
replay implementation. Browser schemas stay GameState 51, GameConfig 31 and
runner saves 33 (game 1.1.68). The separate browser checkpoint fix is covered
by the browser verification suite.

Windows evidence, 14 Nov 2026, independently repeated after Android integration:

- MSVC 19.50.35730.0, toolset 14.50.35717, Windows SDK 10.0.26100.0,
  CMake 4.5.0, Ninja 1.13.2. Tool environment changes are process-local.
- Development and optimized configure/build commands exit 0.
- Both profiles pass 2/2 CTests: headless text/input and UTF-8 asset paths.
- Both rendered smoke checks exit 0: Direct3D 11, 16912 varying pixels,
  one texture, eight draws and one click. Readback is not visual inspection.
- Dependency objects live under each binary tree's _deps. Returning to dev
  after optimized requires no rebuild. No shared Debug/Release object cache.
- Listener lifetime extends through RmlUi shutdown; UTF-8 file reads use
  wide paths on Windows. Two negative controls detect the old failures.

Android evidence, same day:

- Temurin JDK 17.0.21+9, SDK platform/build-tools 35, NDK r30
  (30.0.16248370), Gradle 8.12 and AGP 8.7.3.
- The worker built a debug APK; the parent then rebuilt the merged source
  in the primary checkout with its spaces in the path, reusing the worker's
  project-local tool/download cache. Cold downloads were not repeated.
- bootstrap-android.ps1 now downloads pinned missing archives itself and
  validates hashes, confines extraction/removal to local tools/output, and
  supports an explicit native workspace ToolsRoot. No machine install occurs.
- The package contains arm64 libmain.so with SDL_main, libSDL3.so, the RML
  document, font and font license. minSdk 31, target/compileSdk 35.
- Output: native/android/app/build/outputs/apk/debug/app-debug.apk; copied to
  artifacts/grok-nov14-spend/android-bootstrap/app-debug.apk with inspection.
  Signing is a local debug key. No device install, run, lifecycle or phone
  performance evidence exists. llvm-mingw was not used.

The renderer implements the demo's geometry, textures and scissor needs;
layers, filters and clip masks remain outside this bootstrap. It is not the
final graphics-backend decision. N02 owns representative effects and Pixel 6
proof. N03 owns arithmetic/serialization contracts and native simulation.

## N02 - Representative presentation and device viability (ready after N01 integration)

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

## N03 - Simulation contract and headless native slice (ready after N01 integration)

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
