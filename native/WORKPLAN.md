# Native runtime work plan

## Handoff

- State: **paused 19 Nov 2026 at Cam's request**, at `t3/native-rebuild-planning`
  97b5b746 (local, not pushed). Every tick stage is ported except the
  Campaign, Delve, Founding and Commission parts of Vassal.

  Verification on the merged optimized build:
  - 33/33 enabled CTests passed.
  - 23 step windows passed (138 comparisons) with 14 Vassal masks.
  - Every stage pair passed except prelude at
    `death-committed-arrivals/2035`, which starts at
    `$.civilization.practiceEvents.nextId`. It predates the pause merges
    and is unresolved.

  Pipeline cost on the idle i9-10900K: 21.5 µs/sim-s at opening and 29.4
  late. Food is 9.7, Birth 3.8, phase drain 2.9 and seasonal 1.2. The
  budget is 10–12. `pipeline_steady_state_allocations` stays disabled
  (263 opening allocations remain, 206 of them in Migration).

  Unmerged WIP to resume from:

  | Item | Branch | Commit | Remaining |
  | --- | --- | --- | --- |
  | N03e-9 | `t3/native-timed-vassal-resolution` | 58f3feae | Campaign, Delve and Founding probes fail; Commission not started |
  | N03g | `t3/native-cross-compiler-determinism` | 2131c16b | Clang preset and Android target; 32,000 s cross-compiler runs not yet done |

  Not started:
  - N03f-3 new-game state builder. World generation is merged.
  - N03e-3q third performance pass and allocation fixes.
  - N03f actions and replay (L2).
  - v53 browser catch-up, after PR #107 merges.
- Coordination: one supervising session sets design and reviews and integrates
  delegated items on its branch. Each item has one owner at a time.
- Active owners: none. Paused 19 Nov 2026 with no workers running. On
  resume, the supervising session on `t3/native-rebuild-planning` delegates
  items to worktree workers and reviews and merges their results.
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

**N03e-7b Death result (19 Nov 2026).** Death feeds migrants from destination
Edible Stock and commits surviving cohorts as Strangers before rolling hardship
and old-age mortality in browser order. It publishes regional and last-meal
reports, updates population and loss history, and drains death events before
Death Practices. Migration still records legacy external departures when it
books them. Prelude refunds pending bookings and leaves committed arrivals in
place. Death reuses admission-time report rows and reserves survivor payloads
alongside Migration bookings. Restored pending bookings use the same typed
payload layout.

Browser baseline `496d9971` covers natural arrivals at seed-123/2034 and
/2130 and seed-1/1716, hardship, old-age deaths and zero-death moons.
Prepared stage exhibits cover partial and total arrival losses, the legacy
mitigation cap, 130 external emigrants and an expiry after commitment.
Reproduce with `node native/reference/trace.mjs`,
`node native/reference/stage-probe.mjs --all`,
`node native/reference/stage-pairs.mjs native/build/optimized/src/sim/waffle_parity.exe death`
and `node native/reference/step-windows.mjs native/build/optimized/src/sim/waffle_parity.exe`.
Windows optimized build and all 30 CTests pass. Death (15/15), Migration
(16/16) and Death Practices (10/10) stage pairs pass unmasked. All 14 windows
and 120 comparisons pass. A prepared two-second continuation also passes
with native-booked arrival payloads and 30 survivors among 32 migrants.
Movement, arrival and loss-accounting masks are removed. Narrow Villager
mortality and site-history masks, plus the general RNG mask, belong to
N03e-4 until Birth draws and aging are integrated. Food still owns the
step mask for creating the parent last-meal record. The Death pairs expose
its updated Migration fields.

