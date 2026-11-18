# Native game runtime

## Accepted direction

Cam selected a game-specific runtime built on **C++ + SDL3 + RmlUi** in the
architecture discussion on 13 November 2026. Windows and Android are the first
installed targets; the Pixel 6 is the phone performance floor. Browser delivery
is deferred. This directory is the home for the successor, developed alongside
the independently playable browser game.

Reuse the existing artwork and intended gameplay/interactions. Design the native
implementation afresh: the JavaScript/Pixi implementation is a behavioral
reference, not a required architecture or a dependency of the native executable.
Differences between intended rules and observed bugs must be recorded explicitly.

Port design and verification: [ARCHITECTURE](ARCHITECTURE.md).

**Current state:** The Windows presentation slice shows an illustrated regional
map, five settlement cards, and a nested inspector with a live ledger. An arm64
Android debug APK compiled for the earlier bootstrap. The presentation slice's
Android build and device behavior are unverified. Start with
[agent instructions](AGENTS.md) and the [work plan](WORKPLAN.md).

## Windows build

From the repository root in PowerShell, after a clean checkout:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File native/tools/bootstrap-windows.ps1
. native/tools/env.ps1
Set-Location native
cmake --preset dev
cmake --build --preset dev
ctest --preset dev --output-on-failure
.\build\dev\waffle_native_demo.exe --smoke
cmake --preset optimized
cmake --build --preset optimized
ctest --preset optimized --output-on-failure
.\build\optimized\waffle_native_demo.exe --smoke
```

`bootstrap-windows.ps1` only fills `native/.tools`, which git ignores. It
downloads CMake and Ninja. It does not install them for the machine. If
`vswhere` finds Visual Studio Build Tools, that MSVC is the compiler and
llvm-mingw is not downloaded. Otherwise the script downloads the pinned
llvm-mingw UCRT toolchain. `env.ps1` imports `vcvars64` or the llvm-mingw
binaries into the current PowerShell process only.

`--smoke` checks mouse and SDL finger input, nested inspection and scroll
restoration, clipped map readback, counters, and window resize, then exits.
Add `--capture <existing-directory>` to save the overview and ledger as BMPs.
The three headless tests cover the RmlUi document, UTF-8 RML/font paths, map
camera math, and frame-time percentiles. They run without a window or SDL.
Fetched dependencies build under each preset's binary directory.

Launch without arguments to explore. Drag to pan the map, use its +/− buttons
or the wheel to zoom, and select a Practice card to inspect it. The inspector
accepts wheel and finger scrolling. `--touch` routes desktop mouse presses and
drags through SDL's finger events. Escape closes the window.

From `native/`, run `.\build\optimized\waffle_native_demo.exe --bench 1200` for
JSON on stdout, or append a JSON output path. It reports time from entry to
first present and frame tails with SDL vsync set to zero while the script pans, zooms,
scrolls and visits the nested ledger. CPU frame time is elapsed frame work
through SDL submission, excluding present. Working set and private bytes are
sampled after the run. Texture estimates count live RGBA8 art/font pixel storage
and exclude driver overhead, swapchains and staging memory. These measurements
describe the Windows presentation workload.

### Presentation renderer

N02a extends the app's SDL_Renderer bridge with premultiplied PNG textures and
2D affine transforms. The map transforms its contents inside a stationary
rectangular viewport. The map and inspector use axis-aligned scissors. The
headless renderer records those calls and verifies the document requests zero
clip masks, layers or filters. The card frames supply the decorative edges.
Rounded or transformed clip boundaries would need RmlUi clip masks. Live blur
and drop shadows would need layer targets and filter passes.

SDL_GPU offers stencil and shader pipelines for those effects on D3D12 and
Vulkan. It requires matching shader binaries and explicit pass and resource
management. RmlUi 6.3's SDL_GPU sample supplies geometry, textures, transforms
and scissors, leaving masks and filters to the app. The same SDL_Renderer
bridge passed Windows smoke on the default D3D11 driver and on the `gpu`
driver with `SDL_GPU_DRIVER` set to `direct3d12` and `vulkan`. Retaining the
bridge covers this screen's requirements with the existing API. Revisit the
choice with Pixel 6 driver, frame-tail, memory and lifecycle evidence in N02b.
[SDL GPU platform requirements](https://wiki.libsdl.org/SDL3/CategoryGPU) and
[RmlUi 6.3 SDL GPU renderer](https://github.com/mikke89/RmlUi/blob/6.3/Backends/RmlUi_Renderer_SDL_GPU.h).

On the i9-10900K / RTX 3080 Windows host, three optimized 1,200-frame runs at
1120×510 put D3D11 p95 at 2.23–2.36 ms. One run each of the GPU-backed driver
gave 7.04 ms on D3D12 and 6.53 ms on Vulkan. SDL's GPU-backed renderer prefers
mailbox presentation at vsync zero. D3D12's median was near the display's
144 Hz interval, so this comparison includes presentation pacing.

The slice uses the PNG-only build of stb_image. It decodes the five existing PNG
sheets from SDL's UTF-8 file reads without adding a separate decoder library or
toolchain. The Windows executable reads the checkout's art in place. The five
cards share a full atlas upload, which accounts for about 60 MiB of estimated
texture storage in this slice.

Dependency versions and licenses: [THIRD_PARTY.md](THIRD_PARTY.md).

## Android debug package

From the repository root in PowerShell:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File native/tools/bootstrap-android.ps1
```

