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

## N02a - Representative presentation slice on Windows (done)

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

Result, 19 Nov 2026 (merged from `t3/native-presentation-slice` 9b3da861).
The slice shows a layered regional map with pan and zoom, five illustrated
Practice cards and an RmlUi inspector. The inspector has long scrolling text,
live numbers and a nested contribution ledger that restores scroll position on
Back. Mouse and SDL finger input give press feedback, and resize works at
844x390. Image decoding uses stb_image 2.30 (PNG only, pinned by SHA-256).
Backend: SDL_Renderer is kept provisionally. The slice uses only transforms
and scissors; the headless test recorded no clip-mask, layer or filter
requests. The bridge passed smoke on D3D11 and on SDL's GPU-backed D3D12 and
Vulkan. Direct SDL_GPU remains the path for stencil and shader effects.
Optimized bench, 1120x510 on an i9-10900K with an RTX 3080, D3D11 x3:
first present about 0.5 s. Frame p50/p95/p99 0.45/2.3/2.6 ms; CPU-side p99
about 0.6 ms. Working set 131 MiB; estimated textures 83 MiB, of which the
card atlas is about 60 MiB. The supervisor's merged optimized build passed
6/6 CTests and `--smoke`. Unverified: the updated Android build, Pixel 6,
lifecycle and sustained behavior (N02b). These are desktop baselines only.

## N02b - Pixel 6 device validation (blocked: needs Cam and the device)

Install and run the N02a slice on a physical Pixel 6. Exercise touch,
pause/resume and surface/resource recreation. Record frame tails, memory,
startup and thermal behavior, and set provisional frame-tail, scrub-latency and
memory budgets for N04. An emulator result does not satisfy this item. A
scripted adb install/run/log-capture helper may be prepared beforehand.

## N03a - Core foundations (done)