Seven optimized MSVC timing runs on the i9-10900K used the `step --time`
command above with seed-1/0 (`k=39`) and seed-2026-late/3200 (`k=11`). A
focused timer around the Death dispatch within the same runs measured
0.116 and 0.567 µs/sim-s, respectively, including non-Death seconds in the
denominator. Those runs put the pipeline at 12.89 and 14.37 µs/sim-s.
The exact per-person stream meets the Death budget, so no sampled alternative
or divergence was proposed. Android runtime parity remains unverified.

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

**N03e-6b result (19 Nov 2026).** Housing runs scheduled Practices, pays
construction cycles in local-first order, drains the resulting Stock events,
then assesses player and Unrest sites. A completing Structure contributes
capacity on the same boundary and refreshes Practice listeners. Housing writes
the cap read by Faith and reserves Strangers before Villagers in one intent
per source. It draws no RNG. Its reports and reservation payloads rotate with
the moon and use admission-sized, copy-owned storage. GameState v52 is unchanged.
New placements for founding and town activation remain with N03e-9 and N03e-8.

The `seed-1-housing` exhibit exercises a paid local completion, a shared
construction cycle, an unpaid multi-input cycle, per-region recipe modifiers
and all three caps. It includes both Housing and Faith boundaries and a moon
rollover. From the repo root, `node native/reference/trace.mjs`,
`node native/reference/stage-probe.mjs --all` and
`node native/reference/stage-pairs.mjs native/build/optimized/src/sim/waffle_parity.exe housing`
matched 11/11 unmasked Housing pairs. The same stage command with `faith`
matched 31/31 and `migration` matched 16/16.
`node native/reference/step-windows.mjs native/build/optimized/src/sim/waffle_parity.exe`
matched 16/16 windows and 127 comparisons with 147 masks, down from 156.
Housing modifiers, Structure cells, Migration intent summaries and
unplaced cohorts are exposed. The remaining Housing masks cover assessed
population inputs from Birth/Food and R06's report presence after Unrest
expiry. Food's starvation reservations retain their shared masks. Both
exhibit windows also passed with the raw reservations, assessed population,
Faith class reports and class happiness visible.

The optimized Windows build and `ctest --preset optimized --output-on-failure`
passed 30/30. On the i9-10900K with MSVC 19.50, the seven-run medians for
Housing alone were 0.268 µs/sim-s at `seed-1/0` and 0.221 µs/sim-s at
`seed-2026-late/3200`. The focused timer in `artifacts/housing-timer.cpp`
timed just the Housing dispatch during 2,048 replays per sample of the
39- and 11-second windows. Whole-pipeline `waffle_parity step --time` on the
same windows gave seven-run medians of 13.11 and 14.14 µs/sim-s across
9,984 and 2,816 advances per sample. No intentional divergence. Android
validation remains open.

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
N03e-3 merged from `t3/native-scheduled-recipe-engine` 5e6f1b30. The seed-1
topology stub was dropped. Both import paths compile content, and Practice
admission runs after topology is attached. The engine was adapted to
arena-backed tables and nullable `chaosPower`. The merged optimized build
passed 30/30 CTests. Stage pairs: seasonal_practices 12/12,
after_meals_practices 4/4, migration_practices 13/13, death_practices 5/5,
final_flush 67/67, with the others unchanged. All 14 step windows passed.
Merged pipeline cost: 12.6–12.9 µs/sim-s at opening (seed-1/0) and
13.5–15.3 µs/sim-s late (seed-2026-late/3200). That is already at the
whole-game desktop budget, so engine performance became its own item.

Wave started 19 Nov 2026, each item in its own worktree:
- N03e-3p: engine performance, a per-stage timer and a whole-pipeline
  zero-allocation test. Target: ≤ 4 µs/sim-s for the current pipeline.
- N03e-4: Birth, resumed from 0405ee81.
- N03e-5: Food and garrison upkeep.
- N03e-6b: Housing and construction.
- N03e-7b: Death and arrivals.
- N03e-8: control, phase events and Unrest expiry.

