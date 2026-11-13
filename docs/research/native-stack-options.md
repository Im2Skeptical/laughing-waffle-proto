# Native stack options for a clean rebuild

**Decision update:** Cam selected a custom **C++ + SDL3 + RmlUi** runtime.
The [native workspace](../../native/README.md) owns the accepted direction.
The integrated-engine comparison below is supporting research, not an open choice.

Researched 2026-11-13 against current primary sources. Recommendations below are engineering judgments, not measured performance rankings.

This is a blank-page Windows + Android product. Existing JS/Pixi code, function boundaries, save layouts and caches have no preservation value. Reuse paintings, fonts, icons and observable rules/interactions as references. Browser distribution is not required; no web wrapper is recommended.

The workload combines procedural polygon terrain, roads/borders, water/cloud layers, painted cards with changing glyphs/numbers, substantial inspection/shop UI, a life graph, and historical/forecast world scrubbing. A faster simulator alone cannot make those interactions smooth.

## Comparison

**Godot 4 + thin GDScript UI + independent Rust simulation through gdext.** The official archive currently lists [4.7.2 stable; 4.8 remains beta](https://godotengine.org/download/archive/). [Control containers, scrolling, popups and themes](https://docs.godotengine.org/en/stable/tutorials/ui/index.html) suit information panels; [Node2D/Control custom drawing](https://docs.godotengine.org/en/stable/tutorials/2d/custom_drawing_in_2d.html) suits polygons and graphs. Author reusable card/panel scenes and keep simulation outside nodes. This is a strong 2D product fit with explicit Rust allocation, ownership and worker control.

The cost is two languages plus an integration boundary: [gdext is community maintained independently of Godot](https://godot-rust.github.io/book/), with [occasional breaking Rust APIs](https://godot-rust.github.io/book/toolchain/compatibility.html). Android needs separately compiled ABI libraries, NDK/linker configuration and correct `.gdextension` packaging; the binding's [Android guide](https://godot-rust.github.io/book/toolchain/export-android.html) includes dated example versions, not a current toolchain lock. Prove release loading on Windows and ARM64 Android early.

Godot's [stable Android docs still label C# export experimental](https://docs.godotengine.org/en/stable/tutorials/export/exporting_for_android.html). That matters for an all-C# Godot proposal, not GDScript + Rust; it does not make all Godot Android export experimental. [Official C/C++ GDExtension support](https://docs.godotengine.org/en/stable/getting_started/step_by_step/scripting_languages.html) is the alternative to the community binding, retaining native compilation/ABI work and introducing C++ ownership responsibilities.

Choose **Compatibility versus Mobile by measurement**. Godot [recommends Compatibility as a 2D starting point](https://docs.godotengine.org/en/stable/tutorials/rendering/renderers.html), but both support 2D. Test identical map layers, text, clipping and shaders on Pixel 6; renderer names do not establish frame time or battery cost.

**Unity stable LTS + independent C# simulation + IL2CPP.** [Unity 6.3 is the current LTS](https://unity.com/releases/unity-6). One language can cover model, presentation and tooling without a Rust bridge. Use procedural meshes/sprites/materials for the map, reusable prefabs for painted pieces, and evaluate UI Toolkit for dense screen panels against uGUI for animated composition. Unity's [comparison](https://docs.unity.com/en-us/engine/6000.3/manual/uitoolkits/ui-system-compare) identifies different strengths; mixing systems unnecessarily complicates input, layering and authoring.

[IL2CPP compiles C# through C++ to native machine code](https://docs.unity.com/en-us/engine/6000.3/manual/programming-environment/scripting-backends/il2cpp). It does not remove [managed allocation/GC costs](https://docs.unity.com/en-us/engine/6000.3/manual/analysis/performance-memory/managed-memory/garbage-collector). A pure simulation can use compact arrays, explicit ordering and background work without ECS. [Burst supports a restricted C# subset](https://docs.unity3d.com/Packages/com.unity.burst@1.8/manual/csharp-type-support.html), excluding ordinary managed object graphs: use it only for measured suitable kernels, not as blanket speed magic or a prerequisite.

**Defold + Lua presentation + independent C++ native extension.** [GUI scenes/templates, text, clipping and layers](https://defold.com/manuals/gui/) and [runtime mesh buffers](https://defold.com/manuals/mesh/) cover the visual ingredients. Its focused scene/Lua workflow is attractive, and C++ permits explicit simulation storage and scheduling. My concern is product work: rich inspectors, responsive scrolling/staging and graph interaction require more composed/scripted widgets than Godot's Control toolkit. [Native extensions](https://defold.com/manuals/extensions/) are official and normally use Defold's hosted build server; self-hosting is possible. This simplifies developer setup but adds build-service dependence or infrastructure. Cross-language debugging and Lua/native data transfer remain work.

**Bevy/custom Rust:** a Rust core and renderer can share types and native memory control. However, Bevy's [own guide warns of missing features and recurring breaking changes](https://bevy.org/learn/quick-start/introduction/). Custom rendering goes further toward owning text, input, layout, asset tooling and packaging. I would not trade this game's substantial UI authoring needs for that maintenance burden.

**Flutter + Rust:** [native release compilation](https://docs.flutter.dev/resources/architectural-overview), rich widgets and [C-ABI Rust interop](https://docs.flutter.dev/interop) make this credible, especially for panels. The map, shaders, graphs and deterministic FX still need custom rendering/game infrastructure, while Dart/Rust adds another boundary. Prefer it if application-style UI dominates the product; this workload also needs an integrated game workflow.

## Packaging, authoring and tests

All three engines target installed Windows/Android products. Reimport original artwork/fonts/icons; author reusable visual components and data definitions rather than node-per-simulation-entity rules. Budget texture sizes, atlases, compression, glyph coverage and clipped text at actual phone scale. Keep dynamic numbers separate from paintings. The custom timegraph remains project code in every stack.

Godot combines scene/theme authoring, export templates and [headless CLI import/export/script execution](https://docs.godotengine.org/en/stable/tutorials/editor/command_line_tutorial.html); test the independent Rust crate with `cargo test`. Unity combines prefab/UI authoring and asset import settings with [Android SDK/NDK/JDK dependencies](https://docs.unity.com/en-us/engine/6000.3/manual/platform-specific/android/getting-started/sdksetup), IL2CPP toolchains and [batch test runs](https://docs.unity3d.com/Packages/com.unity.test-framework@1.4/manual/reference-command-line.html); design the core for standalone .NET tests too. Defold offers visual collections/GUI/atlases and [Bob CLI builds, bundles and a headless engine variant](https://defold.com/manuals/bob/); a separate C++ core can have standalone tests. Headless success cannot verify GPU rendering or touch behavior. Ship signed Android packages and test release builds, not just editors.

Native Rust means target-specific Windows machine code/Android shared libraries ([Rust Android targets](https://doc.rust-lang.org/rustc/platform-support/android.html)); Rust/WASM is a different compilation/runtime experiment. The authorized WASM benchmark need not dictate installed architecture or predict native performance.

## Recommendation and decision gate

**Choose Unity LTS + independent C# first for overall development simplicity.** It avoids the community-binding dependency while retaining data-layout, worker and native-build control. Godot + Rust is my preferred alternative when open-source engine ownership and Rust's memory control outweigh integration cost. No evidence here proves either faster.

Strongest objections to Unity: [commercial licensing conditions](https://unity.com/products/unity-personal), editor/build complexity, GC discipline, and choosing/maintaining the right UI system. Godot's focused 2D tooling may produce a simpler product despite its extra language. These are legitimate reasons to reverse the recommendation.

Before commitment, build one representative native slice: illustrated map + changing cards + inspector + life/time graphs during forecast and random scrubbing. On Windows and physical Pixel 6 measure startup/full-opening forecast, scrub/input latency, frame distributions, memory and sustained thermal behavior.

Require seeded independent RNG streams, serializable state, deterministic replay, every official 60-tick second, every-second summaries/loss checks, independent mutable preview copies, full opening forecast before play, reveal limits, and visual FX derived from viewed simulation time. Test save/reload/branch replay and identical results across targets; engine fixed-update callbacks do not establish determinism. These [behavior constraints](../timegraph-optimisation-guardrails.md), [game direction](../game-design.md) and [UX requirements](../aesthetic-ux-design.md) survive; old cache architecture does not.
