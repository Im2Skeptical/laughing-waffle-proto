# Recent firsthand experience with custom game runtimes

Research checked 13 November 2026. This records developer accounts, project
announcements and observable release status, not independently reproduced
benchmarks or a representative satisfaction survey. See the separate
[Axmol maintenance and experience review](axmol-maintenance-experience.md).

## What the evidence supports

Building a game-specific runtime on established libraries is a current practical
approach, including for commercial games. The accounts reviewed support control
over specialized simulation/rendering and a code-first workflow. They also
repeatedly expose UI, iteration and platform integration costs. The accounts do
not establish a typical completion time, success rate, speed advantage or Android
reliability. A playable demo, shipped game and a beta engine migration provide
different levels of evidence.

## Signs of Danger: SDL3/wgpu, independent simulation and rewind

In [Slow Rush's 10 April 2026 development account](https://www.slowrush.dev/news/porting-performance-and-playback/),
the developer describes moving from Macroquad to SDL3 with wgpu after encountering
framework issues. They report useful results from separating simulation and
rendering, and built rewind/scrub/replay through stored world states. They also
describe substantial engine-porting work. The SDL3 path is desktop-specific;
the browser has separate integration, and the post notes broken web touch input.

The [Steam listing](https://store.steampowered.com/app/3816900/Signs_of_Danger/)
still shows the game as unreleased. This is relevant implementation experience,
especially for our timeline, but not proof of a shipped Android product or of
similar performance in our simulation. The developer's earlier
[Macroquad retrospective](https://www.reddit.com/r/rust_gamedev/comments/1pc9wyv/macroquad_after_2_years_of_mostly_fulltime_rust/)
is additional context from the same person, not an independent second account.

## Karma Keepers: shipped custom Rust incremental strategy game

In [the creator's framework account](https://www.reddit.com/r/rust_gamedev/comments/1r1w0mu/custom_engine_wgpubevy_ecskira_my_incrementalidle/),
Nazariglez describes a Rust runtime built with wgpu, winit and Kira. Moving to
bevy_ecs simplified some architecture; batching and targeted parallel work
supported a busy screen. Their strongest complaints were custom UI and the
cost of building foundations before trying gameplay ideas. They liked Rust,
while questioning whether the approach fit their original commercial schedule.

The linked product, [Karma Keepers](https://store.steampowered.com/app/3979140/Karma_Keepers/),
is listed as released on 13 August 2026. This is a shipped example, not only a
renderer demonstration. Its incremental/automation/strategy surface makes the
author's UI and prototyping experience particularly relevant to our project.
The earlier account's intended release timing should not be mistaken for its
eventual date. The observed listing does not establish an Android release.

## Revolver Engine: direct SDL_GPU/RmlUi integration experience

In [a March 2026 firsthand integration account](https://www.reddit.com/r/gameenginedevs/comments/1s12sta/integrating_rml_ui_with_my_fps_game_engine/),
GlaireDaggers describes adding RmlUi to a custom retro-FPS engine using the supplied
SDL_GPU integration. They liked familiar document/style authoring, the debugger
and live UI document reload. Integration was mostly straightforward, but bundling
FreeType and RmlUi through CMake took effort. They worked around input-focus and
invisible-element event interception, and reported a text-field scrolling issue
to the maintainer. They also identified missing shader decorators/image masks in
the SDL_GPU renderer as a limitation.

This is direct evidence for the proposed library combination, including its
friction, rather than an inference from supported-feature lists. The account
describes an engine in development, not a shipped Windows/Android game; the
target-specific acceptance work remains ours.

## Mega Super Racer: directly relevant AI-assisted example, still a demo

[ArthursoftDev's firsthand report](https://www.reddit.com/r/aigamedev/comments/1xpn7hu/i_built_a_32kart_mode_7_racer_in_rust_with_claude/)
describes a custom Rust runtime on SDL3/SDL_GPU, extensive agent-assisted code
and tools, and a separate deterministic simulation crate. The creator claims
rapid progress from a short brief and ongoing playtesting, with CI building
desktop, Android and browser targets. They also report browser compatibility
work and excessive/redundant testing slowing the iteration loop.

The [public itch page](https://arthursoft.itch.io/mega-super-racer) corroborates
that a browser demo is offered. It does not independently verify every build,
the development effort claimed, native Android quality or commercial durability.
The author reports extensive professional game-development experience; the
example is not evidence that AI eliminates technical judgment. Search-index
dates and the fetched page's relative timestamps differ, so no exact posting
day is asserted here.

This is unusually close to Cam's proposed workflow, but should carry the weight
of one experienced developer's self-report plus a public demo, rather than a
general productivity claim.

## RimWorld/Waylith: a stronger production-scale example, with a beta qualifier

Ludeon's October 2026 [official announcement](https://steamcommunity.com/app/294100/homecontent/)
describes moving RimWorld from Unity to its in-house Waylith engine while
preserving its visible gameplay. Ludeon reports performance improvements in its
own tests and offers the update through an unstable beta branch. These are
developer-reported results, not our measurements or a stable-release guarantee.

[Dean Hall's firsthand framework account](https://www.reddit.com/r/gamedev/comments/1x6d2dy/introducing_brutal_a_free_c_framework_that_helped/)
describes BRUTAL as the underlying foundation. He explains that a focused
framework can reduce time spent working around general engine assumptions,
while leaving important implementation decisions to the game team.

The [BRUTAL repository](https://github.com/ahwootech/BRUTAL) explicitly provides
native-library bindings and low-level support, not a scene graph, renderer or
editor. Its current getting-started requirements name Windows/Linux; this
research does not establish an Android-ready route. It is C#, so the case
supports the **game-specific architecture** argument rather than proving a
C++/Rust language advantage. It also comes from established studios with an
existing product and engine experience, rather than a small greenfield project.

## What this changes in our assessment

The evidence supports keeping the focused-runtime option on the shortlist. It
does not justify declaring custom code faster or easier before implementation.

- Treat domain simulation and timeline architecture as the distinctive work we
  should own. Keep the replay/serialization/RNG/official-time contracts explicit.
- Reuse UI/text/layout infrastructure wherever it meets the actual illustrated
  inspection/staging workflow. The shipped Rust account gives a concrete reason
  to avoid casually inventing a full UI toolkit alongside the game.
- Preserve the fast content/UI iteration loop as an acceptance criterion, not
  only final frame time. Tools and asset compilation are part of the runtime
  investment even when there is no generic editor.
- Prove Android native builds, lifecycle and GPU recovery early. None of these
  desktop or browser examples validates our Pixel 6 target automatically.
- The AI-assisted report makes the proposed workflow plausible, while remaining
  limited evidence about repeatability and long-term maintenance.

The practical comparison remains Axmol adoption versus a bounded runtime using
existing platform/render/UI libraries. Evaluate one representative illustrated
map/card/inspector/timeline slice, not a sprite stress test. Separate kernel
throughput, input-to-correct-world latency, frame tails, memory, and edit-to-play
cost. No game behavior or implementation changed in this research.