Stage cost targets: Birth, Food and Death ≤ 1 µs/sim-s each; Housing
≤ 0.7; control plus phase events ≤ 1. If Birth or Death sampling would pay
for itself as a distribution-preserving divergence, the worker proposes it
and does not adopt it.

N03e-5 merged from `t3/native-food-garrison-upkeep` 3b079e82, with no
conflicts. The merged optimized build passed 30/30 CTests. Stage pairs: food
11/11, garrison_upkeep 11/11, after_meals_practices 11/11, seasonal 13/13,
migration_practices 14/14, migration 16/16, final_flush 75/75, prelude 74/75
(the known R06 expiry). All 14 step windows passed. The worker measured the
whole pipeline at 66 µs/sim-s at opening and 44 µs/sim-s late; Food Practice
activations through the engine dominate. Two Food gates stay open: late
market routing (1.9 µs/sim-s without activations) and a transfer-journal
allocation at each new transfer second. Both fall to the next
engine-performance pass after N03e-3p.

N03e-4 merged from `t3/native-birth-annual-cohorts-1` 441019a4, then N03e-8
from `t3/territory-phase-drain` 159fdb07. The merged optimized build passed
31/31 CTests. Every ported stage matched on all pairs:
- advance_clock, prelude, phase_events_and_drain, final_flush: 94/94 each
  (the R06 expiry now matches);
- seasonal_practices 18/18, spring_death_baseline 4/4, birth 21/21;
- food 11/11, after_meals_practices 11/11, garrison_upkeep 11/11;
- faith 29/29, migration_practices 15/15, migration 17/17;
- death_practices 8/8, control_and_spatial_pressure 8/8.

All 17 step windows passed. Mask reconciliation:
- Two masks were added for the seed-42-shops/84 holding cascade.
- Five masks were removed. Each was tested alone across every window, and
  none hid a difference.
- The remaining Birth, Food and control masks were reassigned to N03e-7.
  Unported Death or Housing is now their only cause.
- 155 masks remain: N03e-7 85, N03e-9 56, N03e-6 14.

Merged pipeline cost: 61 µs/sim-s at opening and 59 µs/sim-s late, against a
10–12 µs budget. Recipe activations and the phase drain dominate, and
N03e-3p owns both.

Decision (supervisor, 19 Nov 2026): the inverse-binomial Birth sampling
proposal is deferred. It saves about 1.8 µs/sim-s late and nothing at
opening, and it would require versioning the RNG rule and regenerating golden
traces. Revisit with Death sampling once N03e-3p lands and the engine's share
is known.

Merges on 19 Nov 2026:
- N03e-3p (engine performance), d975a057. The engine-only pipeline fell from
  12.7 to 3.9 µs/sim-s.
- N03e-6b (Housing), f843183e. Migration reservations now use one
  phase-indexed payload table: Food phase 0, Housing 1, Faith 2.
- N03e-7b (Death), 5d9b2828. A missing site history death count reads as
  zero, because the browser always creates `{deaths: 0}`.

Every tick stage except Vassal is now ported. The merged optimized build
passed 31/31 CTests. Every stage pair passed: advance_clock, prelude,
phase_events_and_drain and final_flush 102/102; housing 12/12; death 17/17;
death_practices 12/12; migration 19/19; birth 22/22; faith 31/31; food 11/11.
All 19 step windows passed (130 comparisons).

Masks: each mask was tested alone across all windows. 65 of the 79 hid no
difference and were removed, including Vassal masks that the windows never
exercise. 14 remain, all N03e-9 Vassal.

Pipeline cost: 27.7 µs/sim-s at opening and 32.3 late. The largest stages are:

| Stage | Opening µs/sim-s | Late µs/sim-s |
| --- | ---: | ---: |
| Food | 11.2 | 6.6 |
| Phase drain | 7.0 | 9.6 |
| Birth | 4.1 | 8.0 |
| Seasonal Practices | 1.5 | 2.4 |

The drain runs every second at about 7 µs per call. The
`pipeline_steady_state_allocations` test is disabled until N03e-3q, because
Birth, Food and Migration still allocate after warmup.

