# Runtime and platform options

**Scope correction:** the preservation-first recommendation below has been
superseded by Cam's explicit clean rebuild brief and selection of C++/SDL3/RmlUi.
See the [accepted native workspace](../../native/README.md), [earlier assessment](clean-rebuild-assessment.md)
and [native stack research](native-stack-options.md). The linked platform facts
below remain supporting research; web wrappers are no longer the preferred path.

Research checked **2026-11-13** against the official sources linked below. Recommendations are engineering judgments, not measured speed claims. Cam confirmed **Windows and Android first**; Pixel 6 is the existing performance floor. iOS details below are future-scope considerations. This document changes no simulation, RNG, schemas, replay, or UI behavior. See the [migration proposal](runtime-modernization-plan.md) for repository evidence, profiles and acceptance gates.

## Recommendation by axis

Keep one ruleset and pursue build tooling, installed distribution, and measured timeline performance as parallel workstreams. Preserve the browser/Pixi application first; make a Rust/WASM decision after profiling. A full engine rebuild needs a separate product/tooling justification.

| Axis | Preferred starting point | Decision condition |
| --- | --- | --- |
| Fast iteration | Vite, gradual TypeScript, existing JS model | Measure edit-to-play and production build time |
| Windows installation | Tauri spike; Electron fallback | Compare WebView2 compatibility, installer/dependency size, maintenance |
| Installed Android with all art | Capacitor spike; evaluate all-platform Tauri | Validate local workers, lifecycle, storage and required plugins |
| Browser/offline sharing | PWA with explicit complete-content caching | Verify quota, installation completeness, updates, recovery |
| Smooth deterministic scrubbing | Profile current worker/restore/render paths | Physical Pixel 6 interaction and memory gates |
| Simulation CPU replacement | Focused Rust/WASM experiment | Exact replay parity and meaningful end-to-end improvement |
| Visual authoring tools | Godot/Unity only if editor workflows justify rebuild | Price the port of UI, rules, content tools, saves, and tests |

## 1. Preserve browser/Pixi/JS; modernize builds

