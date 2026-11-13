# Clean rebuild assessment

13 November 2026. **Draft recommendation, not implementation or a benchmark.**
Targets: installed Windows and Android, Pixel 6 performance floor.

**Decision update:** Cam selected a custom **C++ + SDL3 + RmlUi** runtime.
The accepted scope and execution entry now live in [native/README.md](../../native/README.md).
The Unity recommendation and alternative assessments below are earlier research,
not the implementation plan. The existing art and behavioral target remain the
basis of the clean rebuild.

## The brief

Cam explicitly wants a blank-page successor. Existing source code is a reference
for observed behavior and tests, not something the new architecture must retain.
Keep the paintings, fonts, icons, established interaction intentions and game
rules. Rebuild their implementation where a different design is clearer or
faster. Develop the successor alongside the current playable game and switch
only when the new one demonstrates the required behavior and performance.

This supersedes the earlier recommendation to first package the Pixi application
and progressively extract its internals. Packaging the old game is optional
maintenance, not a prerequisite for the successor. Browser distribution is not
a release requirement for this assessment.

## Recommendation

For the combined priorities of simplicity, performance control and installed
Windows/Android distribution, choose **Unity 6.3 LTS, C# throughout, an
engine-independent simulation/timeline library, and IL2CPP release builds** as
the first candidate. Pin the editor and package versions. Use an unlit 2D
rendering setup, reusable illustrated UI prefabs, and custom batched map/graph
geometry. Start with uGUI for the composed game UI, using TextMeshPro for text;
keep UI Toolkit available for development editors rather than mixing runtime
UI systems without a concrete need.

This is an engineering judgment about fit and controllable complexity, not a
claim that Unity has measured faster than Pixi or Godot for this game. The core
must not depend on Unity scene objects. C# can cover rules, presentation and
tools, while IL2CPP produces native target builds. A browser, webview, JavaScript
worker and WASM runtime are not release requirements.

**Godot 4 plus a pure Rust simulation** is the strongest alternative. Its 2D
Control/scene workflow is a strong visual fit, but thin GDScript presentation
plus a Rust GDExtension adds a second language and a community binding/Android
ABI toolchain. Prefer it if open-source engine ownership or demonstrated native
memory/performance advantages outweigh that cost. For Godot, start by measuring
Compatibility against Mobile on the actual device.

Rust remains a useful authorized experiment, not a predetermined dependency.
Compare the representative C# and Rust core workloads; optionally compile Rust
to WASM for the browser control. Native Rust and WASM are different deployment
targets. If Rust materially beats a disciplined C# core on the critical phone
workload, revisit a native Rust adapter with that evidence. The [native stack
research](native-stack-options.md) assesses the options and their objections.

## What looking at this game establishes

The local v1.1.59 build was inspected through the actual menu, regional map,
timeline browsing and settlement/card inspection screens, including a narrower
landscape view. This was visual/interaction inspection, not an isolated timing
run or physical-phone test.

The displayed game consists primarily of:

- Painted textures and decorative frames, with independent labels and glyphs.
- A polygon-based regional map with painted terrain, roads, settlement/building
  imagery, territorial outlines, water and translucent cloud layers.
- Illustrated cards, reusable trays/sockets, progress indicators and tooltips.
- A dense but bounded amount of UI, including scrollable detailed readings.
- A custom multi-series timeline that drives inspection of the entire world.
- Effects that must seek to viewed game time rather than accumulate wall time.

This is a native 2D strategy/UI workload. It does not need a 3D art pipeline to
look painted, nor a custom low-level graphics engine to draw these surfaces.
The art style comes mainly from the assets and composition. A different renderer
can retain it. The risks are texture residency, alpha overdraw, dynamic geometry,
text/UI invalidation, state inspection and simulation scheduling, rather than
the stylistic label attached to the pictures.