Wave started 19 Nov 2026:
- N03e-3q: performance pass 2. Target ≤ 8 µs/sim-s, and re-enable the
  allocation test.
- N03e-9: timed Vassal resolution.
- N03f-3: native new game and world generation (L3).
- N03g: clang (llvm-mingw) versus MSVC hash agreement over 32,000 s, long-run
  stability, anchor-restore self-consistency, and an unrun Android
  command-line harness.

Pause requested by Cam, 19 Nov 2026. All four workers were asked to stop at
a clean checkpoint. N03f-3 stopped at verified world generation
(`t3/native-new-game-world-generation` 4dd0cf7b), which is merged. Native
`regional-v2` topology, ranked opening roads and region colours match browser
exports for 13 seeds. The new-game state builder had not started. The
supervisor's merged build passed 32/32 enabled CTests and 19/19 step windows.
`std::unordered_set` in biome generation is used only for membership; order
comes from vectors.
N03g stopped with its verified MSVC harness merged
(`t3/native-cross-compiler-determinism` d7758c35): `waffle_parity run`,
per-second hashes, 64 s anchors, and adapter save and restore. The merged
build passed 33/33 enabled CTests, including the 256-second seed-1 hash
fixture, and 19/19 step windows.

256-second smoke runs from seed-1/0 and seed-2026-late/3200:
- State stayed finite throughout.
- Anchor replay reproduced the live hashes, and adapter saves were lossless.
- Throughput was 21,764 and 17,849 sim-s/s, including hashing and anchors.
- Copy plus 63 s replay took 3.5–3.7 ms at p50 and 7.3–8.6 ms at p95. The
  p95 exceeds the scaled desktop target and needs attention with N04.

The clang preset, Android target and resume commands are WIP in 2131c16b,
not merged. Still open: clang versus MSVC agreement, the 32,000-second
runs, 1000-year growth, and execution on a device.

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

**N03e-5 port verified, performance open (19 Nov 2026).**
`t3/native-food-garrison-upkeep`, based on `9a49365c`, runs Food in
browser order. It clears regional recipe modifiers, replenishes detailed
markets, runs both routing Practice seams, debits all local meals, and
routes remaining Edible demand through allies and priced storefronts.
It records spending, transfer order, relief and class feed memory.
The site's mutable `lastMeal` and the published moon Food report use
separate storage so Migration and Death can update the site record.
Food and Faith use separate payloads in the shared reservation bank.
Garrisons pay atomically with local priority before shared retries and
carry the existing support commitment through payment. The port draws no
RNG and uses the existing v52 serialized fields. Both stages remain
gated by the lunar dispatcher.

From the root, `node native/reference/trace.mjs` regenerated the original
traces and `node native/reference/trace.mjs seed-1-food-contention`
captured the prepared scenario. `node native/reference/stage-probe.mjs --all`
matched the official tick and trace hashes. For
`$parity = "native/build/optimized/src/sim/waffle_parity.exe"`,
`node native/reference/stage-pairs.mjs $parity <stage>` passed Food 11/11,
garrison upkeep 11/11 and seasonal Practices 13/13 without masks.
The prepared pair checks neighboring Stock contention, Currency purchases,
local and market-paid garrisons, an unpaid garrison, full and partial feed
thresholds, starvation reservations and the seasonal generation boost.
`node native/reference/step-windows.mjs $parity` passed 14 windows and
120 comparisons with 182 masks. Both schema `--check` commands passed.
After dot-sourcing `native/tools/env.ps1`, `cmake --preset optimized`,
`cmake --build --preset optimized` and
`ctest --preset optimized --output-on-failure` in `native/` passed 30/30.

