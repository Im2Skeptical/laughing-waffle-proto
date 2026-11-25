# Native runtime work plan

## Handoff

- **Paused 20 Nov 2026 at Cam's request. No workers are running.**
  - On `main` (v1.1.81, at Cam's direction: direct to main, history kept,
    no PR):
    - the native simulation port, exact at GameState v53 against browser
      9123ed72, with MSVC, clang and Android (Pixel 6 Pro) hash agreement;
    - the headless forecast timegraph;
    - the connected Windows game: title, save slots, map, settlements,
      Practice Reform, Life Map, Shop, and the N04i forecast experience.
    The same tip is pushed as `t3/native-rebuild-planning`.
  - Verification at pause, on MSVC and clang:
    - 52/52 CTests and the connected smoke;
    - 30 windows / 153 comparisons with zero masks;
    - 34 journals / 252 replay checkpoints;
    - `npm run verify` and `check:docs`;
    - CI Verify on the first native main commit dc273658.
  - Resume points:
    1. **N04j settlement view depth** (`t3/native-settlement-view`
       ac34b5a3, pushed, not merged; branched before N04i).
       - Overview, Moon, Structures and Practices tabs work and follow the
         displayed second.
       - Its checks pass, but frame p99 is about 0.25 ms over the control
         (2.77 MSVC / 2.60 clang). Profile RmlUi layout cost, then merge
         over N04i.
       - Resume steps are in its N04j section on that branch.
    2. **Pixel app validation** is pending while Cam uses the phone. The
       APK builds with `native/tools/bootstrap-android.ps1`, and
       `native/tools/benchmark-android-timegraph.ps1` runs the device
       session. Stop the HiSuite service first.
    3. **Proposal awaiting Cam:** sparse event records (Vassal outcome
       codes, migration origin and destination) for richer timegraph
       marker tooltips. This would change what forecasts store.
    4. **Optional:** rule-level performance options are on hold. The
       desktop and Pixel targets are met, so these are not needed.
  - Notes for whoever resumes:
    - Disk: C: once ran out. Delete `native/build` in merged worker
      worktrees when space is low.
    - The Node 24 Windows preview test in `npm run verify` is flaky.
      Re-run it once before treating a failure as real.
- History below this line predates the pause.

- State, 19 Nov 2026: the wave that resumed from e6cef481 is merged into
  `t3/native-rebuild-planning` (local, not pushed). Every tick stage is
  ported, including all of Vassal. Native New Game builds second-zero
  states.

  Supervisor verification of the merged optimized MSVC build:
  - 36/36 CTests passed. That includes `pipeline_steady_state_allocations`,
    which is now enabled with zero allocations after warmup, and the
    2,048 s cross-compiler hash fixture.
  - All 829 stage pairs across 18 stages passed.
  - 30 step windows (153 comparisons) passed with **zero masks**.
  - New Game matched 5 exact second-zero states, plus 10 windows started
    from native states (92 comparisons).
  - The N03g merge was also checked on `optimized-clang`: 34/34 CTests,
    and 23 windows that agreed hash for hash with MSVC.

  Pipeline cost before pass 4, with the N03e-3q-3 method (CPU 15, 5 runs, medians):
  - Opening: **19.3 µs/sim-s**. Food 8.9, Birth 3.5, phase drain 2.8,
    seasonal 1.2.
  - Late: **23.3**. Birth 6.5, Food 5.2, drain 5.1.
  - Budget: 10–12 on desktop, so about 2× remains.

  Open items:
  - L4: Android arm64 hashes. They need a device (see N03g).
  - N03f actions and replay (L2): `rebuildStateAtSecond` and actions.
  - Performance, next pass: exact rules first. The three rule-level
    proposals in N03e-3q-3 (inverse-binomial Birth, Death sampling,
    deferred Practice diagnostics) await Cam's call.
  - v53 browser catch-up, after PR #107 merges.
- Coordination: one supervising session sets design and reviews and integrates
  delegated items on its branch. Each item has one owner at a time.
- Wave started 19 Nov 2026 from 6baa16dd (merged):
  - N03f L2 actions and replay: merged from 48e60bdf (48302da1).
    - Supervisor re-verification on MSVC and clang: 38/38 CTests,
      829/829 pairs, and 30 windows with zero masks.
    - Replay: 7 journals, 18 action kinds and 58 browser checkpoints matched
      in all three replay modes on both compilers. New Game checks passed.
    - Random `rebuildStateAtSecond` latency over 32,000 s: 0.31 ms p50 and
      0.48 ms p95 on desktop.
    - The schema change (`origin` nullable on shop draft edits) matches the
      browser's `moveVassalShopStructure`.
    - Pipeline is now **17.4 opening / 20.9 late** µs/sim-s.
    - Remaining action kinds have owners in the N03f section.
- **Physical device session, 19 Nov 2026 (Cam's Pixel 6 Pro `raven`, Android
  API 37, arm64, USB). Merged v53 build.**
  Command: `native/tools/benchmark-android-timegraph.ps1`. Reports are in
  `artifacts/n04b/android-v53/`.
  - **L4 holds:** the 2,048 s per-second hash stream was byte-identical to
    the Windows reference.
  - Timegraph, 3 runs each. No big-core affinity was available, so the
    scheduler chose the core. The phone was charging over USB.

    | Fixture | sim-s/s | Restore p50 / p95 / p99 ms | Charged MiB |
    | --- | --- | --- | ---: |
    | Seed 1 ordinary (ends 5,700) | 31.8–33.4k | 0.83 / 1.42 / 1.64 | 51 |
    | Seed 2026 late ordinary (ends +1,486) | 43.2–47.8k | 0.75 / 1.30 / 1.49 | 14 |
    | Seed 1 longevity 32,000 s | 88–108k (296–362 ms) | 0.31 / 0.56 / 0.83 | 98 |
    | Seed 2026 late longevity 32,000 s | 99–126k | 0.33 / 0.54 / 0.91 | 100 |

  - The measured phone/desktop ratio is about **1.3–1.4×** (desktop seed 1
    ordinary is 43.2k sim-s/s), not the assumed 2.5–3×. The ordinary
    forecast sits at the 32k sim-s/s target, and restore is well inside
    4 / 8 ms.
  - Harness fix: timegraph reports overwrote the `seed-1.json` input on the
    device, so the longevity run read a report and crashed with a null
    `gameConfig`. Reports are now `report-<case>.json`, and the tool throws
    if `gameConfig` is missing.
  - Windows-side setup: Huawei HiSuite held the ADB interface exclusively
    (adb `Access is denied`). Stopping its service freed the phone.
    `adb` (platform-tools 37.0.1) is now in
    `native/.tools/android-sdk/platform-tools`.