Build `waffle_core` per the [determinism contract](ARCHITECTURE.md#determinism-contract):
JS-compatible numerics, RNG streams, an ordered JSON value with JS key order,
a parser, a canonical writer and SHA-256. Split CMake into libraries with
enforced layering and set the floating-point flags on every toolchain.

Done when unit tests cover JS edge cases, with expected values produced by
Node. Cases include `Number::toString` across exponent boundaries,
`Math.round` halves and -0, ToInt32 wraparound, key order, RNG sequences per
stream, and sorted-key hashes equal to the corpus hashes for corpus states.
Dev and optimized CTest pass.

Result, 18 Nov 2026 (merged from `t3/native-core-foundations` 78f0fa9f):
`waffle_core` provides JS numerics, all RNG streams (seed doubles, `baseSeed`
and the standalone `createRng`), ordered JSON with JS key order, a JSON.stringify
writer, a canonical SHA-256 and a CMake layering CTest. The vectors cover 6,019
number formats and 1.08M RNG draws, generated by Node. All nine browser
snapshots re-emit byte-identically and match the corpus hashes. Floating point:
MSVC 19.50 rejects `/fp:contract-` (D9002). `/fp:precise` emits no FMA, but
`/fp:contract` does and changes results. The build uses `/fp:precise` on MSVC
and `-fno-fast-math -ffp-contract=off` on clang. The supervisor repeated the
optimized configure/build: 5/5 CTests and `--smoke` pass. Android: core
cross-compiles with NDK clang 21. Device execution and llvm-mingw runtime are
unverified.

N03a-2 result, 19 Nov 2026 (merged from `t3/deterministic-transcendentals`
714c0632): `waffle::core::js` provides fdlibm/V8 `pow`, `exp`, `log`, `log10`,
`sin`, `cos`, `atan2`, `hypot` and `sqrt`. The vectors (27k–44k per function)
are bit-exact with Node 24.15 fdlibm results. Node's default Windows
`Math.pow` differs in 913/44,096 cases (2.07%), each by 1 ULP. Browser `pow`
is therefore platform-dependent, while native uses portable fdlibm, so
cross-platform native replay is unaffected. The layering check now rejects
platform transcendentals in core/sim/timegraph. Core tests cross-link for
Android arm64 API 31. The supervisor's merged optimized build passed 12/12
CTests.

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

## N03c - State inventory and tick specification (done)

Read-only analysis of the pinned baseline. Produce a draft
`native/schema/gamestate.v<N>.json` describing every serialized field, checked
against real states from many seeds and horizons. Document the per-tick and
per-second pipeline from `updateGame` in call order: which modules run, when,
and which state they read and write. List the determinism hazards with file and
line: key-order dependence, sort comparators, transcendental math, `|0`/`>>>`,
`Math.round`, and NaN/undefined/null handling.

Done when the schema accepts every captured state, and the pipeline document is
detailed enough to cut the N03e items.

Result, 19 Nov 2026 (merged from `t3/native-state-tick-spec` 2a1afa96):
[schema](schema/gamestate.v52.json) (384 types and 1,666 fields; 1,398 observed,
268 unobserved; one `json` escape hatch, `skillProgressionDefs`).
[validate.mjs](schema/validate.mjs) passed 5,198 snapshots across 16 seeds,
actions, prepared starts and a 32,000 s run. [Tick pipeline](spec/tick-pipeline.md)
covers the stepping proposal, the profile and the N03e cuts N03e-1 to N03e-9.
[Hazards](spec/determinism-hazards.md) lists confirmed browser defects: the
mid-second season latch is not serialized; the RNG seed exceeds 2^53 at second
25,729 of the sustained run; Primordial pressure overflows with valid tunables.
Profile, JS sustained 6,720 s in 14.62 s (about 460 sim-s/s): summaries 27%,
Food 19%, anchor JSON 16%, drains 11%. Clock/AP work is about 0.2%. Lunar phases
make nearly every second substantive.

Browser follow-up: the three confirmed defects are being fixed separately
on browser branch `fix/sim-rng-season-primordial`: uint32 seed storage,
integer season clock and a finite Primordial pressure policy. The native port
adopts them in a baseline catch-up after merge. Until then it pins 496d9971.

## N03p - Performance architecture (done)

Cam's priority, 18 Nov 2026: performance outranks exact JS matching. See
[Priorities](ARCHITECTURE.md#priorities). Using the N03c pipeline, frequency
and profile data, design the runtime state layout, per-tick work elimination,
compiled content, the summary path and the anchor/restore scheme against the
31 µs-per-sim-second budget (about 1000 years per second). Prototype the
riskiest parts as micro-benchmarks in optimized builds before committing the
layout.

Done when a design note with budgets per step exists, micro-benchmarks support
it, and every proposed divergence from JS behavior is listed for review.

Result, 19 Nov 2026 (merged from `t3/native-performance-architecture`
09c18cc1). See the [design note](spec/performance-architecture.md); the adopted
decisions are in [ARCHITECTURE](ARCHITECTURE.md#performance-stance).
`waffle_bench` runs skeleton kernels, not rule ports, on a world derived from
real browser state. Optimized, i9-10900K, seven 32,000 s runs: 3.90 µs/sim-s
at 20 sites (Birth 2.34, Workforce 0.65, Summary 0.37, Events 0.29), 7.86 at
2x and 15.04 at 4x. Snapshot 2 KB; restore p95 211 µs at a 64 s stride.
Summary 2.7 KB/s. Peak 84 MiB for one horizon. The supervisor's merged
optimized build passed 11/11 CTests. Deferred divergences: modular RNG,
overflow policy and collation. Open questions: required marker columns and
admissible world/content sizes.

## N03d - Browser-schema adapter and L0 round-trip (done)

N03d-1: generated mirror types and JSON I/O with L0 round-trip. N03d-2: the
runtime state model (hot typed tables, interned IDs, cold subtrees kept as mirror
types) and the mirror-to-runtime-to-mirror mapping, with L0 through runtime.

Generate mirror types and JSON I/O from the schema. Map them to and from
runtime state. Every reference state round-trips to byte-identical canonical
JSON. `waffle_parity` can import, export and diff states.

N03d-1 result, 19 Nov 2026 (merged from `t3/generated-browser-schema-mirror`
b05f3fd0): [codegen.mjs](schema/codegen.mjs) with `--check` generates the
`waffle_sim` mirror (12.5k lines; optimized compile about 11 s). Absent and null
stay distinct, and dict order is preserved. `waffle_parity` provides
`roundtrip`, `hash` and `diff`. L0: 22/22 trace states and 2,949/2,949 schema
snapshots round-trip with equal hashes. No schema fixes were needed. The
supervisor's merged optimized build passed 10/10 CTests. The `waffle_parity hash`
of the seed-1 opening equals trace second 0 (`b38990e9…`). The binary is at
`build/<preset>/src/sim/waffle_parity.exe`.

N03d-2 result, 19 Nov 2026 (merged from `t3/native-runtime-state-mapping`
7cdb1d7e): `RuntimeState` holds flat typed hot tables: clocks, AP, binary64 RNG,
regions and sites, the joint ledger, boards, Stock, moon turns, civilization
ledgers and pending events. It uses checked 32-bit ordinals and authored-order
spans. Cold mirror data is copied with the state; captured content is shared
immutably with an order-sensitive SHA-256. A generated field map drives both
directions, and CTest rejects unclassified fields. L0 through runtime: 22/22
trace states and 2,949/2,949 captures. Copy independence holds. Optimized copy,
median of 101: opening 3.7 µs (38 KB hot); year 50 549 µs (74 KB hot);
late trace 512 µs. With Practice traces cleared, year 50 copies in 6.5 µs. Cold
traces dominate copy cost and would add about 8.6 µs/sim-s at a 64 s anchor
stride, so N03d-3 fixes this. The supervisor's merged optimized build passed
15/15 CTests. Open: legacy captures without joint ledgers; physical adjacency
awaits the world-definition port.

N03d-3: move growing cold history (Practice traces, journals, histories) out of
the copied state into append-only immutable storage with cursors in state.
Done when a late-state full copy is ≤20 µs, L0 through runtime still holds and
copy independence is tested.

N03d-3 result, 19 Nov 2026 (merged from `t3/native-append-only-cold-history`
650f3556). Histories (site and civilization Practice traces, receipts, Vassal
and Life Map records) now live in immutable 16-record typed pages with cursors
in state. Appending creates a branch-owned tail page; export materializes
retained order. Optimized full copies: opening 3.6 µs, year 50 5.6 µs (was
560), late trace 5.4 µs (was 614). Ring retention matches the browser writer
for saturated cases. L0 through runtime: 22/22 and 2,949/2,949. The
supervisor's merged optimized build passed 16/16 CTests. Append cost and
forecast memory get measured once recipes write traces (N03e-3).

## N03e - Tick systems with step parity (N03e-0, N03e-1, N03e-2 done; N03e-1b active)

Cuts follow [the tick pipeline](spec/tick-pipeline.md#proposed-n03e-cuts).
N03e-0 is the captured-content compiler (typed decoded definitions and DSL
structures, with unsupported-op reporting). N03e-1 is clock and stage
dispatch plus the step-parity harness and mask file.

Port tick systems in pipeline order, one bounded item per subsystem group.
Each item removes its parity masks, passes L1 on the trace set (or records an
approved divergence), and reports optimized sim-s/s.

N03e-1 result, 19 Nov 2026 (merged from `t3/native-clock-stage-parity`
1d10f648): `advance_one_second` covers the pause/terminal gate, AP, and the
second and season clocks with the browser's 60 binary64 additions (first
season change at second 9, first year at 33). Ordered lunar dispatch runs
through named empty stage seams. No RNG, no steady-state allocation.
`waffle_parity step` compares masked canonical states per second against
trace windows (`trace.mjs` windows, `step-windows.mjs`).
[parity-masks.json](reference/parity-masks.json) has 119 owner-tagged masks.
Masked L1: 9 windows, 107 comparisons, all pass. Optimized cost
0.159 µs/sim-s. The supervisor's merged optimized build passed 19/19 CTests.
The season latch is kept in native copies; import mirrors the browser's
mid-second restore behavior.

N03e-0 result, 19 Nov 2026 (merged from `t3/native-captured-content-compiler`
bf6fd524): versioned `compile_content` produces immutable tables for Practices,
Structures, settings and Life Map rules. It covers all 16 effect ops and 18
trigger kinds, keeps declaration order, and records which effects commit with
the population recipe. Field accounting: 712 compiled, 29 descriptive,
0 unsupported. The numeric audit widened 46 `gameConfig` fields from `integer`
to `number`; the fractional-keyword state is a regression test. Modifier
dedup uses semantic equality ([divergences](spec/divergences.md)). The compiler
flags any config where browser string identity would differ; none of 2,951
configs do. Optimized compile: 7.9 ms median. The supervisor's merged
optimized build passed 21/21 CTests with both codegen checks current. Open:
run admission must keep the compiled pointer; the active-Vassal keyword
overlay is an interpreter decision for N03e-3.

N03b-2 result, 19 Nov 2026 (merged from `t3/native-stage-probes` 08181841).
`native/reference/stage-probe.mjs` reproduces official seconds stage by stage.
The validity gate passed: all 36 sampled seconds matched official replay and
the trace hashes, giving 254 stage pairs. Coverage includes season, year and
moon rollovers, shops, year 50 and 100, and same-root Smelting/Toolmaking
Discharges. The clock runs on ticks 1-60. On tick 60 the stages run in order:
`prelude`, `seasonal_practices`, `spring_death_baseline`, `birth`, `food`,
`after_meals_practices`, `garrison_upkeep`, `housing`, `faith`,
`migration_practices`, `migration`, `death`, `death_practices`,
`control_and_spatial_pressure`, `phase_events_and_drain`, `vassal_check` and
`final_flush`. The sidecar carries `_seasonChanged`, `_boardDirty` and
`chaosBefore`. `waffle_parity stage --stage <name> --before --after [--masks]`
tests one stage. The supervisor's merged optimized build passed 22/22 CTests.
N03e-3 to N03e-8 can now be ported in parallel once N03e-2 lands.

N03e-2 result, 19 Nov 2026 (merged from `t3/native-settlement-prelude`
959818a5): ports moon-turn creation and rollover, Green tiers, empty Stranger
resets, the Spring death baseline, and Unrest income through expiry. Adds
typed site/bin access, stable ledger merge and proportional allocation, cohort
helpers and class/faction totals ([handoff](src/sim/settlement/README.md)).
Masks: 4 broad masks removed, 29 narrower moon-payload masks added; all 144
remaining masks name an owner. Step parity: 133 comparisons in 11 windows, zero
unmasked mismatches. Optimized cost 0.41 µs/sim-s at the 20-site opening
(0.11 before). Ledger vectors: 17/17. The supervisor's merged optimized build
passed 24/24 CTests. Seams left: migration refunds (N03e-7); control
clearing, market restoration and events (N03e-8).

N03e-1b result, 19 Nov 2026 (merged from `t3/native-stage-parity-wiring`
ec7cf31f): the dispatcher and `waffle_parity stage` share `run_stage` and
`StageContext` over 18 stages, one file per stage
([porting guide](src/sim/README.md#porting-a-stage)). Birth owns moon rollover,
and Migration Practices run before the Migration header update. Stage parity:
advance_clock 36/36, prelude 36/36 with five expiry masks (35/36 unmasked;
the R06 expiry at seed-1/1598 awaits N03e-7/8), spring_death_baseline 3/3.
The supervisor's merged optimized build passed 25/25 CTests.

Parallel wave, started 19 Nov 2026: N03e-3 recipe engine, N03e-4 Birth,
N03e-6a Faith/Chaos and N03e-7a Migration, each in its own stage files.
Food, Housing, Death and control follow once the recipe engine lands.

N03e-3 surfaced two foundation gaps, now assigned. Both run concurrently, with
N03e-3 coding against fixed interfaces:
- N03d-4 world topology: an immutable `WorldTopology` (region order, physical
  adjacency, biome, mountain components) shared from RuntimeState. For now it
  is loaded from browser-exported files in `reference/topology/`. N03f must
  later generate identical topology natively (L3).
- N03d-5 allocation-free history appends completed from WIP `2b2db2d4`.
  Private 16-row tails append in place, shared tails detach on write, and full
  pages stay shared. Recyclable slabs back directory chunks, pages and variable
  payload columns. Existing stages and the adapter use the same `History` API.
  From `native/` after dot-sourcing `native/tools/env.ps1` at the repo root,
  `cmake --preset optimized`, `cmake --build --preset optimized --parallel 8`
  and `ctest --preset optimized --output-on-failure` passed 26/26 on Windows.
  `waffle_history_test` proved 0 global `new` and 0 `delete` calls over 8,192
  warmed seconds with ring rollovers, growing history and retained anchors.
  It also passed interleaved copy isolation, cross-thread snapshot release
  and restore/replay from a `RuntimeState` anchor. `node native/reference/trace.mjs`
  and `node native/reference/step-windows.mjs native/build/optimized/src/sim/waffle_parity.exe`
  passed all 9 windows (107 comparisons). After `node native/schema/capture.mjs --queued`,
  `native/build/optimized/src/sim/waffle_browser_tests.exe runtime-corpus artifacts/native-reference/traces artifacts/native-schema/queued`
  passed L0 on 25 trace states and 2 queued snapshots. On the i9-10900K with MSVC
  19.50, `native/build/optimized/src/sim/waffle_parity.exe runtime-stats artifacts/native-reference/traces/seed-2026-late/state-3200.json`
  gave a 5.9 µs median full copy (seven runs of 101 samples).
  `native/build/optimized/src/sim/waffle_history_test.exe --bench` gave a 223 ns
  median append with provider, trait and text payloads (seven runs of 100,000,
  217–249 ns). First use, slab growth and requests above the pooled size or
  alignment limits can allocate. Measure cold-history high-water capacity and
  admission under the recipe engine and retained forecast anchors. Android
  runtime and timing remain open.
  The browser can use the same anchor-isolation tests if its history storage
  changes. The allocation and timing results describe the native store.

N03e-7a result (resumed the credit-stop WIP 3d01d5fb on `t3/native-migration-stage`).
The Migration dispatcher updates the moon header, reselects reservations,
apportions housing by live road, books departures, and publishes movements
and regional/meal reports. The prelude cancels pending bookings before town
expiry. Migration draws no RNG and matches browser baseline 496d9971 without
an intentional divergence. N03e-3 owns scheduled Migration Practices before
the header. N03e-7 Death owns arrival food, hardship and committing arrivals.
At seed-1/1598 the Migration cancellation matches, with four remaining
prelude masks covering control, the storefront, and Practice event writes
(N03e-8). Movement tables and report arrays still have step masks for
unported reservation/Stock writes and Death, while regional and site report
presence, timestamps and source losses are now exposed.

Windows MSVC optimized build and CTests passed 26/26 with
`cmake --preset optimized`, `cmake --build --preset optimized` and
`ctest --preset optimized --output-on-failure` from `native/`.
`node native/reference/stage-probe.mjs --all --check` and
`node native/reference/stage-pairs.mjs native/build/optimized/src/sim/waffle_parity.exe migration`
matched 15/15 pairs unmasked. Real moves include seed-123/2033 and /2129
(32 each) and seed-1/1715 (5 and 3). Seed-123/2039 has no moves or unplaced
people, /2123 has 31 unplaced and /2675 has 318 unplaced across two sources.
`settlement_migration` also passes unmasked housing contention, live refunds
and legacy external emigration. `node native/reference/trace.mjs` and
`node native/reference/step-windows.mjs native/build/optimized/src/sim/waffle_parity.exe`
produced 14 passing windows and 120 comparisons.

Using `waffle_parity step --from <window>/state-<start>.json --seconds <k>
--expect-dir <window> --masks native/reference/parity-masks.json --time`,
the median of five runs of the ported pipeline on the i9-10900K was 0.52 µs/sim-s for
seed-1/0 (`k=39`), 3.18 for seed-1-migration/1714, 1.65 for
seed-123-migration/2032, and 3.55 for seed-123-migration/2674 (`k=3`).
Windows are in `artifacts/native-reference/windows/`. The optimized
allocation probe in `artifacts/native-migration/allocations.cpp` measured
zero allocations across 50,000 warmed invocations per input, including real
bookings and unresolved reservations. Scratch and state arenas allocate
when first populated or at a new high-water mark. Android was untested.

N03d-4 result, 19 Nov 2026. Gameplay admission retains immutable topology
and compiled content and shares both across runtime copies. The parity
tools resolve `world.definitionId` through the topology manifest. From
`native/`, `cmake --preset optimized`, `cmake --build --preset optimized`
and `ctest --preset optimized --output-on-failure` passed 27/27 tests,
including `world_topology_test` and the step CLI controls. From the repo
root, `node native/reference/export-topology.mjs --check` matched all four
seeds, including physical neighbor order, symmetry, biomes, components and
candidate road order. `node native/reference/trace.mjs` regenerated six
scenarios. `waffle_browser_tests corpus` and `runtime-corpus` over
`artifacts/native-reference/traces` and `native/reference/fixtures/seed-1`
passed 25/25 trace states each. `waffle_world_topology_test
native/reference/topology native/reference/fixtures/seed-1/state-0.json
<all 25 trace state paths>` also passed admission and L0 for all 25.
`node native/reference/step-windows.mjs native/build/optimized/src/sim/waffle_parity.exe`
passed all nine trace windows and 107 comparisons with the existing masks.
On the i9-10900K optimized build, median seed-1 topology construction took
24.2 µs and full runtime admission took 17.46 ms, excluding file I/O and
JSON parsing. A neighbor span, biome and mountain span lookup took
4.29 ns per region over 20 million triplets per run, with zero allocations.
N03e-3 integration must remove its temporary seed-1 stub. Rerun the exporter
when integrating a scenario with a new world ID, such as seed-123 Migration.
The [topology handoff](src/sim/README.md#world-topology-admission) records
what N03f must reproduce for native generation. Device parity remains L4 work.

19 Nov 2026: the Codex workspace ran out of credits. N03e-7a stopped
mid-task. Its unverified partial work is preserved as WIP commit 3d01d5fb on
`t3/port-native-migration-stage`. It includes a `seed-123-migration` scenario
with natural movement at seconds 2033 and 2129, 32 people each. Other active
workers may stop the same way. Their worktrees hold uncommitted work. Resume
each from its branch and worktree. Also stopped, with WIP preserved:
N03d-4 44d39ed4 on `t3/native-world-topology-admission` (the exporter found 4
definitions, and browser comparisons of neighbor order, symmetry, road order and
components passed before the stop; the builds were unverified), and N03d-5
2b2db2d4 on `t3/allocation-free-history-appends` (late copy baseline 5.8 µs;
the arena was unfinished). N03e-4 0405ee81 on `t3/native-birth-annual-cohorts`:
six of eight full Birth probes run scheduled Practices first, so full Birth
parity depends on N03e-3; it was adding a Practice-seam comparison.

N03e-6a result, 19 Nov 2026 (`t3/native-faith-chaos-stage-1`, resumed from
`bf6c6951`). Faith runs through `run_stage` with typed class memory, moon
reports, Chaos income and collapse reservations. The port uses the baseline
`496d9971` Primordial formula, deterministic arithmetic and zero RNG draws.
From the repository root, `node native/reference/stage-probe.mjs --all`
and `node native/reference/stage-pairs.mjs native/build/optimized/src/sim/waffle_parity.exe faith`
matched 29/29 unmasked Faith pairs across four seeds. They cover all
six adjacent tier shifts, first, continuing and returning collapse, an
existing Housing reservation, Chaos crossing above Resistance, Primordial
growth and Unrest income. `node native/reference/trace.mjs` and
`node native/reference/step-windows.mjs native/build/optimized/src/sim/waffle_parity.exe`
passed nine windows and 107 comparisons with 158 shared masks. The step masks
expose floor consumption, Faith report timestamps, Primordial, Spawn count and most
loss-pressure values. Remaining affected leaves have upstream Food, Housing,
population, recipes or territory owners, including the R06 report after
Unrest expiry. `cmake --preset optimized`, `cmake --build --preset optimized`
and `ctest --preset optimized --output-on-failure` under `native/` passed
26/26 tests, including both v52 codegen checks and collapse after copy and
JSON restore with fractional premature-death mitigation and phase Resistance.
The optimized i9-10900K/MSVC 19.50 cost was 0.050–0.073 µs/sim-s
(0.300–0.439 µs per Faith boundary), with zero counted allocations across
1.25 million calls. Run `native/build/optimized/src/sim/waffle_faith_stage_test.exe`
with each probe's before boundary from its manifest (seed-1/4, seed-1/406,
seed-1867/76, seed-42-shops/70, seed-2026-late/3334). The median of five
50,000-call batches excludes setup, state resets and export. No new intentional
divergence. Open seams are N03e-3 Faith Practice activation, capacity admission
when later stages grow or share the reservation buffers, N03e-8 phase events
and drain, and the v53 Primordial cap.

N03e-3 on
`t3/native-scheduled-stock-discharge` (WIP on top of a temporary seed-1
topology stub commit). It had settled the browser recipe order: complete the
local scheduled pass, drain FIFO, then shared retries one at a time, each
draining its children. The engine was unfinished and unverified. All six
workers are stopped; nothing native is running.
Note: N03e-3 and N03e-6a both edit `gamestate.v52.json` and regenerate the
mirror, so expect schema merge conflicts.

19 Nov 2026, resumed: Codex credits were restored. New worktree workers resumed
N03d-4, N03d-5, N03e-3, N03e-6a and N03e-7a, each by merging its WIP commit.
N03e-4 Birth waits for the N03e-3 engine before resuming from 0405ee81.
Merge order: N03d-4 and N03d-5 first, then N03e-3 (its topology stub is
dropped at merge), then the stages.
N03e-7a merged 19 Nov 2026 from `t3/native-migration-stage` 3efe0ab5. The
supervisor's merged optimized build passed 26/26 CTests, and all 14 generated
step windows passed (120 comparisons).
N03d-5 merged 19 Nov 2026 from `t3/allocation-free-history-appends-1` 88c9072c
(late copy 5.9 µs, append 223 ns, zero warmed allocations). The merged
optimized build passed 27/27 CTests and 14/14 step windows.
N03d-4 merged from `t3/native-topology-admission` 45002ad5, with the seed-123
world added to the exports. N03e-6a merged from `t3/native-faith-chaos-stage-1`
344c9dad. Faith's narrowed `*.faith.byClass` masks replace the broad Faith
masks. Migration's `intents`/`inbound`/`outbound` masks replace the broad
Migration masks. The merged optimized build passed 30/30 CTests. Stage pairs:
faith 29/29, migration 15/15, advance_clock 67/67, spring_death_baseline 3/3,
prelude 66/67 (the known R06 expiry at seed-1/1598, owned by N03e-8). All 14
step windows passed (120 comparisons).

**N03e-3 result (19 Nov 2026).** `t3/native-scheduled-recipe-engine` resumes
`ba7abdc3` with the seed-1 topology stub still isolated at `c40df7fd`.
[Practice activation and reactions](src/sim/practice/practice.hpp) expose
`activate` for a typed timing and optional phase seam, `emit` for typed
event payloads, and `drain` for the synchronous FIFO. Call
`rebuild_listeners` after changing installed cards, Structures, or site
membership. [Hosted Stock](src/sim/practice/stock.hpp) exposes
`plan_stock` and `apply_stock` for a synchronous plan and commit against
the same state. The plan exposes receipts borrowing typed Trait spans.
Structure upkeep, modifiers, and conversion support use compiled definitions.
The interpreter uses `recipeEffects` to commit conversions with the
population and Stock transaction before executing the remaining effects
in declaration order. It finishes the scheduled local pass, drains all
FIFO events with Charge gains before Discharges, then processes one shared
retry at a time with its children ahead of the next retry. Both per-root
caps and first-parent deferred retry order follow browser baseline
`496d9971`.

The ordinary active-Vassal overlay reads the live Vassal and holder at
the multiplier read point. In the full-map ruleset the player must hold
the region. A living, current Scholar contributes Synthesis from other
Scholar-staffed, independently Stock-supplied Practices. The current
Warrior reads the persistent Monster Trophy count. The card's compiled
coefficient applies to its declared additive Output or Capacity pool.
The interpreter keeps compiled definitions immutable across Vassal
changes. Experimental keyword prototype rewrites remain open.

Verification used `node native/reference/stage-probe.mjs --all`, then
`node native/reference/stage-pairs.mjs <waffle_parity.exe> <stage>` without
masks. Seasonal passed 10/10, After Meals 4/4, Migration Practices 7/7,
Death Practices 5/5, and final flush 36/36. Both captured same-root
Smelting and Toolmaking cascades matched. Targeted probes matched two
stopped roots at cap 20 and at a lowered cap of 3, and retained empty
Stock substitution spans on a pending-event restore and drain.
All three non-seed-1 Death pairs require
the real adjacency fixture. An ignored compatibility build, reproduced
with `artifacts/n03e-3-topology-check.ps1`, used the N03d-4 input from
`44d39ed4` and restored the isolated stub afterwards. In `native/`,
`cmake --preset optimized`, `cmake --build --preset optimized`, and
`ctest --preset optimized --output-on-failure` passed 25/25 CTests.
Both schema codegen checks passed. After `node native/reference/trace.mjs`,
`node native/reference/step-windows.mjs <waffle_parity.exe>` passed all
nine windows and 107 comparisons with 136 masks. Eight masks were
removed, covering the drained queue and seven recipe-owned site fields.
The remaining shared journal and spending masks identify the unported
phase epilogue, other event producers and Food routing.

On the i9-10900K Windows host, `waffle_parity step --time` measured
26.79 µs/sim-second from `seed-1/0` and 26.23 µs/sim-second from
`seed-2026-late/3200`. These are seven-run medians over 9,984 and
2,816 timed advances per run. The inputs have 71 Practices and 48
Structures at opening and 63 Practices and 42 Structures at the late
anchor. Timing uses the topology compatibility build and the existing
History implementation. With 64 warmup steps, the optimized
`artifacts/n03e-3-alloc.exe <window-start-state.json> 3200` probe on the
regular build counted 504,217 calls to `operator new` from the opening
and 441,070 from the late anchor over 3,200 advances each. Trace appends
still copy and allocate History pages. Admission reserves recipe effect
rows and the event queue, and reactions index local slots and remote
trigger kinds. Scratch can still grow at new high-water marks. The
allocation and desktop budget gates remain open pending N03d-5 and a
repeat of these measurements.

The remaining integration points are N03d-4 topology admission, N03d-5
allocation-free History appends, and N03e-8 external action targets and
immediate Spawn resolution for pressure and Spawn effects. The lunar
phase event producer remains a stub. No intentional browser divergence
was introduced. Android runtime parity remains unverified.

**N03e-3p — Practice engine and pipeline performance (19 Nov 2026).**
Implementation on `t3/optimize-practice-recipe-engine` from `9a49365c`.
`waffle_parity step --time` reports an uninstrumented pipeline average and a
separate Stage breakdown. See the [timing and allocation commands](src/sim/README.md#step-parity).
Stage timers run in the CLI. They count time over every advancing second in
the window and include the cost of reading the clock at each Stage call.

Before optimization, the allocation test counted 5,599 calls at the opening
and 5,611 late over 3,200 advances each after 512 warmup advances. Recreating
the Stock-transfer history for each active second caused almost all of those
calls. Windows Performance Recorder was installed; the CPU profile was
denied by host policy (`0xc5585011`). Local, nested TSC probes in a separate
optimized diagnostic binary measured Stock planning and source collection as
the largest exclusive recipe costs. Opening ran about 3.08 Stock plans,
1.69 condition evaluations, 3.62 queued events and 5.08 trace records per
sim-second. Late ran 4.00, 2.73, 2.73 and 3.82 respectively. Trace records
include both queued events and direct records, with a second append when
attributed to a site. The probes found 0 listener rebuilds in either window.

Scope timings from the diagnostic build (µs/sim-second, opening and late)
were approximately 6.5 and 10.4 for Stock planning including source
collection, 2.4 and 2.8 for activation traversal and upkeep bookkeeping,
0.04 and 0.06 for conditions, and 4.1 and 3.0 for trace writing including
payload and text. Queue emission excluding provider copies was about 0.66
and 0.81, and reassembling a queued event for tracing cost 0.16 in each
window. Trace text accounted for roughly 0.5 in each window. Symbols are
already interned at admission. The scope measurements are intrusive and
include probe overhead, especially for payload and text operations.
Raw Windows measurements and diagnostic sources are under ignored
`artifacts/n03e-3p-*`.

The engine now indexes scheduled cards, upkeep and present Structure
modifier kinds when rebuilding listeners. Runtime gates still read live
population, Stock, upkeep and control. A caller changing a board or site
membership must rebuild runtime indexes as applicable and then call
`rebuild_listeners`. Reused Stock, population and receipt scratch avoids
initializing capacity-sized buffers at each recipe. The FIFO reads pending
payloads by index and transfers their spans directly into history. Traces
build their shared fields once and fill page-local payloads in place.
Practice journals share a recyclable arena, reserve normal provider slabs
at admission and reuse the Stock-transfer page when private. Allocation
diagnostics identified the last intermittent growth as a 512-byte Stock
provider size class during Seasonal Practices at second 3753.

RNG, serialized fields, event order and the public stage API are preserved.
The browser can use the same measured separation of board membership from
live recipe gates if it revisits its Practice dispatch. Native timings apply
only to the C++ implementation.

**Optimized Windows results.** Intel Core i9-10900K, MSVC 19.50, baseline
`9a49365c` with the same timing CLI. Alternating baseline and candidate
processes ran on logical CPU 15. Medians are from 7 runs of 9,984 advances
at opening (39-second window, 71 Practices, 48 Structures) and 14 runs of
2,816 advances late (11-second window, 63 Practices, 42 Structures).
See the [step timing command](src/sim/README.md#step-parity) for both inputs.
The stage pass is instrumented and each row is an independent median.

| µs/sim-second | Opening before | Opening after | Late before | Late after |
| --- | ---: | ---: | ---: | ---: |
| Pipeline | **12.650** | **3.899** | **13.655** | **3.973** |
| advance_clock | 0.126 | 0.114 | 0.132 | 0.120 |
| prelude | 0.285 | 0.272 | 0.286 | 0.274 |
| seasonal_practices | 4.190 | 1.441 | 5.731 | 1.844 |
| spring_death_baseline | 0.003 | 0.003 | 0.009 | 0.008 |
| birth | 0.079 | 0.074 | 0.082 | 0.076 |
| food | 0.004 | 0.004 | 0.002 | 0.002 |
| after_meals_practices | 0.106 | 0.067 | 0.054 | 0.032 |
| garrison_upkeep | 0.003 | 0.003 | 0.002 | 0.002 |
| housing | 0.004 | 0.004 | 0.005 | 0.004 |
| faith | 0.058 | 0.049 | 0.088 | 0.078 |
| migration_practices | 2.107 | 0.826 | 1.932 | 0.431 |
| migration | 0.119 | 0.103 | 0.150 | 0.138 |
| death | 0.003 | 0.003 | 0.004 | 0.004 |
| death_practices | 5.768 | 0.982 | 5.215 | 0.942 |
| control_and_spatial_pressure | 0.004 | 0.003 | 0.006 | 0.004 |
| phase_events_and_drain | 0.017 | 0.017 | 0.017 | 0.017 |
| vassal_check | 0.016 | 0.016 | 0.016 | 0.015 |
| final_flush | 0.020 | 0.018 | 0.020 | 0.018 |

The four Practice stages plus final flush account for about 3.33 and
3.27 µs/sim-second after optimization, about 85% of the pipeline.
Seasonal Practices are the largest remaining Stage. Writing the site and
civilization traces and testing Stock are the largest measured engine
costs after removing capacity-sized buffer construction. The candidate
ranged from 3.87–4.43 opening and 3.94–5.08 late. The two late batches had
medians of 4.04 and 3.97. The pooled medians meet the target with little
headroom late.

`ctest --preset optimized --output-on-failure` passed 31/31 from
`native/`. The new allocation CTest counted zero global `new` calls in
each 3,200-second measurement after 512 warmup seconds. It gates the
admitted opening and late workloads. Newly introduced payload sizes or
board changes can still grow storage and should be measured as their stages
land. `node native/reference/trace.mjs` and
`node native/reference/stage-probe.mjs --all` regenerated the oracle.
With `native/build/optimized/src/sim/waffle_parity.exe` and
`native/reference/stage-pairs.mjs`, unmasked results were advance_clock
67/67, prelude 66/67 (known R06 expiry at `seed-1/1598`, N03e-8),
seasonal_practices 12/12, spring_death_baseline 3/3,
after_meals_practices 4/4, faith 29/29, migration_practices 13/13,
migration 15/15, death_practices 5/5 and final_flush 67/67.
`node native/reference/step-windows.mjs <waffle_parity.exe>` passed all 14
windows (120 comparisons, with the existing 156 masks).
`waffle_browser_tests runtime-corpus artifacts/native-reference/traces
artifacts/native-reference/windows/seed-1/0` also passed L0 on 27 retained
trace states and all 40 opening-window snapshots. Repository
`npm run verify` passed.

No rule divergence was adopted. If the full pipeline needs more headroom,
one option for supervisor review is to omit duplicate Practice and Stock
diagnostic journals during speculative forecast and reconstruct them on
demand at an inspected anchor. That would change the trace availability
contract and needs a measured prototype and approval. Android runtime
parity and timing remain unverified.

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