Removed the Food modifier, regional spending and broad Faith class masks.
Opened the Food, relief, garrison and latest-meal records to comparison
except for the fields affected by pending Birth, Death and territorial
writers. The shared transfer journal still depends on Birth Practices.
Housing changes migration reservation array membership, and Birth and
Death change the number of people available for Food to reserve. The
individual remaining masks specify these dependencies. Unmasked stage
pairs compare the complete journal, reservations and market records.

On the i9-10900K, seven medians for opening `seed-1/0` (9,984 advances
each) and late `seed-2026-late/3200` (2,816 advances each) were 66.05 and
44.32 µs/sim-second for the full pipeline. Food plus upkeep measured
49.15 and 22.86 µs/sim-second, of which 48.49 and 20.95 were inside the
two Food Practice seams. Subtracting those seams per run gives 0.66 and
1.91 µs/sim-second. From the root, `& artifacts/food-time.ps1 -RecipeSeams`
links an instrumented optimized CLI and `node artifacts/food-measure.mjs`
runs both binaries with `step --from <window>/state-<start>.json --seconds
<39|11> --expect-dir <window> --masks native/reference/parity-masks.json
--time`. Samples are in `artifacts/food-diagnostics/times.json`.

The 1 µs/sim-second gate is open. The exclusive late workload still
includes priced purchases and Stock transfer history appends. The shared
transfer history creates a fresh arena on the first transfer of a new
second, so the zero-allocation gate also remains open. The next measurement
needs the N03e-3p Practice engine and a reusable transfer journal window.
The browser [supply profile](../docs/research/settlement-supply-performance.md)
supports the shared use of cached authored adjacency with live road and
holder checks. Native uses that existing lookup in both payment paths.
There are no new intentional browser divergences. Android runtime parity
and performance remain unverified.

**N03e-4 result (19 Nov 2026).** `t3/native-birth-annual-cohorts-1` resumes
`0405ee81` on the merged N03e-3 pipeline. Birth rotates the moon and copies
the previous reports, clears Faith Resistance, activates Birth Practices
through `practice::activate`, then rolls births, maturation and new Elders
in browser site, residency and specialty order. It ages existing Elders at
the first Birth boundary of the year, updates joint or legacy cohorts, and
carries proportional allegiance credits from the pre-birth distribution.
The main RNG advances for every browser draw, including certain outcomes. Birth reserves report
and credit rows at admission. Per-thread scratch and population tables grow
geometrically at new high-water marks. No schema or browser source changed.

From `native/`, `cmake --preset optimized`,
`cmake --build --preset optimized --parallel 8` and
`ctest --preset optimized --output-on-failure` passed 30/30 tests on
Windows. From the root, `node native/reference/trace.mjs`,
`node native/reference/stage-probe.mjs --all` and `--all --check` confirmed
official replay hashes. `node native/reference/stage-pairs.mjs
native/build/optimized/src/sim/waffle_parity.exe birth` passed 20/20
unmasked pairs, including mixed allegiances and all age strata, all four
Faith tiers, the concurrent Birth/year wrap at seed-1/97, and zero births
with one maturation at seed-123-migration/2041.
`node native/reference/step-windows.mjs native/build/optimized/src/sim/waffle_parity.exe`
passed 14 windows and 120 comparisons. The runtime corpus round-tripped
27 trace states and the checked-in seed-1 snapshot. Both schema generators
pass `--check`, and `npm run verify` passed. The aging year, Faith Resistance and Birth report headers,
rates and age advances are now visible in step parity. The three full Birth report masks became
count-only masks, and the credit and main RNG masks track dependency on the
still-unported Death stage. There are 160 shared masks and zero N03e-4 masks.

The optimized timings use µs per sim-second, on the Windows i9-10900K with
MSVC 19.50.

| Work measured | Opening seed-1/0 | Late seed-2026-late/3200 |
| --- | ---: | ---: |
| Exact cohorts after Practices | 2.34 | 4.18 |
| Prototype binomial cohorts after Practices | 2.30 | 2.40 |
| Full exact Birth stage | 7.79 | 8.49 |
| Full prototype Birth stage | 7.91 | 6.36 |
| Whole exact pipeline | 31.01 | 25.07 |