- Active owners (wave started 19 Nov 2026 from f781c456, after Cam's direction
  on app UX):
  - Direction: build proper videogame interaction (states, feedback,
    motion, confirmations), and improve code-rendered visuals freely in the
    game's tone. The browser build is a content and layout reference only.
    Gameplay rules stay exactly as ported.
  - N03i native catch-up to browser 9123ed72 (PR #108): merged from
    3ccd066b. The baseline is now 9123ed72.
    - `ensure_moon_region_result` (shared with Death and Migration) creates
      a missing row by appending it to the current Moon's bank. Conquest
      creates the row before the controller transfer, as in the browser.
    - New journal `action-campaign-nest-mid-moon` (second-2 conquest).
    - Supervisor re-run: 45/45 CTests on MSVC and clang, all 18 stages of
      pairs, 30 windows with zero masks, 34 journals and 252 replay
      checkpoints, and the New Game checks.
    - Pipeline 16.0 / 18.2. Longevity forecast 32,000 s in 250 ms.
  - N04g app integration (N04e shell and N04f interaction): merged from
    d92ba425.
    - The title uses the Frontier Watch art. Continue shows the autosave
      it will open. Save and Load show slot metadata and empty, corrupt or
      incompatible states. Overwrite and abandon need confirmation. Saves
      post a toast. The map shows region names.
    - Supervisor re-run: 48/48 CTests and the connected smoke on MSVC and
      clang, 30 windows with zero masks, and 252 replay checkpoints.
    - Worker Windows numbers: first playable 689 / 655 ms (MSVC / clang),
      1000-year forecast 299 / 226 ms, scrub p95 1.65 / 1.34 ms, every scrub
      within 2 frames.
    - Pixel app validation is **pending by Cam's choice**: the phone is in
      daily use. The APK and `benchmark-android-timegraph.ps1` are ready for
      a later session.
  - N04h Life Map and Shop flows: merged from 7342ce36.
    - Covers Vassal selection and reroll, the Life Map route, node
      decisions with cost, risk and outcome, succession, and the Shop
      (placement preview, slot unlocks, roads, itemized checkout,
      unavailable reasons). Map labels are now collision-aware.
    - Supervisor audit of the 148-line `sim/vassal` change:
      - pure extractions (`immediate_risk`, `mortality_at`, `next_unlock`);
      - `purchase()` fills a quote receipt before the unchanged
        affordability checks (55 rejections still match);
      - the read-only `quote_shop` dry-runs on a state copy only when
        rebuilding a live, actionable shop view, never while scrubbing.
    - Supervisor re-run: 50/50 CTests and the connected smoke on MSVC and
      clang, 30 windows with zero masks, and 252 replay checkpoints.
      `npm run verify` passed after `npm ci` and the `check:docs` link fix.
  - N04i forecast and timegraph experience: sol 6.2 worker on
    `t3/native-forecast-experience`.
  - N04j settlement view depth: sol 6.2 worker on
    `t3/native-settlement-view`.
  - Disk: C: fell to 2.2 GB free. The supervisor deleted `native/build`
    in 39 merged worker worktrees (49.2 GB), keeping worktrees, branches
    and artifacts. C: then had 59.5 GB free.
  - Next after N04f: the Life Map and Shop flows, built on the N04f
    components.
- Previous wave:
  - N03h v53 catch-up: merged from bd2aeedd. Supervisor audit: uint32 RNG
    cursors match the browser's `>>> 0`; the clock derives from the tick
    index; and the late allocation test's threshold override is test-only.
    Supervisor re-run: 45/45 CTests on MSVC and clang, all stage pairs
    after removing 5 stale v52 capture directories, 30 windows with zero
    masks, 242 replay checkpoints, and the New Game checks. Pipeline is
    now 15.8 / 17.8.
  - Browser Housing fix (Campaign conquest restoring a ruin mid-turn):
    PR #108 is open and awaits Cam's merge authorization. It is not part
    of the N03h target.
- Wave started 19 Nov 2026 from 6c803fd3 (merged):
  - N03e-3q pass 6: merged from c4ecf242.
    - Shared trace chunks are retained once per cursor run, standalone
      scheduled Stock recipes are compiled, and scalar receipts are packed.
    - Supervisor audit: chunk lifetime is pinned by the page's first
      owning ref; the recipe fast path applies only when admission proves
      a single generateStock effect with no inputs, population or external
      action; and absent versus present-empty receipt fields are kept.
    - Supervisor re-run: 42/42 CTests on MSVC and clang, 829/829 pairs,
      30 windows with zero masks, 242 replay checkpoints, and the New Game
      checks.
    - Pipeline **16.1 opening / 21.2 late** µs/sim-s. The longevity forecast
      ran 32,000 s in 252 ms.
    - Remaining gap to 10 µs: about 6 opening and 11 late. Measure the
      Pixel before another pass.
  - N04d connected Windows slice: merged from cee8c47c.
    - `waffle_native_game.exe --seed <n>` or `--load <save.json>`. The loop:
      select a settlement, inspect a Practice, confirm a Practice Reform
      reorder (which starts a new forecast), scrub the population strip
      (map and board show the restored state), then return to Live.
    - Supervisor re-run: 45/45 CTests on MSVC and clang. The connected
      smoke passed: generation 5, 5 actions, scrub t=227, live t=148.
      Windows passed and 242 replay checkpoints matched.
    - Worker measurements (MSVC, i9 + RTX 3080, 1120×640): first playable
      729 ms; frame p50/p99 1.1/1.6 ms during a 1000-year forecast; loaded
      scrub input-to-present p95 2.6 ms (2 frames); private memory 217 MiB.
    - Deferred: full Life Map and Shop workflows, save slots, terrain art,
      previous-forecast overlays, reveal animations, and Pixel.
  - Next ready, pending Cam:
    - The Pixel 6 session (`native/tools/benchmark-android-timegraph.ps1`)
      for L4 hashes and phone timings.
    - Rule-level performance options (lighter observable traces,
      inverse-binomial Birth, lunar cadence).
    - The scope and UX priorities for expanding the connected slice.
- Wave started 19 Nov 2026 from 48302da1 (merged):
  - N04a headless forecast core (`waffle_timegraph`): merged from 6cd2f9d6.
    - Supervisor audit:
      - restores copy the anchor and journal under the lock and replay
        outside it;
      - generation checks drop stale publishes and restores;
      - COW page reference counts are atomic (acq_rel/acquire), and the
        arena is mutex-guarded.
    - Supervisor re-run: 42/42 CTests on MSVC and clang, 30 windows with
      zero masks, and 58 replay checkpoints.
    - `waffle_parity timegraph`, seed 1 ordinary: 4,890 s (Monster Overrun)
      in 117–122 ms, about 41k sim-s/s.
    - Seed 1 longevity fixture: 32,000 s in 272–304 ms, 105–118k sim-s/s.
      This fixture uses 64 s phases and no Monster expansion.
    - The desktop dream target is met. Pixel 6 is unmeasured.
  - N04b forecast memory accounting and Android harness: merged from 1fc1c0ba.
    - The ledger is within ±10% of private-byte growth on every fixture and
      on both compilers.
    - A `GrowthLimitReached` exception abandons only the unpublished step.
      Residual risk: a throw inside a `noexcept` path would terminate the
      program, though the pressure tests reach the limit cleanly on both
      compilers.
    - Supervisor re-run: 42/42 CTests on MSVC and clang, 30 windows with
      zero masks, and 242 replay checkpoints. The seed 1 longevity run did
      32,000 s in 282 ms, charging 233.5 MB.
    - Harness: `native/tools/benchmark-android-timegraph.ps1`. It has not
      run, because no device was attached.
    - Finding: one 1000-year generation charges about 225–240 MiB (summaries
      83, anchor tables 57, retained history 81), so a successor stops
      around second 4,400 while the previous generation is kept.
  - N04c forecast memory reduction: merged from dec85a18.
    - The largest 1000-year generation is now 117.5 MiB (it was 222–241).
      With the previous generation retained, the successor reaches the full
      horizon; the largest pair is 228 MiB.
    - Supervisor audit:
      - Summary interning stores an index to a bit-identical earlier
        record, under the forecast mutex.
      - Packed trace records use a presence mask, with present values stored
        as their object representation (null stays distinct), and the
        generated field visitor drives both encode and decode.
      - Payloads grow from the back of the chunk inside the reserved record
        span.
    - Supervisor re-run: 42/42 CTests on MSVC and clang, 829/829 pairs,
      30 windows with zero masks, 242 replay checkpoints, and the New Game
      checks.
    - Seed 1 longevity: 32,000 s in 257 ms, charging 107.6 MB. Seed 1
      ordinary: 4,890 s in 112 ms, charging 44.5 MB. Pipeline 17.6 / 21.4.
  - N03f L2b remaining action kinds: merged from a75f3478 (259987e0).
    - The `parity_run` option conflict was resolved by keeping both
      `--rejections` and `--timegraph-hashes`.
    - Supervisor re-run: 42/42 CTests on MSVC and clang, 829/829 pairs,
      30 windows with zero masks, and the New Game checks.
    - Replay: 33 journals and 242 browser checkpoints in all three modes,
      plus 55 rejection probes with no state change, on both compilers.
    - The schema relaxations (optional intervention `targetRegionId`/`tier`,
      shop `inventoryIndex`) come from browser-captured states that round-trip.
    - The legacy hub override and pre-v52 regional actions stay with the
      native save integration owner.
    - Browser defect found: Campaign conquest that restores a ruin mid-turn
      leaves no Moon-turn report row, so Housing throws at `housing.js:65`.
      It is present on main v1.1.78. A sol 6.2 project thread owns the
      browser fix and PR, which needs Cam's merge authorization.
  - N03e-3q pass 4: merged from 83cac22d.
    - The supervisor audited the staffing-cache invalidation (ledger
      reindex, `rebuild_listeners`, the `sitesDirty` bypass) and Birth's
      deferred application (only the rolls draw RNG).
    - Re-verified: 36/36 CTests, 829/829 pairs, 30 windows with zero masks,
      and the New Game checks.
    - Pipeline is now **18.4 opening / 22.7 late** µs/sim-s.
    - Plan: [n03e-3q-pass-4-budget](docs/n03e-3q-pass-4-budget.md).
      1000 game years per wall second allows 31.25 µs per published second
      on desktop, so the desktop dream target is within reach. Pixel 6 is
      the binding constraint, at a projected 15–21k sim-s/s against 32k.
  - N03e-3q pass 5, shared trace storage: **adopted by the supervisor**
    (ef3d3daf).
    - The worker stopped below the 2 µs threshold, saving 1.144 opening and
      1.173 late, and retired the prototype on its branch. The supervisor
      restored the code from 05c81306, because it is exact, improves
      restore p95 and cuts retained anchor bytes by about 5%.
      [Measurements](#n03e-3q-pass-5--shared-practice-trace-storage-stopped-19-nov-2026).
    - Ownership was audited. A value copy opens a fresh chunk for its next
      write, records are immutable once published, receipts allocate inside
      the chunk, and the last handle frees it.
    - Re-verified on MSVC and clang: 36/36 CTests each, 829/829 pairs,
      30 windows with zero masks, and the New Game checks.
    - Pipeline is now **17.5 opening / 21.7 late** µs/sim-s.
    - Next performance step: measure enqueue, receipt construction and
      publication separately before trying another storage layout.
- Previous wave, merged:
  - N03e-9 535f641d (merge 56baea63)
  - N03g ae3ccaa6 (efba073f)
  - N03f-3 33208558 (9afb8501)
  - N03e-3q-3 2b51bcb8
  - Supervisor fix: the prelude `death-committed-arrivals/2035` mismatch.
    The exhibit had used a hand-built prelude from before N03e-8 was
    merged. It now calls the browser's `stepUnrest`. Also added
    `waffle_parity stage --write-actual <file>`.
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

**N03e-9 — Timed Vassal resolution (done, 19 Nov 2026).**
`t3/native-timed-vassal-resolution-2` starts at `e6cef481` and merges the
paused exhibits from `58f3feae`. The four implementation commits cover
Campaign (`0ef2d7bd`), Delve (`9c1d1e19`), Founding (`f5ad7248`) and
Commission (`e2d83364`), against browser baseline `496d9971`.

Campaign refreshes the open visit after mortality, using current Force, costs
and potential travel distances. The authored River Basin island probe matched
distance 3 and Food cost 4 with the label-point fallback. Delve refreshes
shop inventory after mortality, with the authored candidate order and captured
shop, research and Discovery rules. Both keep the visit open and award zero
node income. Founding uses the Practice training ledger and places a finished
Lyceum in the first free span when applicable. Commission offers use the
current actor and reachable node context. Permanent stat gains and gross
Prestige income advance their corresponding goals. Scholar Founding generates
offers before the mortality draw. The port consumes the serialized
`vassalSeed` in browser order and publishes changes through the existing
History and GameState schema.

Optimized MSVC verification from `native/` passed 33/33 enabled CTests after
`cmake --preset optimized`, `cmake --build --preset optimized` and
`ctest --preset optimized --output-on-failure`. The preset disables
`pipeline_steady_state_allocations`. From the repo root, with
`$exe = 'native/build/optimized/src/sim/waffle_parity.exe'`:

- `node native/reference/trace.mjs` generated the resumed corpus. Four
  additional captures used the same command with
  `seed-1-vassal-scholar-founding seed-1-vassal-commission-stat seed-1-vassal-commission-prestige seed-1-vassal-commission-progress`.
  Browser JSON continuation and authoritative rebuild matched throughout.
- `node native/reference/stage-probe.mjs --all` matched official and trace
  hashes. `node native/reference/stage-pairs.mjs $exe vassal_check` passed
  121/121 unmasked pairs, up from 114/121 on the resumed build with the same
  captures. Across the other stages, 706/707 pairs passed on both builds.
  Prelude at `death-committed-arrivals/2035` still differs first at
  `$.civilization.practiceEvents.nextId` with 53 differing leaves.
- `node native/reference/step-windows.mjs $exe` passed 30 windows and 153
  comparisons (152 advancing, one gated) with zero masks. All 14 N03e-9
  masks were individually omitted from the original set and tested against
  all 30 windows before removing the entire set. The other 13 masks stayed
  enabled in each individual audit.
- Both schema generators and `node native/reference/export-vassal-tables.mjs --check`
  passed `--check`. Native `run --seconds 256 --anchors` from the
  Scholar Founding, stat Commission and Prestige payout captures verified
  all 256 live advances and sampled value-copy and adapter restores for
  each capture.

Seven paired runs on the Windows i9-10900K measured the idle deadline path
with `$exe step --from <window>/state-<start>.json --seconds <advances>
--expect-dir <window> --masks artifacts/n03e-9/no-masks.json
--report artifacts/n03e-9/time-step.json --time`.
The median `vassal_check` stage costs include instrumentation:

| Window | Advances per timed run | Before (µs/sim-s) | After (µs/sim-s) |
| --- | ---: | ---: | ---: |
| `seed-1/0` | 9,984 | 0.0166 | 0.0182 |
| `seed-2026-late/3200` | 2,816 | 0.0196 | 0.0189 |
| `seed-42-shops/80` (pending until 228) | 2,816 | 0.0163 | 0.0196 |

Local evidence is in `artifacts/n03e-9/`. `node artifacts/n03e-9/audit.mjs masks`
repeats the individual mask audit, `stages` compares the two executables, and
`time` repeats the paired medians. The resumed executable and original masks
are saved in that directory. The River Basin probe uses
`node native/reference/export-topology.mjs --out-dir artifacts/n03e-9/river-basin-topology riverBasin01`,
`node artifacts/n03e-9/campaign-island.mjs` and
`$exe stage --stage vassal_check --before artifacts/n03e-9/campaign-island-before.json --after artifacts/n03e-9/campaign-island-after.json --topology-dir artifacts/n03e-9/river-basin-topology`.

Cross-runtime handoff. Native evaluates the same timed operations at the
browser's Vassal stage. The existing derived deadline covers both Commission
and node work. The no-work stage reads only that deadline. N03f owns node
entry, confirmation, Commission selection and its committed action events.
When actions change the current actor, Commission, tracked stat or pending
transaction, refresh the current actor index as needed and call
`vassal::reindex`. Windows restore passed. Android hash agreement remains
with N03g. Ownership returns to the supervising session.

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

**N03e-3q — pipeline performance, third pass (complete, 19 Nov 2026).**

Phase 1 re-enabled the allocation gate. Admission reserves worker scratch for
Migration, Death and Practice population writes, table headroom for reports,
growing reservation payloads and returning storefronts, and small history
payload slabs. Full uninterrupted runs after 512 warmup seconds measured
zero global allocations at opening (3,200 seconds) and late (1,920 seconds,
3712 to 5632). The late fixture keeps the hash-checked 3200 anchor and ends
44 seconds before Monster Overrun. Opening previously allocated 263 times. The original late gate stopped early, so it supplied no full-horizon baseline count.
The counter and the assertion that every measured second advances remain
active. The new reserves are capacity hints. Larger worlds can still grow.

Paired optimized MSVC timings on logical CPU 15, five alternating runs per
binary and anchor, measured 41.441 to 44.200 µs/sim-s opening and
53.664 to 49.097 late for Phase 1. These host timings differ from the
supervisor's idle baseline. Raw reports and executable copies are in
`artifacts/n03e-3q-3/`. From the repository root run
`python artifacts/n03e-3q-3/time.py base gate` and, from native,
`ctest --preset optimized -V -R pipeline_steady_state_allocations`.

Phase 2 used an in-process Windows sampling profiler linked against the
optimized simulation library. The simulation thread ran on CPU 15, and a
second thread used GetThreadContext and RtlVirtualUnwind on CPU 12. It
collected 1,600 asynchronous stacks per anchor, sampling only inside
advance_one_second. Admission, state copies and oracle comparisons were
excluded. PC stacks, symbol map, sampler source and counts are in the raw
report directory (`sample.cpp`, `sample-*.txt`, `sample.map`, `profile.py`).
These were separate diagnostic runs. Practice activation appeared in
1,073 opening stacks, with Food in 784. Late population-table writes appeared
in 224 stacks and the phase drain in 430. Inclusive counts overlap.

A late capture has Withheld Spoils at Charge 6 and Stock 2 in the twelfth
of 19 detailed sites. A preceding phase root that cannot gain, clamp or
Discharge can publish both trace rows directly. The first possible
reaction and its suffix keep FIFO order. Earlier pending events, active
roots, safety caps, large event IDs and possible remote clamps retain
the full drain. The sort change computes each live bin's closed-vocabulary
rank once and preserves decimal-age order and the original-index tie.
Meal routing reuses its source buffer only while payment can enqueue
events without re-entering Stock planning.

Each row below is a fresh comparison with the preceding build, in
microseconds per sim-second. Differences across rows include host load.
The timing harness checked every requested comparison and counted 9,984
opening or 2,816 late advances per run.

| Kept change | Opening pipeline | Late pipeline | Target stage |
| --- | ---: | ---: | --- |
| `638d72e1` encode trace symbols once | 23.724 to 22.078 | 29.939 to 29.019 | Food 11.684 to 10.479 opening, phase drain 7.487 to 6.645 late |
| `010030df` trace inert phase prefix and skip redundant clamps | 24.269 to 25.395 | 28.333 to 27.114 | Late drain 6.315 to 6.019 (4/5 pairs faster), opening drain 3.310 to 3.342 |
| `9fa61247` rank population keys before sorting | 21.163 to 21.209 | 27.696 to 25.988 | Late Birth 7.658 to 7.363 (4/5 pairs faster) |
| `9b10798d` reuse Food source scratch and Edible lookup | 23.609 to 21.522 | 25.491 to 26.290 | Food 10.883 to 10.338 opening (4/5) and 6.140 to 5.444 late (5/5) |

Four experiments were discarded. They tested lazy optional history rows (`gate_pages.txt`),
bypassing history payload checkpoints for plain trace rows
(`trace_plain.txt`), narrowing recipe amount modifier scans
(`food_amount.txt`) and indexing scheduled Food recipes by routing stage
(`food_routing.txt`). Each regressed a pipeline median or had mixed results
during host load changes. The intermediate clamp-only measurement is
in `trace_drain.txt`.

**Final matched measurement.** The initial final comparison varied from
21.868 to 42.924 at opening on the baseline alone (`base_final.txt`).
The confirmation used identical CPU-15 affinity and Windows process power
settings for both binaries (execution-speed throttling explicitly disabled).
It observed load before every launch, kept all five alternating runs per
build per anchor and recorded host utilization in `confirmation-load.jsonl`.
Median system CPU usage during those runs was 20.4% baseline and
19.8% final. Opening ranges were 21.09-21.55 before and
19.60-22.49 after. Late ranges were 27.55-28.85 and
23.24-24.69. The selected binary was faster in 4/5 opening and
5/5 late pairs. Overall pipeline timing excludes per-stage observer
overhead. The stage medians come from a separate instrumented pass.

| Microseconds per sim-second | Opening e6cef481 | Opening pass 3 | Late e6cef481 | Late pass 3 |
| --- | ---: | ---: | ---: | ---: |
| pipeline | 21.429 | 19.932 | 27.909 | 24.028 |
| advance_clock | 0.144 | 0.135 | 0.162 | 0.151 |
| prelude | 0.302 | 0.304 | 0.317 | 0.315 |
| seasonal_practices | 1.261 | 1.168 | 2.023 | 1.936 |
| spring_death_baseline | 0.003 | 0.003 | 0.011 | 0.009 |
| birth | 3.876 | 3.644 | 7.243 | 6.767 |
| food | 9.914 | 9.186 | 5.798 | 5.255 |
| after_meals_practices | 0.067 | 0.064 | 0.132 | 0.120 |
| garrison_upkeep | 0.088 | 0.088 | 0.050 | 0.050 |
| housing | 0.102 | 0.101 | 0.212 | 0.217 |
| faith | 0.066 | 0.067 | 0.131 | 0.122 |
| migration_practices | 0.750 | 0.677 | 0.403 | 0.391 |
| migration | 0.132 | 0.133 | 0.299 | 0.303 |
| death | 0.156 | 0.151 | 0.392 | 0.390 |
| death_practices | 0.923 | 0.875 | 0.985 | 0.921 |
| control_and_spatial_pressure | 0.370 | 0.351 | 0.426 | 0.411 |
| phase_events_and_drain | 2.946 | 2.900 | 6.478 | 5.149 |
| vassal_check | 0.016 | 0.019 | 0.019 | 0.021 |
| final_flush | 0.021 | 0.021 | 0.021 | 0.023 |

The 10-12 us desktop budget remains open. No Pixel 6 timing or Android
hash result was obtained in this pass. On separate uninstrumented forecast
runs, end-of-horizon private process memory increased about 1.1 MiB opening
and 1.3 MiB late. The logical hot-state and history byte counts matched.
The gate covers the warmed admitted simulation on its measuring thread.
An independent process also passed the late horizon with no opening warmup.

**Reproduction and verification.** Run these commands from the repository root in PowerShell.

```powershell
. native/tools/env.ps1
Push-Location native
cmake --preset optimized
cmake --build --preset optimized
ctest --preset optimized --output-on-failure
Pop-Location
$d = 'artifacts/n03e-3q-3'
node native/reference/stage-probe.mjs --all
& "$d/pairs.ps1" base
& "$d/pairs.ps1" final
& "$d/continuity.ps1" base
& "$d/continuity.ps1" final
python "$d/confirmation.py" base final
```

All 34 enabled CTests passed. The pair runner invokes
`node native/reference/step-windows.mjs <exe>` and
`node native/reference/stage-pairs.mjs <exe> <stage>` for all 18 stages.
Both binaries passed 23 windows / 138 comparisons (137 advancing, one
gated) with the same 14 Vassal masks. Both matched 751/752 unmasked stage
pairs. Prelude was 110/111, with the same 53 differing leaves starting
at `$.civilization.practiceEvents.nextId` in `death-committed-arrivals/2035`.
The final corpus was regenerated with this checkout's exhibit generator.
The supervisor's newer shared capture includes the later Prelude fix.
Passing pair counts were clock 110, seasonal 19, spring baseline 4, Birth 26,
Food 11, after-meals 11, garrison 11, Housing 12, Faith 31, Migration
Practices 16, Migration 19, Death 17, Death Practices 12, control/spatial
12, phase drain 110, Vassal 110, final flush 110.

The continuity runner invokes `waffle_parity run --from <anchor> --seconds
<N> --hashes <output>`, adding `--expect <baseline-stream>` on the candidate.
All 3,713 opening and 2,433 late per-second digest rows (including each
anchor) matched byte for byte with no masks. Raw CTest, window, pair, hash
and timing outputs are in `artifacts/n03e-3q-3/`.

Cross-runtime handoff. The browser can measure the inert phase prefix against
the same late window. Verify that trace IDs through the prefix precede
descendant IDs and that a remote dynamic clamp still forces the queue.
Population sort prefixes and MSVC buffer copies are native-specific.
Both runtimes must preserve age-string ordering, equal-key FP addition
order and Stock-provider order.

**Proposals for the supervisor**

The gains below are estimates.

| Proposal | Estimated desktop saving at opening / late | Browser difference and version boundary |
| --- | --- | --- |
| Inverse-binomial Birth counts | Up to about 0.3 / 0.6 us/sim-s gross, before paying for a sampler. Birth RNG counting occupied 23 / 34 of 1,600 gate-build samples. | The browser tests a draw for each person in the ordered cohorts. A distribution-equivalent count changes individual outcomes and the continuing seed. Pin a new native simulation/RNG rules version in saves, anchors and replay goldens. |
| Sample Death by cohort | Less than the entire Death stage, roughly 0.2 / 0.4 us/sim-s on the faster runs. The mortality loop was too small to isolate a reliable net gain. | Natural-age and hardship victim counts and later draws can change. Version the mortality and RNG rules together and establish native cross-platform golden streams. |
| Defer rich Practice diagnostics during forecast | Illustrative 2-4 / 2-4 us/sim-s if about a quarter to half of trace work leaves the forward pass. Trace construction/append occurred in 672 / 473 of 1,600 samples. Restore and materialization costs are unmeasured. | The browser exposes per-site and civilization trace rows at their event second, including blocker reasons. Define and version anchor/diagnostic materialization, export and digest behavior. Retain queue effects and gameplay events. |
| Change draw counts without changing the high-level rule | No separate additive estimate. Savings overlap the Birth/Death rows. | Seeds are observable in browser saves and replay. Any changed seed progression needs the versioned native RNG contract above, including behavior beyond the binary64 exact-integer range. |

### N03e-3q pass 4 — exact-rule pipeline performance (complete, 19 Nov 2026)

Base `6baa16dd`, branch `t3/native-pipeline-performance-4`. Both assigned phases are complete and ownership is released. The [structural plan](docs/n03e-3q-pass-4-budget.md) gives the sampled loops, measured dispatch floor, exact-rule and rule-change cost estimates, phone assumptions and cross-runtime handoff.

| Separate commit and measurement | Opening pipeline | Late pipeline | Target stage, opening / late |
| --- | ---: | ---: | --- |
| `28baa0d7` reuse joint staffing until population or board changes | 19.548 → 19.049 | 22.975 → 22.882 | Food 9.088 → 8.878 (4/5 pairs faster) / 5.176 → 4.967 (5/5) |
| `be5c1856` retain normalized joint tables on inert Birth rolls | 19.066 → 18.297 | 23.208 → 22.726 | Birth 3.546 → 2.992 (5/5) / 6.203 → 6.083 (3/5) |

Each comparison used optimized MSVC on the i9-10900K, logical CPU 15, execution-speed throttling disabled. Five pairs per window alternated AB/BA launch order. Each run checked the states, then timed 256 resets from the opening or late anchor (9,984 / 2,816 advances). The overall pipeline uses the unobserved pass. Stage times use a separate instrumented pass. The late Birth delta against the staffing-only commit was small and variable. The final comparison below uses five fresh pairs against the original binary. Opening improved in 5/5 pairs and late in 4/5. Ranges were 19.45–19.85 → 18.46–18.70 opening and 22.46–23.90 → 21.73–23.09 late.

| µs/sim-s | Opening base | Opening pass 4 | Late base | Late pass 4 |
| --- | ---: | ---: | ---: | ---: |
| pipeline | 19.675 | 18.665 | 23.671 | 22.068 |
| advance_clock | 0.133 | 0.134 | 0.147 | 0.150 |
| prelude | 0.300 | 0.298 | 0.317 | 0.311 |
| seasonal_practices | 1.175 | 1.109 | 1.871 | 1.845 |
| spring_death_baseline | 0.003 | 0.003 | 0.011 | 0.010 |
| birth | 3.570 | 3.001 | 6.407 | 5.905 |
| food | 9.124 | 8.728 | 5.111 | 5.015 |
| after_meals_practices | 0.066 | 0.066 | 0.121 | 0.119 |
| garrison_upkeep | 0.087 | 0.083 | 0.047 | 0.046 |
| housing | 0.097 | 0.100 | 0.198 | 0.207 |
| faith | 0.069 | 0.067 | 0.124 | 0.127 |
| migration_practices | 0.681 | 0.647 | 0.379 | 0.395 |
| migration | 0.131 | 0.133 | 0.303 | 0.296 |
| death | 0.154 | 0.153 | 0.370 | 0.382 |
| death_practices | 0.875 | 0.835 | 0.924 | 0.912 |
| control_and_spatial_pressure | 0.367 | 0.358 | 0.400 | 0.407 |
| phase_events_and_drain | 2.889 | 2.843 | 5.194 | 5.056 |
| vassal_check | 0.017 | 0.017 | 0.018 | 0.022 |
| final_flush | 0.021 | 0.020 | 0.022 | 0.020 |

Both changes affect derived native state only. Staffing and the joint normalization flag are copy-owned per site. An imported ledger goes through a full first publication even if all rolls are zero. Legacy staffing is read directly. The warmed simulation still reports zero allocations; the logical hot-state accounting grows by 2,720 bytes at either 20-site endpoint, with identical reachable history byte counts. The generated Export and digest inputs are unchanged.

**Verification from the repository root, PowerShell.** The ignored raw report directory is `artifacts/n03e-3q-4/`. It holds binary copies, scripts, linker maps, raw stack PCs, all 60 paired JSON reports and load readings. In this worktree the pass-three runner and sampler were copied locally with their output paths updated. The timing report filenames include both build labels to prevent overwrites. The stage runner fails on every mismatch, including Prelude.

```powershell
$d = 'artifacts/n03e-3q-4'
. native/tools/env.ps1
Push-Location native
foreach ($preset in 'optimized','optimized-clang') {
    cmake --preset $preset
    cmake --build --preset $preset
    ctest --preset $preset --output-on-failure
    ctest --preset $preset -V -R pipeline_steady_state_allocations
}
Pop-Location
node native/schema/codegen.mjs
node native/schema/runtime-codegen.mjs

# Reuse the matching supervisor trace/window inputs, or generate them in a fresh checkout with
# node native/reference/trace.mjs
node native/reference/stage-probe.mjs --all
node native/reference/export-new-game.mjs --windows
foreach ($label in 'food','birth') {
    & "$d/pairs.ps1" $label
    node native/reference/new-game-windows.mjs "$d/$label.exe"
}
# One additional Birth with an independently validated browser start/end hash.
# The raw capture copy of stage-probe redirects its output outside the default corpus.
node "$d/extra-path.mjs"
node "$d/extra-probe.mjs" seed-1 43
foreach ($label in 'food','birth') {
    $s = "$d/extra-stages/seed-1/43"
    & "$d/$label.exe" stage --stage birth --before "$s/after-advance_clock.json" --after "$s/after-birth.json"
}
foreach ($label in 'base','food','birth') { & "$d/continuity.ps1" $label }
python "$d/confirmation.py" base food
python "$d/confirmation.py" food birth
python "$d/confirmation.py" base birth
```

- MSVC passed 36/36 CTests at baseline and after each change. Final optimized Clang passed 36/36. Both final binaries matched all 2,049 pinned digest rows through second 2,048. Both verbose allocation runs measured precisely zero allocations at opening over 3,200 advances and late over 1,920 advances, each after 512 warmup seconds.
- Both implementation commits passed the 18-stage corpus. A fresh `--all` and the supervisor's on-disk corpus each contain **828 distinct pairs**. The additional seed-1/43 Birth makes **829 verified distinct pairs** for each commit. The checked-in seed-1/1 clock boundary overlaps the default corpus. `pairs.ps1` runs `node native/reference/step-windows.mjs <exe>` and `node native/reference/stage-pairs.mjs <exe> <stage>` for every stage named in the table.
- Both passed 30 step windows, 153 comparisons (152 advancing, one gated) with zero masks. Each also matched five exact new-game starts and 10 native-start windows, 92 comparisons. Uninterrupted hash streams matched baseline at every row from 0–3712 and 3200–5632, including both anchors. Regeneration produced zero schema/digest-source changes.
- Sampling used `& "$d/diag-build.ps1" sample` after sourcing the MSVC environment, then `& "$d/sample.exe" artifacts/native-reference/windows/seed-1/0/state-0.json native/reference/topology 39` and the analogous `seed-2026-late/3200/state-3200.json` with `11`. Raw files use UTF-16 PowerShell redirection. The post-change copy is `sample-final`. The diagnostic floor used `& "$d/diag-build.ps1" floor` then `& "$d/floor.exe" <state> <window-length>` on the same anchors. See `loops.txt`, `groups.txt`, and `floor-{opening,late}.txt`.

**Decision for the supervisor.** The live pipeline still exceeds the 10–12 desktop allocation. Prototype exact shared trace storage with independent retention cursors and a restore oracle first. Cam's decision is needed only to change seeded sampling, lunar cadence or observable diagnostic content. The physical Pixel 6 throughput, thermal behavior and Android hash run remain open. This branch ends at the structural plan.


### N03e-3q pass 5 — shared Practice trace storage (stopped, 19 Nov 2026)

Branch `t3/native-trace-storage`, base `c4db1832`, measured prototype `05c81306`. The checkpoint saved **1.144 µs/sim-s opening and 1.173 late**. Both fall below the supervisor's approximately 2 µs stop threshold. The branch restores the base runtime and retains the measured prototype as a separate commit for inspection. The experiment produced no independently measured subchange to carry forward.

The prototype writes each newly emitted Practice row and its provider, trait, tag and receipt payload once. The civilization and site pages each retain their own ordered reference and their own 100-row eviction cursor. A writer allocates into a 4 KiB arena bucket. Published objects have stable addresses, and copying a writer gives the fork an empty tail. Direct phase rows store the second, ID, region, event kind, phase and captured controller. Inspection, Export and digest expand the remaining fields. The rare page-local phase string takes the full-row path. Reactive pending events retain their fields and receipts. Imported windows load their own captured rows, including oversized captures. The storage experiment did not attempt to identify common rows across two independently supplied JSON arrays at admission.

**Pipeline and stages.** Optimized MSVC, i9-10900K, logical CPU 15, five alternating AB/BA pairs per window, process execution-speed throttling disabled. Each executable checked 39 opening or 11 late advances before timing 256 resets. The pipeline uses the unobserved pass. All 18 stages use the separate instrumented pass and are weighted per simulated second. Opening was faster in 5/5 pairs, late in 3/5. The median of the paired differences was 1.162 opening and 1.173 late. The table gives medians per executable.

| µs/sim-s | Opening base | Opening prototype | Late base | Late prototype |
| --- | ---: | ---: | ---: | ---: |
| pipeline | 18.653 | 17.509 | 23.512 | 22.339 |
| advance_clock | 0.133 | 0.129 | 0.152 | 0.157 |
| prelude | 0.297 | 0.298 | 0.309 | 0.315 |
| seasonal_practices | 1.115 | 1.024 | 1.859 | 1.668 |
| spring_death_baseline | 0.003 | 0.004 | 0.010 | 0.011 |
| birth | 3.014 | 2.967 | 5.920 | 5.813 |
| food | 8.825 | 8.377 | 5.024 | 4.879 |
| after_meals_practices | 0.066 | 0.066 | 0.120 | 0.120 |
| garrison_upkeep | 0.085 | 0.084 | 0.045 | 0.047 |
| housing | 0.100 | 0.096 | 0.208 | 0.201 |
| faith | 0.066 | 0.059 | 0.126 | 0.116 |
| migration_practices | 0.648 | 0.534 | 0.392 | 0.359 |
| migration | 0.135 | 0.134 | 0.297 | 0.304 |
| death | 0.157 | 0.150 | 0.379 | 0.388 |
| death_practices | 0.828 | 0.827 | 0.904 | 0.869 |
| control_and_spatial_pressure | 0.359 | 0.355 | 0.407 | 0.408 |
| phase_events_and_drain | 2.849 | 2.438 | 5.064 | 4.592 |
| vassal_check | 0.017 | 0.017 | 0.018 | 0.019 |
| final_flush | 0.020 | 0.020 | 0.021 | 0.019 |

**Restore and retained anchors.** Each of five alternating runs per binary/window used `waffle_parity run --anchors` across the full digest horizon. The CLI samples 32 restores, each including the value copy and up to 63 advances. The table reports the median of the five per-run percentiles. The last two pairs saw higher background CPU load. Their observations are included.

| Metric | Opening base | Opening prototype | Late base | Late prototype |
| --- | ---: | ---: | ---: | ---: |
| Copy plus restore p50, ms | 1.2184 | 1.1351 | 1.3510 | 1.3306 |
| Copy plus restore p95, ms | 1.6878 | 1.4565 | 1.6844 | 1.6300 |
| Anchor creation alone p50, ms | 0.1510 | 0.1530 | 0.1713 | 0.1665 |
| Anchor creation alone p95, ms | 0.2214 | 0.1981 | 0.2319 | 0.2372 |
| Retained bytes per additional anchor, rounded | 1,421,694 | 1,349,603 | 1,558,690 | 1,466,447 |

The memory probe counts outstanding bytes requested through scalar, array and aligned global C++ allocation, including retained arena slabs. It advances the same state and takes a copy every 64 seconds in both arms. One arm keeps every anchor and one keeps the latest. At second 3712, the extra 58 anchors retained 82,458,278 → 78,276,990 bytes. At second 5632, the extra 38 retained 59,230,222 → 55,724,974 bytes. All five alternating pairs produced identical byte counts and endpoint digests. Allocator bookkeeping and OS residency are outside this measure. The prototype CLI's per-history `live_bytes()` counts cursor storage only. The separate allocation probe accounts for the shared chunks without charging them to both windows.

**Reproduction and verification.** All experiment files are local under `native/artifacts/n03e-3q-5/` (`$d` below). This keeps generated output inside the assigned native tree. `validation/` contains a copy of the reference scripts and read-only access to the supervisor's matching trace and window inputs. The stage and new-game generators wrote fresh captures there. Commands begin at the repository root in PowerShell.

```powershell
$d = (Resolve-Path native/artifacts/n03e-3q-5).Path
. native/tools/env.ps1
node native/schema/codegen.mjs
node native/schema/runtime-codegen.mjs
Push-Location native
foreach ($preset in 'optimized','optimized-clang') {
    cmake --preset $preset
    cmake --build --preset $preset
    ctest --preset $preset --output-on-failure
    ctest --preset $preset -V -R pipeline_steady_state_allocations
}
Pop-Location

# Saved optimized executables are base.exe (c4db1832) and shared.exe (05c81306).
python "$d/confirmation.py" base shared
python "$d/anchors.py" 0 5 base shared
python "$d/retained-pairs.py"
& "$d/endpoints.ps1" $d
python "$d/report.py"

Push-Location "$d/validation"
node native/reference/stage-probe.mjs --all
$stages = (Get-Content "$d/base_shared-opening-base-0.json" -Raw |
    ConvertFrom-Json).stages.PSObject.Properties.Name
foreach ($stage in $stages) { node native/reference/stage-pairs.mjs "$d/shared.exe" $stage }
node native/reference/step-windows.mjs "$d/shared.exe"
node native/reference/export-new-game.mjs --windows
node native/reference/new-game-windows.mjs "$d/shared.exe"
node native/reference/stage-probe.mjs seed-1 43
$s = 'artifacts/native-reference/stages/seed-1/43'
& "$d/shared.exe" stage --stage birth --before "$s/after-advance_clock.json" --after "$s/after-birth.json"
Pop-Location
```

- Candidate CTest results were 36/36 optimized MSVC and 36/36 optimized Clang. Both verbose allocation gates measured zero allocations over 3,200 opening and 1,920 late advances after 512 warmup seconds.
- A fresh `stage-probe --all` supplied 828 distinct pairs across all 18 stages. The independently hash-checked Birth at seed-1/43 supplied pair 829, as in pass four. All passed. The extra capture is stored separately in `extra-seed-1-43/` so it does not change the standard corpus counts.
- All 30 step windows passed with 153 comparisons, 152 advancing and one gated, with zero masks. New Game passed five exact starts and 10 native-start windows, 92 comparisons.
- The five paired anchor runs matched every base digest from 0 through 3712 inclusive (3,713 rows) and 3200 through 5632 inclusive (2,433 rows). Optimized Clang also matched both complete MSVC base streams. Every paired anchor run verified value-copy continuations and five browser-save adapter round trips. Base and candidate endpoint exports matched byte for byte at 841,009 bytes opening and 848,272 late.
- `confirmation.py` calls `waffle_parity step --from <start> --seconds 39|11 --expect-dir <window> --masks native/reference/parity-masks.json --time --report <json>`. `anchors.py` calls `run --anchors --from <start> --seconds 3712|2432 --hashes <tsv> --report <json>` and adds `--expect <base.tsv>` for the candidate. `retained.cpp` was linked with the measured candidate library and the pass-four library whose native sources match the base. `retained-pairs.txt` records both controls. Individual timings, host load, CTest logs and export hashes are beside the scripts.

**Supervisor disposition and cross-runtime handoff.** Publishing once removed roughly 0.45 opening Food and 0.47 late phase-drain µs/sim-s. The measured result covers building receipts, writing both cursor references, retaining chunks and evicting each window. Pass four's 8.6/8.2 trace-plus-enqueue estimate includes work this prototype still performs, including constructing reactive events. A follow-up would need a profile that separately prices enqueue, receipt construction and reference publication before funding a second layout. The browser can reuse the independent-window eviction and emit-time receipt oracles. The native timing and allocator results apply to this desktop workload. Ownership released.


### N03e-3q pass 6 — exact-rule pipeline speedups

**Complete.** Branch `t3/native-pipeline-performance-6`, base `6c803fd3`, final implementation `9a3cd7de`. Ownership released after the two requested phases. The [budget note](docs/n03e-3q-pass-4-budget.md#pass-six-on-the-merged-packed-trace-pipeline) gives the exclusive attribution, separate commit measurements, discarded Birth result, phone projection and proposals.

| µs/sim-s | Opening base | Opening final | Late base | Late final |
| --- | ---: | ---: | ---: | ---: |
| **Pipeline** | 17.616 | 15.961 | 22.555 | 20.777 |
| advance_clock | 0.132 | 0.137 | 0.154 | 0.159 |
| prelude | 0.294 | 0.305 | 0.311 | 0.317 |
| seasonal_practices | 1.041 | 0.932 | 1.728 | 1.604 |
| spring_death_baseline | 0.003 | 0.003 | 0.010 | 0.011 |
| birth | 2.975 | 2.965 | 6.018 | 6.003 |
| food | 8.511 | 7.420 | 5.024 | 4.654 |
| after_meals_practices | 0.066 | 0.068 | 0.125 | 0.108 |
| garrison_upkeep | 0.089 | 0.088 | 0.045 | 0.049 |
| housing | 0.091 | 0.092 | 0.200 | 0.209 |
| faith | 0.066 | 0.066 | 0.114 | 0.126 |
| migration_practices | 0.543 | 0.514 | 0.362 | 0.363 |
| migration | 0.134 | 0.132 | 0.312 | 0.304 |
| death | 0.158 | 0.155 | 0.388 | 0.384 |
| death_practices | 0.835 | 0.756 | 0.903 | 0.836 |
| control_and_spatial_pressure | 0.355 | 0.348 | 0.418 | 0.417 |
| phase_events_and_drain | 2.396 | 2.145 | 4.578 | 4.152 |
| vassal_check | 0.016 | 0.016 | 0.019 | 0.018 |
| final_flush | 0.020 | 0.021 | 0.032 | 0.020 |

The pipeline uses 256 reset-and-advance repetitions per trial (9,984 opening or 2,816 late advances). Each run first checked the window. Stage rows are medians of a separate observed pass, weighted per simulated second. Pipeline medians come from the unobserved pass. Five pairs alternated launch order on the i9-10900K using optimized MSVC, CPU 15, execution-speed throttling disabled. The final gap to 10 µs/sim-s is 5.961 opening and 10.777 late. All measured changes stayed within native simulation internals.

**Verification.** Each selected implementation passed the following checks independently. MSVC matched 828 distinct stage pairs from the fresh 18-stage corpus and one extra hash-checked Birth at seed-1/43, for 829 total. The 30 step windows matched 153 comparisons with zero masks (152 advancing, one gated). All 33 journals matched 242 browser checkpoints in three replay modes and all 55 expected rejections. New Game matched five exact starts and 92 comparisons across ten windows. Continuous MSVC digests matched the base byte for byte at 3,713 opening and 2,433 late seconds, including the anchors.

MSVC and llvm-mingw Clang each passed 42/42 optimized CTests per selected implementation. The cross-compiler fixture compared all 2,049 digest rows through second 2,048. The allocation gate recorded zero allocations over 3,200 opening and 1,920 late advances after a 512-second warmup. Each compiler also matched 32,001 summary hashes and 501 every-64-second anchor hashes on seed-1 longevity. The fresh serial oracle from the base matched the original N04a oracle byte for byte.

**Commands.** Run from the repository root in PowerShell. The local directory `native/artifacts/n03e-3q-6/` contains the scripts, copied executables, raw stacks and symbols, paired timing JSON, host load, hash streams and test logs. The validation copy of this checkout's reference scripts writes its captures there and reads the supervisor's matching trace and window inputs. The JS model is linked from this checkout. The extra Birth directory was moved aside before running the 18 standard stage comparisons.

```powershell
$d = (Resolve-Path native/artifacts/n03e-3q-6).Path
. native/tools/env.ps1
Push-Location native
foreach ($preset in 'optimized','optimized-clang') {
    cmake --preset $preset
    cmake --build --preset $preset
    ctest --preset $preset --output-on-failure
    ctest --preset $preset -V -R pipeline_steady_state_allocations
}
Pop-Location

# On the base revision, save optimized waffle_parity as base.exe in $d.
& "$d/sample.ps1"
python "$d/attribute.py"
& "$d/continuity.ps1" base
& "$d/base.exe" run --from "$d/longevity.json" --seconds 32000 --hashes "$d/long-states.tsv" --timegraph-hashes "$d/serial.tsv"

Push-Location "$d/validation"
node native/reference/stage-probe.mjs --all
node native/reference/export-new-game.mjs --windows
node native/reference/stage-probe.mjs seed-1 43
# On fresh capture, move artifacts/native-reference/stages/seed-1/43 to $d/extra-43.
Pop-Location

foreach ($label in 'owners','producer','scalar') {
    # At the corresponding source revision, save optimized waffle_parity as "$d/$label.exe".
    & "$d/pairs.ps1" $label
    & "$d/tests.ps1" $label
}
python "$d/confirmation.py" base owners
python "$d/confirmation.py" owners producer
python "$d/confirmation.py" producer birth
python "$d/confirmation.py" producer scalar
python "$d/confirmation.py" base scalar
python "$d/check.py" owners producer scalar
```

The pair script runs the following commands from the validation copy for each saved MSVC executable. The continuity and forecast commands run from the repository root. The two input windows are seed-1/0 (`N=3712`) and seed-2026-late/3200 (`N=2432`). The matching timing commands use `step --from <start> --seconds 39|11 --expect-dir <window> --masks native/reference/parity-masks.json --time --report <json>`.

```powershell
$stages = (Get-Content "$d/base_scalar-opening-base-0.json" -Raw | ConvertFrom-Json).stages.PSObject.Properties.Name
foreach ($stage in $stages) { node native/reference/stage-pairs.mjs $exe $stage }
node native/reference/step-windows.mjs $exe
node native/reference/replay-windows.mjs $exe
node native/reference/new-game-windows.mjs $exe
& $exe stage --stage birth --before "$d/extra-43/after-advance_clock.json" --after "$d/extra-43/after-birth.json"
& $exe run --from $start --seconds $N --hashes $output --expect $baseStream
foreach ($preset in 'optimized','optimized-clang') {
    & "native/build/$preset/src/sim/waffle_parity.exe" timegraph --from "$d/longevity.json" --seconds 32000 --repeats 1 --samples 0 --expect "$d/serial.tsv"
}
```


## N03f - Actions, replay and new game

Action application and `rebuildStateAtSecond` (L2), then new game and world
generation (L3). Windows/Android hash agreement (L4) is required before N04
completes.

### N03f L2 action and replay checkpoint (`t3/native-actions-replay`)

The oracle is browser `496d9971`, v52. `trace.mjs` records ordered scenario
entries through `appendActionAtCursor`, groups them by second, and applies
each group through `applyReplayActionsAtSecond`. At an initial state, apply
its entries before advancing. At subsequent seconds, finish the full tick
sequence, including the clock tail, then apply entries in append order.
A post-action anchor already includes that second's entries. A failure stops
the group at the failing entry. Replay ignores the live pause gate, still
rejects completed runs, and charges enabled, floored nonnegative AP costs on
success only. Native rejects without changing state, including RNG; browser
commands that perform provisional work before rejecting require isolation.

| Kind | Validation and committed effects | RNG |
| --- | --- | --- |
| `settlementAssignGarrison` | Full-map player holding; non-null target must be a connected adjacent friendly settlement enabled by a Structure modifier. Set support and emit assignment. | None |
| `settlementSelectVassal` | Finite candidate index, no living actor or Vault overflow, matching optional pool identity and a surviving player site. Create selected actor, graph and lineage links; clear pool and flag loadout. | Life Map stream for graph generation and Vassal stream for initial Scholar Commission offers |
| `settlementRerollVassals` | No living actor or Vault overflow. Increment reroll count and regenerate candidates, consuming candidate development where applicable. | Vassal and Vassal Portrait streams |
| `vassalEnterLifeNode` | Current actor, no mandatory picks or pending/active node, reachable graph node, Warrior for Campaign. Create node state and offers, set active node and record entry. | Vassal stream for randomized choices and inventories |
| `vassalSelectLifeOption` | Active idle node and valid affordable option, specialty or Campaign mode. Set selection or rebuild options/inventory. Random specialty grants Prestige. | Vassal stream for specialty inventory |
| `vassalMoveShopStructure` | Active Shop, editable placement and valid reservation. Update staged placement or board draft. | None |
| `vassalPurchaseShopOffer` | Active Shop, available offer or unlock, valid placement/order and affordable reserved costs. Stage receipt, draft edits and time, remove nonrepeatable offer. | None |
| `vassalUndoShopPurchase` | Active Shop and existing undoable receipt. Restore offer and reconstruct dependent draft order/time/cost. | None |
| `vassalReorderShopPurchase` | Active Shop, valid Practice receipt/order and reservation. Update draft order and receipt. | None |
| `vassalRerollShop` | Active idle Scholar Shop with specialty picked and no staged purchases. Start timed Delve. | None at action time; resolution rolls mortality and inventory |
| `vassalConfirmLifeNode` | Active idle node, selected specialty/option, legal acquisition and affordable valid reservations. Commit draft/option, then schedule node or encounter resolution or resolve immediately. | Vassal stream for random reward/risk encounters and immediate resolution; downstream effects can use their own streams |
| `vassalChooseCommission` | Idle active Scholar with a live offer and no accepted Commission. Accept, record baseline stat where applicable and clear offers. | None |
| `vassalChooseDevelopmentStat` | Current actor, queue head ID and offered stat. Increase permanent stat, record progress and event, pop choice. | Vassal stream if it completes a Commission and generates new offers |
| `vassalConfirmHeirloomLoadout` | Current actor, no overflow, up to three unique available Vault IDs. Equip in supplied order, unmark Sanctified items, compact Vault and clear loadout flag. | None |
| `vassalResolveVaultOverflow` | Pending overflow and the exact Vault capacity of unique available IDs. Replace Vault in supplied order and clear overflow flags. | None |
| `debugSetCap` | Control action. Set or clear AP override and clamp current points. | None |
| `debugSetSettlementSlotOverrides` | Legacy local hub and valid ordered override entries. Set Practice/Structure debug values, rebuild occupancy and derived state. | None directly |
| `regionInstallPractice` | Known regional Practice and player region with capacity. Append ID. | None |
| `regionUninstallPractice` | Player region and valid integer installed index. Remove that entry. | None |

The registry constants for pawn placement, inventory move/split/stack, build
designation, tile/hub tag order/toggles, crop/recipe selection and debug
environment queue have no dispatch branch and return `unsupportedAction`.

#### Native implementation and coverage

`sim/step/replay.hpp` exposes the JSON action journal, boundary cursor,
validation result and `rebuildStateAtSecond`. Rebuild reads the immutable
initial state or nearest post-action runtime anchor, copies it, and replays
through the target second. The caller invalidates anchors at or after a journal
edit. The parity tool captures anchors every 64 seconds and checks continuation
through the existing runtime Export and admission adapter. The step driver and
tick order are unchanged. The v52 mirror now preserves the nullable origin of a
staged Structure move. A null origin represents demolition.

The seven replay journals exercise 18 successful kind dispatches and 58 browser
checkpoints, each checked during forward replay, rebuild from the initial
state and rebuild from the nearest anchor. The browser rejection trace covers
`debugSetSettlementSlotOverrides` on a v52 save and six more rejection
cases. Native validation tests verify unchanged state digests after rejection,
same-second AP ordering and retry at the failing journal entry.

| Step window | Journal applied by native |
| --- | --- |
| `seed-42-shops/12` | Selection at 7. Node entry, specialty selection, Practice purchase and confirmation at 12. |
| `seed-42-shops/68` | Same entries at 7 and 12, then the window crosses the resolution at 71. |
| `seed-42-shops/80` | Same entries at 7 and 12, followed by node entry, specialty selection and empty Shop confirmation at 80. |

All three windows start from the separate pre-action snapshot and also compare
the first window state. The other captures check AP, garrison, candidate reroll,
Scholar development/Commission/Delve, Heirloom loadout and overflow,
Structure drafting and demolition, Founding, and legacy regional Practice
list changes. The regional Practice exhibit supplies the list explicitly. The
ordinary full-map regions omit that legacy board, and v52 has no field for its
legacy capacity.

| Open action branches | Owner |
| --- | --- |
| `debugSetSettlementSlotOverrides` with a legacy hub, and capacity-aware regional Practice actions for pre-v52 maps | Native save integration owner, if those legacy formats enter scope |
| Windows/Android arm64 runtime hash agreement | N03g |

#### Reproduction

From the repository root in PowerShell:

```powershell
. native/tools/env.ps1
Push-Location native
cmake --preset optimized
cmake --build --preset optimized --parallel 8
ctest --preset optimized --output-on-failure
Pop-Location
$parity = "native/build/optimized/src/sim/waffle_parity.exe"
node native/reference/trace.mjs
node native/reference/trace.mjs --check
node native/reference/replay-windows.mjs $parity
node native/reference/step-windows.mjs $parity
node native/reference/stage-probe.mjs --all
$stages = @("advance_clock", "prelude", "seasonal_practices", "spring_death_baseline",
  "birth", "food", "after_meals_practices", "garrison_upkeep", "housing", "faith",
  "migration_practices", "migration", "death", "death_practices",
  "control_and_spatial_pressure", "phase_events_and_drain", "vassal_check", "final_flush")
foreach ($stage in $stages) { node native/reference/stage-pairs.mjs $parity $stage }
node native/reference/export-new-game.mjs --windows
node native/reference/new-game-windows.mjs $parity
```

Optimized MSVC passed all 38 CTests, including the original 36, all 30 step
windows and 153 advances/gate comparisons plus three action-window starts.
New Game matched five starts, ten native-start windows and 92 comparisons.
All 828 generated stage pairs passed across 18 stages. The integration
checkout's manifest contains the same 828 scenario/second/stage keys. Zero
masks were added, removed or applied.
Browser `npm run verify` passed after installing the locked dependencies
with `npm ci --no-audit --no-fund`.

`cmake --preset optimized-clang`, `cmake --build --preset optimized-clang`
and `ctest --preset optimized-clang --output-on-failure` also passed 38/38.
`cmake --preset dev-clang` and
`cmake --build --preset dev-clang --target waffle_parity waffle_action_validation_test`
built the second Clang profile. All seven native per-second streams match
hash for hash across MSVC and both Clang builds. Reproduce with
`artifacts/n03f-l2/compare-compilers.ps1`, which runs the same journal and
checkpoints for each executable and compares each TSV's SHA-256.
`cmake --preset android` and
`cmake --build --preset android --target waffle_sim waffle_parity` built the
NDK r30 arm64 / API 31 simulation and parity tool. N03g still owns the
device hash run.

#### 32,000-second rebuild measurement

Use the N03g seed-1 stability input with `phaseDurationSec = 64` and
`monsterExpansionThreshold = 1000000000`.

```powershell
New-Item -ItemType Directory -Force artifacts/n03f-l2 | Out-Null
@'
import { readFileSync, writeFileSync } from "node:fs";
const state = JSON.parse(readFileSync("native/reference/fixtures/seed-1/state-0.json"));
state.gameConfig.settings.values.phaseDurationSec = 64;
state.gameConfig.settings.values.monsterExpansionThreshold = 1e9;
writeFileSync("artifacts/n03f-l2/seed-1-long.json", JSON.stringify(state));
'@ | node --input-type=module

& $parity run --from artifacts/n03f-l2/seed-1-long.json --seconds 32000 --anchors `
  --actions native/reference/fixtures/action-boundaries/actions.json `
  --hashes artifacts/n03f-l2/long-with-actions.tsv --report artifacts/n03f-l2/long-with-actions.json
```

On optimized Windows MSVC / i9-10900K, 256 deterministically sampled target
seconds across 501 anchors measured **0.312 ms p50 / 0.483 ms p95**.
Measurement covers nearest-anchor lookup, independent state copy and replay
through at most 63 seconds. Hashing, adapter I/O and presentation run outside
that sample. The run was measured alongside other build and verification jobs.
The browser guardrails link a 33 ms p95 restore-plus-render gate. Native's
provisional target is 4 ms random-restore p95 under forecast load
([Architecture](ARCHITECTURE.md)). This measurement covers desktop restore
under the stability configuration. Physical device, rendering and concurrent
forecast measurements remain open. The five adapter save/load samples measured
27.71/123.23 ms p50, respectively.

Cross-runtime handoff. The browser action order and its post-action checkpoint
boundary carry over directly. Runtime value copies and 64-second strides are
native choices. The seven browser replay manifests are suitable for the next
N03f behavior passes and for N03g compiler/device comparisons. The raw command
logs and timing report are under `artifacts/n03f-l2/`.

### N03f L2b remaining native actions (done)

Implemented on `t3/native-actions-remaining` from `e1abfab6`, using the
unchanged browser model and definitions at `496d9971`.

| Family | Coverage |
| --- | --- |
| Node entry, selection and confirmation | Crossroads travel, routes and both Tour rewards. Ordinary and Special Relics, immediate death and Mandate protection. Crisis relief, paid relief, diversion and rescue. Discovery, Challenge and Legacy+. Campaign duels, quests, Creep clearing, nest destruction, conquest with transferred garrison and defeat. |
| Shop staging and confirmation | Ordered slot unlocks and undo, hosted Currency payment, legacy connection additions and removals. |
| Candidate selection and reroll | Unpooled family draws, first-life and successor graphs, mid-map and Legacy+ signatures, stock supply placement and Scholar candidate development. |

Scenario rejections run on isolated browser and native copies at the recorded
boundary. The runner checks the rejection reason and unchanged state digest.
Accepted journals exercise continuous replay, rebuild from the initial state,
and rebuild from a post-action anchor.

The native v52 mirror preserves receipt field presence and connection endpoints.
The browser creates a shorter unlock receipt in [shop.js lines 309–317](../src/model/vassal-life-map/shop.js#L309-L317),
assigns `hourglassApplied` only for positive time in [shop.js lines 405–408](../src/model/vassal-life-map/shop.js#L405-L408),
and adds removal receipts only for repriced cards in [shop.js lines 633–643](../src/model/vassal-life-map/shop.js#L633-L643).
The life event copies the original intervention in [node-confirm.js lines 614–621](../src/model/vassal-life-map/lifecycle/node-confirm.js#L614-L621),
including the endpoint-only connection shape in [world-choices.js lines 44–49](../src/model/vassal-life-map/world-choices.js#L44-L49).
Both schema generators ran. Runtime export and digest coverage use the same
generated history fields.

The nest capture commits at second 6. At second 2, the browser restores the
ruin before the current Moon turn has a report row for it, and the next Housing
phase throws while writing that row. A browser follow-up should initialize the
report when restoring the site, then add a replay case between phases.
See [housing.js line 65](../src/model/detailed-settlements/phases/housing.js#L65).

Verification ran on Windows with `optimized` (MSVC) and `optimized-clang`.
From the repository root in PowerShell:

```powershell
. native/tools/env.ps1
$presets = @('optimized', 'optimized-clang')
foreach ($preset in $presets) {
  Push-Location native
  $jobs = if ($preset -eq 'optimized') { 8 } else { 6 }
  cmake --preset $preset
  cmake --build --preset $preset --parallel $jobs
  ctest --preset $preset --output-on-failure
  Pop-Location
}
node native/reference/trace.mjs
node native/reference/trace.mjs action-campaign-alliance
node native/reference/stage-probe.mjs --all
node native/reference/export-new-game.mjs --windows
$stages = @('advance_clock', 'prelude', 'seasonal_practices', 'spring_death_baseline',
  'birth', 'food', 'after_meals_practices', 'garrison_upkeep', 'housing', 'faith',
  'migration_practices', 'migration', 'death', 'death_practices',
  'control_and_spatial_pressure', 'phase_events_and_drain', 'vassal_check', 'final_flush')
foreach ($preset in $presets) {
  $parity = "native/build/$preset/src/sim/waffle_parity.exe"
  node native/reference/replay-windows.mjs $parity
  node native/reference/step-windows.mjs $parity
  foreach ($stage in $stages) { node native/reference/stage-pairs.mjs $parity $stage }
  node native/reference/new-game-windows.mjs $parity
}
node native/schema/codegen.mjs --check
node native/schema/runtime-codegen.mjs --check
node native/reference/export-vassal-tables.mjs --check
```

The browser trace run regenerated all 54 scenarios with matching JSON
continuations and rebuilds. Both presets passed 38/38 CTests, 30 step windows
(153 comparisons, zero masks), 828/828 stage pairs across all 18 stages, and
five exact New Game states plus 10 native-start windows (92 comparisons).
Replay matched 33 journals across 18 action kinds, 242 browser checkpoints in
each replay mode, and 55 rejection probes. The two compilers produced identical
per-second digest streams for all 33 journals. Logs are in `artifacts/n03f-l2b/`.

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

### N03f-3 second-zero builder (done)

The [builder](src/sim/world/new_game.hpp) creates a playable runtime from a
uint32 seed and captured GameConfig. It draws the starter road and structure
capacities, rolls founders on their existing streams, and then assigns Crown,
neutral and Monster regions. It builds the ledger, boards, markets and live
roads in browser order and reuses native Stock capacity and compiled content.
Runtime admission generates regional-v2 topology from the definition ID.
Explicit topology JSON still supports replay of captured reference and authored
definitions.

From the repository root in PowerShell:

```powershell
. native/tools/env.ps1
Push-Location native
cmake --preset optimized
cmake --build --preset optimized --parallel 6
ctest --preset optimized --output-on-failure
Pop-Location
$parity = "native/build/optimized/src/sim/waffle_parity.exe"
node native/reference/export-new-game.mjs --windows
node native/reference/new-game-windows.mjs $parity
node native/reference/trace.mjs
node native/reference/step-windows.mjs $parity
node native/reference/stage-probe.mjs --all
node native/reference/stage-pairs.mjs $parity prelude
foreach ($seed in 1,42,123,1867,2026) {
    & $parity new-game --seed $seed --out "artifacts/n03f-3/seed-$seed.json" --time
}
```

- All 34 enabled optimized CTests passed, including `new_game_parity` against
  the checked-in seed-1 fixture and generated/loaded topology admission.
  `pipeline_steady_state_allocations` remains disabled.
- Browser `npm run verify` and the final `npm run check:docs` passed.
- The five ordinary starts matched every serialized field at second zero.
  Both runtimes advanced from their own second-zero states for all ten
  configured windows across those seeds, including anchors through 3200 s.
  All 92 comparisons passed with zero masks, including the paused gate.
  Seeds 0, 2147483648 and 4294967295 also matched at second zero. A seed-42
  capture with edited settings, Stock capacity, housing and Life Map design
  matched using the same builder.
- For each of the five ordinary seeds, `waffle_parity run --from <state-0.json>
  --seconds 64 --hashes <generated.tsv> --anchors` matched a second run with
  `--topology-dir native/reference/topology --expect <generated.tsv>` and a
  separate output path. All 325 state digests and the restore checks agreed.
- Standard browser-anchor windows passed 23/23 with 138 comparisons. Stage
  pairs passed 751/752. Run `stage-pairs.mjs` with each of the 18 stage names
  in `native/src/sim/step/stages.cpp` and the existing masks file for `vassal_check`.
  The known N03e prelude failure at `death-committed-arrivals/2035` starts at
  `$.civilization.practiceEvents.nextId` and produced identical hashes and
  53 differing leaves with generated and loaded topology. The existing 14
  N03e-9 masks were used for the standard windows and Vassal stage pairs.
  This item added and removed zero masks.
- Optimized Windows MSVC 19.50 on i9-10900K, median of seven full builds per
  seed, excluding process startup, captured-config file reading and output
  serialization. Seed 1 took 27.16 ms, seed 42 took 27.57 ms, seed 123 took
  28.27 ms, seed 1867 took 34.00 ms and seed 2026 took 28.35 ms. The median
  across seeds was 28.27 ms. The earlier world-generation-only median was
  22.96 ms. Timing includes content compilation and runtime admission.
- Android arm64 `waffle_sim` cross-build passed with NDK r30, API 31 and
  `Release`. Configure with `cmake -S native -B native/build/n03f3-android -G Ninja
  -DCMAKE_BUILD_TYPE=Release -DCMAKE_TOOLCHAIN_FILE=<ndk>/build/cmake/android.toolchain.cmake
  -DANDROID_ABI=arm64-v8a -DANDROID_PLATFORM=android-31` and build with
  `cmake --build native/build/n03f3-android --target waffle_sim --parallel 4`.
  Device hash agreement remains part of N03g.

`new-game --scenario <id>` selects the starting configuration from a captured
fixture. The built-in ordinary trace scenarios reuse the seed-1 capture.
The supplied seed still controls topology and all RNG streams.
Verification artifacts are in `artifacts/n03f-3/`. L2 coverage and remaining
action branches are recorded above.

## N03g - Cross-compiler determinism and long-run restore (Windows verified, Android runtime unrun)

Worker branch `t3/native-cross-compiler-determinism-2` starts at
`e6cef481` and merges the paused checkpoint `2131c16b`. The MSVC
harness from `d7758c35` was already integrated. The Clang presets pin
both compiler drivers and `windres.exe` to the same llvm-mingw
installation. FreeType's resource build previously resolved a bare
`windres` from PATH, which failed under the normal MSVC shell. The
`dev-clang` preset shares that toolchain with `optimized-clang`.

The implementation adds build configuration and CTest coverage.
Generated commands for `advance_second.cpp` and `parity_run.cpp`
use `/fp:precise` under MSVC 19.50.35730 and
`-fno-fast-math -ffp-contract=off` under llvm-mingw 23.1.5 and NDK
r30 Clang. Command evidence is in `artifacts/n03g/fp-<preset>.txt`.

### Build and verify

Run from the repository root in PowerShell. In a linked worktree use the
primary checkout's `native/.tools` junction before bootstrap.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File native/tools/bootstrap-windows.ps1 -WithClang
. native/tools/env.ps1
Push-Location native
foreach ($preset in 'optimized','dev','optimized-clang','dev-clang') {
    cmake --fresh --preset $preset
    cmake --build --preset $preset --parallel 6
    ctest --preset $preset --output-on-failure
}
Pop-Location
node native/reference/trace.mjs
node native/reference/step-windows.mjs native/build/optimized/src/sim/waffle_parity.exe
node native/reference/step-windows.mjs native/build/optimized-clang/src/sim/waffle_parity.exe
```

`--fresh` clears CMake's cached bare resource compiler from the paused
Clang build. MSVC and Clang optimized step windows each passed 23 windows
and 138 comparisons (137 advancing, 1 gated), with the existing 14 masks.
No simulation stage changed, so there are no new stage-pair measurements.
The previously recorded prelude mismatch is still supervisor-owned.

All 34 enabled CTests passed under `optimized` (41.90 s), `dev` (216.47 s), `optimized-clang` (14.06 s) and `dev-clang` (79.15 s). The existing
`pipeline_steady_state_allocations` test remains disabled. Logs are
`artifacts/n03g/ctest-<preset>.log`.

`native_run_cross_compiler` pins the 2,049 hash rows at seconds 0–2,048
of the unmodified seed-1 run. Its final digest is `7f4548db30e59d17`.
Both toolchains can run this CTest independently against the
[checked-in hash stream](src/tests/vectors/native-run-cross-compiler.tsv). The
existing 256-second adapter and replay smoke is also enabled.

### Unmodified saves and the 32,000-second workload

Both unmodified saves end by Monster overrun in ordinary simulation, at
absolute seconds 4,890 and 5,676. Requesting 32,000 advances from either
save returns exit 2 at the corresponding terminal second in both
optimized Windows builds. The terminal snapshots carry
`runStatus.complete = true` and `reason = "monsterOverrun"`. Full
per-second comparison on those inputs is therefore through the terminal
second, including its digest. Keeping a holding alive from either exact
start for 32,000 advances would need a player action journal.

For the separate 32,000-second stability workload, derive each input
from the same save and set the existing captured
`settings.values.phaseDurationSec` to 64 (was 1) and
`monsterExpansionThreshold` to 1000000000 (was 100). The lower lunar
dispatch frequency and higher threshold keep both test runs alive.
Changing only the threshold reached territorial loss at 6,516 and
9,552, respectively. These variants are performance and replay
fixtures. They use the normal clock and terminal rules and do not
represent the default game balance.

```powershell
$out = 'artifacts/n03g'
New-Item -ItemType Directory -Force $out | Out-Null
$starts = [ordered]@{
    'seed-1' = 'native/reference/fixtures/seed-1/state-0.json'
    'seed-2026-late' = 'artifacts/native-reference/traces/seed-2026-late/state-3200.json'
}
$untilTerminal = @{ 'seed-1' = 4890; 'seed-2026-late' = 2476 }
@"
import json
from pathlib import Path
starts = {
    "seed-1": "$($starts['seed-1'])",
    "seed-2026-late": "$($starts['seed-2026-late'])",
}
for seed, path in starts.items():
    state = json.loads(Path(path).read_text(encoding="utf8"))
    settings = state["gameConfig"]["settings"]["values"]
    settings["phaseDurationSec"] = 64
    settings["monsterExpansionThreshold"] = 1000000000
    path = Path("$out") / f"{seed}-longevity.json"
    path.write_text(json.dumps(state, ensure_ascii=False, separators=(",", ":")), encoding="utf8")
"@ | python -
foreach ($seed in $starts.Keys) {
    foreach ($preset in 'optimized','optimized-clang') {
        $exe = "native/build/$preset/src/sim/waffle_parity.exe"
        & $exe run --from $starts[$seed] --seconds 32000 --anchors --hashes "$out/$seed-requested-$preset.tsv"
        if ($LASTEXITCODE -ne 2) { throw "Expected a terminal run from $seed on $preset" }
    }
    foreach ($preset in 'optimized','dev','optimized-clang','dev-clang') {
        $exe = "native/build/$preset/src/sim/waffle_parity.exe"
        foreach ($suffix in '','-long') {
            $case = "$seed$suffix"
            $fixture = $starts[$seed]
            $seconds = $untilTerminal[$seed]
            if ($suffix) {
                $fixture = "$out/$seed-longevity.json"
                $seconds = 32000
            }
            $dest = "$out/$case-$preset"
            $expect = @()
            if ($preset -ne 'optimized') { $expect = @('--expect', "$out/$case-optimized.tsv") }
            $snapshot = @()
            if (!$suffix -and $preset -eq 'optimized') { $snapshot = @('--snapshot', "$dest-terminal.json") }
            & $exe run --from $fixture --seconds $seconds --anchors --hashes "$dest.tsv" --report "$dest.json" @expect @snapshot
            if ($LASTEXITCODE -ne 0) { throw "Determinism check failed for $case on $preset" }
        }
    }
    foreach ($suffix in '','-long') {
        $case = "$seed$suffix"
        foreach ($pair in @(@('optimized','optimized-clang'), @('optimized','dev'), @('optimized-clang','dev-clang'))) {
            cmake -E compare_files "$out/$case-$($pair[0]).tsv" "$out/$case-$($pair[1]).tsv"
            if ($LASTEXITCODE -ne 0) { throw "Hash stream differs for $case on $($pair -join '/')" }
        }
    }
}
```

The late input regenerated by `trace.mjs` has SHA-256
`f838a38cfc48253018de948dbec84f7b44a3dbe63dbfbfd2e1e24493c1199f88`.
For each row below the hash files and corresponding JSON reports are at
`artifacts/n03g/<stem>-<preset>.tsv` and `.json`. Each hash stream
includes the initial state. The four Windows builds agree byte for byte.

| Stem | Advances | Final second | Final state digest | Stream SHA-256 |
| --- | ---: | ---: | --- | --- |
| `seed-1` | 4,890 | 4,890 | `bc067d238adbdd60` | `ef098951996dea25929c02d82b6fe51034ca08e3c3776ff3024579dd44b1ae6f` |
| `seed-2026-late` | 2,476 | 5,676 | `aa23e7b7a8d799a0` | `0717830e69c75fe65f8e0e2955b133f3c51d3135d1de58409acb578195ec6a46` |
| `seed-1-long` | 32,000 | 32,000 | `175541e792a97f0e` | `38ad36ef33f836cfca15a4e7929c6d2db5d366a073e1581a73a1b556aa7b28b5` |
| `seed-2026-late-long` | 32,000 | 35,200 | `bdf6609165c4327b` | `7ffd04d52f8a729a99815ceba42a66e55fb8f8632fd97db2b95ed9fe7a49954e` |

Each run digested finite reachable state each second and matched the
independently advanced endpoint. The two long runs each held 501
anchors. The harness verified every hash in 32 evenly spaced 64-state
anchor windows and in five adapter reload windows. The adapter exports
also matched byte for byte after reimport. Win x64 measurements on the
i9-10900K, with rate timed on the uninterrupted advance pass and
restore time covering a copy plus 63 advances across the 32 windows.
The optimized measurements come from a serial rerun of the same
commands with output prefixes `artifacts/n03g/<stem>-<preset>-measured`
and `--expect` pointed at the first MSVC optimized stream. The dev
runs overlapped build and test activity.

| Workload | Preset | Sim-s/s | Anchor restore p50 ms | p95 ms |
| --- | --- | ---: | ---: | ---: |
| `seed-1` | MSVC optimized | 51,999 | 1.471 | 2.705 |
| `seed-1` | Clang optimized | 68,157 | 1.220 | 1.987 |
| `seed-1` | MSVC dev | 1,793 | 43.253 | 58.219 |
| `seed-1` | Clang dev | 1,989 | 22.131 | 32.765 |
| `seed-2026-late` | MSVC optimized | 23,840 | 1.801 | 3.207 |
| `seed-2026-late` | Clang optimized | 30,677 | 2.597 | 4.081 |
| `seed-2026-late` | MSVC dev | 791 | 54.066 | 68.109 |
| `seed-2026-late` | Clang dev | 3,425 | 27.173 | 31.979 |
| `seed-1-long` | MSVC optimized | 328,849 | 0.406 | 0.577 |
| `seed-1-long` | Clang optimized | 401,596 | 0.367 | 0.513 |
| `seed-1-long` | MSVC dev | 12,288 | 4.499 | 6.946 |
| `seed-1-long` | Clang dev | 15,484 | 2.735 | 4.204 |
| `seed-2026-late-long` | MSVC optimized | 257,701 | 0.320 | 0.542 |
| `seed-2026-late-long` | Clang optimized | 379,927 | 0.276 | 0.390 |
| `seed-2026-late-long` | MSVC dev | 17,977 | 3.261 | 5.217 |
| `seed-2026-late-long` | Clang dev | 33,716 | 2.842 | 3.716 |

MSVC optimized long-run live history grew to approximately 0.96 MiB on
both cases. Process working set with all retained anchors reached about
352 and 409 MiB, respectively. This CLI retains every anchor to validate
restore over the whole horizon. Its memory use is separate from N04's
budgeted forecast store. The browser timegraph's independent-copy replay
contract is the corresponding invariant. The longevity timings reflect
the less frequent lunar stages in these fixtures.

The browser `npm run verify` passed documentation, architecture,
reachability, assets and build, then stopped when the temporary
`test:build-preview` server failed to start. The independently run
`npm run check:docs` and `npm run test:native-reference` passed.
`npm start` reported all default preview ports occupied. A checkout
preview started with `node scripts/local-preview.mjs --serve 5211`
served the index and build metadata successfully.

### Android arm64

The existing project-local NDK r30 (`30.0.16248370`) built
`native/build/android/src/sim/waffle_parity`. `llvm-readelf -h -l -d`
reported an AArch64 ELF64 PIE with `/system/bin/linker64`. The executable
links Android's `libm.so`, `libdl.so` and `libc.so` and includes libc++
statically. When the pinned NDK is missing, use
`powershell -NoProfile -ExecutionPolicy Bypass -File native/tools/bootstrap-android.ps1`
to install it. The build here used the NDK extracted from the cached
archive with SHA-1 `9bf167a1985fa7d4a036186b78f702eab9179408`.

```powershell
. native/tools/env.ps1
Push-Location native
cmake --preset android
cmake --build --preset android --target waffle_parity --parallel 6
Pop-Location
$ndkBin = 'native/.tools/android-sdk/ndk/30.0.16248370/toolchains/llvm/prebuilt/windows-x86_64/bin'
& "$ndkBin/llvm-readelf.exe" -h -l -d native/build/android/src/sim/waffle_parity
```

Android execution and L4 are **unrun**. `adb devices -l` returned an
empty list. From the repository root, use the `$starts`,
`$untilTerminal` and `$out` above after generating the Windows streams
and longevity inputs. Connect an API 31+ arm64 device or emulator, and
then run the following commands. An existing SDK `adb.exe` can be used
in place of the downloaded platform-tools.

```powershell
curl.exe -fsSL -o "$out/platform-tools-windows.zip" https://dl.google.com/android/repository/platform-tools-latest-windows.zip
tar.exe -xf "$out/platform-tools-windows.zip" -C $out
$adb = "$out/platform-tools/adb.exe"
$remote = '/data/local/tmp/waffle-n03g'
& $adb devices -l
& $adb shell getprop ro.product.cpu.abi
& $adb shell mkdir -p "$remote/topology"
& $adb push native/build/android/src/sim/waffle_parity "$remote/waffle_parity"
& $adb shell chmod 755 "$remote/waffle_parity"
Get-ChildItem native/reference/topology/*.json | ForEach-Object {
    & $adb push $_.FullName "$remote/topology/"
    if ($LASTEXITCODE -ne 0) { throw "Topology push failed for $($_.Name)" }
}
foreach ($seed in $starts.Keys) {
    foreach ($suffix in '','-long') {
        $case = "$seed$suffix"
        $fixture = $starts[$seed]
        $seconds = $untilTerminal[$seed]
        if ($suffix) {
            $fixture = "$out/$seed-longevity.json"
            $seconds = 32000
        }
        & $adb push $fixture "$remote/$case.json"
        & $adb push "$out/$case-optimized.tsv" "$remote/$case-windows.tsv"
        & $adb shell "$remote/waffle_parity run --from $remote/$case.json --topology-dir $remote/topology --seconds $seconds --anchors --hashes $remote/$case.tsv --expect $remote/$case-windows.tsv --report $remote/$case-report.json"
        if ($LASTEXITCODE -ne 0) { throw "Android parity failed for $case" }
        & $adb pull "$remote/$case.tsv" "$out/$case-android.tsv"
        & $adb pull "$remote/$case-report.json" "$out/$case-android.json"
        cmake -E compare_files "$out/$case-optimized.tsv" "$out/$case-android.tsv"
        if ($LASTEXITCODE -ne 0) { throw "Android hash file differs for $case" }
    }
}
```

## N03h - v53 catch-up

Windows verification is complete on `t3/native-v53-catch-up`, started at
`5f24e617`. The browser oracle moves from `496d9971` to `2334c106`
(v1.1.78). GameState advances to v53. GameConfig v31 and runner saves v33
retain their versions. The target predates the restored-ruin Housing fix.

### Browser change inventory

| Path under `src/` | Classification and native disposition |
| --- | --- |
| `defs/gamepieces/detailed-settlement-defs.js` | Content. Anatomical Study and Heresiography gain 4 and 5 Research per Discharge. Doomsday Chronicle uses 1 Paper for 3 Research per Birth plus up to 4 from lost settlements, with no workers. All three drop Stock. Surveying, Charnel Alchemy and Monster Hunting lose incidental Research and keep their Stock recipes. Capture the definitions and run them through the existing DSL. |
| `defs/gamepieces/full-map-defs.js` | Rule. Ordinary offers can opt in through the captured Practice flag. Apply this in both ordinary shops and Life Map Stock Supply eligibility, with map-seeded cards excluded first. |
| `model/commands/simulation-commands.js` | Rule. Use tick-derived clocks, dispatch the season at its exact boundary, and pass the change to the scheduler synchronously. |
| `model/detailed-settlements/phases.js` | Rule and schema. Use dispatcher-local season change and the state constructor's schema. Preserve prelude, season, Spring baseline, then lunar ordering. |
| `model/detailed-settlements/phases/chaos.js` | Rule. Zero base short-circuits, split the power for tiny positive bases when needed, and cap primordial income at one billion before rounding. |
| `model/game-config.js` | Schema and content. Validate and compile optional Boolean `fullMapOffer` within v31. Absence from a captured definition confers no additional eligibility. |
| `model/game-model.js` | Rule plumbing. The caller's frame delta no longer enters the simulation clock. |
| `model/gamepiece-presentation.js` | View only. Readiness shows the new exact seasonal schedule. |
| `model/init.js` | Rule. Full season countdown at second zero. |
| `model/live-second-stage-scheduler.js` | Rule plumbing. Forward the season-boundary flag to settlement stages. |
| `model/mechanic-readings.js` | View only. Readout describes the existing lost-settlement bonus cap. |
| `model/rng.js` | Rule. Wrap each advancing stream and standalone seed modulo 2^32. Preserve mix operations and draw order. |
| `model/state.js` | Schema and rules. Require v53, validate unsigned advancing seeds, preserve finite run identity, initialize the countdown, and remove season scratch from save/restore. |
| `model/tests/charge-content.js` | Test only. Updated fixed tick calls. |
| `model/tests/civilization-content.js` | Test only. Chronicle now checks loss-scaled Research and zero Stock. |
| `model/tests/detailed-settlements/queries.js` | Test only. Corrected the Primordial tuning assertion's description. |
| `model/tests/detailed-settlements/vassals.js` | Test only. Explicitly passes the season-boundary flag to direct phase calls. |
| `model/tests/minimal-bronze-content.js` | Test only. Updated schema expectation. |
| `model/tests/monster-pressure.js` | Test only. Added extreme Primordial cases. |
| `model/tests/neutral-markets.js` | Test only. Removed the old forced schema. |
| `model/tests/simulation-clock-rng.js` | Test only. Added unsigned stream, long-run clock and boundary restore controls. |
| `model/tests/timegraph-performance.js` | Test only. Removed transient latch cleanup. |
| `model/tests/vassal-life-map/lifecycle.js` | Test only. Updated fixture schema. |
| `model/tests/world-state.js` | Test only. Updated fixture schema. |
| `model/timegraph/state-restorer.js` | Rule plumbing. The browser restore cache no longer clears a season latch. Native restore computes the boundary from the tick index. |

#104 only changes the browser Vassal HUD. #100 preview tooling does not
participate in native simulation. The topology generator source is identical.

### Arithmetic, ordering and replay

- At a tick index `i`, use binary64 `i / 60`, `(i % (60 * duration)) / 60`
  and `(60 * duration - i % (60 * duration)) / 60` in that order of operations
  for the three clock readings. A positive integer duration is required,
  otherwise the tick uses 8 seconds. At a full-second dispatch, AP updates
  first. With a nonempty season list and zero tick remainder, the ordinal is
  `i / (60 * duration)`, the index is ordinal modulo season count, and the
  year is one plus the floored quotient. The first summer begins at second 8.
  The season recipe sees the new season before Food resolves on that second.
- Mulberry32 adds `0x6d2b79f5` in uint32 and performs its mix in uint32 before
  dividing by 2^32. Initialize cursors from the low word of the floored input,
  or that word XORed with the stream-specific salt. Preserve every draw and the
  site, cohort, Practice, candidate and offer enumeration order. Probability
  batches still count the same word comparisons and consume the same draws.
- Primordial multiplication and split powers use the existing fdlibm path.
  Apply each multiplication in browser order and cap before five-decimal
  rounding. The accumulated Chaos balance can exceed one billion.
- Keep the adapter JSON-only and drop v52. Mid-second restore derives the next
  boundary from `simStepIndex`. Runtime display and platform layers consume
  the same read interfaces. Test stages, step, replay, New Game, both compilers,
  the serial timegraph oracle and the connected smoke.

### Captures and verification

The active v53 schema uses a `uint32` scalar in the generated browser mirror
and native stepping state. The v52 JSON schema remains an inventory referenced
by earlier WORKPLAN items. The active codec rejects v52 and out-of-range seeds.
Captured GameConfig now compiles the optional offer flag. The built-in offer
table retains the browser's inherent eligible IDs while the run's flag supplies
opt-ins. Both shop and Life Map output filtering use the captured recipes.

All 54 browser traces were captured in two batches. Then Charge and territory
were recaptured at their v53 dispatch seconds. The staged exhibits preserve
same-root Charge and incoming garrison checks at the season seam. A prepared
32-person migration covers partial and total arrival loss, capped legacy
mitigation and expiry after commitment, since the ordinary v53 replay at
that anchor has no large arrival. The late allocation test starts from the
same hash-checked second 3,200 and raises the expansion threshold only for
the allocation measurement, to keep all 1,920 advances after the 512-second
warmup. Native timegraph terminal assertions were re-pinned by the browser
replay runner to Monster Overrun at second 5,700 and territorial loss at 7,368.

From the repository root, with the tool junction in place:

```powershell
node native/schema/codegen.mjs
node native/schema/runtime-codegen.mjs
node native/src/sim/content/generate.mjs
node native/reference/export-vassal-tables.mjs
node native/reference/generate.mjs --write
node native/src/tests/vectors/generate-core-vectors.mjs
node native/reference/trace.mjs seed-1 seed-2026-late
$ids = Get-ChildItem native/reference/scenarios/*.json | ForEach-Object BaseName | Where-Object { $_ -notin 'seed-1','seed-2026-late' }
node native/reference/trace.mjs @ids
node native/reference/trace.mjs seed-42-charge seed-1-territory
node native/reference/stage-probe.mjs
& artifacts/n03h/refresh-fixtures.ps1
node native/reference/stage-probe.mjs --all
node native/reference/export-topology.mjs --check
node native/reference/export-new-game.mjs --windows
. native/tools/env.ps1
$d = 'artifacts/n03h'
foreach ($preset in 'optimized','optimized-clang') {
    Push-Location native
    cmake --preset $preset
    cmake --build --preset $preset
    ctest --preset $preset --output-on-failure
    Pop-Location
    $exe = "native/build/$preset/src/sim/waffle_parity.exe"
    node native/reference/step-windows.mjs $exe
    & "$d/stage-pairs.ps1" $preset
    node native/reference/replay-windows.mjs $exe
    node native/reference/new-game-windows.mjs $exe
    foreach ($shape in 'opening','late') {
        & $exe timegraph --from "$d/$shape-longevity.json" --seconds 32000 --repeats 1 --samples 0 --expect "$d/$shape-serial.tsv"
    }
    & "native/build/$preset/waffle_native_game.exe" --smoke --seed 42
}
```

`refresh-fixtures.ps1` copies the files named by `git ls-files
native/reference/fixtures` from their corresponding trace, window or stage
directory under `artifacts/native-reference`. The recorded journals and
rejection inputs remain byte-identical. The state JSON, hash rows and replay
checkpoints come directly from the browser. The native digest fixtures were
written by `waffle_parity run --from native/reference/fixtures/seed-1/state-0.json
--seconds 256|2048 --hashes <output.tsv>`, then checked in both presets.
The 256-second vector also matched all 257 browser checkpoints in three
replay modes. The 2,049 digest rows match between compilers and the first
1,601 browser checkpoints match in three replay modes. Topology checked
byte-identical across all five fixture seeds.

For the longevity inputs, `node artifacts/n03h/prepare-longevity.mjs` takes
the seed-1 opening and seed-2026 second-3,200 anchors and sets
`phaseDurationSec=64` and `monsterExpansionThreshold=1000000000`. For each
shape the optimized MSVC serial oracle was captured with
`waffle_parity run --from <shape>-longevity.json --seconds 32000 --hashes
<shape>-long-states.tsv --timegraph-hashes <shape>-serial.tsv`.
Both presets matched 32,001 summaries and 501 anchors on each shape.

Each preset passed 45/45 CTests, 30 unmasked step windows with 153 comparisons,
all 823 pairs across 18 stages, 242 checkpoints from 33 replay journals in
three replay modes, 55 rejections, 5 exact New Game starts and 92 comparisons
in 10 native-start windows. The seed-42 connected smoke completed five actions
and exercised scrubbing and live return in each preset. Eleven additional
browser stage pairs matched on each compiler for saturated and split-power
Primordial, and Chronicle's zero-Stock Research, Paper cost and loss cap.
`npm run verify` passed.

### Pipeline timing

The pass-three runner measured optimized MSVC on the i9-10900K, logical CPU
15, with execution-speed throttling disabled. `python artifacts/n03h/time.py`
ran five alternating before/after pairs per window. Each invocation of
`waffle_parity step --time --report` checked the matching browser window
with zero masks, then timed 256 resets, making 9,984 opening advances or
2,816 late advances. Pipeline medians use the unobserved pass.

| Window | v52 µs/sim-s | v53 µs/sim-s | Change |
| --- | ---: | ---: | ---: |
| Seed 1 opening, seconds 1–39 | 15.762 | 15.724 | −0.24% |
| Seed 2026 late anchor, seconds 3,201–3,211 | 20.707 | 18.072 | −12.73% |

The separate observed pass put clock cost at 0.131 → 0.096 µs/sim-s
opening and 0.151 → 0.106 late. Late seasonal work fell from 1.580
to 0.380 because the corrected calendar had already dispatched Spring
at the anchor and only Summer was inside this window. Food fell from
4.564 to 3.561. Late Death, phase drain, Migration Practices and Faith
rose by 0.340, 0.520, 0.118 and 0.019 µs/sim-s respectively. The two
browser baselines generate different late populations and event queues,
so those deltas measure the behavior change and its resulting workload
together. They do not isolate the cost of individual rule operations.
Raw observations and medians are in `artifacts/n03h/`.

No new browser defects were reproduced. The existing restored-ruin
Housing issue is outside this baseline. No intentional divergence was
introduced or proposed. The implementation is ready for supervisor review.

## N03i - PR #108 catch-up

Branch `t3/native-catch-up-108` starts at `f781c456` and merges browser
`9123ed72` (v1.1.79). GameState v53, GameConfig v31 and runner saves v33
remain the same. The browser fix is confined to the Moon report and its
writers. Neither runtime changes the RNG, clock or gameplay layer boundaries.

Campaign inserts the empty report row after marking the ruin detailed and
before transferring control. The native report keeps an ordered range of
entries keyed by region ID. It appends a missing row using the active Moon's
bank and keeps the earlier rows in order. Birth, Food, Housing, Faith,
Migration and Death all use that keyed lookup. The next Birth carries the
previous row forward and builds the new report in detailed-site order.

`action-campaign-nest-mid-moon` reuses the seed-1 nest exhibit and confirms
the Campaign at second 2, after Food. It captures every second through 9,
including Housing at 3 and the rollover at 7. The second-6 journal remains
available as a separate boundary case.

Verification from the repository root, using the shared toolchain junction:

```powershell
git diff --exit-code 9123ed72 -- src/
node --test src/model/tests/detailed-settlements/campaign-ruin.js
node native/reference/trace.mjs
node native/reference/stage-probe.mjs --all
node native/reference/stage-probe.mjs action-campaign-nest-mid-moon 3 7
node artifacts/n03i/capture-missing-row.mjs
node native/reference/export-new-game.mjs --windows
node native/reference/generate.mjs --write
node native/reference/verify.mjs
. native/tools/env.ps1
foreach ($preset in 'optimized','optimized-clang') {
    Push-Location native
    cmake --preset $preset
    cmake --build --preset $preset --parallel 6
    ctest --preset $preset --output-on-failure
    Pop-Location
    $exe = "native/build/$preset/src/sim/waffle_parity.exe"
    node native/reference/step-windows.mjs $exe
    $stages = 'advance_clock','prelude','seasonal_practices','spring_death_baseline',
        'birth','food','after_meals_practices','garrison_upkeep','housing','faith',
        'migration_practices','migration','death','death_practices','control_and_spatial_pressure',
        'phase_events_and_drain','vassal_check','final_flush'
    foreach ($stage in $stages) { node native/reference/stage-pairs.mjs $exe $stage }
    node native/reference/replay-windows.mjs $exe
    node native/reference/new-game-windows.mjs $exe
}
```

`artifacts/n03i/run-parity.ps1` logs these comparisons. It also runs Housing
against a browser capture with the row removed and compares the raw Moon
report key order at seconds 2 and 7.

The browser produced 55 traces and the older opening corpus verifier passed.
Regenerating that corpus advanced its manifest pin only. Its nine state hashes
and all 17 checked-in step, stage and replay fixtures matched the fresh browser
captures. Windows CRLF checkout conversion affects the byte-for-byte
`trace.mjs --check` comparison for the action-boundaries fixture. The Git
blobs match the regenerated captures after normalizing the copied rejection
input's line endings.

MSVC and clang each passed 45 CTests, 30 step windows with 153 unmasked
comparisons, 835 pairs across all 18 stages, and 34 replay journals with 252
checkpoints in three replay modes and 55 rejection checks. Both passed five
exact New Game starts and 92 comparisons across ten New Game windows. Housing
matched with the row deliberately removed. Both executables exported identical
snapshots and running hashes through seconds 2 and 7, and the report keys
matched browser order. The browser Campaign, detailed-settlement and
detailed-replay tests also passed.

`npm run verify` hit the local HTTP deadline in the browser preview fixture.
The standalone `npm run test:build-preview` passed on retry, as did
`npm run test:graphics-options`. `npm test` reached the end of save recovery
before C: filled. After moving generated output to D:, all remaining browser
test groups passed in individual runs. The detailed-settlement and
detailed-replay groups had already passed separately. `npm start` served the
pinned browser source at the checkout's LAN preview. Logs are under
`artifacts/n03i/`.

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

### N04a - Headless forecast core (Windows verified, allocator budget open)

Implementation on `t3/native-timegraph-core` from `e1abfab6`. The
[design note](docs/timegraph-core.md) landed first in `a2968d10`.
`waffle_timegraph` owns one simulation worker, dense typed rows, 64-second
anchors, prioritized asynchronous restore, edit generations and cancellation.
Its read API copies immutable publication data. A retained generation keeps
only the caller's previously revealed prefix. The controller will own reveal,
New Game's wait for the complete opening projection, and live action commits.

**Verification.** Run from the repository root in PowerShell.

```powershell
. native/tools/env.ps1
Push-Location native
foreach ($preset in 'optimized','optimized-clang') {
    cmake --preset $preset
    cmake --build --preset $preset --parallel 6
    ctest --preset $preset --output-on-failure
}
Pop-Location
node native/reference/trace.mjs
foreach ($preset in 'optimized','optimized-clang') {
    $exe = "native/build/$preset/src/sim/waffle_parity.exe"
    node native/reference/step-windows.mjs $exe
    node native/reference/replay-windows.mjs $exe
}
```

Both presets passed **42/42 CTests**, including all 38 existing tests and the
zero steady-state sim allocation gate. Step verification passed 30 windows
and 153 comparisons with zero masks. Replay matched 58 browser checkpoints
in three modes across 7 journals and 18 action kinds. The new tests check
summary and anchor hashes against single-threaded `waffle_parity run`,
random restores during active forecasts, an already-applied action boundary,
independent copies, stale cancellation, retained coverage, storage pressure,
and both Monster Overrun and territorial loss terminals. Both Windows workers
also matched 32,001 summary hashes and 501 anchors against the MSVC serial
seed-1 longevity run. The separate seed-42 Shops journal matched 193 rows
and four anchors on both builds. Logs and streams are in `artifacts/n04a/`.

To reproduce the long hash check, derive `artifacts/n04a/seed-1-longevity.json`
from the seed-1 input below using the two N03g setting changes. Run
`waffle_parity run` with that file on MSVC, then verify the stream on both
presets.

```powershell
$inputState = 'artifacts/n04a/seed-1-longevity.json'
$oracle = 'artifacts/n04a/long-hash.tsv'
$msvc = 'native/build/optimized/src/sim/waffle_parity.exe'
& $msvc run --from $inputState --seconds 32000 --hashes artifacts/n04a/long-hash-states.tsv --timegraph-hashes $oracle
foreach ($preset in 'optimized','optimized-clang') {
    $exe = "native/build/$preset/src/sim/waffle_parity.exe"
    & $exe timegraph --from $inputState --seconds 32000 --repeats 1 --samples 0 --expect $oracle
}
```

**Desktop bench.** Windows x64 on i9-10900K. Each CLI invocation warms up for
512 advances, then runs three repeated forecasts and three separate loaded
restore passes. Throughput includes worker submission, summaries, anchors
and final publication. It excludes fixture parsing and digest validation.
Restores measure request-to-independent-state latency for up to 256 random
published targets per pass, sampled as coverage advances. The table uses
median wall time and median of the per-pass percentiles. Ordinary runs both
stop at Monster Overrun. The N03g longevity variants use `phaseDurationSec=64`
and `monsterExpansionThreshold=1000000000` to suppress expansion.

| Fixture | Preset | Seconds | Wall ms | Sim-s/s | µs/row | Restore p50 / p95 / p99 ms | Charged / process private MiB |
| --- | --- | --- | ---: | ---: | ---: | --- | --- |
| Seed 1 ordinary | MSVC | 0–4,890 | 118.962 | 41,106 | 24.32 | 0.665 / 1.284 / 1.392 | 51.89 / 97.56 |
| Seed 2026 late ordinary | MSVC | 3,200–5,676 | 71.313 | 34,720 | 28.79 | 0.721 / 1.338 / 1.448 | 39.34 / 62.88 |
| Seed 1 longevity | MSVC | 0–32,000 | 294.635 | 108,609 | 9.21 | 0.232 / 0.333 / 0.384 | 164.42 / 231.87 |
| Seed 2026 late longevity | MSVC | 3,200–35,200 | 304.175 | 105,202 | 9.51 | 0.253 / 0.350 / 0.401 | 179.45 / 252.10 |
| Seed 1 ordinary | Clang | 0–4,890 | 94.900 | 51,528 | 19.40 | 0.543 / 1.067 / 1.231 | 51.89 / 96.94 |
| Seed 2026 late ordinary | Clang | 3,200–5,676 | 57.480 | 43,076 | 23.21 | 0.628 / 1.114 / 1.206 | 39.34 / 63.29 |
| Seed 1 longevity | Clang | 0–32,000 | 225.573 | 141,861 | 7.05 | 0.197 / 0.268 / 0.308 | 164.42 / 232.23 |
| Seed 2026 late longevity | Clang | 3,200–35,200 | 235.768 | 135,727 | 7.37 | 0.217 / 0.302 / 0.347 | 179.45 / 252.01 |

These desktop medians meet the about 31 µs/published-second goal. A pass
overlapping other native builds was substantially slower, with approximately
94% total CPU load. **Pixel 6 is unmeasured.** Its restore targets under
forecast load are p95 ≤4 ms and p99 ≤8 ms. Desktop headless timings leave
input-to-visible latency for the connected slice to measure.

```powershell
$opening = 'native/reference/fixtures/seed-1/state-0.json'
$late = 'artifacts/native-reference/traces/seed-2026-late/state-3200.json'
foreach ($preset in 'optimized','optimized-clang') {
    $exe = "native/build/$preset/src/sim/waffle_parity.exe"
    & $exe timegraph --from $opening --seconds 32000 --repeats 3 --samples 256 --report "artifacts/n04a/seed-1-$preset.json"
    & $exe timegraph --from $late --seconds 32000 --repeats 3 --samples 256 --report "artifacts/n04a/seed-2026-late-$preset.json"
    & $exe timegraph --from $opening --seconds 32000 --repeats 3 --samples 256 --longevity --report "artifacts/n04a/seed-1-long-$preset.json"
    & $exe timegraph --from $late --seconds 32000 --repeats 3 --samples 256 --longevity --report "artifacts/n04a/seed-2026-late-long-$preset.json"
}
```

**Allocation and remaining budget work.** The 20-region row is 2,728 B.
Each full longevity run uses 83.28 MiB of summary pages and 501 anchors,
which charge 57.14 MiB on seed 1 and 72.17 MiB on seed 2026 late. Ordinary
row writes allocate nothing. A new page and a value anchor allocate every
64 seconds. Their storage is required to retain the row series and bound
scrub to 63 replay steps. A restore allocates its result channel and an
independent mutable state. The sim pipeline allocation gate is unchanged.

The ledger stops at 256 MiB across both generations and budgets 24 MiB for
working state, immutable content and shared simulation allocations. In a
two-generation seed-1 longevity probe, the prior generation kept all
32,001 rows, the successor stopped at second 20,863, and the store charged
255.94 MiB. Windows private process memory reached 382 MiB in that probe
(`artifacts/n04a/two-generations.log`). The cap is verified for accounted
forecast storage. Shared history/slab capacity and process allocator
overhead are outside exact accounting. The two-generation probe exceeded
256 MiB in private process memory. Expose retained arena byte counts and attribute them across
generations before relying on the budget for a device. Check uninterrupted
editing with repeated retention and restore on a physical Pixel 6.

**Cross-runtime handoff.** The native worker uses the browser's dense summary,
terminal boundary, previous reveal and isolated restore contracts. Four
representative snapshot rows matched the browser selectors directly
(`artifacts/n04a/browser-summary.mjs`).
The packed anchors and memory findings are specific to the native runtime.
Leave browser stride and reveal tuning to its measured workloads.
`npm run check:docs` passed. The supplemental browser `npm run verify`
passed docs and architecture, then stopped at source reachability because
this worktree lacks the `esbuild` dependency.

### N04b - Forecast memory accounting and Android benchmark harness

Windows verified on `optimized` and `optimized-clang`. Android arm64
build verified. Device execution is unrun.

The forecast ledger now charges an arena once across the current and
retained generations. Arena counters include live blocks, recycled blocks,
untouched slab capacity, slab headers and direct upstream allocations.
Anchors charge the runtime tables and history cursors they own. Shared
history pages are charged through the arenas. The worker and one restore
reserve runtime-table high-water capacity measured at submission and
anchor capture. The worker reserve includes its summary row. Journal
accounting includes the journal and generation bookkeeping.

Publication checks the remaining budget before each speculative step and
before publishing its row. A slab reservation that does not fit ends the
forecast at the last complete second. The previously revealed prefix,
dense rows, 64-second stride and stale-result rejection are preserved.
Restores can grow the arena to complete an independent scrub state. The
ledger continues to charge those slabs and reuse their recycled blocks.

**Memory breakdown.** Windows x64, i9-10900K, fresh process per fixture.
Sample private bytes after fixture admission and again at each completed
forecast boundary. The pressure probe retains all 32,001 rows of the
first seed-1 longevity generation before submitting its successor.
Measurements are MiB except the journal column. Arena live and recycled
bytes are subsets of arena retained. The residual estimates allocator
overhead and unmetered work by subtracting summary, anchor, incremental
arena and journal bytes from private growth. It also includes changes in
heap slack after parsing the input state. The restored state's owned
buffers were measured separately after the forecast snapshots.

| MSVC sample | End sec | Summary | Anchor tables | Arena live | Recycled | Arena retained | Journal KiB | Worker / restore reserve | Measured restore | Heap and scratch residual |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | ---: | ---: |
| N04a ledger, seed-1 longevity | 32,000 | 83.28 | 57.14 | 80.71 | 0.06 | 81.24 | 0.18 | 24.00 combined | 0.37 | 3.61 |
| N04a ledger, both generations | 20,863 | 137.58 | 94.36 | 133.32 | 0.06 | 137.90 | 0.36 | 24.00 combined | 0.41 | 5.88 |
| Seed 1 ordinary | 4,890 | 12.83 | 15.07 | 57.75 | 0.06 | 62.23 | 0.23 | 0.59 / 0.59 | 0.45 | 2.11 |
| Seed 2026 late ordinary | 5,676 | 6.50 | 8.84 | 38.02 | 0.11 | 40.10 | 0.23 | 0.67 / 0.66 | 0.53 | 0.77 |
| Seed 1 longevity | 32,000 | 83.28 | 57.14 | 80.72 | 0.06 | 81.24 | 0.23 | 0.52 / 0.51 | 0.41 | 3.46 |
| Seed 2026 late longevity | 35,200 | 83.28 | 72.17 | 81.21 | 0.07 | 84.68 | 0.23 | 0.64 / 0.64 | 0.49 | 3.89 |
| Pressure, both generations | 4,415 | 94.77 | 65.08 | 91.94 | 0.06 | 95.01 | 0.47 | 0.52 / 0.51 | 0.40 | 4.89 |

The instrumented N04a baseline charged 164.42 MiB against 224.75 MiB of
private growth for one longevity generation. The successor pushed that
to 255.94 MiB charged against 375.20 MiB of private growth, or 380.70 MiB
of total process private memory. The new ledger's signed error is
`100 * (charged / (private after - private before) - 1)`. All five
samples on each compiler are within ±10%. Charged and private growth
figures below are MiB.

| Fixture | MSVC charged / growth | Error | Clang charged / growth | Error |
| --- | ---: | ---: | ---: | ---: |
| Seed 1 ordinary | 91.30 / 91.71 | −0.45% | 91.36 / 90.67 | +0.76% |
| Seed 2026 late ordinary | 56.77 / 53.21 | +6.69% | 57.04 / 53.41 | +6.80% |
| Seed 1 longevity | 222.69 / 224.60 | −0.85% | 222.88 / 224.42 | −0.69% |
| Seed 2026 late longevity | 241.41 / 241.01 | +0.17% | 241.72 / 239.86 | +0.78% |
| Pressure, both generations | 255.89 / 259.24 | −1.29% | 255.81 / 257.89 | −0.81% |

The Clang successor stopped at second 4,351. Different reserved capacities
can change the final admitted boundary. Both compilers restored the same
canonical states for the shared coverage. The standalone seed-1 longevity
scrub to second 31,999 opened 4.50 MiB of additional arena capacity on
both builds. The measured pressure-tail scrubs reused existing capacity.
The 256 MiB cap governs forecast admission. Process heap overhead and
later scrub allocation can take committed memory above the admission cap.

**Verification and reproduction.** From the repository root in PowerShell.
Logs and raw reports are in `artifacts/n04b/`.

```powershell
New-Item -ItemType Directory -Force artifacts/n04b | Out-Null
. native/tools/env.ps1
Push-Location native
foreach ($preset in 'optimized','optimized-clang') {
    cmake --preset $preset
    cmake --build --preset $preset --parallel 5
    ctest --preset $preset --output-on-failure
}
Pop-Location
node native/reference/trace.mjs
$opening = 'native/reference/fixtures/seed-1/state-0.json'
$late = 'artifacts/native-reference/traces/seed-2026-late/state-3200.json'
foreach ($preset in 'optimized','optimized-clang') {
    $exe = "native/build/$preset/src/sim/waffle_parity.exe"
    node native/reference/step-windows.mjs $exe
    node native/reference/replay-windows.mjs $exe
    & $exe timegraph --from $opening --memory-profile --report "artifacts/n04b/memory-$preset-seed-1.json"
    & $exe timegraph --from $late --memory-profile --report "artifacts/n04b/memory-$preset-seed-2026-late.json"
    & $exe timegraph --from $opening --longevity --memory-profile --report "artifacts/n04b/memory-$preset-seed-1-long.json"
    & $exe timegraph --from $late --longevity --memory-profile --report "artifacts/n04b/memory-$preset-seed-2026-late-long.json"
    & $exe timegraph --from $opening --longevity --retain-previous --report "artifacts/n04b/memory-$preset-pressure.json"
}
```

Both presets passed 42/42 CTests, including the allocation gate, small and
256 MiB pressure cases, cancellation, anchor digest comparison and
independent restores. Both passed 30 step windows and 153 comparisons with
zero masks. Both replay checks matched 58 browser checkpoints in three
modes across seven journals and 18 action kinds. Both workers also matched
32,001 summary hashes and 501 anchor hashes from the MSVC serial longevity
run using the N04a long-hash command with output under `artifacts/n04b/`.
The supplemental browser `npm run verify` passed documentation and
architecture checks, then stopped at source reachability because this
worktree lacks `esbuild`.

**Throughput.** The matched Windows comparison used the N04a benchmark
arguments above and five alternating baseline/candidate pairs per fixture
on logical CPU 15. Each invocation ran three timed forecasts and separate
loaded restore passes. MSVC used the unmodified `4ff792a0` executable.
Clang used the N04a `6cd2f9d6` executable, which has the same native source.
Median rates below are sim-seconds per wall second, with 15 forecasts per
cell. The largest median decrease was 0.96%. Per-run reports are under
`artifacts/n04b/timing-final-*.json`. The captured comparison script runs
from the repository root using
`& artifacts/n04b/run-desktop.ps1 -Stem '-final'`.

| Fixture | MSVC baseline → new | Change | Clang baseline → new | Change |
| --- | ---: | ---: | ---: | ---: |
| Seed 1 ordinary | 40,013 → 39,806 | −0.52% | 50,597 → 50,440 | −0.31% |
| Seed 2026 late ordinary | 33,990 → 34,289 | +0.88% | 42,371 → 42,287 | −0.20% |
| Seed 1 longevity | 102,993 → 104,454 | +1.42% | 137,998 → 136,667 | −0.96% |
| Seed 2026 late longevity | 101,434 → 100,765 | −0.66% | 131,543 → 130,401 | −0.87% |

Loaded restore p95 medians were 0.255–1.305 ms across the candidate
fixtures. MSVC late longevity p99 moved from 0.381 to 0.436 ms. Both
pressure tests preserved the 63-step restore bound.

**Android arm64.** The NDK r30 API 31 build includes `waffle_parity
timegraph`. The harness pushes the two input states and topology, runs
the 2,048-second checked-in cross-compiler hash oracle, then benchmarks
the four N04a variants with 3 repeats and 256 restore samples. It selects
the highest-capacity allowed CPU using `taskset`, falls back to maximum
frequency when capacity is unavailable, and records the actual choice.
The output folder includes the pulled hash stream, cross-compiler JSON,
four benchmark JSON reports and `device.json`. An empty adb device list
leaves the session unrun.

```powershell
. native/tools/env.ps1
Push-Location native
cmake --preset android
cmake --build --preset android --target waffle_parity --parallel 5
Pop-Location
$ndkBin = 'native/.tools/android-sdk/ndk/30.0.16248370/toolchains/llvm/prebuilt/windows-x86_64/bin'
& "$ndkBin/llvm-readelf.exe" -h -l -d native/build/android/src/sim/waffle_parity
powershell -NoProfile -ExecutionPolicy Bypass -File native/tools/benchmark-android-timegraph.ps1
```

The executable is an AArch64 ELF64 PIE with `/system/bin/linker64`,
dynamically linked to `libm.so`, `libdl.so` and `libc.so`. The script
accepts `-Adb <path-to-adb.exe>` and `-Serial <online-device-id>`. It
generates the late fixture if needed. With the downloaded platform-tools,
the extra check was
`& native/tools/benchmark-android-timegraph.ps1 -Adb artifacts/n04b/platform-tools/adb.exe`.
`adb devices -l` showed no devices. L4 agreement on Android, phone timings
and input-to-visible scrub latency remain unmeasured.

**Cross-runtime handoff.** Native retained-byte accounting treats storage
shared between a forecast, its anchors and a prior generation as one
allocation. The browser's independent restore and dense-row behavior
remain the shared contract. Browser heap accounting needs its own
generation-retention measurement because the slab ownership and Windows
private-byte results are native-specific.

### N04c - Forecast memory reduction (complete, Windows x64)

Two full 32,000-second generations fit under 256 MiB on both fixtures and compilers. The largest single generation charged 117.50 MiB. The largest retained pair charged 228.42 MiB, including the shared arena and the worker and restore reserves. The pressure harness retains every earlier row and anchor and submits a successor from the same fixture. Seed 1 advances from 0 to 32,000 twice. The late seed advances from 3,200 to 35,200 twice. The small-cap test still forces a partial generation and checks scrubbing of both prefixes.

**Measured levers.** Branch `t3/native-timegraph-compact`, baseline `99934fca`.

| MSVC longevity | Seed 1 saved | Seed 2026 late saved | Change |
| --- | ---: | ---: | --- |
| Summary pages, `e6cd584e` | 72.03 MiB | 72.20 MiB | Within a page, each region reuses its preceding record if all 128 bytes match. Every second still has its own header and direct per-region indices. |
| Retained history, `63ae1901` | 48.02 MiB | 51.90 MiB | Each immutable Practice trace record stores its present fields and retains a payload object only when it has variable data. |
| Anchor tables | 0.00 MiB | 0.00 MiB | Existing column sharing and restore code suffice at the original 64-second stride. |
| **Total charged reduction** | **120.05 MiB** | **124.10 MiB** | Differences use unrounded bytes. |

The per-region values occupied 2,560 of the 2,728 bytes in each typed row. A diagnostic comparison with the preceding second within each page found 11,167 changed region records on seed 1 and 9,387 on the late seed in 630,000 comparisons each. Exact bit comparisons distinguish signed zero. Page growth is admitted and charged before publication. `readSummaries` copies independent dense rows, including across page boundaries.

At 501 anchors the baseline arena held 17,602 and 17,911 live 4 KiB Practice trace chunks (68.76 and 69.96 MiB). Trace cursor pages occupied about 9.34 and 9.39 MiB. The 112-byte directory allocation class occupied another 1.22 MiB on each. The remaining live allocation classes totalled about 1.40 and 0.63 MiB. The retained-minus-live difference was 0.52 and 3.47 MiB. Most of the cost was live records pinned by snapshots. Three frequently emitted receipt shapes each occurred at least 28,000 times on seed 1, with only 5–9 optional keys present. The new schema-generated field walk preserves absent, null, false and present values, exact floating-point representations and payload ranges. Packed records grow from the front of a chunk and payload allocations grow from the back. The worker retains exclusive write access to unused space. Snapshot handles keep the existing atomic reference counts and arena mutex.

A separate diagnostic compared 128-byte pieces of equal-length private columns at consecutive anchors. On seed 1, 34.89 of 37.57 MiB matched byte-for-byte (92.9%). On seed 2026 late, 47.22 of 49.86 MiB matched (94.7%). Site and meal rows were the largest contributors. These comparisons include padding, so they are a diagnostic lower bound on unchanged data in the compared columns. They do not participate in admission. A new anchor codec would add work on the scrub path after both memory targets have already been met.

**N04b memory breakdown.** Fresh process per case on the Windows x64 i9-10900K. Before and after use the same five workloads. MiB except the journal column (KiB). Arena live and recycled are subsets of retained. Residual is private growth minus summary, anchors, journal and incremental arena retention. The pressure rows end at different seconds because the new successor completes.

| MSVC workload | End sec | Summary | Anchor tables | Arena live | Recycled | Retained | Journal KiB | Worker / restore reserve | Measured restore | Heap and scratch residual |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Seed 1 ordinary before | 4,890 | 12.83 | 15.07 | 57.75 | 0.06 | 62.23 | 0.23 | 0.59 / 0.59 | 0.45 | 2.00 |
| Seed 1 ordinary after | 4,890 | 3.89 | 15.07 | 21.58 | 0.06 | 22.27 | 0.23 | 0.59 / 0.59 | 0.45 | 1.39 |
| Late ordinary before | 5,676 | 6.50 | 8.84 | 38.02 | 0.11 | 40.10 | 0.23 | 0.67 / 0.66 | 0.53 | 1.66 |
| Late ordinary after | 5,676 | 2.06 | 8.84 | 12.88 | 0.10 | 16.10 | 0.23 | 0.67 / 0.66 | 0.53 | 0.75 |
| Seed 1 longevity before | 32,000 | 83.28 | 57.14 | 80.72 | 0.06 | 81.24 | 0.23 | 0.52 / 0.51 | 0.41 | 3.62 |
| Seed 1 longevity after | 32,000 | 11.25 | 57.14 | 29.16 | 0.07 | 33.23 | 0.23 | 0.52 / 0.51 | 0.41 | 4.49 |
| Late longevity before | 35,200 | 83.28 | 72.17 | 81.21 | 0.07 | 84.68 | 0.23 | 0.64 / 0.64 | 0.49 | 3.85 |
| Late longevity after | 35,200 | 11.08 | 72.17 | 29.11 | 0.06 | 32.78 | 0.23 | 0.64 / 0.64 | 0.49 | 4.35 |
| Seed 1 retained pair before | 4,415 | 94.77 | 65.08 | 91.94 | 0.06 | 95.01 | 0.47 | 0.52 / 0.51 | 0.40 | 4.80 |
| Seed 1 retained pair after | 32,000 | 22.50 | 114.27 | 58.32 | 0.07 | 61.93 | 0.47 | 0.52 / 0.51 | 0.41 | 7.90 |

The ledger error is `100 × (charged / private growth − 1)`. Each cell gives charged MiB / process private growth MiB (signed error). Private growth is sampled after admission and before the profiling scrub.

| Workload | MSVC before | MSVC after | Clang before | Clang after |
| --- | ---: | ---: | ---: | ---: |
| Seed 1 ordinary | 91.30 / 91.60 (-0.32%) | 42.41 / 42.09 (+0.74%) | 91.36 / 90.49 (+0.96%) | 42.47 / 41.62 (+2.02%) |
| Late ordinary | 56.77 / 54.09 (+4.95%) | 28.33 / 26.00 (+8.98%) | 57.04 / 53.10 (+7.42%) | 28.60 / 26.39 (+8.36%) |
| Seed 1 longevity | 222.69 / 224.77 (-0.92%) | 102.64 / 105.59 (-2.79%) | 222.88 / 224.70 (-0.81%) | 102.83 / 105.00 (-2.06%) |
| Late longevity | 241.41 / 240.97 (+0.18%) | 117.32 / 118.62 (-1.10%) | 241.72 / 239.83 (+0.79%) | 117.50 / 116.27 (+1.05%) |
| Seed 1 retained pair | 255.89 / 259.15 (-1.26%) | 199.74 / 206.09 (-3.08%) | 255.81 / 257.61 (-0.70%) | 199.93 / 205.13 (-2.54%) |

The separate late retained-pair probe charged 228.11 MiB on MSVC and 228.42 MiB on Clang. For seed 1 the full pair charged 199.74 and 199.93 MiB respectively. Both standalone seed-1 tail scrubs grew the arena by a further 0.50 MiB. The tail scrubs of the retained seed-1 pair reused existing capacity.

**Throughput and loaded restore.** Baseline and candidate ran in alternating order on logical CPU 15. Each fixture/compiler cell contains five matched pairs of processes, three timed forecasts and up to 256 individual restores per loaded pass. The table uses median throughput and median of the 15 per-pass tails. Signed changes use unrounded observations. The quiet confirmation followed completion of build and parity work. Raw reports from both series are in `artifacts/n04c/timing-{final,quiet}-*.json`.

| Workload | Preset | Sim-s/s before / after (change) | Restore p95 ms before / after (change) | Restore p99 ms before / after (change) |
| --- | --- | ---: | ---: | ---: |
| Seed 1 ordinary | MSVC | 42,045 / 43,888 (+4.38%) | 1.240 / 1.213 (-2.21%) | 1.359 / 1.344 (-1.15%) |
| Seed 1 ordinary | Clang | 51,867 / 54,694 (+5.45%) | 1.013 / 0.995 (-1.80%) | 1.115 / 1.117 (+0.12%) |
| Late ordinary | MSVC | 35,767 / 37,388 (+4.53%) | 1.274 / 1.250 (-1.87%) | 1.394 / 1.360 (-2.45%) |
| Late ordinary | Clang | 44,054 / 46,414 (+5.36%) | 1.034 / 1.047 (+1.33%) | 1.153 / 1.151 (-0.14%) |
| Seed 1 longevity | MSVC | 109,605 / 119,954 (+9.44%) | 0.284 / 0.276 (-2.92%) | 0.337 / 0.323 (-4.10%) |
| Seed 1 longevity | Clang | 139,797 / 158,486 (+13.37%) | 0.247 / 0.242 (-2.26%) | 0.303 / 0.282 (-7.05%) |
| Late longevity | MSVC | 105,420 / 115,251 (+9.33%) | 0.305 / 0.300 (-1.87%) | 0.359 / 0.365 (+1.61%) |
| Late longevity | Clang | 134,400 / 152,034 (+13.12%) | 0.269 / 0.260 (-3.49%) | 0.318 / 0.319 (+0.41%) |

**Verification and reproduction.** Both presets passed 42/42 CTests. The warmed pipeline recorded zero allocations across 3,200 opening and 1,920 late seconds on each compiler. Browser step parity passed 30 windows with 153 comparisons and zero masks. All 33 journals matched 242 browser checkpoints in three replay modes and 55 rejected actions. On each compiler, each longevity fixture matched all 32,001 published summary hashes and all 501 restored anchor hashes from the pre-change MSVC serial oracle. All ten N04b ledger comparisons were within ±10%. No gameplay, RNG, serialized schema or action ordering changed.

From the repo root in PowerShell, with both optimized baseline executables from `99934fca` saved under `artifacts/n04c/base-<preset>.exe`:

```powershell
$d = 'artifacts/n04c'
New-Item -ItemType Directory -Force $d | Out-Null
. native/tools/env.ps1
Push-Location native
foreach ($preset in 'optimized','optimized-clang') {
    cmake --preset $preset
    cmake --build --preset $preset --parallel 5
    ctest --preset $preset --output-on-failure
    ctest --preset $preset -V -R pipeline_steady_state_allocations
}
Pop-Location
node native/reference/trace.mjs
$opening = 'native/reference/fixtures/seed-1/state-0.json'
Copy-Item artifacts/native-reference/traces/seed-2026-late/state-3200.json "$d/late.json" -Force
foreach ($id in 'seed-1','late') {
    $inputState = if ($id -eq 'seed-1') { $opening } else { "$d/late.json" }
    node -e "const fs=require('fs'),s=JSON.parse(fs.readFileSync(process.argv[1])); Object.assign(s.gameConfig.settings.values,{phaseDurationSec:64,monsterExpansionThreshold:1000000000}); fs.writeFileSync(process.argv[2],JSON.stringify(s))" $inputState "$d/$id-longevity.json"
    $stem = if ($id -eq 'seed-1') { 'long' } else { 'late' }
    & "$d/base-optimized.exe" run --from "$d/$id-longevity.json" --seconds 32000 --hashes "$d/$stem-states.tsv" --timegraph-hashes "$d/$stem-hash.tsv"
}
foreach ($preset in 'optimized','optimized-clang') {
    $exe = "native/build/$preset/src/sim/waffle_parity.exe"
    node native/reference/step-windows.mjs $exe
    node native/reference/replay-windows.mjs $exe
    foreach ($id in 'seed-1','late') {
        $stem = if ($id -eq 'seed-1') { 'long' } else { 'late' }
        & $exe timegraph --from "$d/$id-longevity.json" --seconds 32000 --repeats 1 --samples 0 --expect "$d/$stem-hash.tsv"
    }
    & $exe timegraph --from "$d/late.json" --longevity --retain-previous --report "$d/late-pressure-$preset.json"
    foreach ($case in 'seed-1','seed-2026-late','seed-1-long','seed-2026-late-long','pressure') {
        $inputState = if ($case -like 'seed-2026*') { "$d/late.json" } else { $opening }
        $flags = @('--memory-profile')
        if ($case -like '*-long' -or $case -eq 'pressure') { $flags += '--longevity' }
        if ($case -eq 'pressure') { $flags += '--retain-previous' }
        & "$d/base-$preset.exe" timegraph --from $inputState @flags --report "$d/before-$preset-$case.json"
        & $exe timegraph --from $inputState @flags --report "$d/memory-$preset-$case.json"
    }
}
# Equivalent to the archived run-desktop.ps1 -Stem '-quiet'. Run after other builds finish.
(Get-Process -Id $PID).ProcessorAffinity = [IntPtr](1 -shl 15)
foreach ($preset in 'optimized','optimized-clang') {
    foreach ($case in 'seed-1','seed-2026-late','seed-1-long','seed-2026-late-long') {
        $inputState = if ($case -like 'seed-2026*') { "$d/late.json" } else { $opening }
        $flags = @()
        if ($case -like '*-long') { $flags += '--longevity' }
        foreach ($round in 1..5) {
            foreach ($label in $(if ($round % 2) { 'base','new' } else { 'new','base' })) {
                $exe = if ($label -eq 'base') { "$d/base-$preset.exe" } else { "native/build/$preset/src/sim/waffle_parity.exe" }
                & $exe timegraph --from $inputState --seconds 32000 @flags --samples 256 --repeats 3 --report "$d/timing-quiet-$preset-$case-$round-$label.json"
            }
        }
    }
}
```

**Cross-runtime handoff.** The browser and native timegraphs share the dense every-second summary and independent restore contracts. The native measurements show how much consecutive per-region series repeat. The browser can measure that repetition on the same fixtures before considering a page encoding. The Windows memory and loaded-worker timings apply to the native desktop runtime. Device and input-to-visible latency remain with the connected slice. No supervisor decision is required for N04c.

### N04d - Windows connected playable slice

Windows implementation complete on `t3/native-connected-slice`. Start with the
[design and launch guide](docs/connected-slice.md). The game builds an ordinary
New Game from a seed or admits a generated regional browser state or runner save.
The regional map, roads, controllers, settlement board and Practice inspector
read the same immutable live or viewed snapshot. In Practice Reform, stage a
reorder, see its time cost and confirm. Ported actions enter the journal and
advance to resolution. A new forecast replaces the old one and publishes the
population strip incrementally. Press or drag to inspect a revealed second and
use Live to return. The opening waits for forecast completion.

#### Performance

Windows 11 x64 build 26200, i9-10900K, RTX 3080, SDL Direct3D 11, 1120×640,
VSync off. Three fresh processes per preset. The 20-region seed-1 workload uses
the N04c longevity settings (`phaseDurationSec=64`,
`monsterExpansionThreshold=1000000000`), leaving the 8-second seasons intact.
An opening forecast and one untimed scrub warm the path before a real Practice
reorder replaces the generation. All six replacements reached second 32,192
from a live frontier of 192, covering 1,000 years beyond live.

Values are medians of the three per-run statistics. Startup measures from app
entry to first SDL present and to the first playable present. Frame samples
include session polling, graph and UI rendering, and present while the forecast
was running. The summary row includes only frames that consumed new rows.
Isolated reconstruction replays the same sampled offsets on packed anchors
built from published states and excludes queueing, layout and render. The
combined row pairs this timing with the actual restore frame's render/present
time. Input-to-present includes scheduling, polling, reconstruction and
rendering from the scripted plot pointer path. Memory is sampled at completion
before the independent reconstruction probe.

| Measurement | `optimized` MSVC | `optimized-clang` |
| --- | ---: | ---: |
| First present / playable, ms | 602 / 729 | 445 / 573 |
| Replacement forecast wall time, ms | 279 | 237 |
| Active forecast frames / loaded scrubs, median count | 261 / 130 | 210 / 104 |
| Frame time p50 / p95 / p99, ms | 1.095 / 1.388 / 1.602 | 1.008 / 2.255 / 2.599 |
| Summary transfer and chart update p95, ms | 0.027 | 0.060 |
| Rendering and present p95, ms | 1.249 | 2.022 |
| Isolated reconstruction p95, ms | 0.180 | 0.158 |
| Reconstruction plus render p95, ms | 1.445 | 2.237 |
| Loaded scrub input-to-present p95, ms / frames | 2.573 / 2 | 4.122 / 2 |
| Working set / private bytes, MiB | 190.6 / 217.3 | 189.0 / 217.2 |
| Forecast ledger / texture estimate, MiB | 104.1 / 13.9 | 104.3 / 13.9 |

Every sampled loaded scrub presented within two harness frames. The worst
elapsed input-to-present across the six runs was 5.385 ms. Raw per-run timings
are in `artifacts/n04d/bench-optimized-*.json` and
`artifacts/n04d/bench-optimized-clang-*.json`.

#### Verification and reproduction

Both presets passed 45/45 CTests, including seeded New Game, browser state
admission and runner-envelope import at a nonzero live frontier. The smoke
asserts the board order, action count, cost spent and generation change. It
submits superseding scrub requests, compares the displayed state's parity digest
with `rebuildStateAtSecond`, rejects an edit while viewing the forecast and
returns to the same live state. Seed 42 captured live at t=148 and preview at
t=227. On each preset, step parity passed 30 windows and 153 comparisons with
zero masks. Replay parity passed 33 journals, 242 browser checkpoints in three
replay modes and 55 rejected actions.

From the worktree root, with the shared toolchain junction already in place:

```powershell
. native/tools/env.ps1
Push-Location native
foreach ($preset in 'optimized','optimized-clang') {
    cmake --preset $preset
    cmake --build --preset $preset
    ctest --preset $preset --output-on-failure
}
Pop-Location
node native/reference/trace.mjs
foreach ($preset in 'optimized','optimized-clang') {
    $parity = "native/build/$preset/src/sim/waffle_parity.exe"
    node native/reference/step-windows.mjs $parity
    node native/reference/replay-windows.mjs $parity
}

New-Item -ItemType Directory -Force artifacts/n04d | Out-Null
node -e "const fs=require('node:fs'),s=JSON.parse(fs.readFileSync('native/reference/fixtures/seed-1/state-0.json')); Object.assign(s.gameConfig.settings.values,{phaseDurationSec:64,monsterExpansionThreshold:1e9}); fs.writeFileSync('artifacts/n04d/seed-1-n04c-long.json',JSON.stringify(s))"
$env:SDL_RENDER_DRIVER = 'direct3d11'
foreach ($preset in 'optimized','optimized-clang') {
    foreach ($sample in 1..3) {
        & "native/build/$preset/waffle_native_game.exe" --bench 2400 "artifacts/n04d/bench-$preset-$sample.json" --load artifacts/n04d/seed-1-n04c-long.json
    }
}
& native/build/optimized/waffle_native_game.exe --seed 42 --capture artifacts/n04d
```

Captures in `artifacts/n04d/`: `01-regional-map.png`,
`02-practice-inspection.png`, `03-forecast-preview.png` and
`04-return-to-live.png`.

**Remaining coverage.** Full Life Map and shop workflows, native saves,
browser persistent-knowledge overlays, illustrated regional terrain, previous
forecast overlays, reveal and time-advance animations, and Pixel validation.
Browser source and existing art are unchanged. The cross-runtime result is
that bounded dense summary reads and direct, generation-checked priority
restores fit the Windows input budget under this forecast workload. Browser
worker transport and physical device timing still need their own measurements.

### N04f - Native interaction and presentation

Windows implementation on `t3/native-interaction`, based on `f781c456`.
The [interaction design](docs/interaction-system.md) was committed first in
`97322d8e`. Shared RCSS provides the control and feedback vocabulary. The
connected view binds the status, clock and progress to the app read model and
keeps both the atlas and population strip in view during decisions. The
settlement board shows the staged order and its time cost next to its cards.
Review opens a separate confirmation. Cancel preserves a staged order, and
Undo returns the board to committed order. Errors report the reason.

The map bakes biome ink and topology into an SDL texture. The live view draws
faction borders, roads, settlement marks and selection over it. The camera
eases to zoom and selection targets and follows direct panning. The strip
shows published coverage, separate Live and Preview playheads and the
population at the restored second. Hover reads the published population band.
Keyboard controls, Escape, touch drag, long-press help and a session Motion
toggle share the desktop and 640×360 landscape presentation paths.

The interaction smokes drive SDL input on both window sizes. They cover
selection, inspection, non-activating touch help, a rejected locked drop,
keyboard staging and undo, touch staging, review and cancel, confirmation,
preview and Live, reduced motion and New Game. Simulation, schemas, RNG,
replay and the timegraph worker are unchanged.

#### 1,000-year forecast

Windows 11 build 26200, i9-10900K, RTX 3080, SDL Direct3D 11, 1120×640, VSync
off. Five interleaved baseline and current runs per preset, alternating their
order. The baseline uses the `f781c456` app and RML with the same unchanged
native libraries as the current build. The workload is the N04d seed-1 long
fixture. All 20 replacement forecasts reached second 32,192 from Live 192.
The table reports medians of per-run percentiles and forecast times.

| Build | Frame p50 / p95 / p99, ms | Loaded scrub p95, ms | Forecast wall time, ms |
| --- | ---: | ---: | ---: |
| MSVC baseline | 1.205 / 1.821 / 2.539 | 3.316 | 275.92 |
| MSVC N04f | 1.036 / 1.706 / 2.201 | 2.372 | 296.83 |
| Clang baseline | 1.036 / 1.904 / 2.313 | 3.203 | 204.87 |
| Clang N04f | 0.810 / 1.845 / 2.279 | 2.531 | 227.44 |

All 2,013 N04f loaded scrubs presented within two harness frames. Maximum
elapsed input-to-present was 3.381 ms. The paired p99 improved by 13% on MSVC
and 1% on Clang. The earlier archived N04d p99 was 1.602 ms on MSVC and
2.599 ms on Clang. Use the paired rows for the same-session comparison.
The current harness exercised roughly twice as many scrubs per forecast as
the baseline. Raw paired rows are in `artifacts/n04f/paired/`. A separate
unpaired run during concurrent compiler activity is retained under
`artifacts/n04f/after/bench-*.json`.

```powershell
node -e "const fs=require('node:fs'),s=JSON.parse(fs.readFileSync('native/reference/fixtures/seed-1/state-0.json')); Object.assign(s.gameConfig.settings.values,{phaseDurationSec:64,monsterExpansionThreshold:1e9}); fs.writeFileSync('artifacts/n04f/seed-1-n04c-long.json',JSON.stringify(s))"
$env:SDL_RENDER_DRIVER = 'direct3d11'
& native/build/optimized/waffle_native_game.exe --bench 2400 artifacts/n04f/sample.json --load artifacts/n04f/seed-1-n04c-long.json
```

Repeat with `optimized-clang` and with the baseline presentation build at
`f781c456`. The local baseline rebuild recipe is in
`artifacts/n04f/build-baseline.py`.

**Cross-runtime handoff.** Caching the procedural terrain kept its detail
away from the scrub render path. The app also collects a restore that becomes
ready during layout, without waiting on the worker. The paired workload
covers the full forecast and authoritative replay checks. A browser
equivalent would need its own message-delivery and input-to-present
measurement before adopting the late handoff.

#### Verification and reproduction

Both optimized presets passed 47/47 CTests, including the original connected
smoke and two new interaction tests. The standalone seed-42 smokes committed
at second 148 and restored second 227. Each compiler passed 30 step windows
and 153 comparisons with zero masks. Replay passed 33 journals, 242 browser
checkpoints in three replay modes and 55 rejected actions.

```powershell
. native/tools/env.ps1
Push-Location native
foreach ($preset in 'optimized','optimized-clang') {
    cmake --preset $preset
    cmake --build --preset $preset
    ctest --preset $preset --output-on-failure
}
Pop-Location
node native/reference/trace.mjs
foreach ($preset in 'optimized','optimized-clang') {
    $parity = "native/build/$preset/src/sim/waffle_parity.exe"
    node native/reference/step-windows.mjs $parity
    node native/reference/replay-windows.mjs $parity
    & "native/build/$preset/waffle_native_game.exe" --smoke --seed 42
}
$env:SDL_RENDER_DRIVER = 'direct3d11'
$game = 'native/build/optimized/waffle_native_game.exe'
& $game --seed 42 --capture artifacts/n04f/after
& $game --seed 42 --size 640 360 --capture artifacts/n04f/compact
```

Captures and raw benchmark rows are under `artifacts/n04f/` (local, not committed).
The `before/` captures use the N04d view with extra capture checkpoints. The
baseline staged screen contains its one-step confirmation. The `after/` and
`compact/` sets each include the atlas, settlement, Practice inspection,
staged move, confirmation, published forecast progress, held scrub and Live.
`interaction.mp4` records the desktop interaction run.

**Integration.** Save slots, title flow, lifecycle, Android packaging and
physical-phone validation are separate work. Packaging the connected
document requires both `interaction.rcss` and `connected-layout.rcss` alongside
`connected.rml`. The Motion setting lasts for the current application run.

### N04e - Native app shell, save slots and Android package

Implemented on `t3/native-app-shell` from `f781c456`. Launch without arguments
to reach the title. Enter a uint32 seed or leave it blank for a random seed.
Continue opens the newest readable slot, and Load displays the autosave and
three manual slots. In a run, Save opens the manual slots and asks for
confirmation before overwriting. Title saves the live run before leaving it.
The load list shows year, live second, region count, UTC wall-clock save time
and save/GameState versions.

The native v1 save records the browser v53 replay base, the action journal and
the live second. Loading replays that boundary and checks its digest before
starting a fresh forecast. Taking a save while scrubbing records the committed
frontier. The app validates the envelope and payload checksum, and replaces
each slot atomically from a temporary file in the same directory. Windows
uses `%APPDATA%\Laughing Waffle\Native Game\saves`. Android uses the app's
internal files directory. Files and clocks stay in `native/src/app`. Simulation rules,
RNG, schema and replay ordering follow the existing native port.

Windows minimize and Android backgrounding cancel the forecast, clear the
preview, release RmlUi textures and autosave the committed run. Returning
rebuilds the forecast from the same live frontier and reloads textures with
SDL's restored renderer. A process restart can recover via Continue.

#### Android run and measurement

The existing SDL3 activity loads the connected game from `libmain.so`. The
debug-signed APK uses optimized arm64 native code and packages the RML,
font, sprite sheets and opening config for offline use. It allows both
landscape orientations, so the cable or cutout can sit on either side. The
layout follows SDL's safe rectangle and Android display scale. Buttons and
the graph scrub area are at least about 48 dp. Tap selects, drag on the plot
scrubs, and one or two fingers pan or pinch the map.

From the worktree root:

```powershell
$tools = (Get-Item native/.tools).Target[0]
powershell -NoProfile -ExecutionPolicy Bypass -File native/tools/bootstrap-android.ps1 -ToolsRoot $tools -OutputDirectory artifacts/n04e/android-build
$adb = 'native/.tools/android-sdk/platform-tools/adb.exe'
$activity = 'org.waffle.nativedemo/.WaffleActivity'
& $adb devices -l
& $adb install -r native/android/app/build/outputs/apk/debug/app-debug.apk
& $adb shell am start -W -n $activity
# Play, save to a slot, press Home, and relaunch the same activity to check resume.
& $adb shell input keyevent KEYCODE_HOME
& $adb shell am start -W -n $activity
cmd /d /c 'native\.tools\android-sdk\platform-tools\adb.exe exec-out screencap -p > artifacts\n04e\pixel-resumed.png'
& $adb shell dumpsys meminfo org.waffle.nativedemo > artifacts/n04e/pixel-meminfo.txt
& $adb shell am force-stop org.waffle.nativedemo
& $adb shell am start -W -n $activity --ei waffle_bench 2400
& $adb logcat -d -s SDL:I > artifacts/n04e/pixel-logcat.txt
& $adb shell am force-stop org.waffle.nativedemo
```

The debug benchmark uses the N04c seed-1 longevity fixture and restarts its
forecast after a real Practice reorder. It logs startup to playable, frame
p50/p95/p99 while forecasting, scrub input to present, reconstruction plus
render, RSS, forecast storage and texture bytes. The ordinary app logs the
pause autosave, released texture bytes and the first playable resume present.

The Windows host built the optimized arm64 package with NDK r30
(`30.0.16248370`) and the project-local debug key. The verified APK is
`artifacts/n04e/android-build/app-debug.apk` (42,199,423 bytes, SHA-256
`c57c4915886362dd5690c434716b671f77ad3b37dac70964292fb1cdce873354`).
APK Signature Scheme v2, the AArch64 `SDL_main` export and the packaged
offline assets passed inspection.
The successful bootstrap used `-ToolsRoot` with the resolved shared toolchain
path. On this host the generated native and Gradle build directories were
junctions to the toolchain drive after the worktree drive ran out of space.

**Pixel 6 Pro (`raven`)** appeared in the initial ADB inventory. Later ADB
queries returned `no devices/emulators found`, consistent with the HiSuite
conflict flagged for this work item. The device list was still empty after
packaging. Physical runtime, touch, save/relaunch, lifecycle timings, benchmarks
and device captures await a working ADB connection. No app was launched on
the phone during this attempt.

#### Verification

```powershell
. native/tools/env.ps1
Push-Location native
foreach ($preset in 'optimized','optimized-clang') {
    cmake --preset $preset
    cmake --build --preset $preset
    ctest --preset $preset --output-on-failure
}
Pop-Location
# Reuse same-baseline captures or generate them with node native/reference/trace.mjs.
foreach ($preset in 'optimized','optimized-clang') {
    $parity = "native/build/$preset/src/sim/waffle_parity.exe"
    node native/reference/step-windows.mjs $parity
    node native/reference/replay-windows.mjs $parity
    & "native/build/$preset/waffle_native_game.exe" --smoke --seed 42
}
& native/build/optimized/waffle_native_game.exe --seed 42 --capture artifacts/n04e/windows-after
npm.cmd run verify
```

Both Windows presets passed 46/46 CTests, including the save/load digest at
second 148 after a five-action journal, saving from a read-only preview,
overwriting a manual slot, Continue, suspend/resume and rejection of corrupt
and incompatible files. On each preset, step parity passed 30 windows and 153
comparisons with zero masks. Replay parity passed 33 journals, 242 browser
checkpoints in three modes and 55 rejections. The browser verification suite
also passed. An actual Windows minimize/restore
round trip wrote the per-user autosave, logged zero RmlUi texture bytes during
pause and presented the same live second with a new forecast generation after
about 10 ms. Evidence is in `artifacts/n04e/windows-lifecycle-stderr.log`.

One optimized Windows Direct3D 11 run of the same harness reached second
32,192, the full 1,000 years from the live frontier at 192. Startup to playable
was 841 ms. The replacement forecast took 313 ms. Across 200 forecast frames,
frame p50/p95/p99 were 1.52/2.17/2.87 ms. Loaded scrub input-to-present p95 was
4.55 ms (99 scrubs), reconstruction plus render p95 was 2.43 ms, and the
working set was 203.7 MiB. This is a desktop sample.

```powershell
& native/build/optimized/waffle_native_game.exe --bench 2400 artifacts/n04e/windows-bench.json --long-benchmark
```

Windows captures are in `artifacts/n04e/windows-before` and
`artifacts/n04e/windows-after`. Both contain the regional map, inspector and
forecast preview. The after set adds `05-save.png`, `06-title.png` and
`07-load.png`. The existing connected gameplay scope stays at the Practice
Reform slice. Full Life Map and shops, art and interaction redesign, cloud saves
and old save migration are outside N04e.

### N04g - Integrated native app (Windows verified, raven blocked at USB)

On `t3/native-app-integration`, merged `658c93c8` (N04f) and then `38a8fa00`
(N04e) from the supervisor's `9a2f3218` (N03i, browser baseline `9123ed72`).
The combined app keeps N04f's RML/RCSS, map, camera, graph, keyboard, help and
Reform flow. It uses N04e's shell/session, validated atomic saves, Android
assets, safe area, lifecycle and gesture routing. SDL finger events feed the
shared interaction states, with direct two-finger zoom on the same map camera.
Minimize and background release the baked terrain and UI textures before
resume. Both branches' CTest registrations are present.

The title uses the existing Frontier Watch illustration at source sprite
resolution. Continue names the latest save and its year and second. The slot
list shows the live frontier, region count, UTC timestamp and versions for
readable saves, with explicit empty, corrupt and incompatible states.
Overwrite and leaving an unsaved or staged run use the same dialog as Reform.
Leaving writes the live frontier to Autosave. A failed write keeps the run
and shows its error. Manual save success posts a toast. The shell uses
the shared entry motion and the map reveals once the opening forecast is
ready. Region names use compass abbreviations where needed. Labels yield
when they overlap, and inspection shows the full region name.

This changes app input, presentation and save orchestration. Core, simulation,
timegraph, RNG, serialization formats and the browser tree remain at the
supervisor baseline. N04g reuses N04f's late presentation handoff for any
restore ready during layout. The label layer keeps its region elements across
preview samples, and the Live button text refreshes when the mode changes.

#### Windows verification

From the repository root in PowerShell, with `native/.tools` linked to the
shared toolchain. Fresh captures match N03i. A reused capture diverged at
`action-campaign-nest` second 6 and passed after regeneration.

```powershell
. native/tools/env.ps1
Push-Location native
foreach ($preset in 'optimized','optimized-clang') {
    cmake --preset $preset
    cmake --build --preset $preset --parallel 6
    ctest --preset $preset --output-on-failure
}
Pop-Location
node native/reference/trace.mjs
foreach ($preset in 'optimized','optimized-clang') {
    $parity = "native/build/$preset/src/sim/waffle_parity.exe"
    & "native/build/$preset/waffle_native_game.exe" --smoke --seed 42
    node native/reference/step-windows.mjs $parity
    node native/reference/replay-windows.mjs $parity
}
```

Both presets passed 48/48 CTests. The explicit seed-42 smoke reached live
second 148 with five actions and restored preview second 227. Interaction
smoke at both sizes covers actual SDL finger tap, pan, pinch, scrub drag and
long-press help, plus keyboard focus, reduced motion, Reform cancellation,
confirmation and rejection. Shell smoke covers seed entry, Save, overwrite
cancel and confirm, Load, Continue and return-to-title autosave. Save-slot
smoke also covers live digests, suspend/resume, invalid files and failed writes.
Each compiler matched 30 step windows with 153 comparisons and zero masks
(152 advancing and one gated). Replay matched 34 journals across 18 action
kinds, 252 browser checkpoints in three modes and 55 rejections. The logs and
fresh corpus are under `artifacts/n04g/`. `npm.cmd run check:docs` passed
after linking the existing N04f evidence directory at `artifacts/n04f/`
for its historical WORKPLAN link.

#### Windows frame measurements

Five alternating pairs per preset on the i9-10900K / RTX 3080 host, 1120×640,
Direct3D 11, vsync off, with the N04f `--bench 2400` seed-1 longevity
workload. Each sample required full publication through second 32,192, 1,000
years beyond the replacement frontier. These are medians of the per-run
percentiles. The N04f control is the original `658c93c8` build. N04g also
includes N03i. Browser trace capture was active during the pairs.

| Build | First playable, ms | Forecast, ms | Frame p50 / p95 / p99, ms | Loaded scrub p95, ms | Reconstruction + render p95, ms | Working set, MiB |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| MSVC N04f | 719.51 | 296.24 | 0.92 / 1.20 / 1.37 | 1.72 | 1.31 | 190.33 |
| MSVC N04g | 688.75 | 298.61 | 1.06 / 1.34 / 1.68 | 1.65 | 1.41 | 206.34 |
| Clang N04f | 549.91 | 220.60 | 0.73 / 0.96 / 1.09 | 1.27 | 1.03 | 188.41 |
| Clang N04g | 655.03 | 225.67 | 0.77 / 1.01 / 1.22 | 1.34 | 1.08 | 204.88 |

The archived MSVC N04f baseline was 1.04 / 1.71 / 2.20 ms. N04g was within
0.03 ms at p50 and faster at p95 and p99 against that record. The fresh
same-session MSVC p95 and p99 were 0.14 and 0.31 ms higher than the N04f
control. Clang p95 and p99 were 0.05 and 0.14 ms higher. All 2,378 integrated
scrubs presented within two harness frames. Worst loaded input-to-present
was 2.60 ms. N04g private memory was 236.12 MiB on MSVC and 242.42 MiB on
Clang. Estimated live textures were 16.57 MiB on both, up from 14.03 MiB with
the source-resolution title sprite. Forecast charged bytes matched within
each pair of builds per compiler. These timings describe the installed
Windows runtime.

```powershell
# Point $n04fWorktree at the checkout with both optimized builds of 658c93c8.
powershell -NoProfile -ExecutionPolicy Bypass -File artifacts/n04g/paired.ps1 -ControlWorktree $n04fWorktree -RunName paired-final
python artifacts/n04g/paired-summary.py paired-final

$env:SDL_RENDER_DRIVER = 'direct3d11'
$game = 'native/build/optimized/waffle_native_game.exe'
# Use fresh directories for the scripted save slots and captures.
& $game --seed 42 --capture artifacts/n04g/windows/desktop
& $game --seed 42 --size 640 360 --capture artifacts/n04g/windows/compact
```

The paired runner invokes each binary with `--bench 2400 <report.json> --load
artifacts/n04g/seed-1-n04c-long.json`. Raw rows are in
`artifacts/n04g/paired-final/` and the aggregate in
`artifacts/n04g/paired-final-summary.json`. The first set, before the marker
and Live button update changes, is in `artifacts/n04g/paired/`.

Windows before images are in `artifacts/n04g/windows-before/` (N04e).
Integrated images are in `artifacts/n04g/windows/desktop/` and
`artifacts/n04g/windows/compact/`. They include the map and forecast,
`05-reform-confirm.png`, `09-return-confirm.png`, `10-save.png`,
`11-save-feedback.png`, `12-overwrite-confirm.png`, `13-title.png` and
`14-load.png`.

#### Pixel 6 Pro (`raven`)

```powershell
$tools = (Get-Item native/.tools).Target[0]
powershell -NoProfile -ExecutionPolicy Bypass -File native/tools/bootstrap-android.ps1 -ToolsRoot "$tools" -OutputDirectory artifacts/n04g/android-build
& native/.tools/android-sdk/platform-tools/adb.exe devices -l
```

The optimized arm64 debug APK built and passed package inspection, including
the AArch64 `SDL_main` export, debug signature and the packaged RML, both
RCSS files, font, atlas sources and opening config.
`artifacts/n04g/android-build/app-debug.apk` has SHA-256
`1e340befce2af10ba1094a462ec3390a70be2edd54e360edd126e70a2812d2be`.
The signature tool verified APK Signature Scheme v2. Its report is in
`artifacts/n04g/android-build/apk-signature.txt`.

ADB listed no devices before or after packaging. The work item flags HiSuite
USB contention. Windows reported `HuaweiHiSuiteService64.exe` stopped, so
the current USB owner could not be confirmed. Device inventories and service
status are in `artifacts/n04g/adb-devices*.txt` and
`artifacts/n04g/adb-windows-service.txt`. Cam needs to restore USB ADB access
to `raven` before the N04e device procedure can run on this APK. Startup,
forecast frame times, scrub, reconstruction, memory, touch, pause/resume and
phone screenshots remain unmeasured. This session left the phone untouched
and its existing install state is unknown.

### N04h - Desktop Life Map, Shop and regional labels

Implemented on `t3/native-life-map-shop` from `89d08791`. Open **Life Map**
from the atlas. The candidate cards show age, starting Prestige and stats,
with free candidate rerolls and appointment confirmation. The Chronicle shows
the captured graph, current and reachable choices, completed stops, resolution
in simulation seconds, and the latest life events. It covers the native node
families through their captured options, plus Campaign modes, relic disposition,
Development, Commission, Delve and succession. The timed action's Advance
control commits the frontier to its resolution second. Scrub retains the
read-only result at the selected second and Back to Live restores the frontier.

The Shop quotes staged costs through the existing action validator. A
construction offer highlights its footprint and identifies replaced buildings.
The cart shows placement, Practice slot unlocks, route changes, Prestige,
Currency and Monster pressure. Checkout confirms the total and replaces the
forecast. The atlas prioritizes the selected and hovered names, reserves the
legend and zoom controls, and suppresses labels that cannot fit without a
collision. Pinned names can move farther and use a leader line.

The application sends the existing journal commands. Quotes use shared read
helpers and detached action drafts. The sim still owns rule validation, RNG,
ticks, replay and save state. Browser code and captured content are unchanged.
The placement smoke uses a regular seed-42 opening and a paid shop assembled
from the existing parity exhibits. It checks label collisions, node decisions,
all three Shop purchases, a rejected Currency payment, read-only scrubbing,
replay digest equality, save/load and succession at both desktop sizes.

#### Verification

Run in PowerShell from the worktree root with the shared toolchain junction in
place.

```powershell
. native/tools/env.ps1
Push-Location native
foreach ($preset in 'optimized','optimized-clang') {
    cmake --preset $preset
    cmake --build --preset $preset --parallel 8
    ctest --preset $preset --output-on-failure
}
Pop-Location
node native/reference/trace.mjs
foreach ($preset in 'optimized','optimized-clang') {
    $parity = "native/build/$preset/src/sim/waffle_parity.exe"
    & "native/build/$preset/waffle_native_game.exe" --smoke --seed 42
    node native/reference/step-windows.mjs $parity
    node native/reference/replay-windows.mjs $parity
}

node native/src/tests/life_ui_fixture.mjs artifacts/n04h/exhibits
$game = 'native/build/optimized/waffle_native_game.exe'
& $game --life-smoke artifacts/n04h/exhibits --seed 42 --capture artifacts/n04h/1120x640
& $game --life-smoke artifacts/n04h/exhibits --seed 42 --size 640 360 --capture artifacts/n04h/640x360
```

Both presets passed 50/50 CTests. The original smoke restored second 227
and returned to live second 148. Step parity passed 30 windows with 153
comparisons and zero masks. Replay passed 34 journals, 18 kinds, 252 browser
checkpoints in three modes, and 55 rejections. In both Life Map smokes the
checkout preview at second 32 matched authoritative replay, and loading the
save restored the digest at second 64. Manual play runs with
`native/build/optimized/waffle_native_game.exe --seed 42`.

Desktop screenshots and logs are in `artifacts/n04h/`, with N04g atlas
comparisons in `before/` and a short SDL render capture in `life-map-shop.webp`.
Physical Pixel validation is pending. The root
`npm run verify` stopped at the pre-existing missing historical
`artifacts/n04f/` link in WORKPLAN.

#### Frame measurements

Seven alternating pairs per preset at 1120 × 640, Direct3D 11 without vsync,
on the i9-10900K / RTX 3080 Windows host. The original source at `89d08791`
was rebuilt with the same toolchain. Both builds used the existing
`--bench 2400 <json> --long-benchmark` workload. All 28 runs published
through second 32,192, 1,000 years beyond the replacement frontier. Numbers
are medians of the per-run percentiles.

| Preset | Build | Frame p50 / p95 / p99 (ms) | Loaded scrub p95 (ms) | Forecast (ms) |
| --- | --- | --- | ---: | ---: |
| optimized | N04g fresh | 1.065 / 1.449 / 2.012 | 1.895 | 289.75 |
| optimized | N04h | 1.088 / 1.463 / 2.355 | 1.945 | 290.81 |
| optimized-clang | N04g fresh | 0.801 / 1.933 / 2.219 | 2.168 | 224.60 |
| optimized-clang | N04h | 0.804 / 1.903 / 2.434 | 2.105 | 224.23 |

All 3,015 N04h loaded scrubs presented within two frames. The frame p50 and
p95 changed by at most 0.030 ms against the fresh controls. The frame p99
increased by 0.343 ms with MSVC and 0.215 ms with Clang. Both candidate p99
values were below 2.5 ms. The archived MSVC N04g measurement was
1.06 / 1.34 / 1.68 ms. The fresh control also had a longer p99 than that
archive. The final raw reports are in `artifacts/n04h/paired-final-lazy/`.

The browser can use the same layout policy without changing simulation
semantics. Reserve controls before placing labels, grant selected and hovered
regions first use of space, and leave ordinary names at their local anchors.
The native test checks both pinned labels and pairwise collision on the
live map at each desktop size. Browser applicability is unmeasured.

### N04i - Forecast and timegraph experience

Implemented on `t3/native-forecast-experience` from `6c2ddd26`. Two stacked
lanes show People, Belief, Stock, Realm or Chaos. Civilization is the default.
The scope button switches to the selected settlement or capital for People,
Belief and Stock. Realm and Chaos use civilization totals. Belief values
weight the existing Faith tiers and Happiness levels by population.

Drag the plot to scrub. Use the zoom buttons or wheel, then drag the overview
to pan. With the plot focused, arrows step one second. Shift steps one moon,
Ctrl one season and Alt one year. Page Up and Page Down go to adjacent events.
Touch and mouse event buttons are also available. Hover or hold an event marker
for its details, and click or tap to restore its exact second. Home and
Back to Live return to the committed snapshot and bring it into view.

The previous revealed forecast begins at the decision second in faded ink.
It remains readable ahead of the replacement's published coverage while the
comparison is visible. The comparison clears after the replacement has stopped
publishing and the short comparison window has elapsed. The presentation
cache clears immediately. The worker retires its anchors at the next forecast
transaction. A short gold trace shows elapsed game time after an action and
amber ink tracks publications as they arrive. Reduced Motion removes those
effects. A red stop, hatched future and reason label identify a terminal run.
Event navigation includes smaller events that are grouped at wide zoom.
New Game prepares the full opening forecast before play.

Each chart caches min/max bands at 16-second blocks and successive powers of
two. An update ingests at most eight 64-row pages. A wide draw reads one
bounded level and keeps first, last and extrema. Close zoom reads exact rows
into a window cache and grows that cache as rows arrive. A late restore poll
before draw can pick up a completed scrub after RmlUi layout. RNG, game
rules, state schemas and authoritative replay follow the existing paths.
A display snapshot comes from a restore for its requested second and
generation.

#### Verification

Run from the worktree root in PowerShell after creating the toolchain junction.
The N04h browser reference corpus was reused from the same `src/` and
`native/reference/` trees.

```powershell
. native/tools/env.ps1
Push-Location native
foreach ($preset in 'optimized','optimized-clang') {
    cmake --preset $preset
    cmake --build --preset $preset --parallel 6
    ctest --preset $preset --output-on-failure
}
Pop-Location
foreach ($preset in 'optimized','optimized-clang') {
    $parity = "native/build/$preset/src/sim/waffle_parity.exe"
    & "native/build/$preset/waffle_native_game.exe" --smoke --seed 42
    node native/reference/step-windows.mjs $parity
    node native/reference/replay-windows.mjs $parity
}
$game = 'native/build/optimized/waffle_native_game.exe'
& $game --interaction-smoke --seed 42 --capture artifacts/n04i/1120x640 --record
& $game --interaction-smoke --seed 42 --size 640 360 --capture artifacts/n04i/640x360
```

Both presets passed 52/52 CTests and the seed-42 smoke. Per preset, step
parity passed 30 windows and 153 comparisons with zero masks. Replay passed
34 journals, 252 checkpoints in three replay modes and 55 rejections.
The SDL smokes switched series and scope, panned and zoomed, stepped through
the calendar, jumped between events, retained the overlay after Reform and
checked hover and finger hold on Monster Overrun. Clicking it restored second
4,434 and matched `rebuildStateAtSecond` on both desktop layouts. The existing
finger scrub also matched replay at second 227 and returned to Live at 148.

The two N04c workloads reuse the seed-1 opening and seed-2026-late second-3,200
fixture with `phaseDurationSec=64` and `monsterExpansionThreshold=1000000000`.
For each fixture, the `6c2ddd26` MSVC serial oracle and both optimized N04i
workers matched 32,001 summary hashes and 501 anchor hashes.

```powershell
$d = 'artifacts/n04i'
$control = "$d/control-source/native/build/optimized/src/sim/waffle_parity.exe"
foreach ($id in 'seed-1','late') {
    $origin = if ($id -eq 'seed-1') { 'native/reference/fixtures/seed-1/state-0.json' } else {
        'artifacts/native-reference/traces/seed-2026-late/state-3200.json'
    }
    node -e "const fs=require('fs'),s=JSON.parse(fs.readFileSync(process.argv[1])); Object.assign(s.gameConfig.settings.values,{phaseDurationSec:64,monsterExpansionThreshold:1000000000}); fs.writeFileSync(process.argv[2],JSON.stringify(s))" $origin "$d/$id-longevity.json"
    & $control run --from "$d/$id-longevity.json" --seconds 32000 --hashes "$d/$id-states.tsv" --timegraph-hashes "$d/$id-oracle.tsv"
    foreach ($preset in 'optimized','optimized-clang') {
        $parity = "native/build/$preset/src/sim/waffle_parity.exe"
        & $parity timegraph --from "$d/$id-longevity.json" --seconds 32000 --repeats 1 --samples 0 --expect "$d/$id-oracle.tsv"
        & $parity timegraph --from "$d/$id-longevity.json" --seconds 32000 --memory-profile --report "$d/$preset-$id-memory.json"
    }
}
```

Screenshots of the comparison, settlement Belief lanes and terminal preview
are in `artifacts/n04i/1120x640/` and `artifacts/n04i/640x360/`. Baseline
captures are in `artifacts/n04i/before-1120x640/` and
`artifacts/n04i/before-640x360/`. The desktop recording is
`artifacts/n04i/forecast-experience.webp`. Physical Pixel validation remains
pending.

#### Performance and memory

Seven alternating control/candidate pairs per compiler ran in one session
on Windows x64 (i9-10900K, RTX 3080, Direct3D 11, vsync off), at 1120 × 640.
The fresh control was built from `6c2ddd26` with the same pre-timing wait
for the previous forecast to finish. Both used `--bench 2400 <json>
--long-benchmark`. All 28 runs published to second 32,192, with 32,000
seconds of forecast from the committed frontier. The table shows medians of
per-run percentiles in milliseconds.

| Preset | Build | Frame p50 / p95 / p99 | Loaded scrub p95 | Replacement forecast |
| --- | --- | ---: | ---: | ---: |
| optimized | Fresh control | 1.055 / 1.838 / 2.233 | 2.295 | 307.49 |
| optimized | N04i | 1.541 / 1.927 / 2.553 | 2.046 | 301.88 |
| optimized-clang | Fresh control | 0.815 / 2.103 / 2.494 | 2.649 | 233.37 |
| optimized-clang | N04i | 1.333 / 2.014 / 2.573 | 2.280 | 246.10 |

All 2,485 loaded N04i scrubs reached present within two harness frames.
Median frame p99 was 0.321 ms above the fresh MSVC control and 0.080 ms
above the fresh Clang control. Both N04i p99 figures were slightly above the
archived 2.5 ms reference. The loaded scrub p95 improved on both compilers.

| N04i zoomed-out chart | Read and ingest p50 / p95 / p99 (ms) | Per-frame envelope selection p50 / p95 / p99 (ms) |
| --- | ---: | ---: |
| optimized | 0.0680 / 0.1123 / 0.1754 | 0.0123 / 0.0171 / 0.0245 |
| optimized-clang | 0.0570 / 0.1105 / 0.1978 | 0.0084 / 0.0140 / 0.0185 |

Ingestion is measured on frames that read new rows. Envelope selection also
includes the retained line and overview, and visits at most 224 columns
per main lane plus an edge band. The rendering work is counted in the
frame table. The paired benchmark runner and raw JSON are at
`artifacts/n04i/run-paired-final.ps1` and `artifacts/n04i/paired-final/`.

The chronicle header adds 24 bytes per second. At 32,001 published rows that
is 0.73 MiB of header payload, measured against the same control on both
fixtures and compilers. The largest standalone forecast charge was
101.19 MiB across the two fixtures and compilers. The largest chart cache
was 6.69 MiB. Their sum is below the 128 MiB single-generation budget.
The connected benchmark peaked at 216.09 MiB of charged forecast
and chart cache storage across the two generations.

Named Vassal outcomes and per-region migration routes would
benefit from sparse typed event details if the supervisor wants more specific
tooltips. The current edition groups simultaneous events by second and uses
the existing pending-resolution and tenure markers.

**Cross-runtime handoff.** For wide interactive plots the browser can measure
a persistent, incrementally built min/max pyramid. The native view preserves
every published instant for readout and restoration while its wide draw
visits a bounded number of bands. The Windows frame and memory measurements
describe this runtime and the recorded seed-1 workload.

### N04k - Living regional map

The atlas reads the approved browser WebP sheets directly. It uses the same
generated regional definition and art seed, 2-texel world coordinates, ground
atlas rolls, bank profiles and biome artwork. A background worker prepares
the natural and occupied terrain layers, water and hinterland, and caches
settlement compositions and road routes. Village and market sprites share
their biome placements. Crown cities retain their opening province or capital
architecture through capture. Viewed occupancy selects the scorched terrain
and monster landmark immediately on a scrub. Compact overview uses a
half-resolution terrain level, and zoom uploads the fine level. Minimize and
background release the SDL textures, which upload again from the CPU bake.

Live advances blend ownership ink and settlement size and visibility over
265 ms. Roads grow or contract and occupied terrain blends with the natural
biome. Starting a scrub cancels map easing. The first frame after a restore
draws the exact requested map, and returning to Live snaps to the frontier.
The Motion toggle removes the transitions. Region outlines and settlement
diamonds distinguish hover, press and selection. The mouse uses a hand over
targets and a move cursor during pan. On touch, a tap selects and a hold reads
the name, control and population. State, RNG draw order, save schema, forecast
worker and replay stay as in `fd7d581b`.

#### Browser reference and follow-ups

The [browser atlas](../src/views/world-map/README.md) and
[approved Crown art](../docs/crown-modular-art-iteration.md) supply the art and
visual reference. The native raster is visually comparable at the same seed,
with the geography, material decisions and centre anchors shared. It samples
island land directly, uses a coarser routing grid and builds the landscape
from a subset of the browser placement passes. The exact browser relief joins,
city foundation exclusions, terrain transition profiles, distant scenery
scatter, and full LOD chain still need porting. The browser probe supplies a
reference capture for these comparisons.

Static water is present. Animated water, clouds, shadows, fog and wisps, and
their view-local graphics switches with a 30 fps cap, remain follow-ups.
The native atlas shows region and settlement identity, ownership, capitals,
Creep and roads. Hover and touch help add the current residents. The browser
crest still adds worker counts, active and potential Prestige, allegiance,
the normal and Force-adjusted holding thresholds, Force, Unrest years, and
Monster Strength. Stock coverage icons and transfer packets are also absent.

#### Verification

```powershell
. native/tools/env.ps1
foreach ($preset in 'optimized', 'optimized-clang') {
    Push-Location native
    cmake --preset $preset
    cmake --build --preset $preset
    ctest --preset $preset --output-on-failure
    Pop-Location
    $game = "native/build/$preset/waffle_native_game.exe"
    $parity = "native/build/$preset/src/sim/waffle_parity.exe"
    & $game --smoke --seed 42
    node native/reference/step-windows.mjs $parity
    node native/reference/replay-windows.mjs $parity
}
node scripts/regional-presentation-browser-probe.mjs 42 --windowed
```

The existing connected interaction smoke exercises mouse and finger input at
1120 ? 640 and 640 ? 360. It checks hover, press, selection and touch help,
Crown city and road plans, compact LOD selection and texture release.
It compares the first restored map pixels with Motion on and off and verifies
identical atlas pixels after uploading the terrain again.

Both Windows presets passed all 52 CTests and the explicit seed-42 smoke.
Step parity matched 153 comparisons across 30 windows with zero masks.
Replay matched 252 browser checkpoints across 34 journals in three replay
modes, with 55 rejected actions leaving state unchanged. The browser probe
passed the seed-42 illustrated terrain and camera checks.

Use `--seed 42 --size <width> <height> --capture <folder>` with the control and
candidate games to capture each native size. The opening atlas is
`01-regional-map.png`. The candidate also captures `n04k-map-pressed.png`,
`n04k-map-selected.png` and the five-frame Practice Reform transition
`n04k-live-00.png` through `n04k-live-04.png`. The before/after folders and the
seed-42 browser image are under `artifacts/n04k/`.

#### Performance

Windows x64, i9-10900K, RTX 3080, Direct3D 11, MSVC `optimized`, vsync off.
Seven alternating `--bench 2400 <json> --long-benchmark` pairs compared the
1120 × 640 candidate with an unmodified build of `fd7d581b`. Each published to
second 32,192. The median frame p99 dropped from 2.494 to 2.313 ms and the
candidate was faster in six of seven pairs. All loaded scrubs reached present
within two harness frames. Three further candidate runs used 640 × 360.

| Window | Worker bake | Texture upload | Steady map draw p50 / p95 / p99 | Map texture payload |
| --- | ---: | ---: | ---: | ---: |
| 1120 × 640 | 234.39 ms | 2.35 ms | 0.049 / 0.068 / 0.095 ms | 8.89 MiB |
| 640 × 360 | 234.54 ms | 0.99 ms | 0.051 / 0.092 / 0.130 ms | 2.66 MiB |

The table reports medians across runs. Bake time covers CPU raster and layout
work after atlas decode. Upload and draw are main-thread SDL submission time.
Texture payload counts the uploaded terrain level and building atlas at
four bytes per pixel. It excludes the prepared CPU levels, driver storage and
the rest of the app's textures. These are Windows results. The Android package
stages the same WebP images, and Pixel memory and frame timing remain untested.
The runner and raw JSON are `artifacts/n04k/run-paired.ps1` and
`artifacts/n04k/paired-illustrated/`.

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