In Unity, use reusable image/text prefabs for cards, trays and inspections;
textured meshes/sprites for terrain and buildings; and a custom mesh/control for
the graph. The [Unity 6.3 UI comparison](https://docs.unity.com/en-us/engine/6000.3/manual/uitoolkits/ui-system-compare)
recommends uGUI for runtime and identifies UI Toolkit as the alternative. The
[URP 2D project template](https://docs.unity.com/en-us/engine/6000.3/manual/render-pipelines/universal-render-pipeline/introduction/installing-and-configuring-urp/creating-a-urp-project/creating-a-new-project-with-urp)
is a concrete starting point; disable unused lighting/post-processing work and
profile rather than assume the template is optimal.

Godot's [Control system](https://docs.godotengine.org/en/stable/classes/class_control.html),
[NinePatchRect](https://docs.godotengine.org/en/stable/classes/class_ninepatchrect.html),
[Polygon2D](https://docs.godotengine.org/en/stable/classes/class_polygon2d.html)
and [custom drawing](https://docs.godotengine.org/en/stable/tutorials/2d/custom_drawing_in_2d.html)
also fit the surfaces. Its visual suitability is why it remains the principal
alternative; neither option requires keeping the old canvas implementation.

## Why this stack, and its strongest objections

**One toolchain and language:** Unity covers native application export, UI/input,
prefabs, asset import and profiling; C# covers both orchestration and the
framework-free core. [IL2CPP](https://docs.unity.com/en-us/engine/6000.3/manual/programming-environment/scripting-backends/il2cpp)
compiles managed code through C++ to native code without maintaining our own
cross-language binding. This is the main simplicity advantage over Godot/Rust.

**An explicit efficient core:** use compact arrays, stable IDs, ordered events
and deliberate snapshot ownership. Keep hot forecast/restore paths allocation
conscious and measure them outside the editor. IL2CPP does not remove
[managed garbage collection](https://docs.unity.com/en-us/engine/6000.3/manual/analysis/performance-memory/managed-memory/garbage-collector).
Do not put a MonoBehaviour on every cohort, action or time sample. Burst can be
considered for suitable measured kernels; it is not required to start, does not
accept arbitrary managed object graphs and does not establish determinism.

**Unity's costs:** editor/build complexity, commercial license conditions,
managed-allocation discipline and choosing the right UI/render configuration.
Check current license eligibility before committing. We should not add ECS,
Addressables, jobs or multiple UI systems merely because they are available.
Native AOT output does not guarantee a fast simulator or a small installation.

**Godot/Rust's case:** strong 2D/Control authoring, open-source engine ownership,
and a Rust core with explicit allocation/ownership and standalone tests. Its
[renderer guide](https://docs.godotengine.org/en/stable/tutorials/rendering/renderers.html)
provides a 2D starting point. Its additional integration risk is real:
[godot-rust](https://godot-rust.github.io/book/) is community-maintained, with a
documented [Android export path](https://godot-rust.github.io/book/toolchain/export-android.html).
Official [C++ bindings](https://docs.godotengine.org/en/stable/tutorials/scripting/cpp/about_godot_cpp.html)
are an alternative, retaining a two-language application and native ABI work.
No evidence here establishes a universal engine or language speed advantage.

Godot C# would combine those attractions, but [current stable documentation](https://docs.godotengine.org/en/stable/tutorials/scripting/c_sharp/index.html)
still marks Android support experimental. I would not make it the default
Windows/Android recommendation without a specific mobile acceptance spike.

Defold is a serious compact 2D alternative. Its Lua/native-extension split and
GUI/render tools deserve consideration; its inspection/content tools and
cross-language core integration require additional composition. Bevy or a custom Rust renderer
could keep the code in Rust, but shift more application/UI/authoring work onto
this project. Flutter/Rust could serve a UI-heavy game, but is less directly
aligned with the map/effects/asset workflow. Those are fit judgments, not
unsupported FPS or memory rankings.

## A simpler simulation and rendering architecture

### A purpose-built native runtime is a real candidate

The project can own a small runtime tailored to illustrated strategy and
timeline inspection, using existing libraries beneath it. Its scope is the
authoritative simulation, projection storage and restoration, a batched 2D map,
illustrated game controls, and an asset/content build pipeline. It does not need
a generic 3D engine, physics sandbox, arbitrary scripting host or universal scene
editor. This scope is materially smaller than creating a general game engine.

Reuse platform/input/audio libraries, graphics backends and font/text machinery.
For C++, compare a focused engine such as Axmol with SDL3 plus a native UI library
such as RmlUi. For Rust, compare a small 2D library such as Macroquad with the
greater control and greater assembly work of wgpu/winit plus text/layout
libraries. These choices can host the same framework-independent rules and
timeline design; they need not preserve the current game's implementation.

The potential advantage is direct control over data layout, allocation, texture
residency, draw batching, UI invalidation and scheduling. Build graph geometry
when its data/window changes and update the cursor separately. Separate cached
map terrain from changing ownership and effects. Use independent owned preview
states and read-only summary storage; preserve complete continuation/replay
information. Avoid JSON conversion on frame-critical runtime paths while keeping
the state/save contract serializable. These decisions matter more than replacing
one language with another around the same expensive work.

A code-first asset manifest, content compiler, scene descriptions and small
debugging tools may be a good fit for AI-assisted development. Faster code
production makes this route worth testing; it does not itself establish correct
Android lifecycle handling, text/input behavior, driver support or performance.
Those need explicit acceptance scenarios and instrumented release builds.

Evaluate adoption versus custom runtime through the same illustrated
map/card/inspection/timeline slice and actual Android build. Keep Unity as a
comparison for complete-product tooling and implementation complexity rather
than assuming it is either faster or slower. Do not build several full games
or design a universal engine before testing the target-specific slice.

### Common module responsibilities

Design two deep modules: the **simulation/timeline module** and the **presentation
module**. A small adapter converts commands and selected view data between them.

The simulation module owns seeded RNG streams, captured content, ordered actions,
official ticks, full continuation states, checkpoints, every-second summaries,
projection generations and cancellation. It runs headlessly under standalone
.NET tests and a benchmark executable. It has no Unity scene objects, drawing, wall clock or
platform storage. Keep serialized state JSON-compatible; native runtime indexes
and caches remain outside the authoritative state contract.

The interface opens a world/config/save, accepts a command, projects to coverage
or loss, inspects a second, and exports a save. It reports generation, actual
viewed second and coverage explicitly. Reading a tooltip cannot accidentally
start a forecast. The C# presentation talks directly to the C# core through its
interface. JSON is an interchange/save format, not a mandatory transport for
every frame. A future Rust adapter should preserve this coarse interface rather
than cross a native binding per tick, person, resource or graph point.

Forecasting works on private continuation state. Exact preview restoration uses
independent state and yields a view of the requested time. Interactive inspection
gets scheduling priority over background forecasting; stale jobs cannot replace
newer results. Keep graphics changes on the presentation thread, following
[Unity's thread-safety rules](https://docs.unity.com/en-us/engine/6000.3/manual/scripting/get-started/programming-best-practices).
The UI need only receive what it displays, while full continuation states and
every-second summaries remain available in the core. This is a new ownership
design, not a proposal to remove existing replay information.

Use stable IDs and validated content tables for cards, recipes, modifiers and
triggers. Preserve DSL-first authoring rather than writing one native class per
card. Convert existing authored definitions to the new data format as build input;
the installed game must not import the old JS application. New core state/save
schemas can be a clean cut. Do not perpetuate obsolete saves, incidental caches,
large orchestrators or old object layout merely for compatibility.

Presentation uses reusable UI prefabs for cards/readings and a custom map/graph
layer. Static terrain and graph geometry rebuild when their inputs change;
playhead, highlights, packets and time-driven effects update separately. Any
downsampling is display-only: exact summaries and inspection remain intact.
Avoid one engine node per simulated person/event/sample. Reuse asset references
and view objects instead of reconstructing the complete screen on every scrub.

## Reusing the artwork well

Re-import the source paintings, font files and icons into the new toolchain,
converting existing WebP assets to a supported import format where necessary.
Existing Pixi atlas descriptors are optional conversion inputs, not the required
runtime format. Preserve painterly filtering deliberately, with separate
sampling/import settings for pixel-like glyphs and painted backgrounds.

Build a stable logical-ID manifest. Keep card-face thumbnails distinct from
enlarged inspection assets. Import resolution, mipmaps and compression should
match actual use. Unity's [platform texture settings](https://docs.unity.com/en-us/engine/6000.3/script-reference/unityeditor/textureimporterplatformsettings)
allow target-specific formats, quality and sizes. Disk compression and GPU
residency are different budgets; aggressive compression can damage fine 2D art.
Validate paintings, small symbols and text separately on the phone.

Generate static map presentation once per captured geometry/seed, retaining
independent dynamic ownership, buildings and effects. Prebuild seed-independent
asset work at export time. A procedural map cannot be replaced with one fixed
painted screenshot, and runtime simulation behavior must not depend on rendering.

Include the full supported artwork in native Windows and Android release builds.
Load by need; full installation does not require every full-resolution texture
in memory. Test offline first launch, ordinary New Game, background/resume and
upgrade persistence. Native packages still have decode/upload costs and total
process/texture memory limits.

## The immediate artwork caching fix is independent

The verified `no-store` header belongs to the **LAN development server** in
[local-preview.mjs](../../scripts/local-preview.mjs). It should not be assumed to
describe the published GitHub Pages response policy. A separate transfer audit
can distinguish that site's downloads from decode/upload time.

For the current development build, use an **artwork revision independent of the
code/build revision**:

1. Build a manifest with content hashes for runtime art and atlas dependencies.
2. Serve artwork under versioned/content-addressed URLs with reusable cache
   headers. Unchanged art retains its URL across gameplay or documentation edits.
3. Keep entry HTML and the small revision manifest fresh. Detect an art revision
   change and show **Artwork updated — reload** at a safe opportunity.
4. On reload, reuse unchanged cached files and fetch only changed resources.
   Offer a developer **Refresh artwork** action for recovery, without clearing
   saves or every browser cache.

Atlas JSON, its referenced texture image and related multipacks must be versioned
coherently. Adding a query string only to the first JSON is insufficient if it
still points to an unchanged image URL. The existing
[build badge](../../src/views/build-badge-dom.js) already detects general source
changes; its general fingerprint is too broad to serve as the artwork revision.
Track cached HTTP bytes separately from Pixi's in-memory decoded texture cache.

Cache reuse also depends on a stable asset URL. Different preview ports are
different origins, so repeatedly moving the phone between checkout URLs can
cause another art download even with correct headers. Use a stable integration
preview for repeat-load acceptance; keep branch assets immutable if a shared
asset origin is introduced later.

A smaller initial change can use file validators (ETag/Last-Modified) and
`Cache-Control: no-cache` for art: reloads revalidate but can reuse unchanged
bytes with a 304 response. That avoids repeat payload transfer, though it keeps
per-file network requests. Hashed asset URLs are the stronger final design.
See [HTTP cache control](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cache-Control).
This section is a concrete design, not a shipped caching change.

## The first prototype and its acceptance gates

Start a **new native project**, not a new adapter around the full old UI. Reuse
assets and behavior scenarios. Do not reconstruct the entire game before proving
the core loop.

First prove the pinned application/core in both a Windows executable and an
Android ARM64 APK. Load a real painted card, draw the timeline, run a real
forecast on private state, scrub to inspect the correct world, make an action
and replace its projection. Include one representative settlement with supply,
Charge/reaction chains and population phases, plus a representative regional
map/visual load. Label the simulation subset; it is not full-game parity.

Run the C# core and the Rust experiment against the same reference corpus;
measure Rust natively and optionally as WASM for the browser control.
Do not benchmark a trivial loop and extrapolate to the whole game. Separately
test a scene with production-like art, text, graph and clouds so faster rules
cannot hide expensive UI/render work.

The prototype must establish:

- Matching normalized rule outcomes, RNG continuation, action/event ordering,
  every-second summaries and save/replay round trips for the covered scenarios.
- Correct arbitrary-time inspection, no mutable preview leakage and no stale
  projection results. Distinguish immediate marker movement from correct world
  arrival; neither alone establishes responsive scrubbing.
- Sustained phone frame times and restore-plus-render tails within the existing
  50 ms steady-frame and 33 ms p95 restore/render gate, with the longer-term
  goal of 60 Hz feedback. Define the sample/window and report startup separately.
- Bounded process and texture memory through repeated forecast replacements;
  establish the usable budget on a real Pixel 6, including thermal effects.
- Full-art offline relaunch and a working Android background/resume path.
- A practical change-to-play workflow for one content change, one UI change and
  one core-rule change. Measure release performance with optimized core builds;
  a debug-vs-release comparison is not an architecture result.

The existing 1000-year ambition remains a goal to investigate, not a performance
promise. Extend simulation horizon and content complexity independently to expose
limits. Judge the engine's render cost independently from core simulation cost.

## Build profiles, parallel work and cutover

One core and one content model feed **dev**, **performance** and **release**:
fast editable prefabs/scenes and optional art stubs; release-optimized instrumentable
scenarios with both art profiles; and installed complete-art products. Keep
prepared simulation fixtures out of actual forecast timing. Editors and profile
authoring are tools using the same content validators, not alternate game rules.

Keep the current game available throughout. A separate successor project may
live beside it in this repository; sharing a repository need not mean sharing
the old runtime. Give it separate save storage and application identity. Expand
from the accepted slice to all playable content and interactions, then test
complete runs, tenures, endings, saves and developer workflows before switching.

Pin reference scenarios to a rules revision. Compare player-visible/domain
results rather than requiring the successor to serialize obsolete internal
fields byte-for-byte. Preserve accepted game/time/replay contracts until any
change is made deliberately: the current official 60 ticks per second,
every-second loss detection, RNG streams, independent previews and full opening
forecast gate remain requirements. A scene frame loop is not a substitute for
authoritative simulation time. A proposal to skip ticks or change numeric rules
needs a separate explicit decision, not an unnoticed consequence of the rewrite.

This planning update changes no game code, RNG, schemas, state or replay. Validate
the documents with the repository's documentation, architecture and reachability
checks. Native implementation will need its own standalone .NET tests (Cargo for
the Rust experiment), engine tests, cross-target builds,
deterministic scenario comparisons, visual acceptance and real-device gates;
passing the current JavaScript suite cannot validate the new engine.