`powershell -NoProfile -ExecutionPolicy Bypass -File artifacts/native-birth/measure.ps1`
builds and times the ignored exact and sampled harnesses. Each stage result
is the mean of the boundary medians, from 6,000 warm runs each at opening
seconds 1, 7, 13, 19, 25, 31 and 37 and late seconds 3205 and 3211. One
Birth invocation is amortized across six seconds. To time a full exact
stage directly, use `waffle_parity stage --stage birth --before <before>
--after <after> --time` with the captured boundary files. The pipeline medians use
five runs of `waffle_parity step --from <window>/state-<start>.json
--seconds <k> --expect-dir <window> --masks native/reference/parity-masks.json
--time`, with `k=39` and `k=11` respectively. The five-run ranges were
27.63–35.58 opening and 24.50–30.14 late. Logs and benchmark sources are in
`artifacts/native-birth/`. The exact cohort resolver counted zero heap
allocations across 54,000 warmed invocations. The opening repeated-copy
benchmark counted 24 allocations at the first boundary and six at each
later boundary, all in the rollover and Practice prefix. The late prefix
counted zero.

**Divergence proposal for supervisor review.** Inverse-binomial sampling
uses one uniform draw for an eligible cohort, with exact per-person draws
for fewer than 16 people or a numerically tiny starting probability mass.
This would change Birth and downstream Death outcomes, so adopting it
would require versioning the RNG rule and regenerating golden traces.
It improves late cohort cost and still exceeds the 1 µs/sim-second budget.
The committed path retains exact draws. Recipe cost and population commit
cost remain open performance seams. Android execution remains unverified.
The exact bulk RNG helper is reusable in Death when a roll has no observable
per-person side effects. Browser speedup from the same arithmetic remains
unmeasured.

**N03e-8 result (19 Nov 2026).** `t3/territory-phase-drain` ports
the Death-seam holding and Creep check, town board and storefront transitions,
garrison defense, terminal routing, Vassal evacuation, and lunar journal
production and drain. Unrest expiry refunds bookings before clearing control
and reopening the storefront. The new [territory interface](src/sim/territory/territory.hpp)
is available through `practice.hpp`. The recipe engine calls
`plan_external` after stock and population preflight, `commit_external`
inside the same root before effects, and adds the planned bonus only to
generated Stock. The two pressure effects call `add_pressure` and
`trigger_spawn` synchronously. Ruin invalidates by-region eligibility
immediately. `synchronize_sites` refreshes dense site and listener orders
after the root's activation and drain complete. The additive
`emit(EventKindId)` overload journals events without a compiled trigger.
Persistent schema additions cover partial garrison records, local victories,
nullable Spawn outcomes, and evacuation endpoints. Death's local count
updates must preserve the newly optional `history.deaths` field.

Optimized Windows build and 31/31 CTests passed. Unmasked stage pairs passed
prelude 73/73 (including the original 67/67 and seed-1/1598), control 8/8,
phase epilogue 73/73, seasonal 14/14, and Faith 29/29. The prepared
`seed-1-territory` probes cover first activation, threshold Creep and ruin,
Vassal evacuation, incoming garrison defense, a same-root direct Spawn
reaction, and successful external Hunt. The terminal test compares both
loss reasons unmasked. All 17 step windows passed (123 comparisons) with
134 masks, down from 156. Remaining overlapping masks document input from
the unported Birth, Food and Death stages. In particular, Death input at
`seed-42-shops/84` changes whether a holding enters Unrest, so later
whole-step income is still masked while the isolated prelude and control
checks are unmasked. No JS fidelity divergence was adopted.

