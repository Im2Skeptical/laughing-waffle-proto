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

**Current state:** workspace and instructions only. No native executable, native
toolchain setup, Android package or device benchmark has been completed here.
Start with [agent instructions](AGENTS.md) and the [work plan](WORKPLAN.md).

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