The script downloads and verifies pinned JDK/SDK/NDK and build tools into
ignored `native/.tools`, accepts SDK licenses in that local SDK, generates a
local debug key, stages the slice's referenced PNG sheets from the shared art,
and builds `native/android/app/build/outputs/apk/debug/app-debug.apk`.
It also copies the APK and package inspection to
`artifacts/grok-nov14-spend/android-bootstrap/`. It does not install the APK.
First setup needs network access and several GB of disk space. An existing native
workspace cache can be reused with `-ToolsRoot <absolute-path-to-native/.tools>`;
the selected tools path is recorded only in ignored `android/local.properties`.

The optional CMake `android` preset builds native libraries with the default
project-local NDK; Gradle is the APK entry point. API 31/arm64 is the minimum,
with compile/target API 35. N02 still owns physical Pixel 6 validation,
touch, background/resume and graphics resource recovery.

## What we own

- Simulation: deterministic rules, captured content definitions, actions and
  serializable state, runnable without a window or graphics libraries.
- Time inspection: forecasting, summaries, independently restorable previews,
  scrubbing and cancellation of obsolete forecast work.
- Presentation: illustrated map composition, timegraph rendering and the
  game's UI composition in RmlUi.
- Application: loading, input routing, saves, lifecycle and build profiles.

Use established libraries for platform integration, graphics backends, text and
font handling, audio and image decoding. Add dependencies when a concrete slice
needs them. A general engine editor, custom font/layout system, bespoke graphics
driver layer and mandatory ECS are outside the initial scope.

The graphics backend remains an implementation decision. Prove Windows and
Pixel 6 compatibility, clipping, compositing and resource recovery before
committing the renderer. SDL platform support alone does not establish that a
particular GPU backend works on the target phone.

## Shared core and build profiles

All profiles use the same gameplay rules and content definitions:

- Development: diagnostics, quick builds and reloadable assets/layout/content.
- Performance: optimized simulation and rendering, timing instrumentation and
  selectable minimal/full artwork. Debug-build timings do not establish speed.
- Full game: optimized installed build with the complete local artwork package
  and offline startup.

Minimal artwork changes presentation only. Full artwork on disk does not require
all textures to be resident in memory. Keep source artwork shared with the
browser project; produce native packages under ignored native build output.
Content changes must respect captured per-run definitions and replay. Reloading
a definition is not permission to silently change an existing run's rules.

Dependency versions, compiler/SDK versions and build commands will be pinned
during bootstrap. Keep build outputs and native saves separate from browser
outputs and saves. Fresh native saves are acceptable; obsolete-save migration
is outside this rebuild.

## First playable target

Regional map -> settlement -> inspect/change a Practice -> forecast -> scrub
the result, using existing artwork and representative simulation work.