Timing on the i9-10900K used seven-run medians of `waffle_parity step --time`
over `seed-1/0` (39 advances) and `seed-2026-late/3200` (11 advances).
Focused dispatch timers measured control at 0.54 and 0.52 µs/sim-s,
and phase production plus drain at 10.97 and 16.11. Combined medians were
11.51 and 16.65. The untouched timing build measured 26.37 and 34.25 for
the full pipeline. The ≤1 µs/sim-s target remains open. Resume by merging
the additive recipe calls with N03e-3p and timing the same windows with its
optimized drain and History path. The focused wrapper and raw measurements
are in local `artifacts/n03e8-stage-timing.ps1`, `n03e8-timing-final.log`,
and `n03e8-pipeline-timing.log`.

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

**N03e-3q — pipeline performance, second pass (paused 19 Nov 2026).**
Implementation checkpoint on `t3/pipeline-performance-second-pass` from
`3e88c583`. A lunar boundary publishes `phaseResolved` for each detailed
site, with a civilization trace and a site trace. Those records account for
work even when the FIFO starts empty. Phase events with no possible Charge
activity can now write both traces directly, preserving IDs, faction fields
and order. Other events still use the FIFO, with a cheap lower bound before
checking a listener's live Discharge rules. Practice trace text already
interned in the run can reference its symbol. Both exported trace streams
and the browser save format are unchanged. Food now clears its transfer
history in the shared arena, retaining recyclable pages across seconds.

The optimized build passed all 31 enabled CTests. Ran
`node native/reference/trace.mjs`, `node native/reference/stage-probe.mjs --all`,
`node native/reference/stage-pairs.mjs <exe> <stage>` for all 18 stages,
and `node native/reference/step-windows.mjs <exe>` against both binaries.
Both matched all 19 step windows and 130 comparisons with the same 14
Vassal masks. The 17 ported stages matched 621/622 unmasked pairs on both.
The existing Prelude difference at `death-committed-arrivals/2035` starts
at `$.civilization.practiceEvents.nextId`. Vassal remains unported and its
106 pair outcomes were identical. The phase drain passed 106/106.

Five alternating optimized measurements per binary and anchor used
`waffle_parity step --time` on logical CPU 15 of the i9-10900K. Opening
used 9,984 timed advances at `seed-1/0` and late used 2,816 at
`seed-2026-late/3200`. The timing session overlapped verification jobs and
had substantial spread, particularly late. Treat these medians as checkpoint
observations and repeat with the host idle before claiming a floor or
attributing a stage regression. Raw reports and the timing runner are under
`artifacts/n03e-3q/`. The throughput target is still open.

| µs/sim-second | Opening before | Opening checkpoint | Late before | Late checkpoint |
| --- | ---: | ---: | ---: | ---: |
| Pipeline | **58.451** | **43.077** | **80.217** | **70.517** |
| advance_clock | 0.303 | 0.261 | 0.342 | 0.326 |
| prelude | 0.481 | 0.454 | 0.504 | 0.488 |
| seasonal_practices | 2.809 | 2.374 | 4.799 | 10.938 |
| spring_death_baseline | 0.007 | 0.007 | 0.021 | 0.020 |
| birth | 8.264 | 7.749 | 14.733 | 14.197 |
| food | 23.619 | 21.402 | 24.076 | 10.981 |
| after_meals_practices | 0.123 | 0.121 | 0.238 | 0.225 |
| garrison_upkeep | 0.180 | 0.185 | 0.106 | 0.102 |
| housing | 0.206 | 0.193 | 0.466 | 0.424 |
| faith | 0.166 | 0.152 | 0.278 | 0.262 |
| migration_practices | 1.678 | 1.387 | 0.939 | 0.834 |
| migration | 0.262 | 0.247 | 0.659 | 0.646 |
| death | 0.327 | 0.296 | 0.804 | 0.780 |
| death_practices | 2.037 | 1.785 | 2.203 | 1.934 |
| control_and_spatial_pressure | 0.836 | 0.791 | 0.936 | 0.891 |
| phase_events_and_drain | 13.158 | 5.559 | 18.232 | 12.897 |
| vassal_check | 0.034 | 0.028 | 0.039 | 0.038 |
| final_flush | 0.040 | 0.038 | 0.043 | 0.040 |

