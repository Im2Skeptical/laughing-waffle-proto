# Regional map pixel rendering: source findings

> **Historical note.** Dated measurement/research record written against the commit and date stated below. Current schema numbers are in ai/ai-context.md; do not treat numbers here as current.

Research date: 2026-10-13. Scope: first-party rendering and art references for
the accepted geography prototype. This note records evidence and recommendations;
the [implementation proposal](../regional-map-rendering-plan.md) owns the project
architecture and experiment sequence. No renderer or simulation changes are
implemented by this research.

## Palette cycling has the right precedent

Joseph Huckaby's [Canvas Cycle demo](https://www.effectgames.com/demos/canvascycle/)
shows Mark Ferrari's landscape artwork with Standard and Blend cycling modes.
Its first-party [palette implementation](https://www.effectgames.com/demos/canvascycle/palette.js)
describes independent palette ranges, rate and direction, computes their shift
from a supplied timestamp, and optionally interpolates colours between shifts.
Its [bitmap implementation](https://www.effectgames.com/demos/canvascycle/bitmap.js)
stores indexed pixels separately from palette colours and cycle definitions.
These source files were inspected directly; the demo's implementation is a
Canvas CPU renderer, rather than a Pixi/WebGL performance benchmark.

**Recommendation:** use this as an art and sampling precedent. Compute each
cycle's phase directly from viewed simulation time, with positive modulo for
backward sampling. Compare deliberate discrete steps with interpolated palette
colours. Interpolating the palette preserves the spatial pixel grid, although
it introduces intermediate hues. Do not advance palette state incrementally
when playback ticks arrive.

**Art implication (inference):** convincing motion requires spatially arranged
index ramps, such as ordered wave streaks or foam bands. Cycling colours in
arbitrary noise cannot be assumed to produce directed flow. Ocean, river,
shoreline foam and magical effects should have independently defined ranges
and patterns. The precedent supplies inspiration, not project artwork or a
dependency to copy.

## Preserve indices explicitly through the asset pipeline

[Aseprite indexed mode](https://www.aseprite.org/docs/color-mode/)
stores palette references per pixel. Its [colour-mode API](https://www.aseprite.org/api/colormode)
specifies 8-bit indices, and its [Image API](https://www.aseprite.org/api/image)
exposes raw image bytes, row stride and per-pixel values. Its
[Palette API](https://www.aseprite.org/api/palette) exposes colours by index.
Together these provide an available export route for indices and palette data,
if Aseprite is chosen; cycle metadata would remain a separate project format.

Pixi 7.2.4's [BaseImageResource source](https://github.com/pixijs/pixijs/blob/v7.2.4/packages/core/src/textures/resources/BaseImageResource.ts)
uploads browser image/canvas sources through WebGL image APIs, using the texture's
colour format. The [WebGL 1 reference](https://www.khronos.org/files/webgl/webgl-reference-card-1_0.pdf)
lists colour-component formats rather than an indexed-PNG palette interface.
Consequently, loading a paletted PNG normally does not give a shader its original
PNG palette-index plane. Equal-looking colours can also conceal distinct authored
indices; recovering them from RGB is not a reliable general solution.

**Recommendation:** export a lossless encoded data texture or explicit index
bytes, palette colours and cycle definitions. An RGBA8 data texture with opaque
alpha and an index byte in a colour channel is a conservative first experiment;
single-channel formats can be considered after checking the actual WebGL context.
Keep coverage/opacity separate from encoded values so premultiplication does not
change indices. Keep this data out of ordinary colour quantization, dithering,
rescaling and lossy compression. The repository's current
`scripts/build-sprite-sheets.mjs` uses PNG8/PngQuantLow and some atlas rescaling;
those ordinary art jobs are unsuitable for encoded index or phase data.

## Current Pixi has the necessary primitives

The pinned [BaseTexture implementation](https://github.com/pixijs/pixijs/blob/v7.2.4/packages/core/src/textures/BaseTexture.ts)
supports `fromBuffer(Uint8Array, width, height, options)`, scale-mode selection,
mipmap selection and alpha-mode control. Buffer textures default to nearest
sampling, but retain the general power-of-two mipmap default unless overridden.
The pinned [Shader implementation](https://github.com/pixijs/pixijs/blob/v7.2.4/packages/core/src/shader/Shader.ts)
supports custom shader source and uniforms. These primitives support an index
texture plus small palette lookup texture, with time supplied as a uniform.

**Recommendation:** explicitly set nearest sampling and mipmaps off for encoded
indices and lookup tables. Linear sampling averages adjacent values; generated
mipmaps can also alter them, so neither is safe for categorical index decoding.
Sample palette entries at texel centres. Blend *resolved colours* deliberately
when smooth cycling is desired. Quantization, masks and shared borders should
use one world-space pixel lattice, avoiding independently rounded region edges.

[RenderTexture's pinned source](https://github.com/pixijs/pixijs/blob/v7.2.4/packages/core/src/renderTexture/RenderTexture.ts)
supports display-object snapshots and explicitly advises reuse rather than
creating/deleting render textures every frame. Static ground and decoration can
therefore be baked at generation/invalidation time; this does not require an
engine migration. Retain indexed effect layers separately so cycling is not
frozen into the static bake.

## Hybrid ground is a sensible experiment

[Tiled's terrain documentation](https://doc.mapeditor.org/en/stable/manual/terrain/)
demonstrates authored corner/edge transitions and probability-weighted tile
variants. This is evidence for reusable transition art and controlled variation,
not a requirement to adopt Tiled or make gameplay regions square. It also warns
that directional shadows can make vertical flips inappropriate.

**Project inference:** rasterize procedural geography into material/coast/corridor
masks, fill them with restrained authored pixel patterns, and place authored
trees, peaks and cliffs using stable geographic rules. Preserve polygon geometry
for gameplay. Use a consistent texel scale across large and small regions;
do not stretch one biome texture to fit every region. Mirror geography while
retaining a consistent art-lighting convention.

Pixi's [v7 performance guidance](https://pixijs.com/7.x/guides/production/performance-tips)
favours spritesheets, unchanged graphics and caching suitable static content,
and identifies filters and many masks as potentially expensive. Palette cycling
reduces animation asset/frame-generation work, but still shades visible pixels.
Measure GPU/frame cost, texture memory and bake latency on the phone target;
the historical demo does not establish those budgets.

## Questions the next prototype should answer

- Which logical texel density preserves narrow rivers, coastal gaps and small
  regions at the accepted size/border variation and camera zoom extremes?
- Does restrained clustered ground or more patterned ground leave better room
  for settlements, roads, ownership borders and moving units?
- Do discrete or interpolated cycle ramps best fit the intended retro style?
- How much camera snapping is acceptable during pan/pinch, and does fractional
  nearest-neighbour scaling produce distracting shimmer?
- Can one bounded ground bake and a small indexed water layer meet phone budgets,
  before adding chunking or more shader passes?