The first milestone must exercise long text, nested inspection, scrolling,
touch, map layers/clipping and changing numbers. A sprite demo or a synthetic
simulation alone cannot establish that this game's runtime is viable.

Success means:

- Deterministic behavior and authoritative replay, with cross-platform fixtures.
- A 60 FPS interaction target on Pixel 6 while forecasting, measured with frame
  time tails and input-to-visible scrub latency rather than average FPS alone.
- Separate measurements for full opening forecast and random-access restore.
- Measured CPU/GPU memory, cold/warm startup and sustained thermal behavior.
- Offline startup, reliable save/load and Android background/resume recovery.
- A practical edit/build/run cycle on Windows and Android.

Precise latency and memory budgets need a baseline and are an early work item,
not measured achievements. Smooth scrubbing takes priority over forecast reveal
speed or horizon. The existing full-opening-forecast requirement remains in
force; the long-horizon near-instant forecast goal is aspirational.

## Performance handoff between runtimes

Browser performance work and the native rebuild share workloads, behavioral
contracts and engineering findings. Keep implementation choices and timing
claims specific to the runtime being measured.

Before browser performance work, including a hillclimb, read the native scope
above and the relevant item in [WORKPLAN.md](WORKPLAN.md). Before native
simulation, time-inspection or performance work, consult the relevant browser
performance reports and task issues. Start timegraph investigations with the
[guardrails](../docs/timegraph-optimisation-guardrails.md), which link the
existing measurements; follow only references relevant to the bounded task.

For each substantial finding, add a short **Cross-runtime handoff** to the
existing performance report, hillclimb final pack or task issue. Include:

- Evidence: source revision, reproducible workload/commands and correctness
  checks. Link existing harness/proof artifacts for seed, captured configuration,
  actions, horizon, device/build and measurement details instead of duplicating them.
- Applicability: the algorithm or contract the other runtime can use, a
  runtime-specific result, or an explicitly untested hypothesis. Explain the
  relevant ownership, invalidation, ordering or replay constraint.
- Next use: the affected native work item or browser subsystem and the smallest
  validation needed there. Link a reusable fixture or regression when available.

One paragraph with links is enough for a small finding. Keep this handoff in the
existing evidence/task record; WORKPLAN remains the native status index and
GitHub issues own task scope. Browser-only improvements remain worthwhile and
can finish independently of native work.

When consuming a finding, link it from the native task/session record and state
whether it is adopted, needs a fresh measurement, or is inapplicable, with a
reason. Feed native discoveries relevant to the browser back into the shared
report or a linked browser issue. This is a handoff of evidence, not a requirement
to preserve JavaScript architecture or share implementation code.

Preserve the source revision of behavioral fixtures and separate observed bugs
from intended rules. A performance-only change must retain the expected semantic
state, RNG and replay results. Record intentional rule changes separately before
refreshing expectations. Browser timings, prepared-start gains and desktop CPU
throttling do not establish native or physical Pixel 6 performance; validate
native gains with optimized native builds on the stated hardware.

## Authority and evidence

This page records the selected direction. The [work plan](WORKPLAN.md) owns
execution status; [AI context](../ai/ai-context.md) owns current invariants.
[Game design](../docs/game-design.md) and [aesthetic/UX guidance](../docs/aesthetic-ux-design.md)
own intent. Read [timegraph guardrails](../docs/timegraph-optimisation-guardrails.md)
and its required references before simulation/timegraph work.

Earlier research explains the choices, but its tentative engine recommendations
do not override the accepted stack:

- [Focused runtime/library options](../docs/research/focused-2d-runtime-options.md)
- [Firsthand custom-runtime accounts](../docs/research/custom-runtime-developer-experience.md)
- [Axmol support and experience](../docs/research/axmol-maintenance-experience.md)
- [Earlier clean-rebuild assessment](../docs/research/clean-rebuild-assessment.md)

## Resuming later

Assign a session: **"Continue the native runtime from native/AGENTS.md; complete
the next ready work item and leave a verified handoff."** Add a time/compute
budget if desired. This workspace does not schedule agents or consume spare
usage automatically. Each invocation takes one bounded item and records its
result so another session can resume.
