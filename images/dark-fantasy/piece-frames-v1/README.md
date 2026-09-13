# Illustrated physical frames

Original built-in ImageGen assets, 2026-09-12. `prompts.json` records selected
source names and available per-asset prompts. Frame apertures and exteriors
retain genuine alpha transparency. Production encoding trims transparent outer
padding and uniformly downsizes to a maximum 960 pixels; no painted artwork is
modified by the encoding step.

Scheduled practices use a bottom disc socket; charge practices use a source
socket and teal reservoir. Structures share brass and dark stone materials
across one-, two-, and three-cell frames. The original hourglass inset is retained
as source art; current costs use a small edge hourglass and linked time tokens.
Live text, output amounts, quality, workers and progress are drawn by the UI.

`npm run build:sprites` packs this group at 50% scale into `piece-frames.json`.
The shared art loader warms it with the resource family.

`time-year.png`, `time-moon.png`, and `time-phase.png` were created with built-in
ImageGen and revised on 2026-09-14 for small display sizes. They retain transparent
exteriors, simplified silhouettes, and concentric opaque blank centers for runtime
numbers. `time-icons-prompts.json` records the full prompts
and original sources. Production encoding uniformly downsizes each to 384×384;
the atlas includes them at half that resolution.
