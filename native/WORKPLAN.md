# Native runtime work plan

## Handoff

- State: planning revised 18 Nov 2026; see [ARCHITECTURE](ARCHITECTURE.md).
  N01 is done. N02 and N03 are split into bounded items below. No C++
  gameplay or cross-language parity exists yet.
- Coordination: one supervising session sets design and reviews and integrates
  delegated items on its branch. Each item has one owner at a time.
- Active owners (18 Nov 2026): supervising session on `t3/native-rebuild-planning`.
  It delegated N02a, N03a, N03b and N03c to separate worktree workers, whose
  results it reviews and merges.
- Accepted choices: [README](README.md), [ARCHITECTURE](ARCHITECTURE.md) and
  [THIRD_PARTY.md](THIRD_PARTY.md). C++/SDL3/RmlUi stays the stack. The
  bootstrap renderer is SDL3's default 2D renderer, not RmlUi's SDL_GPU/SDL_GL3 samples.

Use `pending`, `ready`, `active`, `blocked`, `done` for item status. Split an oversized item
into bounded tasks with their own completion criteria. Before implementation
begins, create/link its GitHub issue following the repository issue workflow;
use that issue for detailed scope and discussion, and this file for resumable
status and evidence. Keep one active owner per item.

## N01 - Reproducible native bootstrap (done)

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

## N02a - Representative presentation slice on Windows (active)

Render existing map and card artwork and a representative inspector using
RmlUi. Exercise layering, clipping, scrolling, long text, changing numbers,
mouse and emulated touch input, and window resizing. Choose the graphics
backend from evidence: SDL_Renderer or SDL_GPU behind RmlUi's render
interface, with the clip masks and filters the slice needs. Add a frame-time
harness that records p50/p95/p99 frame times and memory from optimized builds.

Done when the slice runs on Windows from the documented commands, with
reproducible startup/frame-time/memory baselines, and the backend decision and
required effects are documented. Synthetic UI timings are not full-game
performance measurements.

## N02b - Pixel 6 device validation (blocked: needs Cam and the device)

Install and run the N02a slice on a physical Pixel 6. Exercise touch,
pause/resume and surface/resource recreation. Record frame tails, memory,
startup and thermal behavior, and set provisional frame-tail, scrub-latency and
memory budgets for N04. An emulator result does not satisfy this item. A
scripted adb install/run/log-capture helper may be prepared beforehand.

## N03a - Core foundations (active)

Build `waffle_core` per the [determinism contract](ARCHITECTURE.md#determinism-contract):
JS-compatible numerics, RNG streams, an ordered JSON value with JS key order,
a parser, a canonical writer and SHA-256. Split CMake into libraries with
enforced layering and set the floating-point flags on every toolchain.

Done when unit tests cover JS edge cases, with expected values produced by
Node. Cases include `Number::toString` across exponent boundaries,
`Math.round` halves and -0, ToInt32 wraparound, key order, RNG sequences per
stream, and sorted-key hashes equal to the corpus hashes for corpus states.
Dev and optimized CTest pass.

## N03b - Reference traces and divergence tooling (done)

JavaScript tooling in `native/reference/`. Pin `BASELINE`. Write a trace
dumper for scenarios (seed or prepared start, action journal, horizon). It
emits per-second sorted-key hashes and canonical full states at chosen seconds
into ignored artifacts, plus small checked-in fixtures. Write a differ that
reports the first divergent second and JSON path between two states or traces.

Done when traces regenerate deterministically, include several seeds, at least
one multi-year horizon and an action-bearing scenario, and pass the browser's
own replay/JSON-continuation checks. The differ must be shown to catch
injected changes. Browser runtime behavior is unchanged.

Result, 18 Nov 2026 (merged from `t3/native-reference-tracing` 67621683):
`trace.mjs`, `diff.mjs`, `BASELINE` (496d9971, GameState 52), five scenarios.
These are `seed-1` (50 years), `seed-42`, `seed-1867`, `seed-42-shops` (vassal
selection, a Practice Reform purchase and a Public Works visit) and
`seed-2026-late` (from second 3200). Checked-in per-second hashes total 535 KB.
JSON continuation reproduced every per-second hash from all 22 kept states.
`rebuildStateAtSecond` matched all checkpoints, and `--check` is byte-stable.
Step parity from serialized states is therefore valid. The `diff.mjs`
self-test catches four injected change kinds. RNG seeds are unbounded doubles
(`3914056142423` observed), not uint32.

## N03c - State inventory and tick specification (active)

Read-only analysis of the pinned baseline. Produce a draft
`native/schema/gamestate.v<N>.json` describing every serialized field, checked
against real states from many seeds and horizons. Document the per-tick and
per-second pipeline from `updateGame` in call order: which modules run, when,
and which state they read and write. List the determinism hazards with file and
line: key-order dependence, sort comparators, transcendental math, `|0`/`>>>`,
`Math.round`, and NaN/undefined/null handling.

Done when the schema accepts every captured state, and the pipeline document is
detailed enough to cut the N03e items.

## N03p - Performance architecture (pending N03c)

Cam's priority, 18 Nov 2026: performance outranks exact JS matching. See
[Priorities](ARCHITECTURE.md#priorities). Using the N03c pipeline, frequency
and profile data, design the runtime state layout, per-tick work elimination,
compiled content, the summary path and the anchor/restore scheme against the
31 µs-per-sim-second budget (about 1000 years per second). Prototype the
riskiest parts as micro-benchmarks in optimized builds before committing the
layout.

Done when a design note with budgets per step exists, micro-benchmarks support
it, and every proposed divergence from JS behavior is listed for review.

## N03d - Browser-schema adapter and L0 round-trip (pending N03a-c, N03p)

Generate mirror types and JSON I/O from the schema. Map them to and from
runtime state. Every reference state round-trips to byte-identical canonical
JSON. `waffle_parity` can import, export and diff states.

## N03e - Tick systems with step parity (pending N03d; split by pipeline)

Port tick systems in pipeline order, one bounded item per subsystem group.
Each item removes its parity masks, passes L1 on the trace set (or records an
approved divergence), and reports optimized sim-s/s.

## N03f - Actions, replay and new game (pending N03e)

Action application and `rebuildStateAtSecond` (L2), then new game and world
generation (L3). Windows/Android hash agreement (L4) is required before N04
completes.

## N04 - Connected playable slice (pending N02 and N03)

This includes the native forecast/timegraph: worker threads, anchors, restore,
summaries and cancellation, measured against the browser handoff evidence.

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

## Browser reference maintenance - card content pass

Bounded maintenance owner: card-content task (complete at handoff). The browser
v1.1.74 content pass replaces blanket terrain effects with captured card rules
and uses GameState 52. Regenerate only `native/reference/corpus/` after checking
live/JSON/replay parity, then run its frozen verifier. No native gameplay or
N02/N03 implementation is included; the existing ready items retain their owners.
