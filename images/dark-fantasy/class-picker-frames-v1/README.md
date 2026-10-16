# Pixel-illustrated class picker frames

Original hand-illustrated limestone, acanthus relief and worn bronze, informed by
`ai/References/Diablo-II09052021-024202-52025.jpg` and
`ai/References/Baldur039s-Gate-II05272023-105108-82687.jpg`.
Generated with the built-in image tool; exact prompts are in `prompts.json`.
Both generated PNG masters have genuine transparent apertures and backgrounds.

`build.py` uses Pillow to crop and reduce the masters with nearest sampling:

    python images/dark-fantasy/class-picker-frames-v1/build.py
    npm run build:sprites -- class-picker-frames

The first command extracts nine named PNG sources: four fixed 64px corner
blocks, four repeatable mirrored edge strips and a 128px circular socket. It
records their sizes in `layout.json`. TexturePacker alone creates the runtime
PNG-8 + JSON atlas, with no rotation, no trimming and 2px extrusion. The build
packs only manifest-listed sprites, excluding generated masters.

`painted-frame-spec.js` owns draw scales. Every rectangular surface uses tiled
edges and fixed corners, including the hero banner and long attribute feature,
so carved ornament never stretches. Selected tabs use warm bronze; locked tabs
use dull iron. Class tints multiply the material while the existing stone fill
shows through the aperture. Nearest filtering and disabled mipmaps preserve the
pixel treatment; vector chrome remains a fallback during loading.

Verify with `node scripts/class-picker-frames-test.mjs`,
`node scripts/chronicle-art-test.mjs`, `npm run check:assets` and
`npm run probe:settlement`.