The warmed opening allocation run dropped from 1,014 to 263 calls over
3,200 advances after 512 warmup advances. Food dropped from 760 to 9.
Remaining calls at opening were Prelude 1, Seasonal Practices 2, Birth 12,
Food 9, Migration 206 and Death 33. The late allocation test stopped before
its measurement horizon on both builds. The checkpoint diagnostic ran
1,964 measured advances, ending at second 5676 with Monster Overrun and
13 allocations. Keep `pipeline_steady_state_allocations` disabled at this
checkpoint. The ignored stack capture attributed 109 opening calls to
Migration's per-site resident collection, followed by selection buffers,
Elder summaries and report storage. See `artifacts/n03e-3q/alloc-diag.log`
and `alloc-symbols.py`.

At resumption, reserve the measured Migration, Birth, Death and recipe
workspaces at admission, then resolve the late allocation fixture's
terminal horizon and re-enable the original gate. The diagnostic timing
scopes put most opening time in Practice activation and traces, and much
of late Birth in population table updates. Food already skips shared
routing for fully supplied sites. Its remaining routing and recipe work
and the late drain fallback still need an exact-rule pass. Inverse-binomial
Birth, Death sampling and deferred diagnostics remain proposals. No
rule-level variant was benchmarked or adopted before the pause.

Cross-runtime handoff. The browser has the same per-site phase event and
trace contract. The native fast path is a candidate for a browser-specific
measurement if its drain is revisited. Reuse the phase stage probes to
check the queue, threshold and Discharge guards and verify trace ID order.

## N03f - Actions, replay and new game (pending N03e)

Action application and `rebuildStateAtSecond` (L2), then new game and world
generation (L3). Windows/Android hash agreement (L4) is required before N04
completes.

N03f-3 topology checkpoint, 19 Nov 2026. Paused at Cam's request after
porting the immutable `regional-v2` world generator from browser baseline
`496d9971`. `generate_regional_world` provides ordered regions, physical
adjacency and candidate road order, underlying biomes, ordered biome
components, names, region colours, and ranked opening roads. Its topology
JSON matches the five checked-in exports (1, 42, 123, 1867, 2026) and fresh
browser exports for 0, 2, 17, 99, 1000, 424242, 2147483648 and 4294967295.
Reproduce with `node native/reference/export-topology.mjs --out-dir artifacts/n03f-topology`
followed by the eight extra `regional-v2:<seed>` IDs, then pass that directory
to `native/build/optimized/src/sim/waffle_regional_generation_test.exe`.
The optimized build passed all 32 enabled CTests. The existing
`pipeline_steady_state_allocations` test remains disabled. The browser trace
and standard step-window commands in [AGENTS.md](AGENTS.md) passed 19 windows
and 130 comparisons starting from browser captures. The supplementary
`artifacts/n03f-opening-probe.cpp` and `artifacts/n03f-opening-oracle.mjs`
compared road rank and colours for all 13 seeds. Seven runs per seed on the
Windows i9-10900K optimized build gave a 22.96 ms median across seed medians
(17.94-25.29 ms), excluding process startup, JSON conversion and export.
No topology divergences were observed. Android parity remains unverified.
Browser `npm run verify` passed the checks and build through
`test:build-preview`, where its temporary preview failed to start.
Resume with the captured-config native second-zero builder. Select the
starter road and draw capacities before generating founder candidates, then
assign Crown, neutral and Monster regions and build cohorts, boards, market
profiles and live roads in browser order. Attach the generated topology in
runtime admission. Add the `new-game` CLI and seed-1 fixture CTest, compare
ordinary second-zero starts for all five scenario seeds, and run step windows
from native-generated starts. This checkpoint contains no state builder or
new-game parity result.

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