[Vite](https://vite.dev/guide/) supplies a development server and production bundling. Its [TypeScript and worker support](https://vite.dev/guide/features) permits incremental typing and worker asset handling; type checking still needs a separate check such as `tsc --noEmit`. TypeScript emits JavaScript: it does not turn the ruleset into a native CPU implementation. Vite can improve development/build ergonomics without guaranteeing faster forecast execution. Audit existing build metadata, asset URLs, worker URLs, and validation scripts before replacing the custom build.

Use one model package in live play, forecasts, replay, and tests. Workers move work away from the UI thread, but communication, copies, allocations, and competing CPU work still matter.

For a PWA, [service workers](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API/Using_Service_Workers) can cache the shell, workers, and complete art manifest for offline use; they require a secure origin. Initial download must finish before declaring the full game available offline. Version caches coherently and handle interrupted updates. [Browser storage](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria) has quotas and best-effort eviction; request persistence and inspect whether it was granted. Installation alone is no guarantee of permanent art or save retention. Keep save export/recovery.

## 2. Installed packaging: independent of simulation speed

**Capacitor mobile + Tauri desktop:** Capacitor [copies the built web bundle](https://capacitorjs.com/docs/basics/workflow) into Android/iOS projects. Include every required image, font, worker, and dependency locally; remove release reliance on development servers/CDNs. Tauri can package frontend assets and [additional resources](https://v2.tauri.app/develop/resources/). This preserves the renderer and model while adding two native project/plugin ecosystems. Wrapping leaves the JS simulation running in a webview; it does not port it to Rust.

**All-platform Tauri:** Tauri supports Windows, Android, and iOS, potentially consolidating shell integration. It still uses [platform webviews](https://v2.tauri.app/reference/webview-versions/): WebView2 on Windows, Android System WebView, and WKWebView on iOS. Therefore one shell does not mean one browser engine/version. Validate workers, local URLs, WASM, lifecycle, saves, and plugins on each target. Adoption of Tauri does not require adoption of a Rust simulation.

**Electron desktop:** Electron [bundles Chromium and Node.js](https://www.electronjs.org/docs/latest/), giving a controlled desktop browser runtime and an additional runtime payload/update responsibility. It targets Windows/macOS/Linux, not phone releases. Its [application package](https://www.electronjs.org/docs/latest/tutorial/application-distribution) can include all assets. Prefer it if consistent Chromium behavior outweighs the measured installation/resource costs; do not infer CPU superiority from packaging.

Bundled art is installed content, separate from evictable browser caches and writable save data. Plan stable application IDs/origins, explicit save export/import between browser and installed app, and app-data persistence tests across upgrades. Uninstall or user deletion remains a separate lifecycle case. For completely offline Windows installation, account for WebView2: Tauri offers an [offline runtime installer](https://v2.tauri.app/distribute/windows-installer/), rather than relying on an internet bootstrapper.

## 3. Focused Rust + WASM headless simulation

Keep Pixi/UI and prototype one coarse simulation seam: initialize from JSON state/config, apply ordered commands, advance bounded official ticks, restore a target second, and export required summaries/anchors/JSON. Keep long-lived runtime state within the worker/WASM session; avoid a JS/WASM crossing for each entity or tick. This extends the existing persistent worker design rather than proposing workers anew.

Preserve the public JSON save contract and exact serialized RNG substreams. Rust must execute the same captured DSL definitions and event order. Initially retain JS as a differential oracle; after acceptance, all authoritative live/replay/forecast paths must use the selected core. Avoid permanently maintaining different rules by platform.

[wasm-bindgen's serialization guide](https://wasm-bindgen.github.io/wasm-bindgen/reference/arbitrary-data-with-serde.html) explicitly advises profiling alternative boundary representations. Conversion, memory copies, startup, summaries, and rendering can consume any kernel gain. Rust/WASM is **not a guaranteed speedup**. Measure optimized builds with boundary costs included, plus native Rust only as a separate experiment if needed. Native and WASM targets require their own parity checks.

## 4. Full engine rebuilds

**Godot:** GDScript provides an integrated scripting workflow; [live scene/code changes, remote debugging, and profilers](https://docs.godotengine.org/en/stable/tutorials/scripting/debug/overview_of_debugging_tools.html) support iteration. [Texture import/compression](https://docs.godotengine.org/en/stable/tutorials/assets_pipeline/importing_images.html) supplies an asset pipeline. Godot is [MIT licensed](https://godotengine.org/license/). These are reasons to consider its authoring environment, not evidence that this simulation becomes faster.

The language choice materially affects distribution: stable [Godot C#/.NET documentation](https://docs.godotengine.org/en/stable/tutorials/scripting/c_sharp/) supports desktop and experimental Android/iOS, but **Godot 4 C# cannot export to web**. GDScript web export needs [WebAssembly/WebGL 2](https://docs.godotengine.org/en/stable/tutorials/export/exporting_for_web.html); threaded export adds cross-origin isolation/hosting requirements. Test the Compatibility renderer and actual phone/browser workload. Rebuilding also replaces the current Pixi views and custom content/debug tools.

**Unity/C#:** A shared C# core can serve Windows/mobile/web, with editor Play mode and [platform texture imports](https://docs.unity.com/en-us/engine/6000.5/manual/materials-and-shaders/textures/textures-reference/class-texture-importer/type-specific). Faster [Play mode entry](https://docs.unity.com/en-us/engine/6000.5/manual/scripting/compilation-and-code-reload/code-reloading-editor/configurable-enter-play-mode) can skip reloads, requiring deliberate state reset. Measure script compilation, import, and target build loops separately. Budget [license eligibility](https://unity.com/legal/editor-terms-of-service/software), SDKs, build modules, and porting effort.

Current [Unity 6.6 web documentation](https://docs.unity.com/en-us/engine/6000.6/manual/platform-specific/webgl/intro/browsercompatibility) includes mobile browsers. [Managed C# threads remain unsupported](https://docs.unity.com/en-us/engine/6000.6/manual/platform-specific/webgl/intro/technical-overview), while [Burst-compiled jobs can run in parallel](https://docs.unity.com/en-us/engine/6000.6/manual/platform-specific/webgl/develop/web-multithreading/burst) using a restricted C# subset and suitable hosting. Do not apply older blanket web-threading limitations to every Unity version, or assume desktop jobs work unchanged in web exports.

Both engines can bundle release art, but neither supplies this game's deterministic replay architecture automatically. Keep the rules core independent of scene nodes, frame delta, engine physics, and global random APIs. A renderer/engine switch still requires porting the timeline interaction and restore machinery.

## 5. Determinism and measurement gates

Follow [repository invariants](../../ai/ai-context.md) and [timegraph guardrails](../timegraph-optimisation-guardrails.md): authoritative `tSec`, all 60 ticks per second, every-second summaries/loss detection, identical RNG draw order, independent mutable previews, and revealed-coverage limits. New Game still waits for its complete opening forecast. Smooth scrubbing outranks horizon length. Persistent projection workers, frozen shared config, and isolated restore anchors already exist; historical Node measurements are not current Pixel 6 results.

Numeric portability needs an explicit contract. Match JS number precision, integer overflow/bitwise operations, rounding, remainder, ordering, and JSON number handling; default Rust/C#/engine numeric types are not interchangeable. [ECMAScript math](https://tc39.es/ecma262/multipage/numbers-and-dates.html#sec-math-object) permits implementation-approximated functions; [Rust `f64` math](https://doc.rust-lang.org/std/primitive.f64.html) documents platform-dependent precision for several functions. Audit actual authoritative math and lock compatible implementations where necessary. Seed equality and fixed timesteps alone cannot prove replay equality. Do not silently substitute fixed-point arithmetic or fast-math for existing semantics.

Run parallel, bounded workstreams with common fixtures:

1. **Build lane:** compare dev/HMR with production bundles from identical source and content; keep production worker-loading checks. Record toolchains and flags. [Cargo profiles](https://doc.rust-lang.org/cargo/reference/profiles.html) distinguish optimized release from dev; engine Editor/development builds likewise cannot stand in for release measurements.
2. **Packaging/art lane:** cold install, airplane-mode first launch, every-art coverage, save/relaunch, upgrade, background/resume, and interrupted-cache recovery. Local bytes remove network waits, not image decode, texture upload, draw work, or RAM/VRAM pressure. [Pixi 7 guidance](https://pixijs.com/7.x/guides/production/performance-tips) supports profiling texture residency/batching; full local art does not require every texture resident simultaneously.
3. **Performance lane:** on physical Pixel 6 and Windows, measure forecast wall time/CPU, clone/serialization, restore-plus-render p95, pointer-to-frame latency, worst frames, memory, and sustained thermal behavior. Include long-lived/large-world fixtures and retained previous/current futures. Compare cold/warm runs, identical seeds/actions/worlds, and foreground conditions; desktop throttling is supplementary. Existing probe gates are restore-plus-render p95 at most 33 ms and no steady frame over 50 ms; agree additional phone interaction budgets before implementation.
4. **Parity gate:** differential live/replay/forecast/save roundtrips across sliced execution, edits, terminal events, old/current preview restoration, and RNG state. Use `npm run test:differential`, the timegraph differential/performance probes, then applicable repository verification. Adopt Rust or an engine only after these pass and representative end-to-end measurements justify the maintenance/port cost.

## Signing and unresolved release scope

[Capacitor setup](https://capacitorjs.com/docs/getting-started/environment-setup) requires Android Studio/SDK tooling and Mac/Xcode for iOS. [Tauri](https://v2.tauri.app/start/prerequisites/) additionally needs Rust, Windows C++ Build Tools/WebView2, and Android NDK tooling; its iOS development is macOS-only. Engine exports retain Apple's Xcode/signing step: [Unity's local iOS builds require macOS](https://docs.unity.com/en-us/engine/6000.6/manual/platform-specific/iphone/getting-started/ios-environment-setup). A hosted Mac can replace owned hardware but adds a build-service dependency; it does not remove the Apple toolchain requirement.

Android releases need [signing keys/Play App Signing](https://developer.android.com/studio/publish/app-signing). App Store/TestFlight requires [Apple distribution provisioning](https://developer.apple.com/documentation/xcode/preparing-your-app-for-distribution). Published fees are [US$99/year for Apple](https://developer.apple.com/help/account/membership/program-enrollment) and [US$25 once for Google Play](https://support.google.com/googleplay/android-developer/answer/6112435), subject to regional terms/eligibility. Windows distribution needs a signing plan; [signing does not guarantee immediate SmartScreen reputation](https://v2.tauri.app/distribute/sign/windows/). No signup or purchase is needed for this research.

For the confirmed Windows/Android scope, remaining release decisions include distribution channel, supported OS versions, art package size/quality requirements, plugin needs, physical-phone memory headroom, and acceptable interaction/forecast budgets. Mac access matters only if iOS enters scope later. These remain benchmark/product decisions, not conclusions obtainable from language rankings.
